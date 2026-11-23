// Comptes « Ce soir on joue » : un pseudo, un mot de passe, un seul compte par téléphone.
// Le téléphone est reconnu par un identifiant tiré au hasard et gardé dans son navigateur (compte.js).
// Un script pourrait inventer un identifiant à chaque fois : la connexion internet est donc plafonnée
// à IP_MAX comptes par 24 h, assez pour toute une soirée sur le même Wi-Fi.
// Tourne dans une fonction Netlify (elle seule voit l'IP du visiteur). Aucune dépendance npm :
// Firestore et Firebase Auth sont appelés en REST avec le compte de service du projet.
//
// Firestore (jamais lisible par les téléphones, voir firestore.rules) :
//   accounts/{id}        id = sha256(pseudo en minuscules)  → pseudo, uid, sel, empreinte du mot de passe, échecs
//   accountDevices/{id}  id = sha256(identifiant du tél.)   → pseudo du compte créé sur ce téléphone
//   accountIps/{id}      id = HMAC(IP)                      → nombre de comptes créés depuis `since`
//   accountsArchive/{uid}                                   → comptes supprimés (par l'admin ou par leur propriétaire)
//   loginIps/{id}        id = HMAC(IP)                      → mots de passe ratés depuis cette connexion (anti-essais en série)
// L'IP n'est jamais stockée en clair.
//
// Admin : les pseudos listés dans la variable d'environnement ADMIN_PSEUDO (séparés par des virgules)
// reçoivent `admin: true` dans leur jeton à la connexion. Ces pseudos ne peuvent pas être créés par inscription :
// crée le compte d'abord, puis ajoute son pseudo à ADMIN_PSEUDO.

import { createHash, createHmac, createPublicKey, createSign, randomBytes, scrypt as scryptCb, timingSafeEqual, verify as verifySig } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

export const PROJECT = "qui-de-nous-7244f";
const PROD_DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const MAX_FAILS = 10, LOCK_MS = 15 * 60 * 1000;
const LOGIN_IP_MAX = 30, LOGIN_IP_WINDOW_MS = 15 * 60 * 1000;   // ratés par connexion, tous comptes confondus
const GROUP_IDLE_MS = 3 * 24 * 3600 * 1000;                        // un groupe où personne n'est passé depuis 3 jours est fermé
const IP_MAX = 20, IP_WINDOW_MS = 24 * 3600 * 1000;
const DEVICE_RE = /^[A-Za-z0-9-]{16,64}$/;

// Pseudo : 3 à 18 caractères (la longueur d'un prénom dans les jeux), lettres, chiffres, . _ -
const PSEUDO_RE = /^[\p{L}\p{N}._-]{3,18}$/u;
const PASS_MIN = 6, PASS_MAX = 128;

const b64url = b => Buffer.from(b).toString("base64url");
const sha256 = s => createHash("sha256").update(s).digest("hex");

function fail(status, error) { return Object.assign(new Error(error), { status, public: true }); }

/* ---------- service account ---------- */
function credentials(env) {
  const email = env.FIREBASE_CLIENT_EMAIL, key = (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key.includes("PRIVATE KEY")) throw fail(503, "Les comptes ne sont pas encore configurés sur le serveur.");
  return { email, key };
}

function signJwt(payload, key) {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })), body = b64url(JSON.stringify(payload));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key);
  return `${head}.${body}.${b64url(sig)}`;
}

// Jeton signé que le téléphone échange contre une session Firebase (signInWithCustomToken).
export function customToken(cred, uid, claims, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  return signJwt({
    iss: cred.email, sub: cred.email, iat, exp: iat + 3600, uid, claims,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit"
  }, cred.key);
}

