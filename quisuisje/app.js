import { firebaseConfig } from "./config.js";
import { GAGES } from "./gages.js";
import { THEMES } from "./persos.js";
import { INFOS } from "./infos.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const ROOT = "qsRooms";
const TIMERS = [0, 60, 90, 120];
const FINS = [["first", "Au 1er qui trouve"], ["last", "À l'avant-dernier"], ["all", "Tous trouvent"]];
const FIN_HINT = {
  first: "La partie s'arrête dès que quelqu'un trouve.",
  last: "On continue pour le classement : le dernier qui n'a pas trouvé a perdu.",
  all: "Tout le monde doit trouver : le dernier à trouver a perdu."
};
const GAGE_LEVELS = ["Soft", "Épicé", "Hot", "Extrême"];
const MIN_PLAYERS = 2, MAX_PLAYERS = 12, SIPS = 2;
const COLORS = ["#D93A26","#2F62D0","#18825A","#7C47CC","#B86400","#C2307C","#0F7C8F","#5E5C17","#8C3B1F","#3D4A63","#4F7A1F","#9A3B8F"];
const DEFAULT_THEMES = ["stars", "monde", "fiction", "anime"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const K = "qsj";
const ROOM_MAX_IDLE_MS = 24 * 3600 * 1000;
const RES = { yes: "Oui", no: "Non", idk: "Ça dépend", ok: "Trouvé !", ko: "Raté" };

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rid = () => Math.random().toString(36).slice(2, 10);
const rand = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const safeColor = c => COLORS.includes(c) ? c : COLORS[0];
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
const ord = i => i === 0 ? "1er" : `${i + 1}e`;
const genCode = () => Array.from({ length: 4 }, () => CODE_CHARS[rand(CODE_CHARS.length)]).join("");
const normCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
/* Links look like #ABCD (join) or #ABCD-tv (big screen). */
const hashCode = () => { const c = normCode(location.hash.slice(1).split("-")[0]); return c.length === 4 ? c : ""; };
const hashIsTv = () => /-tv$/i.test(location.hash);
const store = {
  get(k) { try { return localStorage.getItem(K + "-" + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(K + "-" + k) : localStorage.setItem(K + "-" + k, v); } catch {} },
  json(k, d) { try { return JSON.parse(this.get(k) || "null") ?? d; } catch { return d; } }
};
const names = list => {
  const ns = list.map(p => p.nick);
  return ns.length <= 1 ? ns.join("") : ns.slice(0, -1).join(", ") + " et " + ns[ns.length - 1];
};
const hashInt = s => { let h = 5381; for (const c of String(s)) h = (h * 33 + c.codePointAt(0)) >>> 0; return h; };
const tsMs = ts => ts && ts.toMillis ? ts.toMillis() : (typeof ts === "number" ? ts : 0);
const topOf = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])[0];
const cleanText = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

/* ---------- the post-its ----------
   A card is { name, alt: other ways to say it, theme }. In persos.js, "Zinédine Zidane|Zidane|Zizou". */
const DECK = Object.fromEntries(THEMES.map(t => [t.id, t.cards.map(line => {
  const [name, ...alt] = line.split("|").map(s => s.trim()).filter(Boolean);
  return { name, alt, theme: t.id };
})]));
const themeName = id => THEMES.find(t => t.id === id)?.name || "";
const validThemes = list => { const ok = (list || []).filter(id => DECK[id]); return ok.length ? ok : DEFAULT_THEMES; };
/* Articles, accents and punctuation don't count: « le Joker » is « Joker ». */
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[’'`]/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\b(le|la|les|l|un|une|des|du|de|d)\b/g, " ").replace(/\s+/g, " ").trim();
function lev(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return row[b.length];
}
/* A guess that says the same thing as the post-it: same words, the surname alone, or a small typo. */
function guessMatches(guess, card) {
  const g = norm(guess);
  if (!g || !card) return false;
  for (const c of [card.name, ...(card.alt || [])]) {
    const n = norm(c.replace(/\(.*?\)/g, " ")) || norm(c);
    if (!n) continue;
    if (g === n || g === norm(c)) return true;
    const words = n.split(" ");
    if (words.length > 1 && g.length >= 4 && words[words.length - 1] === g) return true;
    const tol = n.length >= 9 ? 2 : n.length >= 5 ? 1 : 0;
    if (tol && Math.abs(n.length - g.length) <= tol && lev(g, n) <= tol) return true;
  }
  return false;
}
/* A picture and a short description for each perso of the deck (infos.js, taken from Wikipedia).
   Found by name or any other way to say it, so a perso typed by a player gets them too when it is in the deck. */
const INFO_BY = new Map();
for (const t of THEMES) for (const line of t.cards) {
  const [name, ...alt] = line.split("|").map(s => s.trim()).filter(Boolean), info = INFOS[name];
  if (!info) continue;
  for (const n of [name, ...alt]) { const k = norm(n); if (k && !INFO_BY.has(k)) INFO_BY.set(k, info); }
}
/* A photo added by a player (house perso, or a perso given in « les joueurs choisissent ») wins over the deck's picture. */
const PIC_MAX = 150000;
const cleanPic = p => typeof p === "string" && p.length <= PIC_MAX && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) ? p : "";
const infoOf = card => {
  const info = card ? INFO_BY.get(norm(card.name)) : null;
  if (card?.pic) return { i: card.pic, d: info?.d || "" };
  if (!info) return null;
  // A picture that failed to load once (moved on Wikipedia, no network) isn't asked for again.
  return info.i && window.badPics?.has(info.i) ? { ...info, i: "" } : info;
};
/* One theme at random among the chosen ones, then one card of it nobody at the table already has. */
function drawCard(themes, used = []) {
  const pool = validThemes(themes), taken = new Set(used.map(norm));
  for (let tries = 0; tries < 40; tries++) {
    const list = DECK[pool[rand(pool.length)]], c = list[rand(list.length)];
    if (!taken.has(norm(c.name))) return c;
  }
  const rest = pool.flatMap(id => DECK[id]).filter(c => !taken.has(norm(c.name)));
  return rest.length ? rest[rand(rest.length)] : DECK[pool[0]][rand(DECK[pool[0]].length)];
}
const cleanCard = x => ({ name: cleanText(x.name, 60) || "?", alt: Array.isArray(x.alt) ? x.alt.map(a => cleanText(a, 60)).filter(Boolean).slice(0, 6) : [],
  theme: String(x.theme || ""), by: String(x.by || ""), pic: cleanPic(x.pic) });
/* A photo taken or picked on the phone, shrunk to fit in a Firestore document (no Firebase Storage on the free plan). */
async function shrinkPhoto(file, max = 360) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    let q = .8, out = c.toDataURL("image/jpeg", q);
    while (out.length > PIC_MAX * .9 && q > .35) { q -= .15; out = c.toDataURL("image/jpeg", q); }
    return cleanPic(out);
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- the game, the same for the online table and the phone passed around ----------
   A question in the history is { u: who asked, k: "q" (question) or "g" (a guess), t: its text, r: the answer,
   y/n/i: how many said yes / no / don't know, x: who disagreed with the table }. */
/* The next player who still has to find, after `from`; someone online if possible. */
function nextTurn(order, found, from, here = () => true, live = () => true) {
  const n = order.length, i = order.indexOf(from);
  let fallback = "";
  for (let k = 1; k <= n; k++) {
    const id = order[((i + k) % n + n) % n];
    if (found.includes(id) || !here(id)) continue;
    if (live(id)) return id;
    fallback = fallback || id;
  }
  return fallback;
}
function isOver(order, found, fin, here = () => true) {
  const left = order.filter(id => !found.includes(id) && here(id));
  if (!left.length) return true;
  if (fin === "first") return found.length > 0;
  if (fin === "all") return false;
  return left.length <= 1;
}
/* Majority wins; a tie on a question means « ça dépend » (the asker keeps the hand), a tie on a guess counts as found. */
function tally(q, votes) {
  const c = { yes: 0, no: 0, idk: 0 };
  for (const v of votes) if (c[v.v] != null) c[v.v]++;
  const res = q.k === "g" ? (c.yes > 0 && c.yes >= c.no ? "ok" : "ko")
    : c.yes > c.no && c.yes >= c.idk ? "yes" : c.no > c.yes && c.no >= c.idk ? "no" : "idk";
  const agree = q.k === "g" ? (res === "ok" ? "yes" : "no") : res;
  return { res, y: c.yes, n: c.no, i: c.idk, x: votes.filter(v => v.v !== agree && v.v !== "idk").map(v => v.voter) };
}
function playerStats(ids, hist) {
  const S = Object.fromEntries(ids.map(id => [id, { id, q: 0, yes: 0, no: 0, idk: 0, g: 0, gko: 0, toFind: 0, done: false, run: 0, bestRun: 0, contra: 0 }]));
  for (const h of hist) {
    const s = S[h.u];
    if (s) {
      if (!s.done) s.toFind++;
      if (h.k === "g") { s.g++; if (h.r === "ok") s.done = true; else s.gko++; s.run = 0; }
      else {
        s.q++;
        if (h.r === "yes") { s.yes++; s.run++; s.bestRun = Math.max(s.bestRun, s.run); }
        else { if (h.r === "no") s.no++; else s.idk++; if (h.r === "no") s.run = 0; }
      }
    }
    for (const id of h.x || []) if (S[id]) S[id].contra++;
  }
  return S;
}
/* Who found, in order; then the others, the ones who got the most « oui » first. */
function ranking(order, found, hist) {
  const S = playerStats(order, hist);
  return [...found.filter(id => order.includes(id)), ...order.filter(id => !found.includes(id)).sort((a, b) => S[b].yes - S[a].yes)];
}
/* The gage goes to whoever is left without finding (the one who asked most, if several), else to the last one to find. */
function losersOf(order, found, hist, here = () => true) {
  if (order.length < 2) return [];
  const rest = order.filter(id => !found.includes(id));
  if (!rest.length) return found.length ? [found[found.length - 1]] : [];
  const pool = rest.filter(here).length ? rest.filter(here) : rest;
  if (pool.length === 1) return pool;
  const S = playerStats(order, hist), n = id => S[id].q + S[id].g, max = Math.max(...pool.map(n));
  return max > 0 ? pool.filter(id => n(id) === max) : [];
}
/* The same gage or truth on every phone, without anyone having to write it down.
   The group's own gages, when there are some, come out one time in two. */
function gageText(kind, level, seed, house = []) {
  const own = house.filter(c => c.kind === kind).map(c => c.text), h = hashInt(seed + kind);
  if (own.length && h % 2 === 0) return own[(h >>> 1) % own.length];
  const pool = [];
  for (let l = 1; l <= Math.min(4, Math.max(1, +level || 1)); l++) pool.push(...GAGES[kind][l]);
  return pool[h % pool.length];
}

/* ---------- state ---------- */
const M = {
  mode: "boot", me: null, code: null, tv: false,
  room: null, roomReady: false, players: [], playersReady: false,
  cards: {}, move: null, votes: [], customs: [], choices: [], pickIdea: null, desc: "", pics: { perso: "", pick: "" }, picBusy: "",
  gkind: "dare", renaming: false, handover: false, showQR: false, err: "", flash: "", busy: false, fatal: "",
  offline: false, offlineSince: 0, installEvt: null,
  local: null, drafts: { nick: store.get("nick") || "", code: hashCode() }
};
const isMod = () => !M.tv && !!M.room && M.room.hostUid === M.me;
const inRoom = () => !M.tv && M.players.some(p => p.id === M.me);
const present = id => M.players.some(p => p.id === id);
function pInfo(id) {
  const p = M.players.find(x => x.id === id);
  if (p) return p;
  const c = M.room?.cast?.[id];
  return { id, nick: c ? String(c.nick || "?").slice(0, 18) : "?", color: c?.color };
}

/* ---------- presence ----------
   Each phone stamps its player with the server time every HEARTBEAT_MS. The Firestore rules let a player
   take over once the moderator's stamp is a minute old; the button shows a bit later, at HOST_AWAY_MS. */
const HEARTBEAT_MS = 20000, HOST_AWAY_MS = 70000, PLAYER_AWAY_MS = 90000;
let skew = 0, lastHb = 0, mySeen = 0;
const serverNow = () => Date.now() - skew;
const seenMs = p => tsMs(p && p.seen);
const awayFor = p => !p ? Infinity : p.id === M.me ? 0 : serverNow() - seenMs(p);
const isOnline = p => awayFor(p) < PLAYER_AWAY_MS;
const idOnline = id => isOnline(M.players.find(p => p.id === id));
const hostPlayer = () => M.players.find(p => p.id === M.room?.hostUid);
/* Still sent while the page is in the background, as long as the phone lets it run;
   a locked phone stops it, and that player then counts as absent. */
function heartbeat() {
  if (M.mode !== "room" || !M.code || !inRoom()) return;
  lastHb = Date.now();
  F.updateDoc(rPlayer(M.code, M.me), { seen: F.serverTimestamp() }).catch(() => {});
}
setInterval(heartbeat, HEARTBEAT_MS);
/* One tick a second keeps the timers moving, lets the moderator's page run the automatic steps,
   and lets every page stick a post-it on a forehead still bare. */
setInterval(() => {
  if (M.mode === "room") { render(); if (isMod()) hostSync(); fillCards(); }
  else if (M.mode === "local" && M.local?.phase === "play" && M.local.step === "count") {
    if (Date.now() - M.local.countAt >= 3000) { M.local.step = "show"; saveLocal(); try { navigator.vibrate?.(60); } catch {} }
    render();
  }
}, 1000);

/* ---------- Firebase ---------- */
let F = null, DB = null, AUTH = null;
async function loadFirebase() {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")
  ]);
  const fbApp = appMod.initializeApp(firebaseConfig);
  AUTH = authMod.getAuth(fbApp);
  DB = fsMod.getFirestore(fbApp);
  F = { ...fsMod, signInAnonymously: authMod.signInAnonymously };
}
const rRoom = c => F.doc(DB, ROOT, c);
const rPlayer = (c, id) => F.doc(DB, ROOT, c, "players", id);
const cPlayers = c => F.collection(DB, ROOT, c, "players");
/* One post-it per player and per game: cards/{gameId}_{uid}. */
const rCard = (c, g, id) => F.doc(DB, ROOT, c, "cards", `${g}_${id}`);
const rMove = (c, id) => F.doc(DB, ROOT, c, "moves", id);
const cMoves = c => F.collection(DB, ROOT, c, "moves");
const rVote = (c, id) => F.doc(DB, ROOT, c, "votes", id);
const cVotes = c => F.collection(DB, ROOT, c, "votes");
const cCustom = c => F.collection(DB, ROOT, c, "custom");
const rCustom = (c, id) => F.doc(DB, ROOT, c, "custom", id);
const cChoices = c => F.collection(DB, ROOT, c, "choices");
const rChoice = (c, id) => F.doc(DB, ROOT, c, "choices", id);
const cardDoc = (g, id, c) => ({ gameId: g, uid: id, by: M.me, name: cleanText(c.name, 60), alt: (c.alt || []).map(a => cleanText(a, 60)).filter(Boolean).slice(0, 6),
  theme: String(c.theme || "").slice(0, 12), at: Date.now(), ...(cleanPic(c.pic) ? { pic: c.pic } : {}) });

