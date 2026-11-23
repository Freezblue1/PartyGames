// « Ce soir on joue » : ce qui est commun à l'accueil et aux neuf jeux.
//   - le compte (connexion, inscription, couleur, mot de passe, suppression) et sa fenêtre
//   - les stats de chaque jeu, gardées dans le compte, et le classement du groupe
//   - les groupes : qui est là, le chef (que l'on peut passer ou reprendre) ; quand le chef entre dans une partie,
//     tout le groupe le suit
//   - les sauvegardes (partie entière ou résultat), leur partage par lien et le lecteur « Revoir » :
//     chaque jeu raconte sa partie coup par coup (son « journal »), le lecteur la reconstruit
//   - l'espace admin
// Les jeux l'importent (import * as Soiree from "../soiree.js") ; l'accueil appelle mountHub().
import { firebaseConfig } from "./config.js";

const FB = window.LG_FB || window.UC_FB || "https://www.gstatic.com/firebasejs/10.12.2/";
export const COLORS = ["#D93A26", "#2F62D0", "#18825A", "#7C47CC", "#B86400", "#C2307C", "#0F7C8F", "#5E5C17", "#8C3B1F", "#3D4A63"];
export const GAMES = {
  quidenous: "Qui de nous…", undercover: "Undercover", "loup-garou": "Loup-Garou", photoroulette: "Photo Roulette",
  "blanc-manger-coco": "Blanc-manger coco", perudo: "Perudo", quisuisje: "Qui suis-je ?", poker: "Poker", kems: "Kems"
};
const ROOM_COLS = { quidenous: "rooms", undercover: "ucRooms", "loup-garou": "lgRooms", photoroulette: "prRooms", "blanc-manger-coco": "bmRooms", perudo: "pdRooms", quisuisje: "qsRooms", poker: "pkRooms", kems: "kmRooms" };
const NO_TV = new Set(["photoroulette"]);
const ROOT = new URL("./", import.meta.url);
const GAME = (() => { const seg = decodeURIComponent(location.pathname.slice(ROOT.pathname.length).split("/")[0]); return GAMES[seg] ? seg : null; })();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CHUNK = 900000, MAX_SAVE = 8 * CHUNK;
const ONLINE_MS = 100 * 1000, BEAT_MS = 45 * 1000, HOST_AWAY_MS = 10 * 60 * 1000;
const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = ms => ms ? new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return !ms ? "—" : m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const tsMs = t => t?.toMillis ? t.toMillis() : +t || 0;
const local = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
};
const errText = err => err?.code ? "Action refusée (" + err.code + ")." : err?.message || "Ça n'a pas marché.";

/* ---------- Firebase (the same instance as the game's) ---------- */
let A = null, auth = null, Fs = null, fs = null, fbP = null;
function firebase() {
  return fbP ||= (async () => {
    const [appMod, authMod, fsMod] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]);
    const app = appMod.getApps()[0] || appMod.initializeApp(firebaseConfig);
    A = authMod; auth = A.getAuth(app); Fs = fsMod; fs = Fs.getFirestore(app);
    useEmulators(A, auth, Fs, fs);
    await auth.authStateReady();
  })();
}

// Tests only (tests/e2e): the test sets window.SOIREE_EMULATORS before the page loads, so the page
// talks to the local Firebase emulators instead of the real project. Games call this right after getAuth/getFirestore.
const EMU = window.SOIREE_EMULATORS || null, wired = new WeakSet();
export function useEmulators(authMod, a, fsMod, db) {
  if (!EMU) return;
  if (!wired.has(a)) { wired.add(a); authMod.connectAuthEmulator(a, EMU.auth, { disableWarnings: true }); }
  if (!wired.has(db)) { wired.add(db); fsMod.connectFirestoreEmulator(db, EMU.host, EMU.firestorePort); }
}
const ref = (...p) => Fs.doc(fs, ...p);

/* ---------- account ---------- */
let account = null;            // { uid, pseudo, admin, color, party }
let accountReady = null;       // the first load of the account, awaited before the account window draws
export let replaying = false;  // true while a saved game is being replayed: games then write nothing
export const pseudo = () => account?.pseudo || "";
export const color = () => account?.color || null;
export const isAdmin = () => !!account?.admin;