// Shared while it is valid, and while it is being fetched (signup reads two documents at once).
let cachedToken = null;
function accessToken(cred, fetch) {
  if (cachedToken && cachedToken.email === cred.email && cachedToken.exp > Date.now() + 60000) return cachedToken.value;
  const value = fetchAccessToken(cred, fetch);
  cachedToken = { email: cred.email, value, exp: Date.now() + 3000 * 1000 };
  value.catch(() => { if (cachedToken?.value === value) cachedToken = null; });
  return value;
}
async function fetchAccessToken(cred, fetch) {
  const iat = Math.floor(Date.now() / 1000);
  const assertion = signJwt({ iss: cred.email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }, cred.key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  if (!res.ok) throw new Error("oauth " + res.status + " " + await res.text());
  return (await res.json()).access_token;
}

/* ---------- Firestore REST ---------- */
const enc = v => typeof v === "number" ? { integerValue: String(Math.trunc(v)) } : typeof v === "boolean" ? { booleanValue: v } : { stringValue: String(v) };
const encFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
const decValue = v => "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue : "booleanValue" in v ? v.booleanValue
  : "timestampValue" in v ? Date.parse(v.timestampValue) : "nullValue" in v ? null : v.stringValue;
const dec = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, decValue(v)]));

// FIRESTORE_EMULATOR_HOST (tests only, never set on Netlify): talk to the local emulator, which trusts the "owner" token.
function store(cred, fetch, env = {}) {
  const emu = env.FIRESTORE_EMULATOR_HOST;
  const DOCS = emu ? `http://${emu}/v1/projects/${PROJECT}/databases/(default)/documents` : PROD_DOCS;
  const call = async (url, init = {}) => {
    const token = emu ? "owner" : await accessToken(cred, fetch);
    return fetch(url, { ...init, headers: { authorization: "Bearer " + token, "content-type": "application/json", ...init.headers } });
  };
  return {
    // → { data, updateTime } ou null
    async read(path) {
      const res = await call(`${DOCS}/${path}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("get " + res.status + " " + await res.text());
      const j = await res.json();
      return { data: dec(j.fields), updateTime: j.updateTime };
    },
    async get(path) { return (await this.read(path))?.data ?? null; },
    // Écrit tout d'un coup, ou rien si un document a changé entre-temps.
    // writes : [chemin, données, condition] ; condition = { exists: false } ou { updateTime } lu juste avant.
    // data = null supprime le document.
    async commit(writes) {
      const name = path => `projects/${PROJECT}/databases/(default)/documents/${path}`;
      const res = await call(`${DOCS.replace(/\/documents$/, "")}/documents:commit`, {
        method: "POST",
        body: JSON.stringify({ writes: writes.map(([path, data, currentDocument]) => data === null
          ? { delete: name(path), ...(currentDocument && { currentDocument }) }
          : { update: { name: name(path), fields: encFields(data) }, currentDocument }) })
      });
      if (res.ok) return true;
      const text = await res.text();
      if (res.status === 409 || /ALREADY_EXISTS|FAILED_PRECONDITION/.test(text)) return false;
      throw new Error("commit " + res.status + " " + text);
    },
    async removeAll(paths) {
      for (let i = 0; i < paths.length; i += 400) await this.commit(paths.slice(i, i + 400).map(x => [x, null]));
    },
    // Tous les documents d'une collection (ou sous-collection : "parties/ABCD/members") → [{ id, ...champs }]
    async list(collection) {
      const out = [];
      let token = "";
      do {
        const res = await call(`${DOCS}/${collection}?pageSize=300${token ? "&pageToken=" + encodeURIComponent(token) : ""}`);
        if (!res.ok) throw new Error("list " + res.status + " " + await res.text());
        const j = await res.json();
        for (const d of j.documents || []) out.push({ id: d.name.split("/").pop(), ...dec(d.fields) });
        token = j.nextPageToken || "";
      } while (token);
      return out;
    },
    // Chemins des documents dont un champ texte vaut `value`
    async where(collection, field, value) {
      const res = await call(`${DOCS}:runQuery`, {
        method: "POST",
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } } } })
      });
      if (!res.ok) throw new Error("query " + res.status + " " + await res.text());
      return (await res.json()).filter(r => r.document).map(r => r.document.name.split("/documents/")[1]);
    },
    async update(path, data) {
      const mask = Object.keys(data).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
      const res = await call(`${DOCS}/${path}?${mask}&currentDocument.exists=true`, { method: "PATCH", body: JSON.stringify({ fields: encFields(data) }) });
      if (!res.ok) throw new Error("update " + res.status + " " + await res.text());
    }
  };
}

/* ---------- Firebase Auth : suspendre ou supprimer l'utilisateur de session ---------- */
// FIREBASE_AUTH_EMULATOR_HOST : tests seulement. Un utilisateur qui ne s'est jamais connecté n'existe pas encore : sans importance.
async function authUser(cred, fetch, env, action, body) {
  const emu = env.FIREBASE_AUTH_EMULATOR_HOST;
  const base = emu ? `http://${emu}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
  const token = emu || env.FIRESTORE_EMULATOR_HOST ? "owner" : await accessToken(cred, fetch);
  if (!emu && env.FIRESTORE_EMULATOR_HOST) return;  // emulated Firestore without an Auth emulator: nothing to do
  const res = await fetch(`${base}/v1/projects/${PROJECT}/accounts:${action}`, {
    method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body)
  });
  if (!res.ok) { const text = await res.text(); if (!/USER_NOT_FOUND/.test(text)) throw new Error("auth " + action + " " + res.status + " " + text); }
}

// Firestore quotas reset at midnight, Pacific time.
export function pacificMidnight(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(now)).map(x => [x.type, x.value]));
  return now - (((+parts.hour * 60 + +parts.minute) * 60 + +parts.second) * 1000 + now % 1000);
}
// Today's Firestore reads / writes / deletes (Cloud Monitoring). Needs the "Monitoring Viewer" role on the service account.
async function usage(cred, fetch, now, env = {}) {
  if (env.FIRESTORE_EMULATOR_HOST) throw fail(503, "Pas de statistiques Firebase avec les émulateurs (tests en local).");
  const token = await accessToken(cred, fetch);
  const start = new Date(pacificMidnight(now)).toISOString(), end = new Date(now).toISOString();
  const metric = async m => {
    const q = new URLSearchParams({
      filter: `metric.type="firestore.googleapis.com/document/${m}"`, "interval.startTime": start, "interval.endTime": end,
      "aggregation.alignmentPeriod": Math.max(60, Math.ceil((now - pacificMidnight(now)) / 1000)) + "s",
      "aggregation.perSeriesAligner": "ALIGN_SUM", "aggregation.crossSeriesReducer": "REDUCE_SUM"
    });
    const res = await fetch(`https://monitoring.googleapis.com/v3/projects/${PROJECT}/timeSeries?${q}`, { headers: { authorization: "Bearer " + token } });
    if (res.status === 403) throw fail(403, "Le compte de service n'a pas le droit de lire les statistiques Firebase : ajoute-lui le rôle « Lecteur Monitoring » (voir LISEZMOI).");
    if (!res.ok) throw new Error("monitoring " + res.status + " " + await res.text());
    return ((await res.json()).timeSeries || []).reduce((sum, s) => sum + (s.points || []).reduce((a, pt) => a + Number(pt.value?.int64Value || 0), 0), 0);
  };
  const [reads, writes, deletes] = await Promise.all([metric("read_count"), metric("write_count"), metric("delete_count")]);
  return { since: pacificMidnight(now), reads, writes, deletes, limits: { reads: 50000, writes: 20000, deletes: 20000 } };
}