let subs = [], gameSubs = [], turnSubs = [], voteSubs = [], turnKey = "", voteKey = "", unCustom = null, customKey = "";
const cardSubs = new Map();
const off = list => { list.forEach(u => u()); list.length = 0; };
function offCards() { cardSubs.forEach(x => x.un && x.un()); cardSubs.clear(); M.cards = {}; }
function leaveSubs() {
  off(subs); off(gameSubs); off(turnSubs); off(voteSubs); offCards();
  turnKey = ""; voteKey = "";
  if (unCustom) unCustom();
  unCustom = null; customKey = "";
}
function onErr(e) {
  M.err = e && e.code === "permission-denied" ? "Accès refusé à cette partie." : "Connexion à la partie perdue. Recharge la page.";
  render();
}
function subGame() {
  off(gameSubs);
  M.choices = [];
  const g = M.room?.gameId;
  if (!g) return;
  const n = store.json("notes", {});
  M.drafts.notes = n && n.g === g ? String(n.t || "") : "";
  M.pics.pick = "";
  gameSubs.push(F.onSnapshot(F.query(cChoices(M.code), F.where("gameId", "==", g)), s => { M.choices = s.docs.map(d => d.data()); render(); }, () => {}));
}
/* The move of the player whose turn it is: one document per turn, which only they can write. */
function subTurn() {
  const r = M.room, key = r && r.phase === "play" && r.step === "ask" ? `${r.gameId}_${r.seq}` : "";
  if (key === turnKey) return;
  off(turnSubs);
  turnKey = key; M.move = null;
  if (!key) return;
  turnSubs.push(F.onSnapshot(rMove(M.code, key), s => { M.move = s.exists() ? s.data() : null; render(); if (isMod()) hostSync(); }, () => {}));
}
/* The answers to the question on the table. */
function subVotes() {
  const r = M.room, key = r && r.phase === "play" && r.step === "vote" ? `${r.gameId}_${r.seq}` : "";
  if (key === voteKey) return;
  off(voteSubs);
  voteKey = key; M.votes = [];
  if (!key) return;
  const q = F.query(cVotes(M.code), F.where("gameId", "==", r.gameId), F.where("seq", "==", r.seq));
  voteSubs.push(F.onSnapshot(q, s => { M.votes = s.docs.map(d => d.data()); render(); if (isMod()) hostSync(); }, () => {}));
}
/* Everyone reads every post-it but their own; theirs opens once they found it, and all of them at the end.
   The big screen only ever sees those. */
function cardReadable(r, id) {
  if (r.phase === "end" || (r.found || []).includes(id)) return true;
  return id !== M.me && inRoom();
}
function subCards() {
  const r = M.room, g = r?.gameId;
  const want = new Set(r && r.phase !== "lobby" ? (r.order || []).filter(id => cardReadable(r, id)).map(id => `${g}_${id}`) : []);
  for (const [k, x] of cardSubs) if (!want.has(k)) { x.un && x.un(); cardSubs.delete(k); delete M.cards[k.split("_")[1]]; }
  for (const k of want) {
    if (cardSubs.has(k)) continue;
    const id = k.split("_")[1], entry = { un: null };
    cardSubs.set(k, entry);
    entry.un = F.onSnapshot(F.doc(DB, ROOT, M.code, "cards", k), { includeMetadataChanges: true }, s => {
      if (s.exists()) { M.cards[id] = cleanCard(s.data()); preloadPic(M.cards[id]); }
      else if (!s.metadata.fromCache) M.cards[id] = null;
      render();
    }, () => {
      // Refused (the rules saw the room a moment too early): try again a bit later.
      if (cardSubs.get(k) === entry) cardSubs.delete(k);
      setTimeout(() => { if (M.mode === "room" && M.room) subCards(); }, 3000);
    });
  }
}
/* House persos and gages stay a surprise: each player reads their own, the moderator reads them all. */
function subCustom() {
  const key = M.tv ? "" : isMod() ? "all" : inRoom() ? "mine" : "";
  if (key === customKey) return;
  if (unCustom) unCustom();
  unCustom = null; customKey = key; M.customs = [];
  if (!key) return;
  const q = key === "all" ? cCustom(M.code) : F.query(cCustom(M.code), F.where("by", "==", M.me));
  unCustom = F.onSnapshot(q, s => {
    M.customs = s.docs.map(d => { const x = d.data(); return { id: d.id, kind: ["who", "truth"].includes(x.kind) ? x.kind : "dare", text: cleanText(x.text, 140), by: x.by || "", at: x.at || 0, ok: !!x.ok, pic: cleanPic(x.pic) }; })
      .filter(c => c.text).sort((a, b) => a.at - b.at);
    render();
  }, () => { M.customs = []; render(); });
}
function enterRoom(code, tv = false) {
  leaveSubs();
  Object.assign(M, { mode: "room", tv, code, room: null, roomReady: false, players: [], playersReady: false,
    cards: {}, move: null, votes: [], customs: [], choices: [], renaming: false, handover: false, offline: false });
  if (!tv) store.set("room", code);
  try { history.replaceState(null, "", "#" + code + (tv ? "-tv" : "")); } catch {}
  subs.push(F.onSnapshot(rRoom(code), { includeMetadataChanges: true }, s => {
    if (!s.exists()) {
      if (s.metadata.fromCache) return;
      M.err = "Cette partie n'existe plus."; exitRoom(); return;
    }
    if (s.metadata.fromCache && !M.offline) M.offlineSince = Date.now();
    M.offline = s.metadata.fromCache;
    const prev = M.room?.gameId, prevSeq = M.room ? M.room.gameId + M.room.seq : "";
    M.room = s.data(); M.roomReady = true;
    if (M.room.gameId !== prev) subGame();
    if (prevSeq && prevSeq !== M.room.gameId + M.room.seq) M.err = "";
    subTurn(); subVotes(); subCards(); subCustom();
    if (isMod()) { rememberHosted(code); hostSync(); }
    render();
  }, onErr));
  subs.push(F.onSnapshot(cPlayers(code), q => {
    M.players = q.docs.map(d => { const x = d.data({ serverTimestamps: "estimate" }); return { id: d.id, ...x, nick: String(x.nick || "?").slice(0, 18) }; })
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    M.playersReady = true;
    // Learn how far this phone's clock is from the server's, from our own stamp, only when it just changed.
    const mine = q.docs.find(d => d.id === M.me), stamp = mine && !mine.metadata.hasPendingWrites && mine.data().seen;
    if (stamp && stamp.toMillis() !== mySeen) {
      if (mySeen && Date.now() - lastHb < 5000) skew = Date.now() - stamp.toMillis();
      mySeen = stamp.toMillis();
    }
    subCustom(); if (M.room) subCards();
    if (inRoom() && Date.now() - lastHb > HEARTBEAT_MS) heartbeat();
    if (isMod()) hostSync();
    render();
  }, onErr));
  render();
}
function exitRoom() {
  leaveSubs();
  Object.assign(M, { mode: "home", tv: false, code: null, room: null, players: [], cards: {}, move: null, votes: [],
    customs: [], choices: [], handover: false });
  store.set("room", null);
  try { history.replaceState(null, "", location.pathname + location.search); } catch {}
  render();
}
async function joinRoom(code, nick) {
  const ps = await F.getDocs(cPlayers(code));
  lastHb = Date.now();
  if (ps.docs.some(d => d.id === M.me)) { await F.updateDoc(rPlayer(code, M.me), { nick, seen: F.serverTimestamp() }); return; }
  const used = new Set(ps.docs.map(d => d.data().color));
  const fav = profile().color;
  const color = fav && !used.has(fav) ? fav : COLORS.find(c => !used.has(c)) || COLORS[ps.size % COLORS.length];
  await F.setDoc(rPlayer(code, M.me), { nick, color, joinedAt: Date.now(), seen: F.serverTimestamp() });
}
const freshGame = () => ({
  gameId: rid(), phase: "lobby", seq: 0, step: "ask", order: [], cast: {}, givers: {}, turnUid: "",
  q: null, last: null, found: [], history: [], house: [], paused: false
});
const freshRoom = () => ({
  ...freshGame(), themes: DEFAULT_THEMES, pick: "deck", persos: true, replay: true, fin: "last", timer: 0,
  oral: false, gages: false, gageLvl: 1, maison: true, approve: false, apero: false
});
/* Every change of the room also stamps it, which tells the cleanup when a room was last used. */
const patchRoom = p => F.updateDoc(rRoom(M.code), { ...p, touchedAt: F.serverTimestamp() });
/* House persos and gages the moderator accepted (or all of them, when approval is off). */
const usableCustoms = (r = M.room) => M.customs.filter(c => !r?.approve || c.ok || c.by === r.hostUid);

/* ---------- the round, as everyone sees it ---------- */
const moveNow = r => M.move && M.move.gameId === r.gameId && M.move.seq === r.seq ? M.move : null;
const voters = r => (r.order || []).filter(id => id !== r.turnUid && present(id));
const votesNow = r => M.votes.filter(v => v.gameId === r.gameId && v.seq === r.seq && v.voter !== r.turnUid && (r.order || []).includes(v.voter));
const myVote = r => votesNow(r).find(v => v.voter === M.me)?.v || "";
const targetOf = (r, uid) => Object.keys(r.givers || {}).find(t => r.givers[t] === uid) || "";
/* In the « players choose » mode: the players whose post-it is still blank, and who must write it. */
const pickWaiting = r => (r.order || []).filter(t => {
  const gp = M.players.find(p => p.id === r.givers?.[t]);
  return !(gp && gp.picked === r.gameId);
});
function timeLeft(r) {
  if (!r || !r.timer || r.phase !== "play" || r.step !== "ask" || !r.turnAt) return null;
  const end = tsMs(r.turnAt) + r.timer * 1000;
  const now = r.paused ? tsMs(r.pausedAt) || serverNow() : serverNow();
  return Math.max(0, Math.ceil((end - now) / 1000));
}

/* ---------- moderator's page: dealing the post-its and running the turns ----------
   Each post-it is written by someone else than its owner. With the deck, the moderator's page writes them all
   but its own, which the player chosen to "give" to the moderator draws. */
function startGame(r) {
  const ids = M.players.map(p => p.id).slice(0, MAX_PLAYERS);
  const cast = Object.fromEntries(ids.map(id => { const p = pInfo(id); return [id, { nick: p.nick, color: p.color || COLORS[0] }]; }));
  // Who writes whose post-it: one big circle in a random order, never your own.
  const ring = shuffle(ids), givers = {};
  ring.forEach((id, i) => { givers[ring[(i + 1) % ring.length]] = id; });
  // The accepted house gages are copied into the game, so every phone draws the same gage at the end.
  const house = r.gages && r.maison ? usableCustoms(r).filter(c => c.kind !== "who").map(c => ({ kind: c.kind, text: c.text })) : [];
  const friends = r.pick === "friends", online = ids.filter(idOnline);
  const b = F.writeBatch(DB);
  b.update(rRoom(M.code), {
    phase: "play", step: friends ? "pick" : "ask", seq: (r.seq || 0) + 1, order: ids, cast, givers, found: [], history: [], q: null, last: null,
    turnUid: (online.length ? online : ids)[rand((online.length ? online : ids).length)], turnAt: F.serverTimestamp(), house,
    paused: false, pausedAt: null, touchedAt: F.serverTimestamp()
  });
  if (!friends) {
    // House persos come out one time in two, never to the one who wrote it.
    const persos = r.persos ? shuffle(usableCustoms(r).filter(c => c.kind === "who")) : [], used = [];
    for (const id of ids) {
      if (id === M.me) continue;
      const hi = persos.findIndex(c => c.by !== id);
      let card;
      if (hi >= 0 && rand(2) === 0) { card = { name: persos[hi].text, alt: [], theme: "maison", pic: persos[hi].pic }; persos.splice(hi, 1); }
      else card = drawCard(r.themes, used);
      used.push(card.name);
      b.set(rCard(M.code, r.gameId, id), cardDoc(r.gameId, id, card));
    }
  }
  return b.commit();
}
const here = id => present(id);
function passTurn(r) {
  const to = nextTurn(r.order || [], r.found || [], r.turnUid, here, idOnline) || r.turnUid;
  return patchRoom({ step: "ask", turnUid: to, seq: r.seq + 1, turnAt: F.serverTimestamp(), q: null });
}
function applyMove(r, mv) {
  if (mv.kind === "pass") return passTurn(r);
  const t = cleanText(mv.text, 120), k = mv.kind === "guess" ? "g" : "q";
  if (k === "g" && !t && !r.oral) return patchRoom({ seq: r.seq + 1 });
  return patchRoom({ step: "vote", seq: r.seq + 1, q: { u: r.turnUid, k, t }, voteAt: F.serverTimestamp() });
}
/* Counting the answers. A « oui » (or a « ça dépend ») lets the asker go on, if the rules say so; a « non » passes the hand. */
function closeVote(r) {
  const q = r.q;
  if (!q) return patchRoom({ step: "ask", seq: r.seq + 1, turnAt: F.serverTimestamp() });
  const t = tally(q, votesNow(r));
  const entry = { u: q.u, k: q.k, t: q.t || "", r: t.res, y: t.y, n: t.n, i: t.i, x: t.x };
  const base = { history: [...(r.history || []), entry], last: { ...entry, s: r.seq + 1 }, q: null, seq: r.seq + 1, step: "ask", turnAt: F.serverTimestamp() };
  const order = r.order || [];
  if (q.k === "g" && t.res === "ok") {
    const found = [...(r.found || []), q.u];
    if (isOver(order, found, r.fin, here)) return patchRoom({ ...base, found, phase: "end", paused: false });
    return patchRoom({ ...base, found, turnUid: nextTurn(order, found, q.u, here, idOnline) || q.u });
  }
  const again = q.k === "q" && t.res !== "no" && r.replay;
  return patchRoom({ ...base, turnUid: again ? q.u : nextTurn(order, r.found || [], q.u, here, idOnline) || q.u });
}
function hostJob(r) {
  if (r.step === "pick") return pickWaiting(r).length ? null : { name: "picked", run: () => patchRoom({ step: "ask", seq: r.seq + 1, turnAt: F.serverTimestamp() }) };
  if (r.step === "ask") {
    const mv = moveNow(r);
    if (mv && mv.uid === r.turnUid) return { name: "move", run: () => applyMove(r, mv) };
    if (timeLeft(r) === 0) return { name: "time", run: () => passTurn(r) };
    if (!idOnline(r.turnUid)) {
      const to = nextTurn(r.order || [], r.found || [], r.turnUid, here, idOnline);
      if (to && to !== r.turnUid && idOnline(to)) return { name: "skip", run: () => patchRoom({ turnUid: to, seq: r.seq + 1, turnAt: F.serverTimestamp() }) };
    }
    return null;
  }
  if (r.step === "vote") {
    const live = voters(r).filter(idOnline), done = new Set(votesNow(r).map(v => v.voter));
    if (live.length && live.every(id => done.has(id))) return { name: "close", run: () => closeVote(r) };
  }
  return null;
}
let hostBusy = false, jobDone = "";
async function hostSync() {
  const r = M.room;
  if (!isMod() || hostBusy || M.busy || !r || r.phase !== "play" || r.paused) return;
  const job = hostJob(r);
  if (!job) return;
  const key = `${r.gameId}|${r.seq}|${job.name}`;
  if (key === jobDone) return;
  hostBusy = true;
  try { await job.run(); jobDone = key; } catch {}
  hostBusy = false;
}
/* Every page: a post-it still blank once the game runs gets one from the deck. Whoever was meant to write it
   does it at once; anyone else steps in after a few seconds (the first one wins, the others are refused). */
