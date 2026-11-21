// « Ce soir on joue » : ce qui est commun à l'accueil et aux neuf jeux.
//   - le compte (connexion, inscription, couleur du profil) et sa fenêtre
//   - les groupes : quand le chef du groupe entre dans une partie, tout le groupe le suit
//   - l'enregistrement des parties, leur sauvegarde (partie entière ou résultat) et le lecteur « Revoir »
//   - l'espace admin
// Les jeux l'importent (import * as S from "../soiree.js") ; l'accueil appelle mountHub().
import { firebaseConfig } from "./config.js";

const FB = window.LG_FB || window.UC_FB || "https://www.gstatic.com/firebasejs/10.12.2/";
export const COLORS = ["#D93A26", "#2F62D0", "#18825A", "#7C47CC", "#B86400", "#C2307C", "#0F7C8F", "#5E5C17", "#8C3B1F", "#3D4A63"];
export const GAMES = {
  quidenous: "Qui de nous…", undercover: "Undercover", "loup-garou": "Loup-Garou", photoroulette: "Photo Roulette",
  "blanc-manger-coco": "Blanc-manger coco", perudo: "Perudo", quisuisje: "Qui suis-je ?", poker: "Poker", kems: "Kems"
};
const ROOT = new URL("./", import.meta.url);
const GAME = (() => { const seg = decodeURIComponent(location.pathname.slice(ROOT.pathname.length).split("/")[0]); return GAMES[seg] ? seg : null; })();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CHUNK = 900000, MAX_SAVE = 8 * CHUNK, MAX_FRAMES = 4000;
const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = ms => ms ? new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const local = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
};

/* ---------- Firebase (the same instance as the game's) ---------- */
let A = null, auth = null, Fs = null, fs = null, fbP = null;
function firebase() {
  return fbP ||= (async () => {
    const [appMod, authMod, fsMod] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]);
    const app = appMod.getApps()[0] || appMod.initializeApp(firebaseConfig);
    A = authMod; auth = A.getAuth(app); Fs = fsMod; fs = Fs.getFirestore(app);
    await auth.authStateReady();
  })();
}
const ref = (...p) => Fs.doc(fs, ...p);

/* ---------- account ---------- */
let account = null;            // { uid, pseudo, admin, color, party }
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
const adminApi = async body => api("admin", { ...body, idToken: await auth.currentUser.getIdToken() });

/* ---------- styles ---------- */
function ensureCss() {
  if (document.getElementById("so-css")) return;
  const l = document.createElement("link");
  l.id = "so-css"; l.rel = "stylesheet"; l.href = new URL("soiree.css", ROOT).href;
  document.head.appendChild(l);
}

/* ---------- account window ---------- */
let dlg = null;
const ui = { tab: "profil", mode: "connexion", err: "", busy: false, saves: null, adm: null, admUser: null, admSaves: null };

function avatar(c, name, cls = "") { return `<span class="so-av ${cls}" style="background:${esc(c)}">${esc((name || "?")[0])}</span>`; }
function saveRow(s, uid, mine) {
  const href = new URL(`${s.game}/?revoir=${encodeURIComponent(uid + "." + s.id)}`, ROOT).href;
  return `<li class="so-save">
    <div class="so-save-main"><b>${esc(GAMES[s.game] || s.game)}</b> <span class="so-tag">${s.kind === "result" ? "Résultat" : "Partie entière"}</span>
      <small>${when(s.at)}${s.players?.length ? " · " + esc(s.players.slice(0, 8).join(", ")) : ""}</small></div>
    <div class="so-save-acts"><a class="so-btn so-sm" href="${href}">${s.kind === "result" ? "Voir" : "Revoir"}</a>
      ${mine || isAdmin() ? `<button class="so-btn so-sm so-ghost" data-so="save-del" data-uid="${esc(uid)}" data-id="${esc(s.id)}" aria-label="Supprimer">✕</button>` : ""}</div>
  </li>`;
}
function savesList(list, uid, mine) {
  if (!list) return `<p class="so-hint">Chargement…</p>`;
  if (!list.length) return `<p class="so-hint">${mine ? "Aucune sauvegarde pour l'instant. À la fin d'une partie, un bouton te propose de garder la partie entière ou juste le résultat." : "Aucune sauvegarde."}</p>`;
  return `<ul class="so-saves">${list.map(s => saveRow(s, uid, mine)).join("")}</ul>`;
}