/* ---------- IP ---------- */
// IPv6 : un même appareil change d'adresse dans son bloc /64, c'est donc le bloc qui compte.
export function normalizeIp(ip) {
  ip = String(ip || "").trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;
  const [a, b = ""] = ip.toLowerCase().split("::");
  const left = a ? a.split(":") : [], right = b ? b.split(":") : [];
  const full = ip.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  return full.slice(0, 4).map(h => (parseInt(h, 16) || 0).toString(16)).join(":") + "::/64";
}
const ipId = (ip, cred) => createHmac("sha256", sha256("ip:" + cred.key)).update(normalizeIp(ip)).digest("hex");

/* ---------- admin ---------- */
const adminSet = env => new Set(String(env.ADMIN_PSEUDO || "").split(",").map(s => s.normalize("NFC").trim().toLowerCase()).filter(Boolean));
export const isAdminPseudo = (env, pseudo) => adminSet(env).has(String(pseudo).normalize("NFC").trim().toLowerCase());
const claimsFor = (env, pseudo) => isAdminPseudo(env, pseudo) ? { pseudo, admin: true } : { pseudo };

// Vérifie le jeton de session Firebase envoyé par la page (signature Google, projet, expiration).
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwks = null;
async function googleKeys(fetch, refresh = false) {
  if (jwks && !refresh && jwks.exp > Date.now()) return jwks.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("jwks " + res.status);
  const age = Number((res.headers.get("cache-control") || "").match(/max-age=(\d+)/)?.[1] || 3600);
  jwks = { keys: (await res.json()).keys || [], exp: Date.now() + age * 1000 };
  return jwks.keys;
}
export async function verifyIdToken(token, { fetch, now = Date.now(), env = {} }) {
  const bad = fail(401, "Session expirée. Reconnecte-toi.");
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw bad;
  let head, claims;
  try { head = JSON.parse(Buffer.from(parts[0], "base64url")); claims = JSON.parse(Buffer.from(parts[1], "base64url")); } catch { throw bad; }
  const sec = Math.floor(now / 1000);
  const fresh = () => claims.aud === PROJECT && claims.iss === "https://securetoken.google.com/" + PROJECT && claims.sub && claims.exp > sec && claims.iat <= sec + 300;
  // Tests only: the Auth emulator signs nothing. FIREBASE_AUTH_EMULATOR_HOST is never set on Netlify.
  if (env.FIREBASE_AUTH_EMULATOR_HOST && head.alg === "none") { if (!fresh()) throw bad; return claims; }
  if (head.alg !== "RS256" || !head.kid) throw bad;
  let jwk = (await googleKeys(fetch)).find(k => k.kid === head.kid);
  if (!jwk) jwk = (await googleKeys(fetch, true)).find(k => k.kid === head.kid);
  if (!jwk) throw bad;
  const ok = verifySig("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"));
  if (!ok || !fresh()) throw bad;
  return claims;
}