const missSince = {}, fillTried = {};
let flagTried = 0;
function fillCards() {
  const r = M.room;
  if (!r || r.phase !== "play" || !inRoom() || M.offline) return;
  const now = Date.now();
  if (r.step === "pick") {
    // My post-it is written but the flag that tells the moderator didn't go through: send it again.
    const t = targetOf(r, M.me), me = M.players.find(p => p.id === M.me);
    if (t && M.cards[t] && me && me.picked !== r.gameId && now - flagTried > 5000) {
      flagTried = now;
      F.updateDoc(rPlayer(M.code, M.me), { picked: r.gameId }).catch(() => {});
    }
    return;
  }
  const used = Object.values(M.cards).filter(Boolean).map(c => c.name);
  for (const id of r.order || []) {
    if (id === M.me) continue;
    const k = r.gameId + "_" + id;
    if (M.cards[id] !== null) { delete missSince[k]; continue; }
    missSince[k] = missSince[k] || now;
    const wait = r.givers?.[id] === M.me ? 0 : 7000 + hashInt(M.me + k) % 5000;
    if (now - missSince[k] < wait || now - (fillTried[k] || 0) < 15000) continue;
    fillTried[k] = now;
    const card = drawCard(r.themes, used);
    used.push(card.name);
    F.setDoc(rCard(M.code, r.gameId, id), cardDoc(r.gameId, id, card)).catch(() => {});
  }
}

/* ---------- cleanup: rooms this phone created, unused for a day, are deleted ---------- */
function rememberHosted(code) {
  const list = store.json("hosted", []);
  if (!list.includes(code)) { list.push(code); store.set("hosted", JSON.stringify(list.slice(-30))); }
}
async function deleteCards(code, gameId, ids) {
  for (const id of new Set(ids)) await F.deleteDoc(rCard(code, gameId, id)).catch(() => {});
}
async function deleteRoom(code, r) {
  const col = name => F.collection(DB, ROOT, code, name);
  const players = (await F.getDocs(col("players"))).docs;
  // Post-its can't be listed (nobody may read their own), so they go by the uids we know.
  await deleteCards(code, r.gameId, [...players.map(d => d.id), ...(r.order || [])]);
  for (const name of ["moves", "votes", "custom", "choices"]) for (const d of (await F.getDocs(col(name))).docs) await F.deleteDoc(d.ref);
  for (const d of players) await F.deleteDoc(d.ref);
  await F.deleteDoc(rRoom(code));
}
async function cleanupOldRooms() {
  const keep = [];
  for (const code of store.json("hosted", [])) {
    try {
      const s = await F.getDoc(rRoom(code));
      if (!s.exists()) continue;
      const r = s.data();
      if (r.hostUid !== M.me) continue;
      if (code === M.code || Date.now() - Math.max(tsMs(r.touchedAt), tsMs(r.createdAt)) < ROOM_MAX_IDLE_MS) { keep.push(code); continue; }
      await deleteRoom(code, r);
    } catch { keep.push(code); }
  }
  store.set("hosted", JSON.stringify(keep));
}

/* ---------- profile, kept on this phone ---------- */
function profile() {
  return { color: null, games: 0, wins: 0, found: 0, best: 0, questions: 0, titles: {}, persos: [], recorded: [], ...store.json("profile", {}) };
}
function saveProfile(p) { store.set("profile", JSON.stringify(p)); }
function recordGame(gameId, ids, found, hist, titles) {
  const p = profile();
  if (!gameId || p.recorded.includes(gameId) || !ids.includes(M.me) || !hist.length) return;
  const s = playerStats(ids, hist)[M.me];
  p.games++;
  if (found[0] === M.me) p.wins++;
  if (s.done) { p.found++; if (!p.best || s.toFind < p.best) p.best = s.toFind; }
  p.questions += s.q + s.g;
  const t = titles[M.me];
  if (t) p.titles[t.title] = (p.titles[t.title] || 0) + 1;
  p.recorded = [...p.recorded, gameId].slice(-50);
  saveProfile(p);
}
function rememberPerso(gameId, card) {
  const p = profile();
  if (!gameId || !card || p.persos.some(x => x.g === gameId)) return;
  p.persos = [...p.persos, { g: gameId, n: card.name }].slice(-6);
  saveProfile(p);
}

/* ---------- end-of-game titles ---------- */
const TITLE_RULES = [
  { label: "Sherlock", w: 4, score: s => s.done && s.toFind <= 12 ? 13 - s.toFind : 0, why: () => "le plus rapide à trouver" },
  { label: "Sur une lancée", w: 2.2, score: s => s.bestRun >= 4 ? s.bestRun : 0, why: s => `${s.bestRun} « oui » d'affilée` },
  { label: "Têtu", w: 3, score: s => s.gko >= 2 ? s.gko : 0, why: s => `${s.gko} mauvaises réponses` },
  { label: "Du premier coup", w: 1.5, score: s => s.done && s.g === 1 ? 2 : 0, why: () => "trouvé dès sa première proposition" },
  { label: "Philosophe", w: 1.8, score: s => s.idk >= 2 ? s.idk : 0, why: s => `${s.idk} questions qui ont fait débat` },
  { label: "Esprit de contradiction", w: 1.6, score: s => s.contra >= 3 ? s.contra : 0, why: s => `pas d'accord avec la table ${s.contra} fois` },
  { label: "Abonné au non", w: 1.2, score: s => s.no >= 5 ? s.no : 0, why: s => `${s.no} « non » reçus` },
  { label: "Moulin à questions", w: .6, score: s => s.q >= 15 ? s.q : 0, why: s => `${s.q} questions posées` },
  { label: "Toujours dans le flou", w: .4, score: s => !s.done && s.q >= 1 ? s.q : 0, why: s => `a cherché pendant ${plural(s.q, "question")}` }
];
function computeTitles(ids, hist) {
  const S = playerStats(ids, hist), cands = [];
  for (const s of Object.values(S)) for (const rule of TITLE_RULES) {
    const sc = rule.score(s);
    if (sc > 0) cands.push({ uid: s.id, title: rule.label, why: rule.why(s), score: sc * rule.w });
  }
  cands.sort((a, b) => b.score - a.score);
  const out = {}, used = new Set();
  for (const c of cands) if (!out[c.uid] && !used.has(c.title)) { out[c.uid] = c; used.add(c.title); }
  for (const id of ids) if (!out[id]) out[id] = { title: "Figurant", why: "discret mais présent" };
  return out;
}