const defaultColor = uid => COLORS[[...uid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

async function loadAccount() {
  const u = auth.currentUser;
  account = null;
  if (!u || u.isAnonymous) return null;
  const claims = (await u.getIdTokenResult().catch(() => null))?.claims || {};
  const name = String(claims.pseudo || "");
  if (!name) return null;
  let p = {};
  try {
    const s = await Fs.getDoc(ref("profiles", u.uid));
    if (s.exists()) p = s.data();
    else { p = { pseudo: name, color: defaultColor(u.uid), party: null, createdAt: Date.now() }; await Fs.setDoc(ref("profiles", u.uid), p); }
    if (p.pseudo !== name) await Fs.updateDoc(ref("profiles", u.uid), { pseudo: name });
  } catch {}
  account = { uid: u.uid, pseudo: name, admin: claims.admin === true, color: COLORS.includes(p.color) ? p.color : defaultColor(u.uid), party: p.party || null };
  return account;
}
const saveProfile = patch => Fs.updateDoc(ref("profiles", account.uid), patch);

// Identifies this phone for the "one account per phone" rule. Shared by every page of the site.
function deviceId() {
  try {
    let id = localStorage.getItem("soiree-appareil");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("soiree-appareil", id); }
    return id;
  } catch { return ""; }
}

async function api(action, body) {
  const res = await fetch(new URL("api/compte/" + action, ROOT), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(res.status === 404 || res.status === 501 ? "Les comptes ne marchent que sur le site en ligne." : "Le serveur ne répond pas. Réessaie dans un moment.");
  if (!res.ok) throw new Error(data.error || "Ça n'a pas marché. Réessaie.");
  return data;
}
const withSession = async body => ({ ...body, idToken: await auth.currentUser.getIdToken() });
const adminApi = async body => api("admin", await withSession(body));
const meApi = async body => api("moi", await withSession(body));

/* ---------- styles ---------- */
function ensureCss() {
  if (document.getElementById("so-css")) return;
  const l = document.createElement("link");
  l.id = "so-css"; l.rel = "stylesheet"; l.href = new URL("soiree.css", ROOT).href;
  document.head.appendChild(l);
}
function avatar(c, name, cls = "") { return `<span class="so-av ${cls}" style="background:${esc(c)}">${esc((name || "?")[0])}</span>`; }

/* ---------- stats, kept in the account ----------
   Each game keeps its stats in the phone's storage (store "profile"). With an account they also live in
   profiles/{uid}/stats/{game}, so they follow the player to any phone. A guest's own stats are put aside
   ("profile-guest") while an account is signed in on the phone, and come back when it signs out. */
let statsOwner = "";
export async function syncStats(store) {
  if (!GAME || replaying) return;
  const owner = store.get("profile-owner") || "";
  if (!account) {
    if (owner) { store.set("profile", store.get("profile-guest")); store.set("profile-guest", null); store.set("profile-owner", null); }
    statsOwner = "";
    return;
  }
  if (!owner) store.set("profile-guest", store.get("profile"));
  let remote = null;
  try { const s = await Fs.getDoc(ref("profiles", account.uid, "stats", GAME)); if (s.exists()) remote = JSON.parse(s.data().data); } catch {}
  statsOwner = account.uid;
  const mine = owner === account.uid ? store.json("profile", null) : null;
  if (mine && (+mine.games || 0) > (+remote?.games || 0)) pushStats(mine);                      // played offline last time: the phone is ahead
  else if (remote) store.set("profile", JSON.stringify(remote));
  else if (!owner) { const p = store.json("profile", null); if (p && p.games) pushStats(p); }  // first time: this phone's stats become the account's
  else if (owner !== account.uid) store.set("profile", null);                                 // another account's stats were cached here
  store.set("profile-owner", account.uid);
}
function pushStats(p) {
  return Fs.setDoc(ref("profiles", account.uid, "stats", GAME), { data: JSON.stringify(p), games: Math.trunc(+p.games || 0), wins: Math.trunc(+p.wins || 0), at: Date.now() })
    .catch(e => console.warn("stats not saved to the account:", e?.code || e));
}
// Called by a game each time it saves its stats (once per game): sent right away, before the player leaves.
export function statsSaved(p) {
  if (!account || replaying || !GAME || statsOwner !== account.uid) return;
  pushStats(p);
}
async function loadStats(uid) {
  const q = await Fs.getDocs(Fs.collection(fs, "profiles", uid, "stats"));
  return q.docs.map(d => { let data = {}; try { data = JSON.parse(d.data().data); } catch {} return { game: d.id, games: d.data().games || 0, wins: d.data().wins || 0, data }; });
}
const topOf = o => Object.entries(o || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "";

/* ---------- account window ---------- */
let dlg = null;
const ui = { tab: "profil", mode: "connexion", err: "", ok: "", busy: false, delOpen: false, saves: null, stats: null, adm: null, admTab: "comptes", admUser: null, admSaves: null, live: null, usage: null, counts: null };

function saveRow(s, uid, mine) {
  const link = new URL(`${s.game}/?revoir=${encodeURIComponent(uid + "." + s.id)}`, ROOT).href;
  return `<li class="so-save">
    <div class="so-save-main"><b>${esc(GAMES[s.game] || s.game)}</b> <span class="so-tag">${s.kind === "result" ? "Résultat" : "Partie entière"}</span>${s.public ? ` <span class="so-tag so-pub">Partagée</span>` : ""}
      <small>${when(s.at)}${s.players?.length ? " · " + esc(s.players.slice(0, 8).join(", ")) : ""}</small></div>
    <div class="so-save-acts"><a class="so-btn so-sm" href="${link}">${s.kind === "result" ? "Voir" : "Revoir"}</a>
      ${mine ? (s.public
        ? `<button class="so-btn so-sm" data-so="share" data-id="${esc(s.id)}" data-link="${esc(link)}">Copier le lien</button><button class="so-btn so-sm so-ghost" data-so="unshare" data-id="${esc(s.id)}">Ne plus partager</button>`
        : `<button class="so-btn so-sm" data-so="share" data-id="${esc(s.id)}" data-link="${esc(link)}">Partager</button>`) : ""}
      ${mine || isAdmin() ? `<button class="so-btn so-sm so-ghost" data-so="save-del" data-uid="${esc(uid)}" data-id="${esc(s.id)}" aria-label="Supprimer">✕</button>` : ""}</div>
  </li>`;
}
function savesList(list, uid, mine) {
  if (!list) return `<p class="so-hint">Chargement…</p>`;
  if (!list.length) return `<p class="so-hint">${mine ? "Aucune sauvegarde pour l'instant. À la fin d'une partie, un bouton te propose de garder la partie entière ou juste le résultat." : "Aucune sauvegarde."}</p>`;
  return `${mine ? `<p class="so-hint">« Partager » crée un lien : n'importe qui peut revoir la partie avec, même sans compte.</p>` : ""}<ul class="so-saves">${list.map(s => saveRow(s, uid, mine)).join("")}</ul>`;
}
function statsHtml(list) {
  if (!list) return `<p class="so-hint">Chargement…</p>`;
  const by = Object.fromEntries(list.map(s => [s.game, s]));
  const total = list.reduce((a, s) => ({ games: a.games + s.games, wins: a.wins + s.wins }), { games: 0, wins: 0 });
  return `<div class="so-total"><div><b>${total.games}</b><small>parties</small></div><div><b>${total.wins}</b><small>victoires</small></div><div><b>${total.games ? Math.round(100 * total.wins / total.games) : 0}%</b><small>de victoires</small></div></div>
    <ul class="so-statlist">${Object.entries(GAMES).map(([g, name]) => {
      const s = by[g], title = s && topOf(s.data.titles);
      return `<li><b>${esc(name)}</b>${g === "photoroulette" ? `<small>pas de stats dans ce jeu</small>` : s && s.games
        ? `<span>${s.games} partie${s.games > 1 ? "s" : ""} · ${s.wins} victoire${s.wins > 1 ? "s" : ""}</span>${title ? `<small>Titre fétiche : ${esc(title)}</small>` : ""}`
        : `<small>pas encore joué avec ce compte</small>`}</li>`;
    }).join("")}</ul>
    <p class="so-hint">Les stats suivent ton compte sur tous tes appareils. Celles d'avant ton compte, sur ce téléphone, y ont été ajoutées.</p>`;
}

function accountHtml() {
  const err = ui.err ? `<p class="so-err" role="alert">${esc(ui.err)}</p>` : "";
  const ok = ui.ok ? `<p class="so-ok" role="status">${esc(ui.ok)}</p>` : "";
  if (!account) {
    const signup = ui.mode === "inscription";
    return `<form class="so-stack" data-so-form="auth" novalidate>
      <div class="so-seg" role="group" aria-label="Choix">
        <button type="button" data-so="mode" data-m="connexion" aria-pressed="${!signup}">Se connecter</button>
        <button type="button" data-so="mode" data-m="inscription" aria-pressed="${signup}">Créer un compte</button>
      </div>
      <label class="so-field"><span>Pseudo</span><input id="so-pseudo" aria-label="Pseudo" name="username" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="18" required></label>
      <label class="so-field"><span>Mot de passe</span><span class="so-pw"><input id="so-pass" aria-label="Mot de passe" name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" maxlength="128" required><button type="button" class="so-show" data-so="show-pass" aria-pressed="false">Afficher</button></span></label>
      <p class="so-hint">${signup ? "3 à 18 caractères pour le pseudo, 6 au moins pour le mot de passe. Un seul compte par téléphone." : "Ton pseudo, ta couleur et tes stats te suivent dans tous les jeux, sur tous tes appareils."}</p>
      ${err}${ok}
      <button class="so-btn so-primary so-big" type="submit" ${ui.busy ? "disabled" : ""}>${ui.busy ? "Un instant…" : signup ? "Créer mon compte" : "Se connecter"}</button>
    </form>`;
  }
  const tabs = [["profil", "Profil"], ["stats", "Stats"], ["saves", "Sauvegardes"], ...(isAdmin() ? [["admin", "Admin"]] : [])];
  let body = "";
  if (ui.tab === "profil") {
    body = `<div class="so-me">${avatar(account.color, account.pseudo, "so-xl")}<div><b>${esc(account.pseudo)}</b>${isAdmin() ? ` <span class="so-tag so-admin">Admin</span>` : ""}<small>Ton pseudo est ton nom dans tous les jeux.</small></div></div>
      <div class="so-label">Ma couleur</div>
      <div class="so-swatches" role="group" aria-label="Ma couleur">${COLORS.map(c => `<button class="so-swatch" data-so="color" data-c="${c}" style="background:${c}" aria-pressed="${account.color === c}" aria-label="Couleur ${c}"></button>`).join("")}</div>
      <p class="so-hint">Elle s'applique aux prochaines parties que tu rejoins.</p>
      ${err}${ok}
      <details class="so-more"><summary>Changer mon mot de passe</summary>
        <form class="so-stack" data-so-form="password">
          <input class="so-input" id="so-cur" type="password" autocomplete="current-password" placeholder="Mot de passe actuel" aria-label="Mot de passe actuel" required>
          <input class="so-input" id="so-new" type="password" autocomplete="new-password" placeholder="Nouveau mot de passe (6 caractères au moins)" aria-label="Nouveau mot de passe" required>
          <button class="so-btn" type="submit" ${ui.busy ? "disabled" : ""}>Changer le mot de passe</button>
        </form></details>
      <details class="so-more" ${ui.delOpen ? "open" : ""}><summary>Supprimer mon compte</summary>
        <form class="so-stack" data-so-form="delete-me">
          <p class="so-hint">Ton compte, ton profil, tes stats et tes sauvegardes sont effacés, et tu quittes ton groupe. Impossible de revenir en arrière. Ton pseudo et ce téléphone pourront servir à un nouveau compte.</p>
          <input class="so-input" id="so-del-pass" type="password" autocomplete="current-password" placeholder="Ton mot de passe, pour confirmer" aria-label="Mot de passe pour confirmer" required>
          <button class="so-btn so-danger" type="submit" ${ui.busy ? "disabled" : ""}>Supprimer définitivement mon compte</button>
        </form></details>
      <button class="so-btn so-big" data-so="logout">Se déconnecter</button>`;
  } else if (ui.tab === "stats") {
    body = err + statsHtml(ui.stats);
  } else if (ui.tab === "saves") {
    body = err + ok + savesList(ui.saves, account.uid, true);
  } else if (ui.tab === "admin") {
    body = `<div class="so-seg so-subtabs" role="group" aria-label="Admin">${[["comptes", "Comptes"], ["live", "En direct"], ["firebase", "Firebase"]].map(([id, l]) =>
      `<button type="button" data-so="adm-tab" data-t="${id}" aria-pressed="${ui.admTab === id}">${l}</button>`).join("")}</div>${err}${ok}` + adminHtml();
  }
  return `<div class="so-tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" data-so="tab" data-t="${id}" aria-selected="${ui.tab === id}">${label}</button>`).join("")}</div>
    <div class="so-stack">${body}</div>`;
}

function adminHtml() {
  if (ui.admTab === "comptes") {
    if (ui.admUser) return `<button class="so-link" data-so="adm-back">← Tous les comptes</button>
      <div class="so-label">Sauvegardes de ${esc(ui.admUser.pseudo)}</div>${savesList(ui.admSaves, ui.admUser.uid, false)}`;
    const list = ui.adm;
    if (!list) return `<p class="so-hint">Chargement…</p>`;
    const gone = list.filter(a => a.deletedAt).length;
    return `<p class="so-hint">${list.length} compte${list.length > 1 ? "s" : ""} créé${list.length > 1 ? "s" : ""} depuis le début, ${gone} supprimé${gone > 1 ? "s" : ""}, ${list.filter(a => a.banned && !a.deletedAt).length} suspendu(s).</p>
      <input class="so-input" id="so-filter" type="search" placeholder="Chercher un pseudo" aria-label="Chercher un pseudo" autocomplete="off">
      <ul class="so-accts">${list.map(a => `<li data-p="${esc(a.pseudo.toLowerCase())}" class="${a.deletedAt ? "so-gone" : ""}">
        <div class="so-acct-main"><b>${esc(a.pseudo)}</b>${a.admin ? ` <span class="so-tag so-admin">Admin</span>` : ""}${a.deletedAt ? ` <span class="so-tag">Supprimé le ${when(a.deletedAt)}${a.deletedBy === "self" ? " (par lui-même)" : ""}</span>` : ""}${a.banned && !a.deletedAt ? ` <span class="so-tag so-ban">Suspendu</span>` : ""}${a.locked ? ` <span class="so-tag">Bloqué 15 min</span>` : ""}
          <small>Créé le ${when(a.createdAt)} · dernière connexion ${when(a.lastLoginAt)}</small></div>
        <div class="so-acct-acts">
          <button class="so-btn so-sm" data-so="adm-saves" data-uid="${esc(a.uid)}" data-p="${esc(a.pseudo)}">Sauvegardes</button>
          ${a.deletedAt || a.admin ? "" : `<button class="so-btn so-sm" data-so="adm-reset" data-p="${esc(a.pseudo)}">Mot de passe</button>
          <button class="so-btn so-sm" data-so="${a.banned ? "adm-unban" : "adm-ban"}" data-p="${esc(a.pseudo)}">${a.banned ? "Réactiver" : "Suspendre"}</button>
          <button class="so-btn so-sm so-danger" data-so="adm-del" data-p="${esc(a.pseudo)}">Supprimer</button>`}
        </div></li>`).join("")}</ul>`;
  }
  if (ui.admTab === "live") {
    const L = ui.live;
    if (!L) return `<p class="so-hint">Chargement…</p>`;
    const rooms = L.rooms, groups = L.groups;
    return `<div class="so-label">Parties (${rooms.length})</div>
      ${rooms.length ? `<ul class="so-accts">${rooms.map(r => `<li class="${r.fresh ? "" : "so-gone"}"><div class="so-acct-main"><b>${esc(GAMES[r.game])} · ${esc(r.code)}</b> <span class="so-tag">${esc(r.phase || "?")}</span>${r.fresh ? ` <span class="so-tag so-pub">En cours</span>` : ""}
          <small>${r.players == null ? "" : `${r.players} joueur${r.players > 1 ? "s" : ""} · `}dernière action ${ago(r.touched)}</small></div>
          <div class="so-acct-acts">${NO_TV.has(r.game) ? "" : `<a class="so-btn so-sm" href="${new URL(`${r.game}/#${r.code}-tv`, ROOT).href}" target="_blank" rel="noopener">Regarder</a>`}
          <button class="so-btn so-sm so-danger" data-so="adm-room-del" data-g="${esc(r.game)}" data-code="${esc(r.code)}">Fermer</button></div></li>`).join("")}</ul>` : `<p class="so-hint">Aucune partie.</p>`}
      <div class="so-label">Groupes (${groups.length})</div>
      ${groups.length ? `<ul class="so-accts">${groups.map(g => `<li><div class="so-acct-main"><b>${esc(g.code)}</b> · chef ${esc(g.hostPseudo || "?")}${g.current && GAMES[g.current.game] ? ` <span class="so-tag">${esc(GAMES[g.current.game])}</span>` : ""}
          <small>${g.members.length} membre${g.members.length > 1 ? "s" : ""}, ${g.members.filter(online).length} en ligne · ${esc(g.members.map(m => m.pseudo).join(", "))}</small></div>
          <div class="so-acct-acts"><button class="so-btn so-sm so-danger" data-so="adm-group-del" data-code="${esc(g.code)}">Dissoudre</button></div></li>`).join("")}</ul>` : `<p class="so-hint">Aucun groupe.</p>`}
      <button class="so-btn" data-so="adm-tab" data-t="live">Actualiser</button>`;
  }
  // Firebase usage against the free plan
  const U = ui.usage, C = ui.counts;
  const bar = (label, n, max) => `<div class="so-usage"><div><b>${label}</b><span>${n.toLocaleString("fr-FR")} / ${max.toLocaleString("fr-FR")}</span></div>
    <div class="so-meter" role="meter" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${n}" aria-label="${label}"><i style="width:${Math.min(100, 100 * n / max).toFixed(1)}%" class="${n / max > 0.8 ? "hot" : ""}"></i></div></div>`;
  return `${U === null ? `<p class="so-hint">Chargement…</p>` : U.error ? `<p class="so-err">${esc(U.error)}</p>` : `
      <p class="so-hint">Aujourd'hui (depuis minuit, heure de Californie, quand Firebase remet les compteurs à zéro). Forfait gratuit Spark.</p>
      ${bar("Lectures", U.reads, U.limits.reads)}${bar("Écritures", U.writes, U.limits.writes)}${bar("Suppressions", U.deletes, U.limits.deletes)}`}
    ${C ? `<div class="so-total"><div><b>${C.accounts}</b><small>comptes</small></div><div><b>${C.saves ?? "?"}</b><small>sauvegardes</small></div><div><b>${C.rooms}</b><small>parties</small></div><div><b>${C.groups}</b><small>groupes</small></div></div>` : ""}
    <p class="so-hint">Stockage : 1 Go gratuit. Les sauvegardes sont compressées et font quelques Ko chacune.</p>
    <button class="so-btn" data-so="adm-tab" data-t="firebase">Actualiser</button>`;
}

function drawAccount() {
  if (!dlg) return;
  const open = [...dlg.querySelectorAll("details[open] summary")].map(s => s.textContent);
  dlg.querySelector(".so-body").innerHTML = accountHtml();
  dlg.querySelectorAll("details summary").forEach(s => { if (open.includes(s.textContent)) s.parentElement.open = true; });
  if (!account) setTimeout(() => dlg.querySelector("#so-pseudo")?.focus(), 0);
}

async function loadSaves(uid) {
  const q = Fs.query(Fs.collection(fs, "profiles", uid, "saves"), Fs.orderBy("at", "desc"), Fs.limit(100));
  return (await Fs.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
}
async function deleteSave(uid, id) {
  const chunks = await Fs.getDocs(Fs.collection(fs, "profiles", uid, "saves", id, "chunks"));
  const b = Fs.writeBatch(fs);
  chunks.docs.forEach(d => b.delete(d.ref));
  b.delete(ref("profiles", uid, "saves", id));
  await b.commit();
}
// On a phone, the share sheet (WhatsApp…); on a computer, copy the link.
async function shareLink(link, title) {
  const phone = matchMedia("(pointer: coarse)").matches;
  try { if (phone && navigator.share) { await navigator.share({ title: "Ce soir on joue", text: title, url: link }); return "Lien partagé."; } }
  catch (err) { if (err?.name === "AbortError") return ""; }
  try { await navigator.clipboard.writeText(link); return "Lien copié : colle-le dans le groupe."; } catch { return link; }
}

// Admin: rooms of every game and every group, straight from Firestore (the admin may read everything).
async function loadLive() {
  const rooms = [];
  await Promise.all(Object.entries(ROOM_COLS).map(async ([game, col]) => {
    for (const d of (await Fs.getDocs(Fs.collection(fs, col))).docs) {
      const x = d.data(), touched = tsMs(x.touchedAt) || tsMs(x.roundAt) || tsMs(x.createdAt) || 0;
      rooms.push({ game, code: d.id, phase: x.phase, touched, fresh: Date.now() - touched < 6 * 3600 * 1000, players: null });
    }
  }));
  rooms.sort((a, b) => b.touched - a.touched);
  await Promise.all(rooms.filter(r => r.fresh).map(async r => {
    try { r.players = (await Fs.getCountFromServer(Fs.collection(fs, ROOM_COLS[r.game], r.code, "players"))).data().count; } catch {}
  }));
  const groups = await Promise.all((await Fs.getDocs(Fs.collection(fs, "parties"))).docs.map(async d => ({
    code: d.id, ...d.data(),
    members: (await Fs.getDocs(Fs.collection(fs, "parties", d.id, "members"))).docs.map(m => ({ uid: m.id, ...m.data({ serverTimestamps: "estimate" }) }))
  })));
  return { rooms, groups };
}
async function loadCounts() {
  const count = async q => { try { return (await Fs.getCountFromServer(q)).data().count; } catch { return null; } };
  const [saves, groups, ...rooms] = await Promise.all([count(Fs.collectionGroup(fs, "saves")), count(Fs.collection(fs, "parties")),
    ...Object.values(ROOM_COLS).map(c => count(Fs.collection(fs, c)))]);
  return { accounts: ui.adm ? ui.adm.filter(a => !a.deletedAt).length : "?", saves, groups: groups ?? "?", rooms: rooms.reduce((a, n) => a + (n || 0), 0) };
}

async function openTab(t) {
  ui.tab = t; ui.err = ""; ui.ok = ""; drawAccount();
  try {
    if (t === "saves") { ui.saves = null; drawAccount(); ui.saves = await loadSaves(account.uid); }
    if (t === "stats") { ui.stats = null; drawAccount(); ui.stats = await loadStats(account.uid); }
    if (t === "admin") await openAdminTab(ui.admTab);
  } catch (e) { ui.err = e.message || "Chargement impossible."; }
  drawAccount();
}
async function openAdminTab(t) {
  ui.admTab = t; ui.err = ""; drawAccount();
  if (t === "comptes" && !ui.admUser) { ui.adm = null; drawAccount(); ui.adm = (await adminApi({ action: "list" })).accounts; }
  if (t === "live") { ui.live = null; drawAccount(); ui.live = await loadLive(); }
  if (t === "firebase") {
    ui.usage = null; drawAccount();
    if (!ui.adm) ui.adm = (await adminApi({ action: "list" }).catch(() => ({ accounts: null }))).accounts;
    const [u, c] = await Promise.all([adminApi({ action: "usage" }).then(r => r.usage, e => ({ error: e.message })), loadCounts()]);
    ui.usage = u; ui.counts = c;
  }
}

// After signing in or out inside a game, the page reloads so the game picks up the new identity.
async function afterAuthChange() {
  await loadAccount();
  if (GAME) { location.reload(); return; }
  ui.tab = "profil"; ui.delOpen = false; drawAccount(); drawHubButton(); watchParty(); drawParty();
}

async function onAccountClick(e) {
  const b = e.target.closest("[data-so]");
  if (e.target === dlg || b?.dataset.so === "close") { dlg.close(); return; }
  if (!b) return;
  const d = b.dataset;
  ui.ok = "";
  try {
    switch (d.so) {
      case "mode": ui.mode = d.m; ui.err = ""; drawAccount(); break;
      case "show-pass": {
        const i = dlg.querySelector("#so-pass"), show = i.type === "password";
        i.type = show ? "text" : "password"; b.setAttribute("aria-pressed", String(show)); b.textContent = show ? "Cacher" : "Afficher";
        break;
      }
      case "tab": await openTab(d.t); break;
      case "logout": await A.signOut(auth); await afterAuthChange(); break;
      case "color":
        if (!COLORS.includes(d.c)) break;
        account.color = d.c; drawAccount(); drawHubButton();
        await saveProfile({ color: d.c });
        if (party?.code) await Fs.updateDoc(ref("parties", party.code, "members", account.uid), { color: d.c }).catch(() => {});
        drawParty();
        break;
      case "share": case "unshare": {
        const pub = d.so === "share";
        await Fs.updateDoc(ref("profiles", account.uid, "saves", d.id), { public: pub });
        ui.saves = ui.saves.map(s => s.id === d.id ? { ...s, public: pub } : s);
        ui.ok = pub ? await shareLink(d.link, "Revois notre partie sur Ce soir on joue :") : "Ce lien ne marche plus.";
        drawAccount();
        break;
      }
      case "save-del":
        if (!confirm("Supprimer cette sauvegarde ? Elle ne pourra pas être récupérée.")) break;
        await deleteSave(d.uid, d.id);
        if (ui.admUser) ui.admSaves = ui.admSaves.filter(s => s.id !== d.id); else ui.saves = ui.saves.filter(s => s.id !== d.id);
        drawAccount();
        break;
      case "adm-tab": await openAdminTab(d.t); drawAccount(); break;
      case "adm-saves":
        ui.admUser = { uid: d.uid, pseudo: d.p }; ui.admSaves = null; ui.err = ""; drawAccount();
        ui.admSaves = await loadSaves(d.uid); drawAccount();
        break;
      case "adm-back": ui.admUser = null; ui.err = ""; drawAccount(); break;
      case "adm-reset": {
        const pass = prompt(`Nouveau mot de passe pour ${d.p} (6 caractères au moins) :`);
        if (!pass) break;
        await adminApi({ action: "reset", pseudo: d.p, password: pass });
        ui.ok = `Mot de passe de ${d.p} changé.`; drawAccount();
        break;
      }
      case "adm-ban": case "adm-unban": {
        const ban = d.so === "adm-ban";
        if (ban && !confirm(`Suspendre ${d.p} ? Il ne pourra plus se connecter, et sa session en cours s'arrête dans l'heure. Rien n'est effacé : tu pourras le réactiver.`)) break;
        await adminApi({ action: ban ? "ban" : "unban", pseudo: d.p });
        ui.adm = (await adminApi({ action: "list" })).accounts; ui.ok = ban ? `${d.p} est suspendu.` : `${d.p} est réactivé.`; drawAccount();
        break;
      }
      case "adm-del":
        if (!confirm(`Supprimer le compte ${d.p} ? Il ne pourra plus se connecter, son pseudo et son téléphone seront libérés. Il restera dans la liste comme supprimé.`)) break;
        await adminApi({ action: "delete", pseudo: d.p });
        ui.adm = (await adminApi({ action: "list" })).accounts; drawAccount();
        break;
      case "adm-room-del":
        if (!confirm(`Fermer la partie ${GAMES[d.g]} ${d.code} ? Les joueurs dedans seront renvoyés à l'accueil du jeu.`)) break;
        await Fs.deleteDoc(ref(ROOM_COLS[d.g], d.code));
        ui.live.rooms = ui.live.rooms.filter(r => !(r.game === d.g && r.code === d.code)); drawAccount();
        break;
      case "adm-group-del": {
        if (!confirm(`Dissoudre le groupe ${d.code} ?`)) break;
        const members = await Fs.getDocs(Fs.collection(fs, "parties", d.code, "members"));
        const bt = Fs.writeBatch(fs);
        members.docs.forEach(m => bt.delete(m.ref));
        bt.delete(ref("parties", d.code));
        await bt.commit();
        ui.live.groups = ui.live.groups.filter(g => g.code !== d.code); drawAccount();
        break;
      }
    }
  } catch (err) { ui.err = errText(err); drawAccount(); }
}

async function onAccountSubmit(e) {
  e.preventDefault();
  if (ui.busy) return;
  const form = e.target.dataset.soForm;
  ui.err = ""; ui.ok = "";
  if (form === "password") {
    const cur = dlg.querySelector("#so-cur").value, next = dlg.querySelector("#so-new").value;
    ui.busy = true; drawAccount();
    try { await meApi({ action: "password", password: cur, newPassword: next }); ui.ok = "Mot de passe changé."; }
    catch (err) { ui.err = errText(err); }
    ui.busy = false; drawAccount();
    return;
  }
  if (form === "delete-me") {
    const pass = dlg.querySelector("#so-del-pass").value;
    if (!confirm("Supprimer ton compte pour de bon ? Tes stats et tes sauvegardes seront effacées.")) return;
    ui.busy = true; ui.delOpen = true; drawAccount();
    try {
      await meApi({ action: "delete", password: pass });
      stopParty();
      await A.signOut(auth);
      ui.busy = false; ui.delOpen = false;
      await afterAuthChange();
      ui.ok = "Ton compte a été supprimé."; drawAccount();
    } catch (err) { ui.busy = false; ui.err = errText(err); drawAccount(); }
    return;
  }
  // sign in / sign up
  const name = dlg.querySelector("#so-pseudo").value.trim(), password = dlg.querySelector("#so-pass").value;
  if (!name || !password) { ui.err = "Entre ton pseudo et ton mot de passe."; drawAccount(); return; }
  ui.busy = true; drawAccount();
  try {
    await firebase();
    const data = await api(ui.mode, { pseudo: name, password, device: deviceId() });
    await A.signInWithCustomToken(auth, data.token);
    ui.busy = false;
    await afterAuthChange();
  } catch (err) {
    ui.busy = false;
    ui.err = err?.code ? "Connexion à Firebase impossible (" + err.code + ")." : err?.message || "Pas de réseau ?";
    drawAccount();
    dlg.querySelector("#so-pseudo").value = name;
  }
}

export async function openAccount(tab) {
  ensureCss();
  await firebase();
  await accountReady?.catch(() => null);  // opened right after the page loads: wait to know who is signed in
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.className = "so-sheet";
    dlg.setAttribute("aria-label", "Mon compte");
    dlg.innerHTML = `<div class="so-sheet-top"><h2 class="so-title">Mon compte</h2><button class="so-x" type="button" data-so="close" aria-label="Fermer">×</button></div><div class="so-body"></div>`;
    dlg.addEventListener("click", onAccountClick);
    dlg.addEventListener("submit", onAccountSubmit);
    dlg.addEventListener("input", e => {
      if (e.target.id !== "so-filter") return;
      const q = e.target.value.trim().toLowerCase();
      dlg.querySelectorAll(".so-accts li").forEach(li => { li.hidden = !!q && !li.dataset.p.includes(q); });
    });
    document.body.appendChild(dlg);
  }
  ui.err = ""; ui.ok = "";
  drawAccount();
  dlg.showModal();
  if (account && tab) openTab(tab);
}

/* ---------- groups ("parties") ----------
   parties/{code}: { hostUid, hostPseudo, createdAt, current: { game, room, at } | null }
   parties/{code}/members/{uid}: { pseudo, color, joinedAt, seen (server time), where (game or "accueil") }
   Every open page says "I'm here" every 45 s. When the host enters a room in a game, `current` changes and
   every member's page follows. The host can pass the role on; when the host has left or been away 10 minutes,
   any member can take it. A group nobody visits for 3 days is closed by the server (netlify/functions/menage.mjs). */
let party = null;   // { code, data, members, unsubs }
let currentRoom = "", beatT = null;
const followKey = code => "soiree-suivi-" + code;
const online = m => Date.now() - tsMs(m.seen) < ONLINE_MS;
const placeOf = m => !m.where || m.where === "accueil" ? "sur l'accueil" : GAMES[m.where] ? "dans " + GAMES[m.where] : "";

function stopParty() { party?.unsubs.forEach(u => u()); party = null; clearInterval(beatT); beatT = null; }
function beat() {
  if (!party?.code || !account || document.visibilityState !== "visible") return;
  Fs.updateDoc(ref("parties", party.code, "members", account.uid), { seen: Fs.serverTimestamp(), where: GAME || "accueil" }).catch(() => {});
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") beat(); });

function watchParty() {
  const code = account?.party;
  if (party?.code === code) return;
  stopParty();
  if (!code) { drawParty(); return; }
  party = { code, data: null, members: [], unsubs: [], ranking: null };
  party.unsubs.push(Fs.onSnapshot(ref("parties", code), s => {
    if (!s.exists()) { leftParty(); return; }
    party.data = s.data();
    announce();  // the host may have opened a room before the group had loaded
    if (isHost()) markFollowed();  // a leader who later hands the role on must not be sent into their own room
    follow();
    drawParty();
  }, () => leftParty()));
  party.unsubs.push(Fs.onSnapshot(Fs.collection(fs, "parties", code, "members"), q => {
    party.members = q.docs.map(d => ({ uid: d.id, ...d.data({ serverTimestamps: "estimate" }) })).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    if (party.data && !party.members.some(m => m.uid === account.uid)) { leftParty(); return; }  // removed by the host
    drawParty();
  }, () => {}));
  beat();
  beatT = setInterval(() => { beat(); drawParty(); }, BEAT_MS);
}
async function leftParty() {
  stopParty();
  if (account) { account.party = null; await saveProfile({ party: null }).catch(() => {}); }
  drawParty();
}
const isHost = () => !!party?.data && party.data.hostUid === account?.uid;
const hostMember = () => party?.members.find(m => m.uid === party.data?.hostUid);
const hostAway = () => { const h = hostMember(); return !h || Date.now() - tsMs(h.seen) > HOST_AWAY_MS; };

function gameUrl(game, room) { return new URL(`${game}/#${room}`, ROOT).href; }
function goTo(game, room) {
  try { sessionStorage.setItem("soiree-autojoin", room); } catch {}
  const url = gameUrl(game, room), samePage = GAME === game;
  location.href = url;
  if (samePage) location.reload();  // only the #hash changed: reload so the game opens that room
}
// A member's page follows the host into the room the host just entered (once per change).
const currentKey = () => { const c = party?.data?.current; return c ? `${c.game}:${c.room}:${c.at}` : ""; };
function markFollowed() { if (currentKey()) local.set(followKey(party.code), currentKey()); }
function follow() {
  const c = party?.data?.current;
  if (!c || !GAMES[c.game] || isHost()) return;
  const key = currentKey();
  if (local.get(followKey(party.code)) === key) return;
  local.set(followKey(party.code), key);
  if (GAME === c.game && currentRoom === c.room) return;
  goTo(c.game, c.room);
}

// Called by a game each time it opens a room. The host's room becomes the group's room.
export function roomEntered(code, tv = false) {
  if (tv || replaying) return;
  currentRoom = code;
  announce();
}
function announce() {
  if (!isHost() || !GAME || !currentRoom) return;
  const c = party.data.current;
  if (c && c.game === GAME && c.room === currentRoom) return;
  party.data.current = { game: GAME, room: currentRoom, at: Date.now() };
  markFollowed();
  Fs.updateDoc(ref("parties", party.code), { current: party.data.current }).catch(() => {});
}
// The room a member was sent to by the group, to join without asking.
export function autoJoinCode() {
  try { const c = sessionStorage.getItem("soiree-autojoin"); sessionStorage.removeItem("soiree-autojoin"); return account ? c || "" : ""; } catch { return ""; }
}

async function createParty() {
  for (let i = 0; i < 6; i++) {
    const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
    try { await Fs.setDoc(ref("parties", code), { hostUid: account.uid, hostPseudo: account.pseudo, createdAt: Date.now(), current: null }); }
    catch (e) { if (e.code === "permission-denied") continue; throw e; }  // code taken by someone else's group
    await joinParty(code);
    return;
  }
  throw new Error("Impossible de créer le groupe. Réessaie.");
}
async function joinParty(code) {
  code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  if (code.length !== 4) throw new Error("Le code d'un groupe fait 4 caractères.");
  const s = await Fs.getDoc(ref("parties", code));
  if (!s.exists()) throw new Error(`Aucun groupe avec le code ${code}.`);
  if (party?.code && party.code !== code) await leaveParty();
  await Fs.setDoc(ref("parties", code, "members", account.uid), { pseudo: account.pseudo, color: account.color, joinedAt: Date.now(), seen: Fs.serverTimestamp(), where: GAME || "accueil" });
  account.party = code;
  await saveProfile({ party: code });
  watchParty();
}
async function setHost(m) { await Fs.updateDoc(ref("parties", party.code), { hostUid: m.uid, hostPseudo: m.pseudo }); }
// Leaving: a host first hands the group to someone (online first, then the longest-standing member).
async function leaveParty() {
  const code = party?.code || account.party;
  if (code && isHost()) {
    const next = party.members.filter(m => m.uid !== account.uid).sort((a, b) => online(b) - online(a) || (a.joinedAt || 0) - (b.joinedAt || 0))[0];
    if (!next) { await dissolveParty(); return; }
    await setHost(next);
  }
  if (code) await Fs.deleteDoc(ref("parties", code, "members", account.uid)).catch(() => {});
  await leftParty();
}
async function dissolveParty() {
  const code = party.code;
  const members = await Fs.getDocs(Fs.collection(fs, "parties", code, "members"));
  const b = Fs.writeBatch(fs);
  members.docs.forEach(d => b.delete(d.ref));
  b.delete(ref("parties", code));
  await b.commit();
  await leftParty();
}
// Group ranking: everyone's stats, all games together.
async function loadRanking() {
  const rows = await Promise.all(party.members.map(async m => {
    const st = await loadStats(m.uid).catch(() => []);
    const best = st.filter(s => s.games).sort((a, b) => b.wins - a.wins || b.games - a.games)[0];
    return { ...m, games: st.reduce((a, s) => a + s.games, 0), wins: st.reduce((a, s) => a + s.wins, 0), best: best ? GAMES[best.game] : "" };
  }));
  return rows.sort((a, b) => b.wins - a.wins || (b.games ? b.wins / b.games : 0) - (a.games ? a.wins / a.games : 0) || b.games - a.games);
}

/* ---------- home page ---------- */
let partyEl = null, partyErr = "", invitedTo = "";
function drawHubButton() {
  const b = document.getElementById("acct");
  if (!b) return;
  b.textContent = account ? "👤 " + account.pseudo : "Se connecter";
  b.classList.toggle("on", !!account);
}
function drawParty() {
  if (!partyEl) return;
  partyEl.hidden = false;
  const err = partyErr ? `<p class="so-err" role="alert">${esc(partyErr)}</p>` : "";
  let h = `<div class="so-label">Jouer en groupe</div>`;
  if (!account) {
    h += `<p class="so-hint">Crée un groupe avec tes potes : quand le chef lance un jeu, tout le monde arrive dans la même partie. Le groupe reste ouvert d'une partie à l'autre.</p>
      <button class="so-btn so-big" data-so="open">Se connecter pour jouer en groupe</button>`;
  } else if (!party?.data) {
    h += `<p class="so-hint">Quand le chef du groupe entre dans une partie, tout le groupe le suit dans le même salon.</p>${err}
      ${invitedTo ? `<button class="so-btn so-primary so-big" data-so="party-join-invite">Rejoindre le groupe ${esc(invitedTo)}</button><div class="so-or">ou</div>` : ""}
      <button class="so-btn ${invitedTo ? "" : "so-primary"} so-big" data-so="party-create">Créer un groupe</button>
      <form class="so-row" data-so-form="party-join"><input class="so-input so-code" id="so-party-code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="CODE" aria-label="Code du groupe" value="${esc(invitedTo)}"><button class="so-btn" type="submit">Rejoindre</button></form>`;
  } else {
    const host = isHost(), c = party.data.current, on = party.members.filter(online).length;
    h += `<div class="so-party-head"><div><small>Code du groupe</small><div class="so-pcode">${esc(party.code)}</div></div>
        <button class="so-btn so-sm" data-so="party-invite">Inviter</button></div>
      ${c && GAMES[c.game] ? `<div class="so-now"><span>${host ? "Ton groupe joue à" : "Le groupe joue à"} <b>${esc(GAMES[c.game])}</b> · partie ${esc(c.room)}</span>
        <button class="so-btn so-sm so-primary" data-so="party-go">Rejoindre</button></div>` : ""}
      <p class="so-hint"><b>${on}</b> sur ${party.members.length} en ligne</p>
      <ul class="so-members">${party.members.map(m => `<li class="${online(m) ? "so-on" : ""}" title="${online(m) ? "En ligne " + esc(placeOf(m)) : "Vu " + esc(ago(tsMs(m.seen)))}">
        <span class="so-dot" aria-hidden="true"></span>${avatar(m.color || COLORS[0], m.pseudo)}<span class="so-mname">${esc(m.pseudo)}<small>${online(m) ? esc(placeOf(m)) : "vu " + esc(ago(tsMs(m.seen)))}</small></span>
        ${m.uid === party.data.hostUid ? `<span class="so-tag">Chef</span>` : ""}
        ${host && m.uid !== account.uid ? `<button class="so-x so-xs" data-so="party-host" data-uid="${esc(m.uid)}" aria-label="Faire de ${esc(m.pseudo)} le chef" title="Le faire chef">👑</button><button class="so-x so-xs" data-so="party-kick" data-uid="${esc(m.uid)}" aria-label="Retirer ${esc(m.pseudo)}">×</button>` : ""}</li>`).join("")}</ul>
      ${!host && hostAway() ? `<div class="so-now"><span>${hostMember() ? `${esc(party.data.hostPseudo || "Le chef")} n'est plus là depuis un moment.` : "Le chef a quitté le groupe."}</span><button class="so-btn so-sm so-primary" data-so="party-claim">Devenir chef</button></div>` : ""}
      <p class="so-hint">${host ? "Choisis un jeu ci-dessous et crée la partie : tout le groupe arrivera dans ton salon. 👑 passe ton rôle de chef à quelqu'un." : `Quand ${esc(party.data.hostPseudo || "le chef")} lance un jeu, tu arrives directement dans sa partie.`}</p>${err}
      <details class="so-more" data-so-rank ${party.rankOpen ? "open" : ""}><summary>Classement du groupe</summary>${party.ranking ? `<ol class="so-rank">${party.ranking.map((m, i) => `<li><span class="so-pos">${i + 1}</span>${avatar(m.color || COLORS[0], m.pseudo)}<span class="so-mname">${esc(m.pseudo)}<small>${m.games ? `${m.games} partie${m.games > 1 ? "s" : ""}${m.best ? " · meilleur jeu : " + esc(m.best) : ""}` : "pas encore de partie"}</small></span><b>${m.wins} 🏆</b></li>`).join("")}</ol>` : `<p class="so-hint">Chargement…</p>`}
        <p class="so-hint">Victoires dans tous les jeux, avec les stats gardées dans les comptes.</p></details>
      <button class="so-btn so-ghost" data-so="party-leave">${host && party.members.length > 1 ? "Quitter le groupe (le rôle de chef passe à quelqu'un)" : host ? "Dissoudre le groupe" : "Quitter le groupe"}</button>
      ${host && party.members.length > 1 ? `<button class="so-link" data-so="party-dissolve">Dissoudre le groupe pour tout le monde</button>` : ""}`;
  }
  partyEl.innerHTML = h;
}
async function onPartyClick(e) {
  const b = e.target.closest("[data-so]");
  if (!b) return;
  partyErr = "";
  try {
    switch (b.dataset.so) {
      case "open": openAccount(); break;
      case "party-create": await createParty(); break;
      case "party-join-invite": await joinParty(invitedTo); invitedTo = ""; break;
      case "party-leave": if (confirm(isHost() && party.members.length <= 1 ? "Dissoudre le groupe ?" : "Quitter le groupe ?")) await leaveParty(); break;
      case "party-dissolve": if (confirm("Dissoudre le groupe ? Tout le monde en sera retiré.")) await dissolveParty(); break;
      case "party-kick": await Fs.deleteDoc(ref("parties", party.code, "members", b.dataset.uid)); break;
      case "party-host": {
        const m = party.members.find(x => x.uid === b.dataset.uid);
        if (m && confirm(`Faire de ${m.pseudo} le chef du groupe ?`)) await setHost(m);
        break;
      }
      case "party-claim": await setHost({ uid: account.uid, pseudo: account.pseudo }); break;
      case "party-go": { const c = party.data.current; goTo(c.game, c.room); break; }
      case "party-invite": {
        const msg = await shareLink(new URL("#groupe=" + party.code, ROOT).href, `Rejoins mon groupe sur Ce soir on joue (code ${party.code}) :`);
        if (msg) b.textContent = msg.startsWith("Lien") ? "Lien copié" : "Inviter";
        return;
      }
    }
  } catch (err) { partyErr = errText(err); }
  drawParty();
}

export async function mountHub() {
  ensureCss();
  partyEl = document.getElementById("party");
  const m = location.hash.match(/groupe=([A-Za-z0-9]{4})/);
  if (m) invitedTo = m[1].toUpperCase();
  document.getElementById("acct")?.addEventListener("click", () => openAccount());
  partyEl?.addEventListener("click", onPartyClick);
  partyEl?.addEventListener("toggle", async e => {
    if (!e.target.matches("[data-so-rank]") || !party) return;
    party.rankOpen = e.target.open;
    if (e.target.open && !party.ranking) { party.ranking = await loadRanking().catch(() => []); drawParty(); }
  }, true);
  partyEl?.addEventListener("submit", async e => {
    e.preventDefault(); partyErr = "";
    try { await joinParty(partyEl.querySelector("#so-party-code").value); invitedTo = ""; } catch (err) { partyErr = err.message; }
    drawParty();
  });
  accountReady = firebase().then(loadAccount);
  try { await accountReady; } catch {}
  drawHubButton(); drawParty(); watchParty();
  if (invitedTo && !account) openAccount();
}

/* ---------- games: start, account button, own name ---------- */
// Called by a game once its Firebase session is ready.
export async function start() {
  ensureCss();
  await firebase();
  accountReady = loadAccount();
  await accountReady.catch(() => null);
  const nav = document.querySelector(".hub-back");
  if (nav && !nav.querySelector(".so-acct")) {
    nav.insertAdjacentHTML("beforeend", `<button class="so-acct" type="button" hidden>${account ? "👤 " + esc(account.pseudo) : "Se connecter"}</button>`);
    nav.querySelector(".so-acct").addEventListener("click", () => openAccount());
  }
  watchParty();
  return account;
}

// Runs after each render of a game: the account button only on the join page, and a logged-in player plays under their account name.
function decorate(M) {
  const btn = document.querySelector(".hub-back .so-acct");
  if (btn) btn.hidden = M.mode !== "home";
  if (!account) return;
  const app = document.getElementById("app");
  const nick = app?.querySelector("#nick");
  if (nick && !nick.dataset.so) {
    nick.dataset.so = "1";
    nick.value = account.pseudo;
    nick.hidden = true;
    const panel = nick.closest(".panel"), label = panel?.querySelector(".label");
    const me = `<div class="so-playas">${avatar(account.color, account.pseudo)}<span>Tu joues en tant que <b>${esc(account.pseudo)}</b></span></div>`;
    if (M.mode === "home" && label && label.textContent.trim().startsWith("Ton prénom")) { label.remove(); nick.insertAdjacentHTML("afterend", me); }
    else nick.insertAdjacentHTML("afterend", me);
  }
  app?.querySelectorAll('[data-act="rename-open"]').forEach(b => { b.hidden = true; });
}

let lastM = null;
// Called by the game after every render (its render function is wrapped).
export function frame(M) {
  if (replaying) return;
  lastM = M;
  decorate(M);
  drawSaveBar(M);
}

/* ---------- saving: each game tells its game in words (its journal) ----------
   { players: { id: { nick, color } }, events: [{ head?, text?, board?, tone? }], final: { title, rows: [{ who, text }] } }
   "@id" in a text is a player. The journal is built from the game's own history when the game is saved. */
let journalFn = null;
export function setJournal(fn) { journalFn = fn; }
function journal() {
  const j = journalFn?.();
  if (!j || !j.players || !Array.isArray(j.events)) throw new Error("Ce jeu ne sait pas encore raconter cette partie.");
  return j;
}

async function gzipB64(text) {
  if (typeof CompressionStream !== "function") return { enc: "json", data: text };
  const buf = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { enc: "gzip", data: btoa(bin) };
}
async function gunzipB64(enc, data) {
  if (enc === "json") return data;
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
const lastBoard = events => [...events].reverse().find(e => e.board)?.board || null;

async function saveGame(kind) {
  const M = lastM, j = journal();
  const saved = kind === "result"
    ? { v: 2, game: GAME, me: M.me, players: j.players, events: [], board: lastBoard(j.events), final: j.final }
    : { v: 2, game: GAME, me: M.me, players: j.players, events: j.events, final: j.final };
  const { enc, data } = await gzipB64(JSON.stringify(saved));
  if (data.length > MAX_SAVE) throw new Error("Cette partie est trop longue pour être gardée en entier. Garde le résultat.");
  const chunks = [];
  for (let i = 0; i < data.length; i += CHUNK) chunks.push(data.slice(i, i + CHUNK));
  const saveRef = Fs.doc(Fs.collection(fs, "profiles", account.uid, "saves"));
  const b = Fs.writeBatch(fs);
  b.set(saveRef, {
    kind, game: GAME, at: Date.now(), code: M.code || "", enc, chunks: chunks.length, events: saved.events.length, public: false,
    players: Object.values(j.players).map(p => String(p.nick || "").slice(0, 18)).filter(Boolean).slice(0, 20)
  });
  chunks.forEach((c, i) => b.set(Fs.doc(fs, "profiles", account.uid, "saves", saveRef.id, "chunks", String(i).padStart(3, "0")), { d: c }));
  await b.commit();
}

// End-of-game bar: one state per finished game (room + gameId).
let bar = null, barState = { key: "", closed: false, busy: "", done: [], err: "" };
function drawSaveBar(M) {
  const end = M.mode === "room" && !M.tv && M.room?.phase === "end" && M.players?.some(p => p.id === M.me);
  const key = M.code + ":" + (M.room?.gameId || "");
  if (end && barState.key !== key) barState = { key, closed: false, busy: "", done: [], err: "" };
  const show = end && !barState.closed;
  document.body.classList.toggle("so-has-bar", show);
  if (!show) { if (bar) bar.hidden = true; return; }
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "so-bar";
    bar.addEventListener("click", async e => {
      const b = e.target.closest("[data-so]");
      if (!b) return;
      if (b.dataset.so === "bar-close") { barState.closed = true; drawSaveBar(lastM); return; }
      if (b.dataset.so === "open") { openAccount(); return; }
      if (b.dataset.so === "bar-save" && !barState.busy) {
        const kind = b.dataset.k, st = barState;
        st.busy = kind; st.err = ""; drawSaveBar(lastM);
        try { await saveGame(kind); st.done.push(kind); }
        catch (err) { st.err = err.code ? "Sauvegarde refusée (" + err.code + ")." : err.message; }
        st.busy = ""; drawSaveBar(lastM);
      }
    });
    document.body.appendChild(bar);
  }
  bar.hidden = false;
  const { busy, done, err } = barState;
  const btn = (k, label) => `<button class="so-btn so-sm ${done.includes(k) ? "" : "so-primary"}" data-so="bar-save" data-k="${k}" ${done.includes(k) || busy ? "disabled" : ""}>${busy === k ? "Sauvegarde…" : done.includes(k) ? "✓ Gardé" : label}</button>`;
  bar.innerHTML = `<div class="so-bar-in">
    ${account
      ? `<span class="so-bar-txt">Garder cette partie dans ton compte</span><div class="so-bar-acts">${btn("replay", "Partie entière")}${btn("result", "Résultat")}</div>`
      : `<span class="so-bar-txt">Connecte-toi pour garder cette partie</span><div class="so-bar-acts"><button class="so-btn so-sm so-primary" data-so="open">Se connecter</button></div>`}
    <button class="so-x so-xs" data-so="bar-close" aria-label="Fermer">×</button>
    ${err ? `<p class="so-err so-bar-err">${esc(err)}</p>` : ""}
  </div>`;
}

/* ---------- replay: the journal, rebuilt move by move ---------- */
// Called first thing by a game's boot. Returns true when the page is a replay (?revoir=uid.saveId).
export async function replayBoot() {
  const q = new URLSearchParams(location.search).get("revoir");
  if (!q) return false;
  replaying = true;
  ensureCss();
  document.body.classList.add("so-replay");
  const app = document.getElementById("app");
  const msg = (text, withLogin) => {
    app.innerHTML = `<section class="so-panel"><p>${esc(text)}</p>${withLogin ? `<button class="so-btn so-primary so-big" data-so="open">Se connecter</button>` : ""}<a class="so-btn so-big" href="${ROOT.href}">Retour à l'accueil</a></section>`;
    app.querySelector("[data-so=open]")?.addEventListener("click", () => openAccount());
  };
  msg("Chargement de la partie…");
  try {
    // Local testing only: ?revoir=local replays a journal put in sessionStorage (see window.soireeDev).
    if (DEV && q === "local") { show(app, JSON.parse(sessionStorage.getItem("soiree-dev-replay")), { at: Date.now() }); return true; }
    await firebase();
    await loadAccount();   // optional: a shared game opens without an account
    const [uid, id] = q.split(".");
    let s;
    try { s = await Fs.getDoc(ref("profiles", uid, "saves", id)); }
    catch (e) {
      if (e.code === "permission-denied") { msg(account ? "Cette partie n'est pas à toi, et elle n'est pas partagée." : "Cette partie n'est pas partagée. Si elle est à toi, connecte-toi.", !account); return true; }
      throw e;
    }
    if (!s.exists()) { msg("Cette sauvegarde n'existe plus."); return true; }
    const meta = s.data();
    const parts = await Fs.getDocs(Fs.query(Fs.collection(fs, "profiles", uid, "saves", id, "chunks"), Fs.orderBy(Fs.documentId())));
    const saved = JSON.parse(await gunzipB64(meta.enc, parts.docs.map(d => d.data().d).join("")));
    if (saved.v !== 2) { msg("Cette sauvegarde vient de l'ancienne version des replays et ne peut plus être revue."); return true; }
    show(app, saved, meta);
  } catch (e) {
    console.error(e);
    msg("Impossible d'ouvrir cette sauvegarde.");
  }
  return true;
}

function show(app, saved, meta) {
  const P = saved.players || {}, events = saved.events || [], single = !events.length;
  const name = id => P[id] ? `<b class="so-name" style="--c:${esc(P[id].color || "#555")}">${esc(P[id].nick)}</b>` : "?";
  const rich = t => esc(t).replace(/@([A-Za-z0-9_-]+)/g, (m, id) => P[id] ? name(id) : m);
  const boardHtml = b => b ? `<ul class="so-board">${Object.entries(b).map(([id, v]) => `<li>${avatar(P[id]?.color || "#555", P[id]?.nick)}<span><b>${esc(P[id]?.nick || "?")}</b><small>${esc(v)}</small></span></li>`).join("")}</ul>` : "";
  const finalHtml = () => saved.final ? `<section class="so-final"><div class="so-label">${esc(saved.final.title || "Résultat")}</div>
    <ol class="so-rank">${(saved.final.rows || []).map((r, i) => `<li><span class="so-pos">${i + 1}</span>${avatar(P[r.who]?.color || "#555", P[r.who]?.nick)}<span class="so-mname">${esc(P[r.who]?.nick || "?")}<small>${esc(r.text)}</small></span></li>`).join("")}</ol></section>` : "";
  const head = `<header class="so-rhead"><div class="so-label">${single ? "Résultat" : "Revoir"} · ${when(meta.at)}</div><h1 class="so-rtitle">${esc(GAMES[saved.game] || "")}</h1>
    <div class="so-chips">${Object.entries(P).map(([id, p]) => `<span class="so-chip">${avatar(p.color || "#555", p.nick)}${esc(p.nick)}</span>`).join("")}</div></header>`;
  document.body.classList.add("so-has-bar");

  if (single) {
    app.innerHTML = head + boardHtml(saved.board) + finalHtml();
    const ctl = document.createElement("div");
    ctl.className = "so-bar so-player";
    ctl.innerHTML = `<div class="so-bar-in"><span class="so-bar-txt"><b>Résultat</b> · ${esc(GAMES[saved.game] || "")} · ${when(meta.at)}</span><a class="so-btn so-sm so-ghost" href="${ROOT.href}">Quitter</a></div>`;
    document.body.appendChild(ctl);
    return;
  }

  let i = 0, timer = null;
  const boards = []; let cur = null;
  events.forEach((e, k) => { if (e.board) cur = e.board; boards[k] = cur; });
  app.innerHTML = head + `<div class="so-rboard"></div><ol class="so-log"></ol><div class="so-rfinal"></div>`;
  const logEl = app.querySelector(".so-log"), boardEl = app.querySelector(".so-rboard"), finalEl = app.querySelector(".so-rfinal");
  logEl.innerHTML = events.map((e, k) => `<li data-k="${k}" class="${e.head ? "so-lh" : ""} ${e.tone ? "so-t-" + esc(e.tone) : ""}" hidden>${e.head ? `<span class="so-lhead">${rich(e.head)}</span>` : ""}${e.text ? `<span class="so-ltext">${rich(e.text)}</span>` : ""}</li>`).join("");
  const items = [...logEl.children];
  const ctl = document.createElement("div");
  ctl.className = "so-bar so-player";
  document.body.appendChild(ctl);

  const step = n => {
    i = Math.max(0, Math.min(events.length - 1, n));
    items.forEach((li, k) => { li.hidden = k > i; li.classList.toggle("so-cur", k === i); });
    boardEl.innerHTML = boardHtml(boards[i]);
    finalEl.innerHTML = i === events.length - 1 ? finalHtml() : "";
    items[i]?.scrollIntoView({ block: "nearest", behavior: timer ? "smooth" : "auto" });
    draw();
  };
  const stop = () => { clearTimeout(timer); timer = null; };
  const tick = () => {
    if (i >= events.length - 1) { stop(); draw(); return; }
    timer = setTimeout(() => { step(i + 1); if (timer) tick(); }, events[i + 1]?.head ? 1600 : 1200);
  };
  function draw() {
    ctl.innerHTML = `<div class="so-bar-in">
      <span class="so-bar-txt"><b>Revoir</b> · ${esc(GAMES[saved.game] || "")} · ${i + 1}/${events.length}</span>
      <div class="so-bar-acts">
        <button class="so-btn so-sm" data-p="first" aria-label="Début">⏮</button>
        <button class="so-btn so-sm" data-p="prev" aria-label="Précédent">◀</button>
        <button class="so-btn so-sm so-primary" data-p="play" aria-label="${timer ? "Pause" : "Lecture"}">${timer ? "⏸" : "▶"}</button>
        <button class="so-btn so-sm" data-p="next" aria-label="Suivant">▶|</button>
        <button class="so-btn so-sm" data-p="last" aria-label="Fin">⏭</button>
      </div>
      <input class="so-range" type="range" min="0" max="${events.length - 1}" value="${i}" aria-label="Moment de la partie">
      <a class="so-btn so-sm so-ghost" href="${ROOT.href}">Quitter</a>
    </div>`;
  }
  ctl.addEventListener("click", e => {
    const p = e.target.closest("[data-p]")?.dataset.p;
    if (!p) return;
    if (p === "play") { if (timer) stop(); else { if (i >= events.length - 1) step(0); tick(); } draw(); return; }
    stop();
    step({ first: 0, prev: i - 1, next: i + 1, last: events.length - 1 }[p]);
  });
  ctl.addEventListener("input", e => { if (e.target.classList.contains("so-range")) { stop(); step(Number(e.target.value)); } });
  step(0);
}

// Local testing helpers (never on the real site): read a game's journal, pretend to be logged in.
if (DEV) window.soireeDev = {
  journal: () => { const j = journal(); return { v: 2, game: GAME, me: lastM?.me, ...j }; },
  state: () => lastM,   // the game's own state object (tests fill it with a sample game, then read the journal)
  fakeAccount(a) { account = a; drawHubButton(); drawParty(); if (dlg?.open) drawAccount(); },
  ui
};