/* ---------- mots de passe ---------- */
async function hashPassword(pass, salt) { return (await scrypt(pass.normalize("NFC"), salt, 64)).toString("hex"); }
async function checkPassword(pass, salt, hash) {
  const got = Buffer.from(await hashPassword(pass, salt), "hex"), want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

/* ---------- actions ---------- */
function readInput(body) {
  const pseudo = String(body?.pseudo ?? "").normalize("NFC").trim(), pass = String(body?.password ?? "");
  return { pseudo, pass, id: sha256(pseudo.toLowerCase()) };
}

export async function signup(body, ip, { env, fetch, now = Date.now() }) {
  const { pseudo, pass, id } = readInput(body), device = String(body?.device ?? "");
  if (!PSEUDO_RE.test(pseudo)) throw fail(400, "Le pseudo doit faire 3 à 18 caractères : lettres, chiffres, point, tiret ou tiret bas.");
  if (pass.length < PASS_MIN || pass.length > PASS_MAX) throw fail(400, `Le mot de passe doit faire au moins ${PASS_MIN} caractères.`);
  if (!DEVICE_RE.test(device)) throw fail(400, "Ton navigateur n'arrive pas à se souvenir de ce téléphone. Quitte la navigation privée et réessaie.");
  if (!ip) throw fail(400, "Impossible de reconnaître ta connexion.");
  if (isAdminPseudo(env, pseudo)) throw fail(409, "Ce pseudo est réservé.");
  const cred = credentials(env), db = store(cred, fetch, env);
  const deviceDoc = "accountDevices/" + sha256("device:" + device), ipDoc = "accountIps/" + ipId(ip, cred);

  const [taken, phone, net] = await Promise.all([db.get("accounts/" + id), db.get(deviceDoc), db.read(ipDoc)]);
  if (taken) throw fail(409, "Ce pseudo est déjà pris.");
  if (phone) throw fail(403, `Ce téléphone a déjà un compte : « ${phone.account} ». Connecte-toi avec.`);

  // Anti-robot : la fenêtre de 24 h repart de zéro une fois écoulée.
  let since = net?.data.since ?? net?.data.createdAt ?? now, count = net?.data.count ?? (net ? 1 : 0);
  if (now - since >= IP_WINDOW_MS) { since = now; count = 0; }
  if (count >= IP_MAX) throw fail(429, "Trop de comptes créés depuis cette connexion aujourd'hui. Réessaie demain.");

  const uid = "acct_" + randomBytes(12).toString("hex"), salt = randomBytes(16).toString("hex");
  const ok = await db.commit([
    ["accounts/" + id, { pseudo, uid, salt, hash: await hashPassword(pass, salt), createdAt: now, lastLoginAt: now, fails: 0, lockUntil: 0 }, { exists: false }],
    [deviceDoc, { account: pseudo, createdAt: now }, { exists: false }],
    [ipDoc, { count: count + 1, since }, net ? { updateTime: net.updateTime } : { exists: false }]
  ]);
  if (!ok) throw fail(409, "Quelqu'un vient de créer un compte en même temps. Réessaie.");
  return { pseudo, token: customToken(cred, uid, { pseudo }) };
}

export async function login(body, ip, { env, fetch, now = Date.now() }) {
  const { pseudo, pass, id } = readInput(body);
  if (!pseudo || !pass) throw fail(400, "Entre ton pseudo et ton mot de passe.");
  const cred = credentials(env), db = store(cred, fetch, env);
  // Per connection: someone trying passwords on many accounts gets stopped too, not only per account.
  const ipDoc = ip ? "loginIps/" + ipId(ip, cred) : null;
  const tries = ipDoc ? await db.get(ipDoc) : null;
  const inWindow = tries && now - (tries.since || 0) < LOGIN_IP_WINDOW_MS;
  if (inWindow && tries.fails >= LOGIN_IP_MAX) throw fail(429, `Trop de mots de passe ratés depuis cette connexion. Réessaie dans ${Math.ceil((tries.since + LOGIN_IP_WINDOW_MS - now) / 60000)} min.`);
  const missed = async () => { if (ipDoc) await db.commit([[ipDoc, { fails: inWindow ? tries.fails + 1 : 1, since: inWindow ? tries.since : now }]]); };

  const acct = await db.get("accounts/" + id);
  const wrong = fail(401, "Pseudo ou mot de passe incorrect.");
  if (!acct) { await missed(); throw wrong; }
  if (acct.lockUntil > now) throw fail(429, `Trop d'essais ratés. Réessaie dans ${Math.ceil((acct.lockUntil - now) / 60000)} min.`);
  if (!await checkPassword(pass, acct.salt, acct.hash)) {
    const fails = (acct.fails || 0) + 1;
    await db.update("accounts/" + id, fails >= MAX_FAILS ? { fails: 0, lockUntil: now + LOCK_MS } : { fails });
    await missed();
    throw wrong;
  }
  if (acct.banned) throw fail(403, "Ce compte a été suspendu par l'admin.");
  await db.update("accounts/" + id, { fails: 0, lockUntil: 0, lastLoginAt: now });
  const claims = claimsFor(env, acct.pseudo);
  return { pseudo: acct.pseudo, admin: !!claims.admin, token: customToken(cred, acct.uid, claims) };
}

// Everything an account owns, for its deletion: profile, stats, saves (and their pieces), group membership.
async function ownedPaths(db, uid) {
  const prof = await db.get("profiles/" + uid);
  const [stats, saves] = await Promise.all([db.list(`profiles/${uid}/stats`), db.list(`profiles/${uid}/saves`)]);
  const chunks = (await Promise.all(saves.map(s => db.list(`profiles/${uid}/saves/${s.id}/chunks`).then(cs => cs.map(c => `profiles/${uid}/saves/${s.id}/chunks/${c.id}`))))).flat();
  return [
    ...chunks, ...saves.map(s => `profiles/${uid}/saves/${s.id}`), ...stats.map(s => `profiles/${uid}/stats/${s.id}`),
    ...(prof?.party ? [`parties/${prof.party}/members/${uid}`] : []), ...(prof ? ["profiles/" + uid] : [])
  ];
}
async function removeAccount(db, cred, fetch, env, acct, id, now, by) {
  const devices = await db.where("accountDevices", "account", acct.pseudo);
  await db.commit([
    ["accountsArchive/" + acct.uid, { pseudo: acct.pseudo, uid: acct.uid, createdAt: acct.createdAt || 0, lastLoginAt: acct.lastLoginAt || 0, deletedAt: now, deletedBy: by }],
    ["accounts/" + id, null],
    ...devices.map(d => [d, null])
  ]);
  if (by === "self") await db.removeAll(await ownedPaths(db, acct.uid));
  await authUser(cred, fetch, env, "delete", { localId: acct.uid });
}

// The player's own account: change the password, or delete the account. Needs the session AND the current password.
export async function me(body, { env, fetch, now = Date.now() }) {
  const who = await verifyIdToken(body?.idToken, { fetch, now, env });
  const cred = credentials(env), db = store(cred, fetch, env);
  const id = sha256(String(who.pseudo || "").normalize("NFC").trim().toLowerCase());
  const acct = await db.get("accounts/" + id);
  if (!acct || acct.uid !== who.sub) throw fail(404, "Compte introuvable.");
  if (!await checkPassword(String(body.password ?? ""), acct.salt, acct.hash)) throw fail(401, "Mot de passe actuel incorrect.");
  if (body.action === "password") {
    const pass = String(body.newPassword ?? "");
    if (pass.length < PASS_MIN || pass.length > PASS_MAX) throw fail(400, `Le nouveau mot de passe doit faire au moins ${PASS_MIN} caractères.`);
    const salt = randomBytes(16).toString("hex");
    await db.update("accounts/" + id, { salt, hash: await hashPassword(pass, salt), fails: 0, lockUntil: 0 });
    return { ok: true };
  }
  if (body.action === "delete") {
    if (isAdminPseudo(env, acct.pseudo)) throw fail(400, "Un compte admin ne peut pas être supprimé : retire d'abord son pseudo de ADMIN_PSEUDO.");
    await removeAccount(db, cred, fetch, env, acct, id, now, "self");
    return { ok: true };
  }
  throw fail(400, "Action inconnue.");
}

// Daily (Netlify scheduled function): groups where nobody has been around for 3 days are closed.
export async function closeIdleGroups({ env, fetch, now = Date.now() }) {
  const cred = credentials(env), db = store(cred, fetch, env);
  const closed = [];
  for (const g of await db.list("parties")) {
    const members = await db.list(`parties/${g.id}/members`);
    const last = Math.max(g.createdAt || 0, ...members.map(m => m.seen || m.joinedAt || 0));
    if (now - last < GROUP_IDLE_MS) continue;
    await db.removeAll([...members.map(m => `parties/${g.id}/members/${m.id}`), "parties/" + g.id]);
    closed.push(g.id);
  }
  return { closed };
}

// Actions de l'admin. Le jeton doit porter `admin` ET le pseudo doit toujours être dans ADMIN_PSEUDO.
export async function admin(body, { env, fetch, now = Date.now() }) {
  const who = await verifyIdToken(body?.idToken, { fetch, now, env });
  if (!who.admin || !isAdminPseudo(env, who.pseudo)) throw fail(403, "Réservé à l'admin.");
  const cred = credentials(env), db = store(cred, fetch, env);
  const target = () => {
    const { pseudo, id } = readInput(body);
    if (!pseudo) throw fail(400, "Quel compte ?");
    return { pseudo, id };
  };

  if (body.action === "list") {
    const [live, gone] = await Promise.all([db.list("accounts"), db.list("accountsArchive")]);
    const pick = a => ({ pseudo: a.pseudo, uid: a.uid, createdAt: a.createdAt || 0, lastLoginAt: a.lastLoginAt || 0, locked: (a.lockUntil || 0) > now, banned: !!a.banned, admin: isAdminPseudo(env, a.pseudo) });
    return { accounts: [...live.map(pick), ...gone.map(a => ({ ...pick(a), deletedAt: a.deletedAt || 0, deletedBy: a.deletedBy || "admin" }))].sort((a, b) => b.createdAt - a.createdAt) };
  }
  if (body.action === "reset") {
    const { id } = target(), pass = String(body.password ?? "");
    if (pass.length < PASS_MIN || pass.length > PASS_MAX) throw fail(400, `Le mot de passe doit faire au moins ${PASS_MIN} caractères.`);
    if (!await db.get("accounts/" + id)) throw fail(404, "Compte introuvable.");
    const salt = randomBytes(16).toString("hex");
    await db.update("accounts/" + id, { salt, hash: await hashPassword(pass, salt), fails: 0, lockUntil: 0 });
    return { ok: true };
  }
  if (body.action === "delete") {
    const { id } = target(), acct = await db.get("accounts/" + id);
    if (!acct) throw fail(404, "Compte introuvable.");
    if (isAdminPseudo(env, acct.pseudo)) throw fail(400, "Un compte admin ne peut pas être supprimé d'ici.");
    await removeAccount(db, cred, fetch, env, acct, id, now, "admin");
    return { ok: true };
  }
  // Suspend: no new login, and Firebase stops renewing the current session (it ends within the hour).
  if (body.action === "ban" || body.action === "unban") {
    const { id } = target(), acct = await db.get("accounts/" + id);
    if (!acct) throw fail(404, "Compte introuvable.");
    if (isAdminPseudo(env, acct.pseudo)) throw fail(400, "Un compte admin ne peut pas être suspendu.");
    const banned = body.action === "ban";
    await db.update("accounts/" + id, { banned });
    await authUser(cred, fetch, env, "update", { localId: acct.uid, disableUser: banned });
    return { ok: true, banned };
  }
  if (body.action === "usage") return { usage: await usage(cred, fetch, now, env) };
  throw fail(400, "Action inconnue.");
}

/* ---------- HTTP ---------- */
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function handle(req, context, deps = { env: process.env, fetch: globalThis.fetch }) {
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });
  let body;
  try { body = JSON.parse((await req.text()).slice(0, 8000)); } catch { return json(400, { error: "Requête illisible." }); }
  const action = new URL(req.url).pathname.split("/").pop();
  try {
    if (action === "inscription") return json(200, await signup(body, context?.ip, deps));
    if (action === "connexion") return json(200, await login(body, context?.ip, deps));
    if (action === "moi") return json(200, await me(body, deps));
    if (action === "admin") return json(200, await admin(body, deps));
    return json(404, { error: "Action inconnue." });
  } catch (e) {
    if (e.public) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: "Le serveur des comptes a un problème. Réessaie dans un moment." });
  }
}