/* ---------- shared pieces ---------- */
function av(p, cls = "") {
  const ini = (p.nick || "?").trim().charAt(0) || "?";
  return `<span class="av ${cls}" style="background:${safeColor(p.color)}" aria-hidden="true">${esc(ini)}</span>`;
}
function chip(p, extra = "", cls = "") {
  const room = M.mode === "room" && M.room;
  const mod = room && p.id === M.room.hostUid, away = room && p.id !== M.me && !isOnline(M.players.find(x => x.id === p.id));
  return `<span class="chip ${cls} ${away ? "dim" : ""}">${av(p)}<span class="nm">${esc(p.nick)}</span>${mod ? `<span class="tag">modo</span>` : ""}${away ? `<span class="tag off">absent</span>` : ""}${extra}</span>`;
}
function header(big, badge = "") {
  return `<header class="top ${big ? "big" : ""}"><h1 class="logo">Qui suis-je <span class="q">?</span></h1>${badge ? `<span class="badge">${esc(badge)}</span>` : ""}</header>`;
}
function errBox() {
  return (M.err ? `<div class="err" role="alert">${esc(M.err)}</div>` : "") + (M.flash ? `<div class="note" role="status">${esc(M.flash)}</div>` : "");
}
/* The post-it itself: the name in marker, or a big question mark for the one you can't see. */
function postit(card, o = {}) {
  const cls = `postit ${o.cls || ""}`, key = esc(o.key || "");
  if (o.hidden) return `<div class="${cls} hidden" data-key="${key}" role="img" aria-label="Perso caché"><span class="pq" aria-hidden="true">?</span>${o.meta ? `<small>${o.meta}</small>` : ""}</div>`;
  if (!card) return `<div class="${cls} hidden wait" data-key="${key}"><span class="pq" aria-hidden="true">…</span><small>On colle le post-it</small></div>`;
  const len = card.name.length, info = o.plain ? null : infoOf(card), open = info?.d && M.desc === card.name;
  return `<div class="${cls} ${len > 24 ? "long" : len > 13 ? "mid-len" : ""} ${info?.i ? "has-pic" : ""}" data-key="${key}">
    ${info?.d ? `<button class="why" data-act="desc" data-id="${esc(card.name)}" aria-expanded="${!!open}" aria-label="Qui est-ce ?">?</button>` : ""}
    ${info?.i ? `<img class="pic" src="${esc(info.i)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="(window.badPics=window.badPics||new Set).add(this.src);this.remove()">` : ""}
    <span class="pn">${esc(card.name)}</span>${o.meta ? `<small>${o.meta}</small>` : ""}
    ${open ? `<p class="desc">${esc(info.d)}</p>` : ""}</div>`;
}
/* Pictures are fetched as soon as the post-its are known, so they're already there when shown. */
const preloaded = new Set();
function preloadPic(card) {
  const i = infoOf(card)?.i;
  if (i && !preloaded.has(i)) { preloaded.add(i); const im = new Image(); im.referrerPolicy = "no-referrer"; im.src = i; }
}
/* A tiny picture next to a name, in the lists. */
const thumb = card => { const i = infoOf(card)?.i; return i ? `<img class="th" src="${esc(i)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="(window.badPics=window.badPics||new Set).add(this.src);this.remove()">` : ""; };
function cardMeta(card, info) {
  if (!card) return "";
  if (card.theme === "maison") return "Perso maison";
  if (card.theme === "ami" || !themeName(card.theme)) return card.by ? `Choisi par ${esc(info(card.by).nick)}` : "";
  return esc(themeName(card.theme));
}
function stage(label, inner) {
  return `<div class="stage"><div class="label on-ground">${label}</div>${inner}</div>`;
}
function sw(on, act, title, sub) {
  return `<button class="switch" data-act="${act}" aria-pressed="${!!on}"><span class="knob"></span><span><b>${title}</b><br><small>${sub}</small></span></button>`;
}
const togs = (list, cur, act) => `<div class="toggles">${list.map(([v, label]) => `<button class="tog" data-act="${act}" data-id="${v}" aria-pressed="${cur === v}">${label}</button>`).join("")}</div>`;
/* o: { themes, pick, persos, replay, fin, timer, gages, gageLvl, maison, approve, apero, acts } — a missing act hides its setting. */
function settingsPanel(o) {
  const a = o.acts, on = new Set(validThemes(o.themes));
  return `<section class="panel">
    <div class="label">Les persos</div>
    <div class="themes">${THEMES.map(t => `<button class="theme" data-act="${a.theme}" data-id="${t.id}" aria-pressed="${on.has(t.id)}"><b>${esc(t.name)}</b><small>${t.cards.length}</small></button>`).join("")}</div>
    ${a.pick ? `<div class="label">Qui choisit les persos ?</div>
      ${togs([["deck", "La pioche"], ["friends", "Les joueurs"]], o.pick || "deck", a.pick)}
      <p class="hint left">${o.pick === "friends" ? "Chacun écrit en secret le perso d'un autre joueur (tiré au sort). Les thèmes servent alors d'idées." : "L'appli pioche un perso pour chacun dans les thèmes cochés."}</p>
      ${o.pick !== "friends" ? sw(o.persos, a.persos, "Persos maison", "Vos propres persos, ceux que vous connaissez tous : tonton Gérard, la prof de maths… Ils ont une chance sur deux de sortir.") : ""}` : ""}
  </section>
  <section class="panel">
    <div class="label">Règles</div>
    ${a.oral ? sw(o.oral, a.oral, "Questions à l'oral", "Pas de clavier : on pose sa question et on dit qui on pense être à voix haute. Les autres répondent toujours sur leur téléphone.") : ""}
    ${sw(o.replay, a.replay, "Rejouer après un oui", "Tant que la réponse est oui, on garde la main. Sinon, une seule question par tour.")}
    <div class="label">Fin de la partie</div>
    ${togs(FINS, o.fin || "last", a.fin)}
    <p class="hint left">${FIN_HINT[o.fin || "last"]}</p>
    ${a.timer ? `<div class="label">Chrono pour poser sa question</div>
      ${togs(TIMERS.map(v => [v, v ? v + " s" : "Aucun"]), o.timer || 0, a.timer)}
      <p class="hint left">Au bout du chrono, la main passe au suivant.</p>` : ""}
  </section>
  <section class="panel">
    <div class="label">Options</div>
    ${sw(o.gages, a.gages, "Gages et vérités", "À la fin, le perdant choisit entre un gage et une vérité.")}
    ${o.gages ? `${togs([1, 2, 3, 4].map(v => [v, GAGE_LEVELS[v - 1]]), o.gageLvl || 1, a.gageLvl)}
      <p class="hint left">Chaque niveau pioche aussi dans les plus doux. Ce qui touche quelqu'un d'autre se fait avec son accord.</p>
      ${sw(o.maison, a.maison, "Gages maison", "Vos propres gages et vérités : ils ont une chance sur deux de sortir.")}` : ""}
    ${a.approve && ((o.gages && o.maison) || (o.persos && o.pick !== "friends")) ? sw(o.approve, a.approve, "Valider ce que proposent les joueurs", "Les persos et gages maison des autres attendent ton accord.") : ""}
    ${sw(o.apero, a.apero, "Mode apéro", `Une mauvaise réponse : ${SIPS} gorgées. Qui trouve en distribue ${SIPS}.`)}
  </section>`;
}
function settingsSummary(r) {
  const th = validThemes(r.themes);
  const tags = [...(th.length > 3 ? [`${th.length} thèmes`] : th.map(themeName)), r.pick === "friends" ? "Les joueurs choisissent" : "La pioche",
    ...(r.pick !== "friends" && r.persos ? ["Persos maison"] : []), ...(r.oral ? ["Questions à l'oral"] : []), ...(r.replay ? ["Rejouer après un oui"] : ["Une question par tour"]),
    FINS.find(f => f[0] === (r.fin || "last"))[1], ...(r.timer ? [`Chrono ${r.timer} s`] : []),
    ...(r.gages ? [`Gages ${GAGE_LEVELS[(r.gageLvl || 1) - 1]}`] : []), ...(r.gages && r.maison ? ["Gages maison"] : []), ...(r.apero ? ["Mode apéro"] : [])];
  return `<div class="summary">${tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>`;
}
/* The photo waiting to go with the perso being written: a button to take or pick one, then its preview. */
function picField(form) {
  const p = M.pics[form];
  if (M.picBusy === form) return `<p class="hint left picline">Photo en préparation…</p>`;
  return p ? `<div class="picline"><img class="picprev" src="${esc(p)}" alt="Photo choisie"><button class="link" type="button" data-act="pic-clear" data-id="${form}">Retirer la photo</button></div>`
    : `<div class="picline"><button class="btn picbtn" type="button" data-act="pic-choose" data-id="${form}">Ajouter une photo</button><small class="hint">facultatif</small></div>`;
}
/* o: { title, kinds: [[kind, label, placeholder]], form, delAct, canDel, pending, approveAct, empty, max, photo } */
function customBlock(list, o) {
  const kinds = o.kinds, cur = kinds.find(k => k[0] === M.gkind) || kinds[0];
  const field = `<div class="row"><input id="${o.form}" data-draft="${o.form}" type="text" maxlength="${o.max || 140}" autocomplete="off" enterkeyhint="done"
      placeholder="${esc(cur[2])}" aria-label="${esc(cur[1])}"><button class="btn" type="submit">Ajouter</button></div>`;
  return `<section class="panel">
    <div class="label">${o.title}</div>
    ${kinds.length > 1 ? `<div class="toggles">${kinds.map(([k, n]) => `<button class="tog" data-act="gkind" data-id="${k}" aria-pressed="${cur[0] === k}">${n}</button>`).join("")}</div>` : ""}
    <form class="stack" data-form="${o.form}">${field}${o.photo ? picField(o.form) : ""}</form>
    ${list.length ? `<ul class="customs">${list.map(c => {
      const waiting = o.pending && o.pending(c);
      return `<li class="${waiting ? "wait-ok" : ""}">${c.pic ? `<img class="cpic" src="${esc(c.pic)}" alt="">` : ""}<span><small class="tagline">${c.kind === "truth" ? "Vérité" : c.kind === "who" ? "Perso" : "Gage"}${waiting ? " · en attente de validation" : ""}</small>${esc(c.text)}</span>
        <span class="acts">${waiting && o.approveAct ? `<button class="link" data-act="${o.approveAct}" data-id="${esc(c.id)}">Valider</button>` : ""}
        ${o.canDel(c) ? `<button class="link" data-act="${o.delAct}" data-id="${esc(c.id)}" aria-label="Supprimer">${waiting && o.approveAct ? "Refuser" : "Retirer"}</button>` : ""}</span></li>`;
    }).join("")}</ul>` : `<p class="hint left">${o.empty}</p>`}
  </section>`;
}
const GAGE_KINDS = [["dare", "Un gage", "Appelle ton ex et chante-lui un tube des années 80."], ["truth", "Une vérité", "Quel est ton pire mensonge de la soirée ?"]];
const PERSO_KINDS = [["who", "Un perso", "Tonton Gérard, la prof de maths, le chat de Léa…"]];
/* Whose turn it is, and what they are doing. */
function turnPanel(r, info, o = {}) {
  const u = info(r.turnUid), me = !o.noMe && r.turnUid === M.me;
  const n = (r.history || []).filter(h => h.u === r.turnUid).length + 1;
  const doing = r.step === "vote" ? (r.q?.k === "g" ? "propose une réponse" : "attend la réponse") : "prépare sa question";
  return `<section class="panel center turnnow" data-key="${esc(`${r.gameId}.${r.turnUid}`)}">
    <div class="label">${me ? "C'est ton tour" : "Au tour de"} · question ${n}</div>
    ${me ? `<div class="turn me">À toi de deviner !</div>` : `<div class="whois">${av(u)}<span>${esc(u.nick)}</span></div><div class="turn"><span>${doing}<span class="dots"></span></span></div>`}
  </section>`;
}
/* The answer to the last question, as it falls. */
function lastPanel(last, info, o = {}) {
  if (!last) return "";
  const p = info(last.u);
  if (last.k === "g" && last.r === "ok") {
    const card = o.cardOf ? o.cardOf(last.u) : null;
    return `<section class="panel center lastres found" data-key="${esc(o.key || "")}" aria-live="polite">
      <div class="label">${esc(p.nick)} a trouvé !</div>
      ${postit(card, { cls: "small" })}
      ${o.apero ? `<div class="sips">${esc(p.nick)} distribue ${SIPS} gorgées</div>` : ""}
    </section>`;
  }
  const what = last.k === "g" ? (last.t ? `propose « ${esc(last.t)} »` : "propose une réponse <i>à voix haute</i>") : last.t ? `« ${esc(last.t)} »` : "<i>question à voix haute</i>";
  const counts = last.y + last.n + last.i ? `<div class="counts"><span>Oui ${last.y}</span><span>Non ${last.n}</span>${last.i ? `<span>? ${last.i}</span>` : ""}</div>` : "";
  return `<section class="panel lastres res-${last.r}" data-key="${esc(o.key || "")}" aria-live="polite">
    <div class="lr-q">${av(p)}<span><b>${esc(p.nick)}</b> ${what}</span></div>
    <div class="lr-a"><b>${RES[last.r]}</b>${counts}</div>
    ${o.apero && last.r === "ko" ? `<div class="sips">${esc(p.nick)} boit ${SIPS} gorgées</div>` : ""}
  </section>`;
}
const qaLine = h => h.k === "g" ? (h.t ? `Proposé : « ${esc(h.t)} »` : "Réponse proposée <i>à voix haute</i>") : h.t ? esc(h.t) : "<i>à voix haute</i>";
const qaList = list => `<ol class="qa">${list.map(h => `<li class="r-${h.r}"><span>${qaLine(h)}</span><b>${RES[h.r]}</b></li>`).join("")}</ol>`;
/* What one player has learnt so far, question by question. */
function carnet(hist, uid, title, o = {}) {
  const mine = hist.filter(h => h.u === uid);
  if (!mine.length && !o.empty) return "";
  return `<section class="panel carnet"><div class="label">${title}</div>${mine.length ? qaList(mine) : `<p class="hint left">${o.empty}</p>`}</section>`;
}
function journal(hist, info, o = {}) {
  if (!hist.length) return "";
  const list = hist.slice(-(o.max || 12)).reverse();
  const body = `<ol class="qa">${list.map(h => `<li class="r-${h.r}">${av(info(h.u))}<span><b>${esc(info(h.u).nick)}</b> ${qaLine(h)}</span><b>${RES[h.r]}</b></li>`).join("")}</ol>`;
  return o.open ? `<section class="panel"><div class="label">Les dernières questions</div>${body}</section>`
    : `<details class="panel journal"><summary class="label">Journal de la partie</summary>${body}</details>`;
}
/* Everyone at the table, with the post-it each one wears (a question mark for yours). */
function tablePanel(r, info, o = {}) {
  const order = r.order || [], found = r.found || [], hist = r.history || [], live = r.phase === "play";
  return `<section class="panel">
    <div class="label">La table${found.length ? ` · ${found.length} ${found.length > 1 ? "ont" : "a"} trouvé` : ""}</div>
    <ol class="seats">${order.map(id => {
      const p = info(id), turn = live && id === r.turnUid && r.step !== "pick", k = found.indexOf(id);
      const away = o.online && id !== M.me && !idOnline(id), qn = hist.filter(h => h.u === id).length;
      let card;
      if (o.hide && o.hide(id)) card = `<span class="mini hidden">${id === M.me && !o.noMe ? "ton perso : ?" : "?"}</span>`;
      else { const c = o.cardOf(id); card = c ? `<span class="mini">${thumb(c)}${esc(c.name)}</span>` : `<span class="mini wait">on colle le post-it…</span>`; }
      const tags = (o.online && id === M.room?.hostUid ? ` <span class="tag">modo</span>` : "") + (away ? ` <span class="tag off">absent</span>` : "")
        + (turn ? ` <span class="tag hot">son tour</span>` : "") + (k >= 0 ? ` <span class="tag win">${ord(k)}</span>` : "");
      return `<li class="${turn ? "now" : ""} ${k >= 0 ? "done" : ""}">${av(p)}<span class="sw"><span class="nm">${esc(p.nick)}${tags}</span>${card}</span><b class="n" aria-label="${plural(qn, "question")}">${qn}</b></li>`;
    }).join("")}</ol>
  </section>`;
}
/* Gages and truths for the loser, each choosing on their own phone. */
function gagesPanel(o) {
  if (!o.on || !o.losers.length) return "";
  return `<section class="panel"><div class="label">Gage du perdant · ${GAGE_LEVELS[(o.lvl || 1) - 1]}</div>${o.losers.map(p => {
    const kind = o.choiceOf(p.id);
    if (kind) return `<div class="gage ${kind}"><div class="gk">${esc(p.nick)} · ${kind === "dare" ? "Gage" : "Vérité"}</div><p>${esc(gageText(kind, o.lvl, o.seed + p.id, o.house))}</p></div>`;
    if (o.canChoose(p.id)) return `<div class="gage"><div class="gk">${p.id === M.me ? "À toi de choisir" : `${esc(p.nick)} choisit`}</div>
      <div class="btns"><button class="btn primary" data-act="${o.act}" data-id="dare" data-uid="${esc(p.id)}">Gage</button><button class="btn" data-act="${o.act}" data-id="truth" data-uid="${esc(p.id)}">Vérité</button></div></div>`;
    return `<div class="gage"><div class="gk">${esc(p.nick)}</div><p class="dots">choisit entre gage et vérité</p></div>`;
  }).join("")}</section>`;
}
function timerBar(left, total, label) {
  if (left == null) return "";
  const pctW = total ? Math.max(0, Math.min(100, left / total * 100)) : 0;
  return `<div class="timer ${left <= 10 ? "hurry" : ""}"><div class="tl"><span>${label}</span><b>${left} s</b></div><div class="bar"><i style="width:${pctW}%"></i></div></div>`;
}
function waitMod(text) {
  return `<section class="panel center wait"><div class="label">En attente du modo</div><div class="big dots">${text}</div></section>`;
}
function pauseScreen() {
  return `<section class="panel center pause"><div class="label">Pause</div><div class="big">La partie est en pause</div><p class="hint">Le modo la relance dès que tout le monde est revenu.</p></section>`;
}
function rulesBox() {
  return `<details class="panel rules"><summary class="label">Comment on joue</summary>
    <ol>
      <li>Chacun a un <b>perso secret</b> collé sur le front : une star, un héros, un animal… Tout le monde le voit sur son téléphone, <b>sauf toi</b>.</li>
      <li>À ton tour, pose une question qui se répond par oui ou non : « Est-ce que je suis une femme ? ». Tape-la, ou pose-la à voix haute.</li>
      <li>Les autres répondent sur leur téléphone : <b>Oui</b>, <b>Non</b> ou <b>Je ne sais pas</b>. Tant que c'est oui, tu rejoues ; au premier non, la main passe.</li>
      <li>Tu crois savoir ? <b>Propose une réponse</b>. Les autres valident : tu as trouvé, ou c'est raté et la main passe.</li>
      <li>Le premier qui trouve gagne. On continue pour le classement : le dernier a un gage, si vous jouez avec.</li>
    </ol></details>`;
}

/* ---------- screens: home ---------- */
function renderSetup() {
  return header(true) + `<section class="panel">
    <p class="lead"><b>Le jeu en ligne n'est pas encore branché.</b></p>
    <p class="note">Colle la configuration de ton projet Firebase dans le fichier <b>config.js</b>, puis remets le site en ligne.</p>
  </section>
  <button class="btn primary big" data-act="go-local">Jouer sur un seul téléphone</button>`;
}
function renderFatal() {
  return header(true) + `<section class="panel"><p class="lead">${esc(M.fatal)}</p>
    <button class="btn primary big" data-act="reload">Réessayer</button></section>
  <p class="foot"><button class="link" data-act="go-local">Jouer sur un seul téléphone</button></p>`;
}
function profilePanel() {
  const p = profile(), title = topOf(p.titles);
  return `<section class="panel">
    <div class="label">Mon profil</div>
    <div class="swatches" role="group" aria-label="Ma couleur">${COLORS.map(c =>
      `<button class="swatch" data-act="pick-color" data-id="${c}" style="background:${c}" aria-pressed="${p.color === c}" aria-label="Couleur ${c}"></button>`).join("")}</div>
    ${p.games ? `<ul class="stats">
        <li><b>${p.games}</b> ${p.games > 1 ? "parties" : "partie"}</li>
        <li><b>${p.wins}</b> ${p.wins > 1 ? "victoires" : "victoire"}</li>
        <li><b>${p.found}</b> ${p.found > 1 ? "persos trouvés" : "perso trouvé"}</li>
      </ul>
      ${p.best ? `<p class="hint left">Ton record : trouvé en <b>${plural(p.best, "question")}</b>.</p>` : ""}
      ${p.persos.length ? `<p class="hint left">Tu as été : <b>${p.persos.slice().reverse().map(x => esc(x.n)).join(", ")}</b>.</p>` : ""}
      ${title ? `<p class="hint left">Ton titre fétiche : <b>${esc(title[0])}</b>.</p>` : ""}`
      : `<p class="hint left">Tes stats apparaîtront ici après ta première partie en ligne. Elles restent sur ce téléphone.</p>`}
  </section>`;
}
function installPanel() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) return "";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (M.installEvt) return `<button class="btn big" data-act="install">Installer l'appli sur ce téléphone</button>`;
  if (ios) return `<p class="hint on-ground">Pour l'installer : bouton Partager de Safari, puis « Sur l'écran d'accueil ».</p>`;
  return "";
}
function renderHome() {
  const invited = M.drafts.code && M.drafts.code.length === 4 && hashCode() === M.drafts.code;
  const nickField = `<input id="nick" data-draft="nick" type="text" maxlength="18" autocomplete="nickname" enterkeyhint="next" placeholder="Ton prénom ou surnom" aria-label="Ton prénom">`;
  const joinForm = `<form class="stack" data-form="join-code">
      <input id="code" class="codein" data-draft="code" type="text" maxlength="4" autocomplete="off" autocapitalize="characters" enterkeyhint="go" placeholder="CODE" aria-label="Code de la partie">
      <button class="btn ${invited ? "primary big" : ""}" type="submit">Rejoindre la partie</button>
    </form>`;
  return header(true) + `<p class="tagline">Un post-it sur le front : tout le monde sait qui tu es… sauf toi. Pose les bonnes questions !</p>
  <div class="hero" aria-hidden="true">${postit({ name: "Napoléon" }, { cls: "h1", plain: true })}${postit(null, { hidden: true, cls: "h2" })}${postit({ name: "Pikachu" }, { cls: "h3", plain: true })}</div>` + errBox() + `<section class="panel">
    <div class="label">Ton prénom</div>${nickField}
  </section>
  ${invited
    ? `<section class="panel"><div class="label">Tu es invité à la partie</div><div class="code">${esc(M.drafts.code)}</div>${joinForm}</section>
       <div class="or">ou</div>
       <button class="btn big" data-act="create">Créer ma propre partie</button>`
    : `<button class="btn primary big" data-act="create">Créer une partie</button>
       <p class="hint on-ground">Tu seras le modo : tu règles la partie et tu la lances.</p>
       <div class="or">ou</div>
       <section class="panel"><div class="label">Rejoindre avec un code</div>${joinForm}</section>`}
  ${rulesBox()}
  ${profilePanel()}
  ${installPanel()}
  <p class="foot"><button class="link" data-act="go-local">Jouer sur un seul téléphone (sur le front)</button></p>`;
}