function accountHtml() {
  const err = ui.err ? `<p class="so-err" role="alert">${esc(ui.err)}</p>` : "";
  if (!account) {
    const signup = ui.mode === "inscription";
    return `<form class="so-stack" data-so-form="auth" novalidate>
      <div class="so-seg" role="group" aria-label="Choix">
        <button type="button" data-so="mode" data-m="connexion" aria-pressed="${!signup}">Se connecter</button>
        <button type="button" data-so="mode" data-m="inscription" aria-pressed="${signup}">Créer un compte</button>
      </div>
      <label class="so-field"><span>Pseudo</span><input id="so-pseudo" aria-label="Pseudo" name="username" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="18" required></label>
      <label class="so-field"><span>Mot de passe</span><span class="so-pw"><input id="so-pass" aria-label="Mot de passe" name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" maxlength="128" required><button type="button" class="so-show" data-so="show-pass" aria-pressed="false">Afficher</button></span></label>
      <p class="so-hint">${signup ? "3 à 18 caractères pour le pseudo, 6 au moins pour le mot de passe. Un seul compte par téléphone." : "Ton pseudo et ta couleur te suivent dans tous les jeux, sur tous tes appareils."}</p>
      ${err}
      <button class="so-btn so-primary so-big" type="submit" ${ui.busy ? "disabled" : ""}>${ui.busy ? "Un instant…" : signup ? "Créer mon compte" : "Se connecter"}</button>
    </form>`;
  }
  const tabs = [["profil", "Profil"], ["saves", "Sauvegardes"], ...(isAdmin() ? [["admin", "Admin"]] : [])];
  let body = "";
  if (ui.tab === "profil") {
    body = `<div class="so-me">${avatar(account.color, account.pseudo, "so-xl")}<div><b>${esc(account.pseudo)}</b>${isAdmin() ? ` <span class="so-tag so-admin">Admin</span>` : ""}<small>Ton pseudo est ton nom dans tous les jeux.</small></div></div>
      <div class="so-label">Ma couleur</div>
      <div class="so-swatches" role="group" aria-label="Ma couleur">${COLORS.map(c => `<button class="so-swatch" data-so="color" data-c="${c}" style="background:${c}" aria-pressed="${account.color === c}" aria-label="Couleur ${c}"></button>`).join("")}</div>
      <p class="so-hint">Elle s'applique aux prochaines parties que tu rejoins.</p>
      ${err}
      <button class="so-btn so-big" data-so="logout">Se déconnecter</button>`;
  } else if (ui.tab === "saves") {
    body = err + savesList(ui.saves, account.uid, true);
  } else if (ui.tab === "admin") {
    if (ui.admUser) {
      body = `<button class="so-link" data-so="adm-back">← Tous les comptes</button>
        <div class="so-label">Sauvegardes de ${esc(ui.admUser.pseudo)}</div>${err}${savesList(ui.admSaves, ui.admUser.uid, false)}`;
    } else {
      const list = ui.adm;
      body = `${err}${!list ? `<p class="so-hint">Chargement…</p>` : `
        <p class="so-hint">${list.length} compte${list.length > 1 ? "s" : ""} créé${list.length > 1 ? "s" : ""} depuis le début, ${list.filter(a => a.deletedAt).length} supprimé${list.filter(a => a.deletedAt).length > 1 ? "s" : ""}.</p>
        <input class="so-input" id="so-filter" type="search" placeholder="Chercher un pseudo" aria-label="Chercher un pseudo" autocomplete="off">
        <ul class="so-accts">${list.map(a => `<li data-p="${esc(a.pseudo.toLowerCase())}" class="${a.deletedAt ? "so-gone" : ""}">
          <div class="so-acct-main"><b>${esc(a.pseudo)}</b>${a.admin ? ` <span class="so-tag so-admin">Admin</span>` : ""}${a.deletedAt ? ` <span class="so-tag">Supprimé le ${when(a.deletedAt)}</span>` : ""}${a.locked ? ` <span class="so-tag">Bloqué</span>` : ""}
            <small>Créé le ${when(a.createdAt)} · dernière connexion ${when(a.lastLoginAt)}</small></div>
          <div class="so-acct-acts">
            <button class="so-btn so-sm" data-so="adm-saves" data-uid="${esc(a.uid)}" data-p="${esc(a.pseudo)}">Sauvegardes</button>
            ${a.deletedAt ? "" : `<button class="so-btn so-sm" data-so="adm-reset" data-p="${esc(a.pseudo)}">Mot de passe</button>
            ${a.admin ? "" : `<button class="so-btn so-sm so-danger" data-so="adm-del" data-p="${esc(a.pseudo)}">Supprimer</button>`}`}
          </div></li>`).join("")}</ul>`}`;
    }
  }
  return `<div class="so-tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" data-so="tab" data-t="${id}" aria-selected="${ui.tab === id}">${label}</button>`).join("")}</div>
    <div class="so-stack">${body}</div>`;
}

function drawAccount() {
  if (!dlg) return;
  dlg.querySelector(".so-body").innerHTML = accountHtml();
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

async function openTab(t) {
  ui.tab = t; ui.err = ""; drawAccount();
  try {
    if (t === "saves") { ui.saves = null; drawAccount(); ui.saves = await loadSaves(account.uid); }
    if (t === "admin" && !ui.admUser) { ui.adm = null; drawAccount(); ui.adm = (await adminApi({ action: "list" })).accounts; }
  } catch (e) { ui.err = e.message || "Chargement impossible."; }
  drawAccount();
}

// After signing in or out inside a game, the page reloads so the game picks up the new identity.
async function afterAuthChange() {
  await loadAccount();
  if (GAME) { location.reload(); return; }
  ui.tab = "profil"; drawAccount(); drawHubButton(); drawParty(); watchParty();
}

async function onAccountClick(e) {
  const b = e.target.closest("[data-so]");
  if (e.target === dlg || b?.dataset.so === "close") { dlg.close(); return; }
  if (!b) return;
  const d = b.dataset;
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
      case "save-del":
        if (!confirm("Supprimer cette sauvegarde ? Elle ne pourra pas être récupérée.")) break;
        await deleteSave(d.uid, d.id);
        if (ui.admUser) ui.admSaves = ui.admSaves.filter(s => s.id !== d.id); else ui.saves = ui.saves.filter(s => s.id !== d.id);
        drawAccount();
        break;
      case "adm-saves":
        ui.admUser = { uid: d.uid, pseudo: d.p }; ui.admSaves = null; ui.err = ""; drawAccount();
        ui.admSaves = await loadSaves(d.uid); drawAccount();
        break;
      case "adm-back": ui.admUser = null; ui.err = ""; drawAccount(); break;
      case "adm-reset": {
        const pass = prompt(`Nouveau mot de passe pour ${d.p} (6 caractères au moins) :`);
        if (!pass) break;
        await adminApi({ action: "reset", pseudo: d.p, password: pass });
        alert(`Mot de passe de ${d.p} changé.`);
        break;
      }
      case "adm-del":
        if (!confirm(`Supprimer le compte ${d.p} ? Il ne pourra plus se connecter, son pseudo et son téléphone seront libérés. Il restera dans la liste comme supprimé.`)) break;
        await adminApi({ action: "delete", pseudo: d.p });
        ui.adm = (await adminApi({ action: "list" })).accounts; drawAccount();
        break;
    }
  } catch (err) { ui.err = err.code ? "Action refusée (" + err.code + ")." : err.message || "Ça n'a pas marché."; drawAccount(); }
}

async function onAccountSubmit(e) {
  e.preventDefault();
  if (ui.busy) return;
  const name = dlg.querySelector("#so-pseudo").value.trim(), password = dlg.querySelector("#so-pass").value;
  if (!name || !password) { ui.err = "Entre ton pseudo et ton mot de passe."; drawAccount(); return; }
  ui.busy = true; ui.err = ""; drawAccount();
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
  ui.err = "";
  drawAccount();
  dlg.showModal();
  if (account && tab) openTab(tab);
}

/* ---------- groups ("parties") ----------
   parties/{code}: { hostUid, hostPseudo, createdAt, current: { game, room, at } | null }
   parties/{code}/members/{uid}: { pseudo, color, joinedAt }
   When the host enters a room in a game, `current` changes and every member's page follows. */
let party = null;   // { code, data, members, unsubs }
let currentRoom = "";
const followKey = code => "soiree-suivi-" + code;

function stopParty() { party?.unsubs.forEach(u => u()); party = null; }
function watchParty() {
  const code = account?.party;
  if (party?.code === code) return;
  stopParty();
  if (!code) { drawParty(); return; }
  party = { code, data: null, members: [], unsubs: [] };
  party.unsubs.push(Fs.onSnapshot(ref("parties", code), s => {
    if (!s.exists()) { leftParty(); return; }
    party.data = s.data();
    announce();  // the host may have opened a room before the group had loaded
    follow();
    drawParty();
  }, () => leftParty()));
  party.unsubs.push(Fs.onSnapshot(Fs.collection(fs, "parties", code, "members"), q => {
    party.members = q.docs.map(d => ({ uid: d.id, ...d.data() })).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    if (party.data && !party.members.some(m => m.uid === account.uid)) { leftParty(); return; }  // removed by the host
    drawParty();
  }, () => {}));
}
async function leftParty() {
  stopParty();
  if (account) { account.party = null; await saveProfile({ party: null }).catch(() => {}); }
  drawParty();
}
const isHost = () => !!party?.data && party.data.hostUid === account?.uid;

function gameUrl(game, room) { return new URL(`${game}/#${room}`, ROOT).href; }
function goTo(game, room) {
  try { sessionStorage.setItem("soiree-autojoin", room); } catch {}
  const url = gameUrl(game, room), samePage = GAME === game;
  location.href = url;
  if (samePage) location.reload();  // only the #hash changed: reload so the game opens that room
}
// A member's page follows the host into the room the host just entered (once per change).
function follow() {
  const c = party?.data?.current;
  if (!c || !GAMES[c.game] || isHost()) return;
  const key = `${c.game}:${c.room}:${c.at}`;
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
  await Fs.setDoc(ref("parties", code, "members", account.uid), { pseudo: account.pseudo, color: account.color, joinedAt: Date.now() });
  account.party = code;
  await saveProfile({ party: code });
  watchParty();
}
async function leaveParty() {
  const code = party?.code || account.party;
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
    const host = isHost(), c = party.data.current;
    h += `<div class="so-party-head"><div><small>Code du groupe</small><div class="so-pcode">${esc(party.code)}</div></div>
        <button class="so-btn so-sm" data-so="party-invite">Inviter</button></div>
      ${c && GAMES[c.game] ? `<div class="so-now"><span>${host ? "Ton groupe joue à" : "Le groupe joue à"} <b>${esc(GAMES[c.game])}</b> · partie ${esc(c.room)}</span>
        <button class="so-btn so-sm so-primary" data-so="party-go">Rejoindre</button></div>` : ""}
      <ul class="so-members">${party.members.map(m => `<li>${avatar(m.color || COLORS[0], m.pseudo)}<span>${esc(m.pseudo)}</span>${m.uid === party.data.hostUid ? `<span class="so-tag">Chef</span>` : ""}
        ${host && m.uid !== account.uid ? `<button class="so-x so-xs" data-so="party-kick" data-uid="${esc(m.uid)}" aria-label="Retirer ${esc(m.pseudo)}">×</button>` : ""}</li>`).join("")}</ul>
      <p class="so-hint">${host ? "Choisis un jeu ci-dessous et crée la partie : tout le groupe arrivera dans ton salon." : `Quand ${esc(party.data.hostPseudo || "le chef")} lance un jeu, tu arrives directement dans sa partie.`}</p>${err}
      ${host ? `<button class="so-btn so-ghost" data-so="party-dissolve">Dissoudre le groupe</button>` : `<button class="so-btn so-ghost" data-so="party-leave">Quitter le groupe</button>`}`;
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
      case "party-leave": if (confirm("Quitter le groupe ?")) await leaveParty(); break;
      case "party-dissolve": if (confirm("Dissoudre le groupe ? Tout le monde en sera retiré.")) await dissolveParty(); break;
      case "party-kick": await Fs.deleteDoc(ref("parties", party.code, "members", b.dataset.uid)); break;
      case "party-go": { const c = party.data.current; goTo(c.game, c.room); break; }
      case "party-invite": {
        const url = new URL("#groupe=" + party.code, ROOT).href, text = `Rejoins mon groupe sur Ce soir on joue (code ${party.code}) :`;
        try { if (navigator.share) { await navigator.share({ title: "Ce soir on joue", text, url }); break; } } catch (err) { if (err?.name === "AbortError") break; }
        await navigator.clipboard?.writeText(url); partyErr = ""; b.textContent = "Lien copié";
        return;
      }
    }
  } catch (err) { partyErr = err.code ? "Action refusée (" + err.code + ")." : err.message || "Ça n'a pas marché."; }
  drawParty();
}

