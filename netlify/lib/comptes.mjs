// Comptes « Ce soir on joue » : un pseudo, un mot de passe, un seul compte par adresse IP.
// Tourne dans une fonction Netlify (elle seule voit l'IP du visiteur). Aucune dépendance npm :
// Firestore et Firebase Auth sont appelés en REST avec le compte de service du projet.
//
// Firestore (jamais lisible par les téléphones, voir firestore.rules) :
//   accounts/{id}     id = sha256(pseudo en minuscules) → pseudo, uid, sel, empreinte du mot de passe, échecs
//   accountIps/{id}   id = HMAC(IP)                     → pseudo du compte créé depuis cette connexion
// L'IP n'est jamais stockée en clair.

import { createHash, createHmac, createSign, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

export const PROJECT = "qui-de-nous-7244f";
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const MAX_FAILS = 10, LOCK_MS = 15 * 60 * 1000;

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
  const assertion = signJwt({ iss: cred.email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }, cred.key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  if (!res.ok) throw new Error("oauth " + res.status + " " + await res.text());
  return (await res.json()).access_token;
}

/* ---------- Firestore REST ---------- */
const enc = v => typeof v === "number" ? { integerValue: String(Math.trunc(v)) } : { stringValue: String(v) };
const encFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
const dec = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, "integerValue" in v ? Number(v.integerValue) : v.stringValue]));

function store(cred, fetch) {
  const call = async (url, init = {}) => {
    const token = await accessToken(cred, fetch);
    return fetch(url, { ...init, headers: { authorization: "Bearer " + token, "content-type": "application/json", ...init.headers } });
  };
  return {
    async get(path) {
      const res = await call(`${DOCS}/${path}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("get " + res.status + " " + await res.text());
      return dec((await res.json()).fields);
    },
    // Crée tous les documents d'un coup, ou aucun si l'un d'eux existe déjà.
    async createAll(docs) {
      const res = await call(`${DOCS.replace(/\/documents$/, "")}/documents:commit`, {
        method: "POST",
        body: JSON.stringify({ writes: docs.map(([path, data]) => ({ update: { name: `projects/${PROJECT}/databases/(default)/documents/${path}`, fields: encFields(data) }, currentDocument: { exists: false } })) })
      });
      if (res.ok) return true;
      const text = await res.text();
      if (res.status === 409 || /ALREADY_EXISTS|FAILED_PRECONDITION/.test(text)) return false;
      throw new Error("commit " + res.status + " " + text);
    },
    async update(path, data) {
      const mask = Object.keys(data).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
      const res = await call(`${DOCS}/${path}?${mask}&currentDocument.exists=true`, { method: "PATCH", body: JSON.stringify({ fields: encFields(data) }) });
      if (!res.ok) throw new Error("update " + res.status + " " + await res.text());
    }
  };
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

export async function signup(body, ip, { env, fetch }) {
  const { pseudo, pass, id } = readInput(body);
  if (!PSEUDO_RE.test(pseudo)) throw fail(400, "Le pseudo doit faire 3 à 18 caractères : lettres, chiffres, point, tiret ou tiret bas.");
  if (pass.length < PASS_MIN || pass.length > PASS_MAX) throw fail(400, `Le mot de passe doit faire au moins ${PASS_MIN} caractères.`);
  if (!ip) throw fail(400, "Impossible de reconnaître ta connexion.");
  const cred = credentials(env), db = store(cred, fetch), ipDoc = "accountIps/" + ipId(ip, cred);

  const [taken, ipUsed] = await Promise.all([db.get("accounts/" + id), db.get(ipDoc)]);
  if (taken) throw fail(409, "Ce pseudo est déjà pris.");
  if (ipUsed) throw fail(403, "Un compte a déjà été créé depuis cette connexion internet.");

  const uid = "acct_" + randomBytes(12).toString("hex"), salt = randomBytes(16).toString("hex"), now = Date.now();
  const ok = await db.createAll([
    ["accounts/" + id, { pseudo, uid, salt, hash: await hashPassword(pass, salt), createdAt: now, fails: 0, lockUntil: 0 }],
    [ipDoc, { account: pseudo, createdAt: now }]
  ]);
  if (!ok) throw fail(409, "Ce pseudo ou cette connexion vient d'être utilisé. Réessaie.");
  return { pseudo, token: customToken(cred, uid, { pseudo }) };
}

export async function login(body, { env, fetch }) {
  const { pseudo, pass, id } = readInput(body);
  if (!pseudo || !pass) throw fail(400, "Entre ton pseudo et ton mot de passe.");
  const cred = credentials(env), db = store(cred, fetch);
  const acct = await db.get("accounts/" + id);
  const wrong = fail(401, "Pseudo ou mot de passe incorrect.");
  if (!acct) throw wrong;
  const now = Date.now();
  if (acct.lockUntil > now) throw fail(429, `Trop d'essais ratés. Réessaie dans ${Math.ceil((acct.lockUntil - now) / 60000)} min.`);
  if (!await checkPassword(pass, acct.salt, acct.hash)) {
    const fails = (acct.fails || 0) + 1;
    await db.update("accounts/" + id, fails >= MAX_FAILS ? { fails: 0, lockUntil: now + LOCK_MS } : { fails });
    throw wrong;
  }
  if (acct.fails || acct.lockUntil) await db.update("accounts/" + id, { fails: 0, lockUntil: 0 });
  return { pseudo: acct.pseudo, token: customToken(cred, acct.uid, { pseudo: acct.pseudo }) };
}

/* ---------- HTTP ---------- */
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function handle(req, context, deps = { env: process.env, fetch: globalThis.fetch }) {
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });
  let body;
  try { body = JSON.parse((await req.text()).slice(0, 2000)); } catch { return json(400, { error: "Requête illisible." }); }
  const action = new URL(req.url).pathname.split("/").pop();
  try {
    if (action === "inscription") return json(200, await signup(body, context?.ip, deps));
    if (action === "connexion") return json(200, await login(body, deps));
    return json(404, { error: "Action inconnue." });
  } catch (e) {
    if (e.public) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: "Le serveur des comptes a un problème. Réessaie dans un moment." });
  }
}