/* ---------- screens: room ---------- */
const baseUrl = () => location.origin + location.pathname;
const inviteLink = () => baseUrl() + "#" + M.code;
const tvLink = () => baseUrl() + "#" + M.code + "-tv";
function invitePanel() {
  return `<section class="panel center">
    <div class="label">Code de la partie</div>
    <div class="code">${esc(M.code)}</div>
    ${M.showQR ? `<div class="qr" data-qr="${esc(inviteLink())}" aria-label="QR code pour rejoindre la partie"></div>` : ""}
    <div class="btns" style="width:100%">
      ${navigator.share ? `<button class="btn primary" data-act="share">Inviter</button>` : ""}
      <button class="btn" data-act="copy">Copier le lien</button>
      <button class="btn" data-act="toggle-qr">${M.showQR ? "Cacher le QR code" : "QR code"}</button>
    </div>
    <p class="hint">Les autres scannent le QR code, ouvrent le lien, ou tapent le code sur le site.</p>
    ${isMod() ? `<details class="tvbox"><summary>Afficher la partie sur une TV ou un ordi</summary>
      <p class="hint left">Ouvre ce lien sur le grand écran : il montre les questions, les réponses et le classement, jamais un perso pas encore trouvé.</p>
      <div class="row"><input type="text" readonly value="${esc(tvLink())}" aria-label="Lien grand écran" onclick="this.select()"><button class="btn" data-act="copy-tv">Copier</button></div>
    </details>` : ""}
  </section>`;
}
function playersPanel(players, editable) {
  return `<section class="panel">
    <div class="label">Joueurs · ${players.length}${players.length > MAX_PLAYERS ? ` (${MAX_PLAYERS} au plus par partie)` : ""}</div>
    ${players.length ? `<div class="chips">${players.map(p => chip(p,
      editable && p.id !== M.me ? `<button class="x" data-act="kick" data-id="${esc(p.id)}" aria-label="Retirer ${esc(p.nick)}">×</button>` : "",
      p.id === M.me ? "me" : "")).join("")}</div>`
      : `<p class="hint left">Personne pour l'instant.</p>`}
    ${editable && isMod() && players.length > 1 ? (M.handover
      ? `<div class="label">Donner le rôle de modo à</div>
         <div class="chips">${players.filter(p => p.id !== M.me).map(p => `<button class="btn" data-act="handover" data-id="${esc(p.id)}">${esc(p.nick)}</button>`).join("")}</div>
         <button class="link" data-act="handover-cancel" style="align-self:flex-start">Annuler</button>`
      : `<button class="link" data-act="handover-open" style="align-self:flex-start">Passer le rôle de modo à quelqu'un d'autre</button>`) : ""}
    ${inRoom() ? (M.renaming
      ? `<form class="row" data-form="rename"><input id="rename" data-draft="rename" type="text" maxlength="18" autocomplete="off" enterkeyhint="done" placeholder="Nouveau pseudo" aria-label="Nouveau pseudo"><button class="btn primary" type="submit">OK</button></form>
         <button class="link" data-act="rename-cancel" style="align-self:flex-start">Annuler</button>`
      : `<button class="link" data-act="rename-open" style="align-self:flex-start">Changer de pseudo</button>`) : ""}
  </section>`;
}
/* Safety nets: a lost connection, and a moderator whose phone has gone quiet. */
function alerts() {
  let h = "";
  if ((M.offline && Date.now() - M.offlineSince > 4000) || navigator.onLine === false) {
    h += `<div class="note" role="status"><b>Connexion perdue.</b> Le jeu se reconnecte tout seul : ne ferme pas la page, tes actions seront envoyées au retour du réseau.</div>`;
  }
  if (!isMod() && inRoom() && M.room) {
    const away = awayFor(hostPlayer());
    if (away >= HOST_AWAY_MS) {
      const mins = Number.isFinite(away) ? Math.floor(away / 60000) : 0;
      h += `<section class="panel alert">
        <p class="lead"><b>Le modo ne répond plus${mins ? ` depuis ${plural(mins, "minute")}` : ""}.</b></p>
        <p class="hint left">Son téléphone s'est peut-être mis en veille ou a perdu le réseau. Quelqu'un peut reprendre la partie exactement là où elle en est.</p>
        <button class="btn primary" data-act="takeover">Devenir le modo</button>
      </section>`;
    }
  }
  return h;
}
function renderRoom() {
  if (!M.roomReady || !M.playersReady) return header(true, "Partie " + M.code) + `<section class="panel center loading">Connexion à la partie…</section>`;
  if (M.tv) return renderTv();
  const r = M.room, players = M.players, mod = isMod();
  const badge = (mod ? "Modo · " : "Partie ") + M.code;
  if (!inRoom()) {
    return header(true, badge) + errBox() + `<section class="panel">
      <p class="lead">${r.phase === "play" ? "Une partie est en cours. Entre ton prénom : tu la regardes, et tu joues à la suivante." : "Entre ton prénom pour rejoindre la partie."}</p>
      <form class="row" data-form="join-room"><input id="nick" data-draft="nick" type="text" maxlength="18" autocomplete="nickname" enterkeyhint="go" placeholder="Ton prénom ou surnom" aria-label="Ton prénom"><button class="btn primary" type="submit">Rejoindre</button></form>
    </section>${playersPanel(players, false)}
    <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
  }
  const top = errBox() + alerts();
  const back = `<p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
  if (r.phase === "play") return header(false, badge) + top + playScreen(r, mod) + back;
  if (r.phase === "end") return header(true, badge) + top + endScreen(r, players, mod) + back;
  return header(true, badge) + top + lobbyScreen(r, players, mod);
}
function lobbyScreen(r, players, mod) {
  const pending = c => r.approve && !c.ok && c.by !== r.hostUid;
  const common = { delAct: "del-custom", canDel: c => mod || c.by === M.me, pending, approveAct: mod ? "approve-custom" : null };
  const persos = r.pick !== "friends" && r.persos ? customBlock(M.customs.filter(c => c.kind === "who"), { ...common, title: "Persos maison", kinds: PERSO_KINDS, form: "perso", max: 60, photo: true,
    empty: mod ? "Des gens que vous connaissez tous, des persos à vous : ils se glissent dans la pioche. Ajoute une photo, elle s'affichera sur le post-it. Les joueurs peuvent en proposer aussi."
      : "Propose des persos que tout le groupe connaît, avec une photo si tu veux. Personne ne les voit à part toi et le modo, et tu ne tomberas jamais sur les tiens." }) : "";
  const gages = r.gages && r.maison ? customBlock(M.customs.filter(c => c.kind !== "who"), { ...common, title: "Gages maison", kinds: GAGE_KINDS, form: "custom",
    empty: mod ? "Ajoutez vos propres gages et vérités, rien que pour ce groupe. Les autres joueurs peuvent en proposer aussi."
      : "Propose tes propres gages. Personne ne les voit à part toi et le modo : ils tomberont peut-être sur le perdant." }) : "";
  if (!mod) {
    return `${invitePanel()}${playersPanel(players, false)}
    <section class="panel"><div class="label">Réglages de la partie</div>${settingsSummary(r)}</section>
    ${waitMod("Le modo prépare la partie")}
    ${persos}${gages}${rulesBox()}
    <p class="foot"><button class="link" data-act="leave">Quitter la partie</button> · <button class="link" data-act="exit">Retour à l'accueil</button></p>`;
  }
  const why = players.length < MIN_PLAYERS ? `Il faut au moins ${MIN_PLAYERS} joueurs.` : "";
  return `${invitePanel()}${playersPanel(players, true)}
  ${settingsPanel({ themes: r.themes, pick: r.pick, persos: r.persos, oral: r.oral, replay: r.replay, fin: r.fin, timer: r.timer, gages: r.gages, gageLvl: r.gageLvl, maison: r.maison, approve: r.approve, apero: r.apero,
    acts: { theme: "theme", pick: "pick-mode", persos: "persos", oral: "oral", replay: "replay", fin: "fin", timer: "timer", gages: "gages", gageLvl: "gage-lvl", maison: "maison", approve: "approve", apero: "apero" } })}
  ${persos}${gages}
  <button class="btn primary big" data-act="start" ${why ? "disabled" : ""}>Coller les post-it</button>
  ${why ? `<p class="hint on-ground">${esc(why)}</p>` : players.length > MAX_PLAYERS ? `<p class="hint on-ground">Seuls les ${MAX_PLAYERS} premiers arrivés jouent cette partie.</p>` : ""}
  <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
}
/* « Players choose »: each one writes, in secret, the post-it of the player they were given. */
function pickScreen(r, mod) {
  const target = targetOf(r, M.me), waiting = pickWaiting(r);
  let h = `<section class="panel center"><div class="label">Avant de commencer</div><div class="big">Chacun choisit le perso d'un autre</div>
    <p class="hint">En secret : le joueur concerné ne le verra pas. Les autres, si.</p></section>`;
  if (target) {
    const t = pInfo(target), done = M.cards[target];
    if (done) h += stage(`Le perso de ${esc(t.nick)}`, postit(done, { cls: "main", key: `pick.${r.gameId}` }))
      + `<p class="hint on-ground">C'est noté. Interdit de souffler !</p>`;
    else h += `<section class="panel pickbox">
      <div class="label">Tu choisis le perso de</div>
      <div class="whois">${av(t)}<span>${esc(t.nick)}</span></div>
      <form class="stack" data-form="pick"><input id="pick" data-draft="pick" type="text" maxlength="60" autocomplete="off" enterkeyhint="done" placeholder="Une star, un héros, un animal, un ami commun…" aria-label="Le perso de ${esc(t.nick)}">
        ${picField("pick")}
        <div class="btns"><button class="btn" type="button" data-act="pick-idea">Une idée ?</button><button class="btn primary" type="submit">Valider</button></div></form>
      <p class="hint left">Choisis quelqu'un que tout le monde connaît, sinon personne ne pourra répondre à ses questions !</p>
    </section>`;
  } else h += `<section class="panel"><p class="lead">Tu regardes cette partie. Tu joueras à la prochaine.</p></section>`;
  h += `<section class="panel"><div class="label">Ils réfléchissent encore</div>${waiting.length
    ? `<div class="chips">${waiting.map(t => chip(pInfo(r.givers?.[t]))).join("")}</div>` : `<p class="hint left">Tout le monde a choisi.</p>`}</section>`;
  if (mod && waiting.length) h += `<button class="btn" data-act="pick-skip">Commencer sans attendre</button><p class="hint on-ground">Les post-it encore vides seront piochés au hasard.</p>`;
  return h;
}
function questionShow(q) {
  if (q.k === "g") return q.t ? `<div class="guess">« ${esc(q.t)} »</div>` : `<div class="question">Réponse donnée à voix haute</div>`;
  return `<div class="question">${q.t ? "« " + esc(q.t) + " »" : "Question posée à voix haute"}</div>`;
}
function voteProgress(r) {
  const all = voters(r), done = new Set(votesNow(r).map(v => v.voter)), missing = all.filter(id => !done.has(id));
  return `<p class="progress"><b>${done.size}/${all.length}</b> ${done.size > 1 ? "ont répondu" : "a répondu"}${missing.length ? ` · on attend ${esc(names(missing.map(pInfo)))}` : ""}</p>`;
}
function voteBox(r, mine, card) {
  const q = r.q || {}, asker = pInfo(q.u);
  if (q.k === "g") {
    const ok = guessMatches(q.t, card);
    return `<section class="panel votebox">
      <div class="label">${esc(asker.nick)} ${q.t ? "pense être" : "donne sa réponse"}</div>
      ${questionShow(q)}
      ${card && q.t ? `<p class="match ${ok ? "yes" : ""}">${ok ? "Ça correspond au post-it." : "Pas pile le post-it : à vous de juger."}</p>` : ""}
      <div class="vote2">
        <button class="btn vyes" data-act="vote" data-id="yes" aria-pressed="${mine === "yes"}">C'est ça !</button>
        <button class="btn vno" data-act="vote" data-id="no" aria-pressed="${mine === "no"}">Non</button>
      </div>
      ${voteProgress(r)}
    </section>`;
  }
  return `<section class="panel votebox">
    <div class="label">${esc(asker.nick)} demande</div>
    ${questionShow(q)}
    <div class="vote3">
      <button class="btn vyes" data-act="vote" data-id="yes" aria-pressed="${mine === "yes"}">Oui</button>
      <button class="btn vno" data-act="vote" data-id="no" aria-pressed="${mine === "no"}">Non</button>
      <button class="btn vidk" data-act="vote" data-id="idk" aria-pressed="${mine === "idk"}">Je ne sais pas</button>
    </div>
    <p class="hint">${mine ? "Tu peux changer d'avis tant que tout le monde n'a pas répondu." : "Réponds pour le post-it, pas pour toi !"}</p>
    ${voteProgress(r)}
  </section>`;
}
function askBox(r) {
  // Questions à l'oral: no keyboard, one button once the question has been asked out loud.
  if (r.oral) return `<section class="panel askbox center">
    <div class="label">Pose ta question à voix haute</div>
    <p class="lead">« Est-ce que je suis une femme ? », « Est-ce que je suis vivant ? »…</p>
    <button class="btn primary big" data-act="ask-oral">J'ai posé ma question</button>
    <p class="hint">Les autres répondent sur leur téléphone.</p>
  </section>
  <section class="panel guessbox">
    <div class="label">Tu crois savoir ?</div>
    <button class="btn gold big" data-act="guess-oral">Je dis qui je suis</button>
    <p class="hint left">Dis ta réponse à voix haute, puis appuie : les autres valident. Raté ? La main passe.</p>
    <button class="link" data-act="pass" style="align-self:flex-start">Passer mon tour</button>
  </section>`;
  return `<section class="panel askbox">
    <div class="label">Ta question</div>
    <form class="stack" data-form="ask">
      <input id="question" data-draft="question" type="text" maxlength="120" autocomplete="off" enterkeyhint="send" placeholder="Est-ce que je suis une femme ?" aria-label="Ta question">
      <button class="btn primary big" type="submit">Poser la question</button>
    </form>
    <p class="hint left">Pas envie de taper ? Laisse vide, pose-la à voix haute et appuie quand même.</p>
  </section>
  <section class="panel guessbox">
    <div class="label">Tu crois savoir ?</div>
    <form class="row" data-form="guess"><input id="guess" data-draft="guess" type="text" maxlength="60" autocomplete="off" enterkeyhint="send" placeholder="Je suis…" aria-label="Qui tu penses être"><button class="btn gold" type="submit">Proposer</button></form>
    <p class="hint left">Si les autres valident, tu as trouvé. Sinon, la main passe.</p>
    <button class="link" data-act="pass" style="align-self:flex-start">Passer mon tour</button>
  </section>`;
}
function notesPanel() {
  return `<details class="panel notes"><summary class="label">Mes pistes</summary>
    <textarea id="notes" data-draft="notes" rows="3" maxlength="500" placeholder="Humain ? Vivant ? Français ? Mes idées…" aria-label="Mes pistes"></textarea>
    <p class="hint left">Rien que pour toi, gardé sur ce téléphone.</p></details>`;
}
function playScreen(r, mod) {
  const order = r.order || [], hist = r.history || [], found = r.found || [];
  const dealt = order.includes(M.me), asker = r.turnUid, meAsk = asker === M.me, a = pInfo(asker);
  const cardOf = id => M.cards[id];
  const table = tablePanel(r, pInfo, { online: true, cardOf, hide: id => id === M.me && !found.includes(id) });
  let h = "";
  if (r.paused && !mod) return turnPanel(r, pInfo) + pauseScreen() + table;
  if (r.paused) h += `<div class="note"><b>Partie en pause.</b> Les joueurs voient un écran de pause. <button class="link" data-act="pause">Reprendre</button></div>`;
  if (r.step === "pick") return h + pickScreen(r, mod) + modFoot(r, mod);
  h += turnPanel(r, pInfo);
  if (r.last) h += lastPanel(r.last, pInfo, { key: `${r.gameId}.${r.last.s}`, cardOf, apero: r.apero });
  if (r.step === "ask") {
    h += timerBar(timeLeft(r), r.timer, meAsk ? "Ton temps" : "Temps de " + a.nick);
    if (meAsk) {
      h += stage("Ton perso", postit(null, { hidden: true, cls: "main", key: `me.${r.gameId}`, meta: "Tout le monde le voit, sauf toi" }));
      h += moveNow(r) ? `<p class="note">C'est envoyé…</p>` : askBox(r);
      h += carnet(hist, M.me, "Ce que tu sais déjà", { empty: "Rien pour l'instant. Commence large : humain ? vivant ? réel ?" }) + notesPanel();
    } else {
      const c = cardOf(asker);
      h += stage(`Le perso de ${esc(a.nick)}`, postit(c, { cls: "main", key: `${r.gameId}.${asker}`, meta: cardMeta(c, pInfo) }));
      h += carnet(hist, asker, `Ce que ${esc(a.nick)} sait déjà`);
    }
  } else {
    const q = r.q || {};
    if (meAsk) {
      h += stage("Ton perso", postit(null, { hidden: true, cls: "main", key: `me.${r.gameId}` }));
      h += `<section class="panel center"><div class="label">${q.k === "g" ? "Ta proposition" : "Ta question"}</div>${questionShow(q)}
        <p class="lead"><span class="dots">Les autres répondent</span></p>${voteProgress(r)}</section>`;
      h += carnet(hist, M.me, "Ce que tu sais déjà");
    } else {
      const c = cardOf(asker);
      h += stage(`Le perso de ${esc(a.nick)}`, postit(c, { cls: "main", key: `${r.gameId}.${asker}`, meta: cardMeta(c, pInfo) }));
      h += dealt ? voteBox(r, myVote(r), c)
        : `<section class="panel center"><div class="label">${esc(a.nick)} ${q.k === "g" ? "pense être" : "demande"}</div>${questionShow(q)}${voteProgress(r)}</section>`;
      h += carnet(hist, asker, `Ce que ${esc(a.nick)} sait déjà`);
    }
  }
  if (!dealt) h += `<section class="panel"><p class="lead">Tu regardes cette partie. Tu joueras à la prochaine.</p></section>`;
  else if (found.includes(M.me) && !(r.last?.u === M.me && r.last.r === "ok")) h += `<section class="panel center"><div class="label">Tu as trouvé · ${ord(found.indexOf(M.me))}</div>${postit(cardOf(M.me), { cls: "small" })}<p class="hint">Continue à répondre aux autres !</p></section>`;
  else if (!meAsk && hist.some(x => x.u === M.me)) h += `<details class="panel carnet"><summary class="label">Mon carnet</summary>${qaList(hist.filter(x => x.u === M.me))}</details>`;
  h += table + journal(hist, pInfo) + modFoot(r, mod);
  return h;
}
function modFoot(r, mod) {
  if (!mod) return "";
  const links = [];
  if (r.step === "ask" && r.turnUid !== M.me) links.push(`<button class="link" data-act="skip-turn">Passer le tour de ${esc(pInfo(r.turnUid).nick)}</button>`);
  if (r.step === "vote") links.push(`<button class="link" data-act="close-vote">Clore le vote</button>`);
  links.push(`<button class="link" data-act="pause">${r.paused ? "Reprendre la partie" : "Mettre en pause"}</button>`, `<button class="link" data-act="end">Terminer la partie</button>`);
  let h = `<p class="foot">${links.join(" · ")}</p>`;
  if (r.step === "ask" && !idOnline(r.turnUid)) h += `<p class="hint on-ground">${esc(pInfo(r.turnUid).nick)} ne répond plus : son tour passe tout seul au suivant.</p>`;
  if (r.step === "vote" && !voters(r).some(idOnline)) h += `<p class="hint on-ground">Personne d'autre n'est connecté pour répondre : clos le vote quand la réponse a été donnée à voix haute.</p>`;
  return h;
}
function endScreen(r, players, mod) {
  const order = r.order || [], hist = r.history || [], found = r.found || [];
  const rank = ranking(order, found, hist), titles = computeTitles(order, hist), cardOf = id => M.cards[id];
  recordGame(r.gameId, order, found, hist, titles);
  if (order.includes(M.me) && M.cards[M.me]) rememberPerso(r.gameId, M.cards[M.me]);
  const losers = losersOf(order, found, hist, here).map(pInfo);
  const mine = order.includes(M.me) ? stage(found.includes(M.me) ? "Tu étais bien" : "Tu étais…", postit(cardOf(M.me), { cls: "main", key: `end.${r.gameId}` })) : "";
  const h = mine + winnerPanel(rank, found, hist, pInfo, cardOf) + palmares(rank, found, hist, titles, pInfo, cardOf, "share-img")
    + gagesPanel({ on: r.gages, losers, lvl: r.gageLvl, seed: r.gameId, house: r.house || [], act: "choose",
      choiceOf: uid => M.choices.find(c => c.uid === uid)?.kind, canChoose: uid => uid === M.me });
  if (!mod) return h + playersPanel(players, false) + waitMod("Le modo peut lancer une nouvelle partie");
  return h + playersPanel(players, true) + `<button class="btn primary big" data-act="newgame">Nouvelle partie</button>
    <p class="hint on-ground">Les joueurs restent. Tu pourras changer les réglages avant de relancer.</p>`;
}
function winnerPanel(rank, found, hist, info, cardOf) {
  if (!hist.length) return "";
  const w = found[0];
  if (!w) return `<section class="panel center verdict"><div class="label">Fin de la partie</div><div class="name">Personne n'a trouvé</div></section>`;
  const s = playerStats([w], hist)[w], c = cardOf(w);
  return `<section class="panel center verdict"><div class="label">Premier à trouver</div>
    ${av(info(w), "huge")}<div class="name">${esc(info(w).nick)}</div><div class="vsub">${c ? `était ${esc(c.name)} · ` : ""}en ${plural(s.toFind, "question")}</div></section>`;
}
function palmares(rank, found, hist, titles, info, cardOf, shareAct) {
  if (!hist.length) return `<section class="panel"><p class="lead">Aucune question posée pour l'instant.</p></section>`;
  const S = playerStats(rank, hist);
  return `<section class="panel">
    <div class="label">Classement · ${plural(hist.length, "question")}</div>
    <ol class="rank">${rank.map((id, i) => {
      const p = info(id), t = titles[id], s = S[id], c = cardOf(id);
      const where = s.done ? `trouvé en ${plural(s.toFind, "question")}` : "n'a pas trouvé";
      const mine = hist.filter(h => h.u === id);
      return `<li class="${s.done ? "" : "lost"}"><details>
      <summary><span class="pos">${s.done ? i + 1 : "–"}</span>${av(p)}<span class="who"><b>${esc(p.nick)}</b>
        ${c ? `<span class="was">${thumb(c)}${esc(c.name)}</span>` : ""}
        ${t ? `<span class="title">${esc(t.title)}</span>` : ""}
        <small>${esc(where)}${t ? " · " + esc(t.why) : ""}</small></span></summary>
      ${mine.length ? qaList(mine) : `<ul><li>Pas une question. Très mystérieux.</li></ul>`}
    </details></li>`;
    }).join("")}</ol>
    ${shareAct ? `<button class="btn" data-act="${shareAct}">Partager le classement en image</button>` : ""}
  </section>`;
}