export async function mountHub() {
  ensureCss();
  partyEl = document.getElementById("party");
  const m = location.hash.match(/groupe=([A-Za-z0-9]{4})/);
  if (m) invitedTo = m[1].toUpperCase();
  document.getElementById("acct")?.addEventListener("click", () => openAccount());
  partyEl?.addEventListener("click", onPartyClick);
  partyEl?.addEventListener("submit", async e => {
    e.preventDefault(); partyErr = "";
    try { await joinParty(partyEl.querySelector("#so-party-code").value); invitedTo = ""; } catch (err) { partyErr = err.message; }
    drawParty();
  });
  try { await firebase(); await loadAccount(); } catch {}
  drawHubButton(); drawParty(); watchParty();
  if (invitedTo && !account) openAccount();
}

/* ---------- games: start, account button, own name ---------- */
// Called by a game once its Firebase session is ready.
export async function start() {
  ensureCss();
  await firebase();
  await loadAccount().catch(() => null);
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

/* ---------- recording what this phone saw ----------
   After each render the game's state (M) is compared with the previous one; changed keys become a frame.
   A recording covers one game: it restarts when the room or the room's gameId changes. */
const SKIP = new Set(["drafts", "flash", "err", "busy", "installEvt", "local", "fatal", "offline", "offlineSince", "mode", "tv", "savedDirs", "handover", "renaming", "showQR"]);
const PHOTO = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#ddd"/><text x="200" y="158" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#666">Photo non gardée</text></svg>`);
let rec = null, recT = null, lastM = null;

function clean(v, depth = 0) {
  if (v === null || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.length > 20000 || (v.startsWith("data:") && v.length > 2000) ? PHOTO : v;
  if (typeof v !== "object" || depth > 12) return undefined;
  if (typeof v.toMillis === "function") return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(x => { const c = clean(x, depth + 1); return c === undefined ? null : c; });
  if (v instanceof Set) return { __set: [...v].map(x => clean(x, depth + 1)) };
  if (v instanceof Map) return { __map: [...v].map(([k, x]) => [k, clean(x, depth + 1)]) };
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return undefined;
  const o = {};
  for (const k of Object.keys(v)) { const c = clean(v[k], depth + 1); if (c !== undefined) o[k] = c; }
  return o;
}
function ts(ms) { return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6, toMillis: () => ms, toDate: () => new Date(ms), valueOf: () => ms, isEqual: o => o?.toMillis?.() === ms }; }
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (!v || typeof v !== "object") return v;
  if ("__ts" in v) return ts(v.__ts);
  if ("__set" in v) return new Set(v.__set.map(revive));
  if ("__map" in v) return new Map(v.__map.map(([k, x]) => [k, revive(x)]));
  const o = {};
  for (const k of Object.keys(v)) o[k] = revive(v[k]);
  return o;
}