/* ---------- big screen (TV / laptop): follows the game, never shows a post-it not yet found ---------- */
function renderTv() {
  const r = M.room, players = M.players, cardOf = id => M.cards[id];
  let h = header(true, "Partie " + M.code) + alerts();
  if (r.phase === "lobby") {
    h += `<section class="panel center tvjoin">
      <div class="label">Pour jouer, scanne ou tape le code</div>
      <div class="tvrow"><div class="qr big" data-qr="${esc(inviteLink())}"></div><div><div class="code">${esc(M.code)}</div><p class="lead">${esc(location.host + location.pathname)}</p></div></div>
    </section>
    <section class="panel"><div class="label">Joueurs · ${players.length}</div><div class="chips">${players.map(p => chip(p)).join("")}</div></section>
    <section class="panel">${settingsSummary(r)}</section>`;
  } else if (r.phase === "play") {
    const table = tablePanel(r, pInfo, { online: true, cardOf, noMe: true, hide: id => !(r.found || []).includes(id) });
    if (r.paused) return h + turnPanel(r, pInfo, { noMe: true }) + pauseScreen();
    if (r.step === "pick") {
      const waiting = pickWaiting(r);
      return h + `<section class="panel center"><div class="label">Avant de commencer</div><div class="name big-t">Chacun choisit le perso d'un autre</div>
        ${waiting.length ? `<p class="lead">On attend ${esc(names(waiting.map(t => pInfo(r.givers?.[t]))))}</p>` : ""}</section>` + table;
    }
    const q = r.q || {};
    const main = turnPanel(r, pInfo, { noMe: true }) + (r.last ? lastPanel(r.last, pInfo, { key: `${r.gameId}.${r.last.s}`, cardOf, apero: r.apero }) : "")
      + (r.step === "vote" ? `<section class="panel center"><div class="label">${esc(pInfo(q.u).nick)} ${q.k === "g" ? "pense être" : "demande"}</div>${questionShow(q)}${voteProgress(r)}</section>`
        : timerBar(timeLeft(r), r.timer, "Temps de " + pInfo(r.turnUid).nick));
    h += `<div class="tvgrid"><div class="stack">${main}${journal(r.history || [], pInfo, { open: true, max: 8 })}</div><div class="stack">${table}</div></div>`;
  } else {
    const order = r.order || [], hist = r.history || [], found = r.found || [], rank = ranking(order, found, hist);
    h += winnerPanel(rank, found, hist, pInfo, cardOf) + palmares(rank, found, hist, computeTitles(order, hist), pInfo, cardOf, "");
  }
  return h;
}

/* ---------- screens: one phone, on the forehead ----------
   The phone goes from forehead to forehead: it shows your post-it to the others, who tap the answers. */
function newLocal(prev) {
  const saved = store.json("local-names", []);
  return {
    phase: "setup", players: prev?.players || (Array.isArray(saved) ? saved : []),
    themes: prev?.themes || DEFAULT_THEMES, replay: prev ? !!prev.replay : true, fin: prev?.fin || "last",
    gages: !!prev?.gages, gageLvl: prev?.gageLvl || 1, maison: prev ? !!prev.maison : true, apero: !!prev?.apero, customs: prev?.customs || [],
    gid: rid(), order: [], cards: {}, found: [], turnUid: "", step: "handoff", countAt: 0, history: [], last: null, choices: {}
  };
}
function saveLocal() {
  store.set("local", JSON.stringify(M.local));
  if (M.local) store.set("local-names", JSON.stringify(M.local.players));
}
const lp = id => M.local.players.find(p => p.id === id) || { id, nick: "?", color: COLORS[0] };
const lWhy = L => L.players.length < MIN_PLAYERS ? `Ajoute au moins ${MIN_PLAYERS} joueurs.` : L.players.length > MAX_PLAYERS ? `${MAX_PLAYERS} joueurs au plus.` : "";
function renderLocal() {
  const L = M.local, n = L.players.length;
  const back = `<button class="link" data-act="go-online">Jouer chacun sur son téléphone</button>`;
  if (L.phase === "setup") {
    return header(true, "1 téléphone") + errBox() + `<section class="panel">
      <p class="lead">Un seul téléphone, qu'on colle sur son front à son tour : il montre ton perso aux autres, qui touchent les réponses.</p>
      <form class="row" data-form="l-name"><input id="l-name" data-draft="l-name" type="text" maxlength="18" autocomplete="off" enterkeyhint="done" placeholder="Prénom d'un joueur" aria-label="Prénom d'un joueur"><button class="btn" type="submit">Ajouter</button></form>
      ${n ? `<div class="chips">${L.players.map(p => chip(p, `<button class="x" data-act="l-del" data-id="${esc(p.id)}" aria-label="Retirer ${esc(p.nick)}">×</button>`)).join("")}</div>` : ""}
      <p class="hint left">Ajoutez-vous dans l'ordre où vous êtes assis : on joue chacun son tour, dans ce sens.</p>
    </section>
    ${settingsPanel({ themes: L.themes, replay: L.replay, fin: L.fin, gages: L.gages, gageLvl: L.gageLvl, maison: L.maison, apero: L.apero,
      acts: { theme: "l-theme", replay: "l-replay", fin: "l-fin", gages: "l-gages", gageLvl: "l-gage-lvl", maison: "l-maison", apero: "l-apero" } })}
    ${L.gages && L.maison ? customBlock(L.customs, { title: "Gages maison", kinds: GAGE_KINDS, form: "l-custom", delAct: "l-del-custom", canDel: () => true, empty: "Ajoutez vos propres gages et vérités, rien que pour ce groupe." }) : ""}
    <button class="btn primary big" data-act="l-start" ${lWhy(L) ? "disabled" : ""}>Coller les post-it</button>
    ${lWhy(L) ? `<p class="hint on-ground">${esc(lWhy(L))}</p>` : ""}
    ${rulesBox()}
    <p class="foot">${back}</p>`;
  }
  const view = { ...L, phase: L.phase === "end" ? "end" : "play" };
  const cardOf = id => L.cards[id];
  if (L.phase === "end") {
    const rank = ranking(L.order, L.found, L.history), titles = computeTitles(L.order, L.history);
    const house = L.gages && L.maison ? L.customs : [];
    return header(true, "1 téléphone") + winnerPanel(rank, L.found, L.history, lp, cardOf) + palmares(rank, L.found, L.history, titles, lp, cardOf, "l-share")
      + gagesPanel({ on: L.gages, losers: losersOf(L.order, L.found, L.history).map(lp), lvl: L.gageLvl, seed: L.gid, house, act: "l-choose", choiceOf: uid => L.choices[uid], canChoose: () => true })
      + `<button class="btn primary big" data-act="l-reset">Nouvelle partie</button><p class="foot">${back}</p>`;
  }
  const p = lp(L.turnUid), qn = L.history.filter(h => h.u === p.id).length + 1;
  if (L.step === "show") {
    return `<div class="front">
      ${postit(L.cards[p.id], { cls: "huge", key: `l.${L.gid}.${p.id}` })}
      <div class="label on-ground">${esc(p.nick)} · question ${qn}</div>
      <div class="vote3">
        <button class="btn vyes" data-act="l-ans" data-id="yes">Oui</button>
        <button class="btn vno" data-act="l-ans" data-id="no">Non</button>
        <button class="btn vidk" data-act="l-ans" data-id="idk">Je ne sais pas</button>
      </div>
      <div class="vote2">
        <button class="btn gold" data-act="l-ans" data-id="ok">Trouvé !</button>
        <button class="btn" data-act="l-ans" data-id="ko">Mauvaise réponse</button>
      </div>
      <p class="hint on-ground">Les autres : répondez à voix haute, puis touchez la réponse.</p>
      <p class="foot"><button class="link" data-act="l-skip">Rendre la main</button></p>
    </div>`;
  }
  if (L.step === "count") {
    const left = Math.max(1, 3 - Math.floor((Date.now() - L.countAt) / 1000));
    return `<section class="panel center countdown"><div class="big-n">${left}</div><p class="lead">Sur le front, écran vers les autres !</p></section>`;
  }
  let h = header(false, "1 téléphone");
  if (L.last) h += lastPanel(L.last, lp, { key: `l${L.gid}.${L.history.length}`, cardOf, apero: L.apero });
  h += `<section class="panel center hand-off">
    <div class="label">Au tour de</div>${av(p)}<div class="who">${esc(p.nick)}</div>
    <p class="lead">${esc(p.nick)}, prends le téléphone <b>sans regarder l'écran</b>, touche le bouton et colle-le sur ton front, écran vers les autres.</p>
    <button class="btn primary big" data-act="l-go">Je le mets sur mon front</button>
  </section>`;
  h += tablePanel(view, lp, { cardOf, hide: id => !L.found.includes(id), noMe: true });
  h += carnet(L.history, p.id, `Ce que ${esc(p.nick)} sait déjà`);
  h += `<p class="foot"><button class="link" data-act="l-end">Terminer la partie</button> · ${back}</p>`;
  return h;
}

/* ---------- share the leaderboard as an image ---------- */
function wrapLines(g, text, width) {
  const words = text.split(" "), lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (g.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
/* The move of the night: the quickest find, else the longest run of « oui ». */
function bestMove(order, hist, info, cardOf) {
  const S = playerStats(order, hist);
  const best = Object.values(S).filter(s => s.done).sort((a, b) => a.toFind - b.toFind)[0];
  if (best) { const c = cardOf(best.id); return `${info(best.id).nick} a deviné qu'il fallait être ${c ? "« " + c.name + " »" : "son perso"} en ${plural(best.toFind, "question")}.`; }
  const run = Object.values(S).sort((a, b) => b.bestRun - a.bestRun)[0];
  return run && run.bestRun >= 3 ? `${info(run.id).nick} a enchaîné ${run.bestRun} « oui » d'affilée.` : "";
}
async function shareImage(order, found, hist, info, cardOf) {
  const rank = ranking(order, found, hist), titles = computeTitles(order, hist), S = playerStats(order, hist);
  const rows = rank.slice(0, 8).map(id => ({ p: info(id), c: cardOf(id), s: S[id] }));
  const move = bestMove(order, hist, info, cardOf);
  try { await Promise.all([document.fonts.load("60px 'Bowlby One'"), document.fonts.load("40px 'Permanent Marker'"), document.fonts.load("800 30px Onest"), document.fonts.load("500 26px Onest")]); } catch {}
  const W = 1080, c = document.createElement("canvas"), g = c.getContext("2d");
  g.font = "800 40px Onest, Arial, sans-serif";
  const moveLines = move ? wrapLines(g, move, W - 200).slice(0, 5) : [];
  const moveH = move ? 120 + moveLines.length * 52 : 0;
  const H = 300 + moveH + rows.length * 170 + 60;
  c.width = W; c.height = H;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  g.fillStyle = "#B7A4F4"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#1B1433"; g.font = "88px 'Bowlby One', 'Arial Black', sans-serif"; g.fillText("Qui suis-je", 70, 160);
  const qx = 70 + g.measureText("Qui suis-je ").width;
  g.save(); g.translate(qx + 50, 120); g.rotate(.12); g.fillStyle = "#FFE45C"; g.strokeStyle = "#1B1433"; g.lineWidth = 5;
  rr(-50, -55, 100, 100, 8); g.fill(); g.stroke(); g.fillStyle = "#1B1433"; g.textAlign = "center"; g.fillText("?", 0, 30); g.restore(); g.textAlign = "left";
  g.fillStyle = "#2E2357"; g.font = "800 30px Onest, Arial, sans-serif";
  g.fillText(`CLASSEMENT · ${plural(hist.length, "QUESTION")} · ${new Date().toLocaleDateString("fr-FR")}`, 72, 230);
  let y = 270;
  if (move) {
    g.fillStyle = "#1B1433"; rr(60, y, W - 120, moveH - 30, 26); g.fill();
    g.fillStyle = "#FFE45C"; g.font = "800 26px Onest, Arial, sans-serif"; g.fillText("LE COUP DE LA SOIRÉE", 100, y + 56);
    g.fillStyle = "#FFFBF2"; g.font = "800 40px Onest, Arial, sans-serif";
    moveLines.forEach((l, i) => g.fillText(l, 100, y + 112 + i * 52));
    y += moveH;
  }
  rows.forEach((row, i) => {
    const t = titles[row.p.id], first = i === 0 && row.s.done;
    g.fillStyle = first ? "#1B1433" : "#FFFBF2"; g.strokeStyle = "#1B1433"; g.lineWidth = 5;
    rr(60, y, W - 120, 148, 26); g.fill(); g.stroke();
    const ink = first ? "#FFFBF2" : "#1B1433";
    g.fillStyle = ink; g.font = "52px 'Bowlby One', 'Arial Black', sans-serif"; g.fillText(row.s.done ? String(i + 1) : "–", 92, y + 92);
    g.fillStyle = safeColor(row.p.color); g.beginPath(); g.arc(215, y + 74, 40, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = "36px 'Bowlby One', 'Arial Black', sans-serif"; g.textAlign = "center";
    g.fillText((row.p.nick || "?").charAt(0).toUpperCase(), 215, y + 88); g.textAlign = "left";
    g.fillStyle = ink; g.font = "800 40px Onest, Arial, sans-serif"; g.fillText(row.p.nick, 285, y + 56);
    if (row.c) {
      g.font = "34px 'Permanent Marker', 'Comic Sans MS', cursive"; const label = row.c.name.slice(0, 32), w = g.measureText(label).width + 28;
      g.fillStyle = "#FFE45C"; rr(281, y + 72, Math.min(w, W - 420), 46, 6); g.fill();
      g.fillStyle = "#1B1433"; g.fillText(label, 295, y + 107);
    }
    g.fillStyle = ink; g.font = "500 26px Onest, Arial, sans-serif"; g.textAlign = "right";
    g.fillText((t ? t.title : "").slice(0, 26), W - 92, y + 56); g.textAlign = "left";
    y += 170;
  });
  g.fillStyle = "#2E2357"; g.font = "500 26px Onest, Arial, sans-serif"; g.fillText(location.host, 72, H - 40);
  const blob = await new Promise(res => c.toBlob(res, "image/png"));
  const file = new File([blob], "qui-suis-je-classement.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Qui suis-je, le classement" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  flash("Image du classement téléchargée.");
}

/* ---------- QR codes, drawn by a small library loaded only when needed ---------- */
let qrLoading = null;
function fillQR() {
  const boxes = app.querySelectorAll("[data-qr]:empty");
  if (!boxes.length) return;
  if (!window.qrcode) {
    qrLoading = qrLoading || new Promise((ok, ko) => { const s = document.createElement("script"); s.src = QR_LIB; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    qrLoading.then(fillQR, () => boxes.forEach(b => { b.textContent = "QR code indisponible"; }));
    return;
  }
  boxes.forEach(b => {
    const qr = window.qrcode(0, "M"); qr.addData(b.dataset.qr); qr.make();
    b.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  });
}

/* ---------- render ---------- */
let lastHtml = "", lastKeys = {}, lastBuzz = "";
function render() {
  document.body.classList.toggle("tv", M.mode === "room" && M.tv);
  document.body.classList.toggle("onfront", M.mode === "local" && M.local?.phase === "play" && M.local.step !== "handoff");
  let html;
  if (M.mode === "local" && M.local) html = renderLocal();
  else if (M.mode === "room") html = renderRoom();
  else if (M.mode === "home") html = renderHome();
  else if (M.mode === "setup") html = renderSetup();
  else if (M.mode === "fatal") html = renderFatal();
  else html = header(true) + `<section class="panel center loading">On sort les post-it…</section>`;
  // French spacing: « Trouvé ! » never breaks before its exclamation mark.
  html = html.replace(/ ([!?:;»])(?=[\s<"]|$)/g, " $1").replace(/« /g, "« ");
  if (html !== lastHtml) {
    const a = document.activeElement, fid = a && a.id, ss = a && a.selectionStart, se = a && a.selectionEnd;
    const openDetails = [...app.querySelectorAll("details[open] summary")].map(s => s.textContent);
    // Pictures already on screen are kept as they are, so the page redrawing every second doesn't make them blink.
    const pics = new Map();
    app.querySelectorAll("img.pic, img.th").forEach(i => { const k = i.className + "|" + i.getAttribute("src"); if (i.complete && !pics.has(k)) pics.set(k, i); });
    app.innerHTML = html;
    lastHtml = html;
    app.querySelectorAll("img.pic, img.th").forEach(i => { const k = i.className + "|" + i.getAttribute("src"), old = pics.get(k); if (old) { i.replaceWith(old); pics.delete(k); } });
    app.querySelectorAll("details summary").forEach(s => { if (openDetails.includes(s.textContent)) s.parentElement.open = true; });
    app.querySelectorAll("[data-draft]").forEach(i => { i.value = M.drafts[i.dataset.draft] || ""; });
    if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(ss, se); } catch {} } }
    // A new turn, a new answer, a post-it stuck on: each gets its little animation once.
    const keys = {};
    for (const [sel, cls] of [[".turnnow", "enter"], [".lastres", "enter"], [".postit.main", "stick"], [".postit.huge", "stick"]]) {
      const el = app.querySelector(sel), k = el ? el.dataset.key : "";
      if (el && k !== lastKeys[sel]) el.classList.add(cls);
      keys[sel] = k;
    }
    lastKeys = keys;
    fillQR();
  }
  // Fields follow their drafts, even when the page itself didn't change (an idea drawn, a field emptied after sending).
  app.querySelectorAll("[data-draft]").forEach(i => { const v = M.drafts[i.dataset.draft] || ""; if (i.value !== v) i.value = v; });
  // A short buzz when it becomes your turn, or when there is a question to answer.
  const r = M.room, live = M.mode === "room" && !M.tv && r?.phase === "play" && !r.paused;
  const buzz = !live ? "" : r.step === "ask" && r.turnUid === M.me ? "t" + r.gameId + r.seq
    : r.step === "vote" && r.turnUid !== M.me && (r.order || []).includes(M.me) ? "v" + r.gameId + r.seq : "";
  if (buzz && buzz !== lastBuzz) { try { navigator.vibrate?.(buzz[0] === "t" ? [80, 60, 80] : 50); } catch {} }
  lastBuzz = buzz;
  const playing = (M.mode === "room" && M.room?.phase === "play" && (inRoom() || M.tv)) || (M.mode === "local" && M.local?.phase === "play");
  keepAwake(playing);
}
let wake = null, wakePending = false;
async function keepAwake(on) {
  try {
    if (on && !wake && !wakePending && document.visibilityState === "visible" && navigator.wakeLock) {
      wakePending = true;
      wake = await navigator.wakeLock.request("screen");
      wake.addEventListener("release", () => { wake = null; });
    } else if (!on && wake) { const w = wake; wake = null; await w.release(); }
  } catch { wake = null; } finally { wakePending = false; }
}
// Coming back to the page (phone unlocked, app reopened) re-announces this player at once.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") heartbeat(); render(); });
window.addEventListener("online", () => { heartbeat(); render(); });
window.addEventListener("offline", () => { M.offline = true; M.offlineSince = Date.now() - 5000; render(); });
let flashT = null;
function flash(msg) { M.flash = msg; render(); clearTimeout(flashT); flashT = setTimeout(() => { M.flash = ""; render(); }, 2500); }

/* ---------- actions ---------- */
async function write(fn, denied = "Action refusée : seul le modo peut faire ça.") {
  if (M.busy) return;
  M.busy = true; M.err = "";
  try { await fn(); }
  catch (e) {
    const c = e && e.code;
    M.err = c === "permission-denied" ? denied
      : c === "unavailable" ? "Pas de connexion. Vérifie ton réseau et réessaie."
      : "Ça n'a pas marché (" + (c || e?.message || "erreur") + "). Réessaie.";
  }
  M.busy = false; render();
}
const needNick = () => {
  const nick = (M.drafts.nick || "").trim().slice(0, 18);
  if (!nick) { M.err = "Entre d'abord ton prénom."; render(); document.getElementById("nick")?.focus(); return ""; }
  store.set("nick", nick);
  return nick;
};
const modOnly = fn => d => { if (isMod()) fn(d); };
const copy = (text, msg) => navigator.clipboard?.writeText(text).then(() => flash(msg), () => flash(text)) ?? flash(text);
const roomSetting = (k, v) => modOnly(d => write(() => patchRoom({ [k]: v(d, M.room || {}) })));
/* Ticking a theme on or off; at least one stays. */
function toggleTheme(list, id) {
  const cur = validThemes(list);
  if (!DECK[id]) return cur;
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  return next.length ? THEMES.map(t => t.id).filter(x => next.includes(x)) : cur;
}
function readCustom(draft, kind, min = 3) {
  const text = cleanText(M.drafts[draft], kind === "who" ? 60 : 140);
  if (text.length < min) return null;
  M.drafts[draft] = ""; M.err = "";
  return { kind, text };
}
function sendMove(kind) {
  const r = M.room;
  if (!r || r.phase !== "play" || r.step !== "ask" || r.turnUid !== M.me || r.paused || moveNow(r)) return;
  const draft = kind === "guess" ? "guess" : "question", text = r.oral ? "" : cleanText(M.drafts[draft], kind === "guess" ? 60 : 120);
  if (kind === "guess" && !text && !r.oral) { M.err = "Écris d'abord qui tu penses être."; render(); document.getElementById("guess")?.focus(); return; }
  M.drafts[draft] = "";
  write(() => F.setDoc(rMove(M.code, `${r.gameId}_${r.seq}`), { gameId: r.gameId, seq: r.seq, uid: M.me, kind, text, at: Date.now() }), "Trop tard, ce n'est plus ton tour.");
}
function lAnswer(res) {
  const L = M.local, u = L.turnUid;
  if (!u || L.phase !== "play") return;
  const entry = { u, k: res === "ok" || res === "ko" ? "g" : "q", t: "", r: res, y: 0, n: 0, i: 0, x: [] };
  L.history.push(entry);
  L.last = entry;
  if (res === "ok") {
    L.found.push(u);
    if (isOver(L.order, L.found, L.fin)) { L.phase = "end"; saveLocal(); render(); return; }
  }
  const again = (res === "yes" || res === "idk") && L.replay;
  if (!again) { L.turnUid = nextTurn(L.order, L.found, u) || u; L.step = "handoff"; window.scrollTo({ top: 0 }); }
  saveLocal(); render();
}
const ACT = {
  "create": () => {
    const nick = needNick(); if (!nick) return;
    write(async () => {
      let code = genCode();
      for (let i = 0; i < 6 && (await F.getDoc(rRoom(code))).exists(); i++) code = genCode();
      await F.setDoc(rRoom(code), { ...freshRoom(), hostUid: M.me, createdAt: Date.now(), touchedAt: F.serverTimestamp() });
      lastHb = Date.now();
      await F.setDoc(rPlayer(code, M.me), { nick, color: profile().color || COLORS[0], joinedAt: Date.now(), seen: F.serverTimestamp() });
      rememberHosted(code);
      enterRoom(code);
    });
  },
  "exit": () => exitRoom(),
  "leave": () => { const code = M.code; write(async () => { await F.deleteDoc(rPlayer(code, M.me)); exitRoom(); }); },
  "share": () => { navigator.share({ title: "Qui suis-je ?", text: `Rejoins la partie ${M.code} !`, url: inviteLink() }).catch(() => {}); },
  "copy": () => copy(inviteLink(), "Lien d'invitation copié."),
  "copy-tv": () => copy(tvLink(), "Lien grand écran copié."),
  "toggle-qr": () => { M.showQR = !M.showQR; render(); },
  "desc": d => { M.desc = M.desc === d.id ? "" : d.id; render(); },
  "pic-choose": d => { if (d.id in M.pics) { picTarget = d.id; picInput.value = ""; picInput.click(); } },
  "pic-clear": d => { if (d.id in M.pics) { M.pics[d.id] = ""; render(); } },
  "gkind": d => { M.gkind = d.id === "truth" ? "truth" : "dare"; render(); document.getElementById(M.mode === "local" ? "l-custom" : "custom")?.focus(); },

  /* playing a turn */
  "pass": () => sendMove("pass"),
  "vote": d => {
    const r = M.room, v = ["yes", "no", "idk"].includes(d.id) ? d.id : "";
    if (!r || !v || r.phase !== "play" || r.step !== "vote" || r.paused || r.turnUid === M.me || !(r.order || []).includes(M.me)) return;
    if (r.q?.k === "g" && v === "idk") return;
    write(() => F.setDoc(rVote(M.code, `${r.gameId}_${r.seq}_${M.me}`), { gameId: r.gameId, seq: r.seq, voter: M.me, v, at: Date.now() }), "Trop tard, les réponses sont closes.");
  },
  "pick-idea": () => {
    const r = M.room; if (!r) return;
    const card = drawCard(r.themes, Object.values(M.cards).filter(Boolean).map(c => c.name));
    M.pickIdea = card; M.drafts.pick = card.name; render();
  },
  "pick-skip": modOnly(() => { const r = M.room; if (r && r.step === "pick") write(() => patchRoom({ step: "ask", seq: r.seq + 1, turnAt: F.serverTimestamp() })); }),
  "choose": d => {
    const r = M.room; if (!r || d.uid !== M.me) return;
    write(() => F.setDoc(rChoice(M.code, `${r.gameId}_${M.me}`), { gameId: r.gameId, uid: M.me, kind: d.id }), "Ce choix n'est plus possible.");
  },
  "skip-turn": modOnly(() => { const r = M.room; if (r && r.step === "ask") write(() => passTurn(r)); }),
  "close-vote": modOnly(() => { const r = M.room; if (r && r.step === "vote") write(() => closeVote(r)); }),
  "pause": modOnly(() => {
    const r = M.room;
    if (!r.paused) { write(() => patchRoom({ paused: true, pausedAt: F.serverTimestamp() })); return; }
    // Resuming moves the timer forward by the length of the pause.
    const gap = Math.max(0, serverNow() - tsMs(r.pausedAt));
    write(() => patchRoom({ paused: false, pausedAt: null, ...(r.turnAt ? { turnAt: F.Timestamp.fromMillis(tsMs(r.turnAt) + gap) } : {}) }));
  }),
  "end": modOnly(() => write(() => patchRoom({ phase: "end", paused: false }))),
  "newgame": modOnly(() => {
    const r = M.room, old = r?.gameId, order = r?.order || [], code = M.code;
    write(async () => {
      await patchRoom(freshGame());
      if (!old) return;
      try {
        await deleteCards(code, old, order);
        for (const col of [cMoves(code), cVotes(code), cChoices(code)]) {
          const q = await F.getDocs(F.query(col, F.where("gameId", "==", old)));
          for (const d of q.docs) await F.deleteDoc(d.ref);
        }
      } catch {}
    });
  }),
  "start": modOnly(() => {
    const r = M.room;
    if (!r || M.players.length < MIN_PLAYERS) return;
    write(() => startGame(r));
  }),
  "theme": roomSetting("themes", (d, r) => toggleTheme(r.themes, d.id)),
  "pick-mode": roomSetting("pick", d => d.id === "friends" ? "friends" : "deck"),
  "persos": roomSetting("persos", (d, r) => !r.persos),
  "replay": roomSetting("replay", (d, r) => !r.replay),
  "oral": roomSetting("oral", (d, r) => !r.oral),
  "ask-oral": () => sendMove("q"),
  "guess-oral": () => sendMove("guess"),
  "fin": roomSetting("fin", d => FINS.some(f => f[0] === d.id) ? d.id : "last"),
  "timer": roomSetting("timer", d => TIMERS.includes(+d.id) ? +d.id : 0),
  "gages": roomSetting("gages", (d, r) => !r.gages),
  "gage-lvl": roomSetting("gageLvl", d => Math.min(4, Math.max(1, +d.id || 1))),
  "maison": roomSetting("maison", (d, r) => !r.maison),
  "approve": roomSetting("approve", (d, r) => !r.approve),
  "apero": roomSetting("apero", (d, r) => !r.apero),
  "kick": modOnly(d => write(() => F.deleteDoc(rPlayer(M.code, d.id)))),
  "del-custom": d => write(() => F.deleteDoc(rCustom(M.code, d.id))),
  "approve-custom": modOnly(d => write(() => F.updateDoc(rCustom(M.code, d.id), { ok: true }))),
  "takeover": () => write(() => patchRoom({ hostUid: M.me }), "Le modo est revenu entre-temps, ou quelqu'un a déjà repris la partie."),
  "handover-open": () => { M.handover = true; render(); },
  "handover-cancel": () => { M.handover = false; render(); },
  "handover": modOnly(d => { M.handover = false; write(() => patchRoom({ hostUid: d.id })); }),
  "rename-open": () => {
    M.renaming = true; M.drafts.rename = M.players.find(p => p.id === M.me)?.nick || "";
    render();
    const i = document.getElementById("rename"); if (i) { i.focus(); i.select(); }
  },
  "rename-cancel": () => { M.renaming = false; render(); },
  "pick-color": d => { const p = profile(); p.color = COLORS.includes(d.id) ? d.id : null; saveProfile(p); render(); },
  "install": async () => { const e = M.installEvt; M.installEvt = null; render(); if (e) { e.prompt(); try { await e.userChoice; } catch {} } },
  "share-img": () => { const r = M.room; if (r) shareImage(r.order || [], r.found || [], r.history || [], pInfo, id => M.cards[id]).catch(() => flash("Impossible de créer l'image.")); },
  "go-local": () => { M.mode = "local"; if (!M.local || M.local.phase === "end") M.local = newLocal(M.local); M.err = ""; saveLocal(); render(); },
  "go-online": () => { M.err = ""; if (M.code) M.mode = "room"; else M.mode = F && M.me ? "home" : (isPlaceholder() ? "setup" : "fatal"); render(); },
  "reload": () => location.reload(),

  /* one phone */
  "l-del": d => { M.local.players = M.local.players.filter(p => p.id !== d.id); saveLocal(); render(); },
  "l-theme": d => { M.local.themes = toggleTheme(M.local.themes, d.id); saveLocal(); render(); },
  "l-replay": () => { M.local.replay = !M.local.replay; saveLocal(); render(); },
  "l-fin": d => { M.local.fin = FINS.some(f => f[0] === d.id) ? d.id : "last"; saveLocal(); render(); },
  "l-gages": () => { M.local.gages = !M.local.gages; saveLocal(); render(); },
  "l-gage-lvl": d => { M.local.gageLvl = Math.min(4, Math.max(1, +d.id || 1)); saveLocal(); render(); },
  "l-maison": () => { M.local.maison = !M.local.maison; saveLocal(); render(); },
  "l-apero": () => { M.local.apero = !M.local.apero; saveLocal(); render(); },
  "l-del-custom": d => { M.local.customs = M.local.customs.filter(c => c.id !== d.id); saveLocal(); render(); },
  "l-start": () => {
    const L = M.local;
    if (lWhy(L)) return;
    const order = L.players.map(p => p.id), cards = {}, used = [];
    for (const id of order) { const c = drawCard(L.themes, used); cards[id] = c; used.push(c.name); preloadPic(c); }
    Object.assign(L, { phase: "play", gid: rid(), order, cards, found: [], history: [], last: null, choices: {}, turnUid: order[rand(order.length)], step: "handoff" });
    saveLocal(); render();
  },
  "l-go": () => { M.local.step = "count"; M.local.countAt = Date.now(); saveLocal(); render(); },
  "l-ans": d => { if (["yes", "no", "idk", "ok", "ko"].includes(d.id)) lAnswer(d.id); },
  "l-skip": () => { const L = M.local; L.turnUid = nextTurn(L.order, L.found, L.turnUid) || L.turnUid; L.step = "handoff"; saveLocal(); render(); },
  "l-end": () => { M.local.phase = "end"; saveLocal(); render(); },
  "l-choose": d => { M.local.choices[d.uid] = d.id; saveLocal(); render(); },
  "l-share": () => { const L = M.local; shareImage(L.order, L.found, L.history, lp, id => L.cards[id]).catch(() => flash("Impossible de créer l'image.")); },
  "l-reset": () => { M.local = newLocal(M.local); saveLocal(); render(); }
};
const FORM = {
  "join-code": () => {
    const nick = needNick(); if (!nick) return;
    const code = normCode(M.drafts.code);
    if (code.length !== 4) { M.err = "Le code fait 4 caractères."; render(); return; }
    write(async () => {
      const s = await F.getDoc(rRoom(code));
      if (!s.exists()) { M.err = `Aucune partie avec le code ${code}.`; return; }
      await joinRoom(code, nick);
      enterRoom(code);
    });
  },
  "join-room": () => {
    const nick = needNick(); if (!nick) return;
    write(() => joinRoom(M.code, nick));
  },
  "rename": () => {
    const nick = (M.drafts.rename || "").trim().slice(0, 18);
    if (!nick) return;
    M.renaming = false; store.set("nick", nick); M.drafts.nick = nick;
    write(() => F.updateDoc(rPlayer(M.code, M.me), { nick }));
  },
  "ask": () => sendMove("q"),
  "guess": () => sendMove("guess"),
  "pick": () => {
    const r = M.room, target = r && targetOf(r, M.me);
    if (!r || r.step !== "pick" || !target || M.cards[target]) return;
    const name = cleanText(M.drafts.pick, 60);
    if (!name) { M.err = "Écris d'abord un perso."; render(); return; }
    if (Object.values(M.cards).some(c => c && norm(c.name) === norm(name))) { M.err = "Ce perso est déjà pris par quelqu'un d'autre."; render(); return; }
    if (M.picBusy === "pick") return;
    const idea = { ...(M.pickIdea && M.pickIdea.name === name ? M.pickIdea : { name, alt: [], theme: "ami" }), pic: M.pics.pick };
    M.drafts.pick = ""; M.pickIdea = null; M.pics.pick = "";
    write(async () => {
      await F.setDoc(rCard(M.code, r.gameId, target), cardDoc(r.gameId, target, idea));
      await F.updateDoc(rPlayer(M.code, M.me), { picked: r.gameId });
    }, "Ce perso ne peut plus être choisi.");
  },
  "perso": () => {
    if (M.picBusy === "perso") return;
    const pic = M.pics.perso;
    const c = readCustom("perso", "who", 2);
    if (!c) { if (pic) { M.err = "Donne aussi un nom à ce perso : c'est ce qu'il faudra deviner."; render(); } return; }
    M.pics.perso = "";
    write(() => F.addDoc(cCustom(M.code), { ...c, ...(pic ? { pic } : {}), by: M.me, at: Date.now(), ok: isMod() }), "Impossible d'ajouter ce perso.");
  },
  "custom": () => {
    const c = readCustom("custom", M.gkind === "truth" ? "truth" : "dare");
    if (!c) return;
    write(() => F.addDoc(cCustom(M.code), { ...c, by: M.me, at: Date.now(), ok: isMod() }), "Impossible d'ajouter ce gage.");
  },
  "l-name": () => {
    const nick = (M.drafts["l-name"] || "").trim().slice(0, 18);
    if (!nick) return;
    const L = M.local, used = new Set(L.players.map(p => p.color));
    L.players.push({ id: rid(), nick, color: COLORS.find(c => !used.has(c)) || COLORS[L.players.length % COLORS.length] });
    M.drafts["l-name"] = ""; saveLocal(); render();
  },
  "l-custom": () => {
    const c = readCustom("l-custom", M.gkind === "truth" ? "truth" : "dare");
    if (!c) return;
    M.local.customs.push({ id: rid(), ...c });
    saveLocal(); render();
  }
};
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled || !app.contains(b)) return;
  const fn = ACT[b.dataset.act];
  if (fn) { e.preventDefault(); fn(b.dataset); }
});
document.addEventListener("submit", e => {
  const f = e.target.closest("form[data-form]");
  if (!f) return;
  e.preventDefault();
  FORM[f.dataset.form]?.();
});
/* One file picker for the whole page, kept outside #app so a redraw while it is open doesn't lose the chosen photo.
   No « capture » attribute: the phone offers both the camera and the gallery. */
const picInput = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true });
document.body.appendChild(picInput);
let picTarget = "";
picInput.addEventListener("change", async () => {
  const form = picTarget, file = picInput.files && picInput.files[0];
  if (!file || !(form in M.pics)) return;
  M.picBusy = form; M.err = ""; render();
  try {
    const pic = await shrinkPhoto(file);
    if (!pic) throw new Error("format");
    M.pics[form] = pic;
  } catch { M.err = "Impossible de lire cette photo. Essaie avec une autre."; }
  M.picBusy = ""; render();
});
document.addEventListener("input", e => {
  const ds = e.target.dataset || {};
  if (!ds.draft) return;
  M.drafts[ds.draft] = ds.draft === "code" ? (e.target.value = normCode(e.target.value)) : e.target.value;
  if (ds.draft === "notes" && M.room) store.set("notes", JSON.stringify({ g: M.room.gameId, t: e.target.value }));
});
window.addEventListener("hashchange", () => {
  const c = hashCode();
  if (!c || M.mode === "local") return;
  if (hashIsTv() && F && M.me) { if (!(M.code === c && M.tv)) enterRoom(c, true); return; }
  if (c !== M.code) { M.drafts.code = c; if (M.code) exitRoom(); else render(); }
});
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); M.installEvt = e; render(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

/* ---------- boot ---------- */
const isPlaceholder = () => !firebaseConfig.apiKey || /COLLE/.test(firebaseConfig.apiKey);
async function boot() {
  M.local = store.json("local", null);
  if (isPlaceholder()) { M.mode = "setup"; render(); return; }
  render();
  try { await loadFirebase(); }
  catch { M.mode = "fatal"; M.fatal = "Impossible de charger le jeu en ligne. Vérifie ta connexion internet."; render(); return; }
  try { M.me = (await F.signInAnonymously(AUTH)).user.uid; }
  catch (e) {
    M.mode = "fatal";
    M.fatal = e && (e.code === "auth/operation-not-allowed" || e.code === "auth/admin-restricted-operation")
      ? "La connexion anonyme n'est pas activée dans Firebase (Authentication › Sign-in method › Anonyme)."
      : "Connexion impossible (" + (e?.code || "réseau") + ").";
    render(); return;
  }
  const target = hashCode() || store.get("room");
  // A big-screen link opens straight on the game, without joining it.
  if (target && hashIsTv()) { enterRoom(target, true); return; }
  // Back to the game after a reload, or straight in when the link carries a code you already joined.
  if (target) {
    try {
      const [r, p] = await Promise.all([F.getDoc(rRoom(target)), F.getDoc(rPlayer(target, M.me))]);
      if (r.exists() && p.exists()) { enterRoom(target); setTimeout(cleanupOldRooms, 8000); return; }
      if (!r.exists()) { store.set("room", null); if (hashCode()) M.err = `Aucune partie avec le code ${target}.`; }
    } catch {}
  }
  M.mode = "home"; render();
  setTimeout(cleanupOldRooms, 8000);
}
boot();