function capture(M) {
  if (M.mode !== "room" || M.tv || !M.code) return;
  const gid = M.room?.gameId || "";
  if (!rec || rec.code !== M.code || rec.gameId !== gid) rec = { game: GAME, code: M.code, gameId: gid, frames: [], last: {}, me: M.me };
  if (rec.frames.length >= MAX_FRAMES) return;
  const d = {};
  for (const k of Object.keys(M)) {
    if (SKIP.has(k)) continue;
    const v = clean(M[k]);
    if (v === undefined) continue;
    const s = JSON.stringify(v);
    if (rec.last[k] !== s) { rec.last[k] = s; d[k] = v; }
  }
  if (Object.keys(d).length) rec.frames.push({ t: Date.now(), d });
}

// Called by the game after every render (its render function is wrapped).
export function frame(M) {
  if (replaying) return;
  lastM = M;
  decorate(M);
  if (M.mode === "room" && !M.tv && M.code) { clearTimeout(recT); recT = setTimeout(() => capture(M), 120); }
  drawSaveBar(M);
}

/* ---------- saving ---------- */
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

async function saveGame(kind) {
  const M = lastM;
  capture(M);
  if (!rec?.frames.length) throw new Error("Rien à sauvegarder pour l'instant.");
  const frames = kind === "result"
    ? [{ t: Date.now(), d: Object.fromEntries(Object.entries(rec.last).map(([k, s]) => [k, JSON.parse(s)])) }]
    : rec.frames;
  const { enc, data } = await gzipB64(JSON.stringify({ v: 1, game: GAME, me: rec.me, frames }));
  if (data.length > MAX_SAVE) throw new Error("Cette partie est trop longue pour être gardée en entier. Garde le résultat.");
  const chunks = [];
  for (let i = 0; i < data.length; i += CHUNK) chunks.push(data.slice(i, i + CHUNK));
  const saveRef = Fs.doc(Fs.collection(fs, "profiles", account.uid, "saves"));
  const b = Fs.writeBatch(fs);
  b.set(saveRef, {
    kind, game: GAME, at: Date.now(), code: rec.code, enc, chunks: chunks.length, frames: frames.length,
    players: (M.players || []).map(p => String(p.nick || "").slice(0, 18)).filter(Boolean).slice(0, 20)
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

/* ---------- replay ---------- */
// Called first thing by a game's boot. Returns true when the page is a replay (?revoir=uid.saveId).
export async function replayBoot(M, render) {
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
    // Local testing only: ?revoir=local replays a recording put in sessionStorage by window.soireeDev.
    if (DEV && q === "local") { play(M, render, JSON.parse(sessionStorage.getItem("soiree-dev-replay")), { at: Date.now() }); return true; }
    await firebase();
    await loadAccount();
    if (!account) { msg("Connecte-toi pour revoir tes parties.", true); return true; }
    const [uid, id] = q.split(".");
    const s = await Fs.getDoc(ref("profiles", uid, "saves", id));
    if (!s.exists()) { msg("Cette sauvegarde n'existe plus."); return true; }
    const meta = s.data();
    const parts = await Fs.getDocs(Fs.query(Fs.collection(fs, "profiles", uid, "saves", id, "chunks"), Fs.orderBy(Fs.documentId())));
    const rec = JSON.parse(await gunzipB64(meta.enc, parts.docs.map(d => d.data().d).join("")));
    play(M, render, rec, meta);
  } catch (e) {
    msg(e.code === "permission-denied" ? "Cette sauvegarde n'est pas à toi." : "Impossible d'ouvrir cette sauvegarde.");
  }
  return true;
}

function play(M, render, saved, meta) {
  const frames = saved.frames.map(f => ({ t: f.t, d: revive(f.d) }));
  const states = [];
  const stateAt = i => {
    for (let k = states.length; k <= i; k++) states[k] = { ...(states[k - 1] || {}), ...frames[k].d };
    return states[i];
  };
  let i = 0, timer = null;
  const ctl = document.createElement("div");
  ctl.className = "so-bar so-player";
  document.body.appendChild(ctl);
  document.body.classList.add("so-has-bar");
  const show = n => {
    i = Math.max(0, Math.min(frames.length - 1, n));
    Object.assign(M, stateAt(i), { mode: "room", tv: false, me: saved.me, err: "", flash: "" });
    try { render(); } catch (e) { console.error(e); }
    draw();
  };
  const stop = () => { clearTimeout(timer); timer = null; };
  const tick = () => {
    if (i >= frames.length - 1) { stop(); draw(); return; }
    const gap = Math.min(2500, Math.max(350, frames[i + 1].t - frames[i].t));
    timer = setTimeout(() => { show(i + 1); if (timer) tick(); }, gap);
  };
  const single = frames.length === 1;
  function draw() {
    ctl.innerHTML = `<div class="so-bar-in">
      <span class="so-bar-txt"><b>${single ? "Résultat" : "Revoir"}</b> · ${esc(GAMES[saved.game] || "")} · ${when(meta.at)}${single ? "" : ` · ${i + 1}/${frames.length}`}</span>
      ${single ? "" : `<div class="so-bar-acts">
        <button class="so-btn so-sm" data-p="first" aria-label="Début">⏮</button>
        <button class="so-btn so-sm" data-p="prev" aria-label="Précédent">◀</button>
        <button class="so-btn so-sm so-primary" data-p="play" aria-label="${timer ? "Pause" : "Lecture"}">${timer ? "⏸" : "▶"}</button>
        <button class="so-btn so-sm" data-p="next" aria-label="Suivant">▶|</button>
        <button class="so-btn so-sm" data-p="last" aria-label="Fin">⏭</button>
      </div>
      <input class="so-range" type="range" min="0" max="${frames.length - 1}" value="${i}" aria-label="Moment de la partie">`}
      <a class="so-btn so-sm so-ghost" href="${ROOT.href}">Quitter</a>
    </div>`;
  }
  ctl.addEventListener("click", e => {
    const p = e.target.closest("[data-p]")?.dataset.p;
    if (!p) return;
    if (p === "play") { if (timer) stop(); else { if (i >= frames.length - 1) show(0); tick(); } draw(); return; }
    stop();
    show({ first: 0, prev: i - 1, next: i + 1, last: frames.length - 1 }[p]);
  });
  ctl.addEventListener("input", e => { if (e.target.classList.contains("so-range")) { stop(); show(Number(e.target.value)); } });
  show(0);
}

// Local testing helpers (never on the real site): inspect the recording, pretend to be logged in.
if (DEV) window.soireeDev = {
  recording: () => rec && { v: 1, game: GAME, me: rec.me, frames: rec.frames },
  fakeAccount(a) { account = a; drawHubButton(); drawParty(); if (dlg?.open) drawAccount(); },
  ui
};
