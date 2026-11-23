import { firebaseConfig } from "./config.js";
import * as Soiree from "../soiree.js";
import { PACKS, GROUP_PACK } from "./words.js";
import { GAGES } from "./gages.js";

const FB = window.UC_FB || "https://www.gstatic.com/firebasejs/10.12.2/";
const QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const COLORS = ["#D93A26","#2F62D0","#18825A","#7C47CC","#B86400","#C2307C","#0F7C8F","#5E5C17","#8C3B1F","#3D4A63","#A3262A","#2E7D32"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const K = "uc";
const ROLES = { civ: "Civil", uc: "Undercover", white: "Mr White" };
const POINTS = { civ: 2, uc: 10, white: 6 };
const GAGE_LEVELS = ["Soft", "Épicé", "Hot", "Extrême"];
const WORD_SHOW_MS = 6000;
const ROOM_MAX_IDLE_MS = 24 * 3600 * 1000;

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rid = () => Math.random().toString(36).slice(2, 10);
const rand = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const safeColor = c => COLORS.includes(c) ? c : COLORS[9];
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
const genCode = () => Array.from({ length: 4 }, () => CODE_CHARS[rand(CODE_CHARS.length)]).join("");
const normCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
/* Links look like #ABCD (join) or #ABCD-tv (big screen). */
const hashCode = () => { const c = normCode(location.hash.slice(1).split("-")[0]); return c.length === 4 ? c : ""; };
const hashIsTv = () => /-tv$/i.test(location.hash);
const store = {
  get(k) { try { return localStorage.getItem(K + "-" + k); } catch { return null; } },
  set(k, v) { if (Soiree.replaying) return; try { v == null ? localStorage.removeItem(K + "-" + k) : localStorage.setItem(K + "-" + k, v); } catch {} },
  json(k, d) { try { return JSON.parse(this.get(k) || "null") ?? d; } catch { return d; } }
};
const names = list => {
  const ns = list.map(p => p.nick);
  return ns.length <= 1 ? ns.join("") : ns.slice(0, -1).join(", ") + " et " + ns[ns.length - 1];
};
const cleanText = (s, max) => String(s || "").trim().replace(/\s+/g, " ").slice(0, max);
const hashInt = s => { let h = 5381; for (const c of String(s)) h = (h * 33 + c.codePointAt(0)) >>> 0; return h; };
const tsMs = ts => ts && typeof ts.toMillis === "function" ? ts.toMillis() : typeof ts === "number" ? ts : 0;
const topOf = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])[0];

/* ---------- rules of the game ---------- */
// Accents, case, a leading article and a final plural don't count when Mr White guesses.
function normWord(s) {
  let t = String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’`]/g, "'").trim();
  t = t.replace(/^(?:de l'|l'|(?:les|le|la|un|une|des|du|de la)\s+)/, "").replace(/[^a-z0-9]/g, "");
  return t.length > 3 ? t.replace(/[sx]$/, "") : t;
}
const sameWord = (a, b) => !!normWord(a) && normWord(a) === normWord(b);
// The impostors must stay a minority: at least one more civilian than impostors.
const maxImp = n => Math.max(0, Math.floor((n - 1) / 2));
const WHITE_MIN = 4;
// Mr White takes an impostor seat. At 4 players he may come with or without an Undercover.
function compo(n, nUc, white) {
  const w = white && n >= WHITE_MIN ? 1 : 0;
  const cap = w ? Math.max(maxImp(n), Math.min(2, n - 2)) : maxImp(n);
  const want = Number.isFinite(+nUc) && nUc !== null && nUc !== "" ? Math.round(+nUc) : 1;
  const uc = Math.max(w ? 0 : Math.min(1, cap), Math.min(want, cap - w));
  return { uc, white: w, cap, civ: Math.max(0, n - uc - w), ok: n >= 3 };
}
const compoText = c => [plural(c.civ, "civil"), c.uc ? plural(c.uc, "undercover") : "", c.white ? "1 Mr White" : ""].filter(Boolean).join(" · ");
/* The pairs of the chosen packs; "Ce groupe" adds the house pairs the moderator accepted. */
function pairPool(packIds, customs = []) {
  const pool = [];
  for (const p of PACKS) if (packIds.includes(p.id)) p.pairs.forEach((w, i) => pool.push({ key: p.id + ":" + i, w }));
  if (packIds.includes(GROUP_PACK.id)) for (const c of customs) pool.push({ key: "m:" + c.id, w: [c.a, c.b], house: true });
  return pool;
}
// Pairs already played in this room wait their turn; house pairs come first until each has been played once.
function pickPair(packIds, used, customs = []) {
  const pool = pairPool(packIds, customs);
  if (!pool.length) return null;
  let avail = pool.filter(x => !used.includes(x.key));
  const reset = !avail.length;
  if (reset) avail = pool;
  const house = avail.filter(x => x.house);
  const from = house.length ? house : avail;
  const x = from[rand(from.length)];
  const [civ, uc] = rand(2) ? x.w : [x.w[1], x.w[0]];
  return { civ, uc, used: (reset ? [] : used).concat(x.key).slice(-400) };
}
// Mr White never speaks first.
function dealRoles(ids, c) {
  const roles = {};
  shuffle(ids).forEach((id, i) => { roles[id] = i < c.uc ? "uc" : i < c.uc + c.white ? "white" : "civ"; });
  const order = shuffle(ids), first = order.findIndex(id => roles[id] !== "white");
  if (first > 0) [order[0], order[first]] = [order[first], order[0]];
  return { roles, order };
}
// Each round starts one seat further round the table.
function roundOrder(order, outIds, round) {
  const n = order.length, seq = [];
  for (let i = 0; i < n; i++) { const id = order[(round - 1 + i) % n]; if (!outIds.includes(id)) seq.push(id); }
  return seq;
}
function verdictAfter(order, outIds, roles) {
  const alive = order.filter(id => !outIds.includes(id));
  const imp = alive.filter(id => roles[id] && roles[id] !== "civ").length;
  return !imp ? "civ" : alive.length - imp <= 1 ? "imp" : "";
}
const isWinner = (role, winner) => winner === "civ" ? role === "civ" : winner === "imp" ? role !== "civ" : winner === "white" ? role === "white" : false;
function addScores(scores, roles, winner) {
  const s = { ...(scores || {}) };
  for (const [id, role] of Object.entries(roles)) if (isWinner(role, winner)) s[id] = (s[id] || 0) + POINTS[role];
  return s;
}
function tally(candidates, vm) {
  const by = Object.fromEntries(candidates.map(id => [id, []]));
  for (const [v, t] of Object.entries(vm)) if (by[t]) by[t].push(v);
  const rows = candidates.map(id => ({ id, voters: by[id] })).sort((a, b) => b.voters.length - a.voters.length);
  const max = rows[0]?.voters.length || 0;
  return { rows, max, top: max ? rows.filter(r => r.voters.length === max).map(r => r.id) : [] };
}
/* The same gage or truth on every phone, without anyone having to write it down. */
function gageText(kind, level, seed) {
  const pool = [];
  for (let l = 1; l <= Math.min(4, Math.max(1, +level || 1)); l++) pool.push(...GAGES[kind][l]);
  return pool[hashInt(seed + kind) % pool.length];
}

/* ---------- end-of-game titles ---------- */
const isImp = role => !!role && role !== "civ";
const TITLE_RULES = [
  { label: "Médium", w: 9, score: (s, g) => s.role === "white" && g.winner === "white" ? 1 : 0, why: () => "a trouvé le mot sans jamais l'avoir eu" },
  { label: "Menteur pro", w: 7, score: s => s.role === "uc" && !s.out && s.recv === 0 ? 1 : 0, why: () => "Undercover, pas un seul vote contre lui" },
  { label: "Bluffeur de génie", w: 6, score: s => s.role === "white" && !s.out ? 1 : 0, why: () => "Mr White, jamais démasqué" },
  { label: "Agent infiltré", w: 5, score: s => s.role === "uc" && !s.out ? 1 : 0, why: () => "Undercover, toujours là à la fin" },
  { label: "Grillé d'avance", w: 4.5, score: s => isImp(s.role) && s.out === 1 ? 1 : 0, why: () => "démasqué dès le premier tour" },
  { label: "Kamikaze", w: 4, score: s => s.role === "civ" && s.out === 1 ? 1 : 0, why: () => "éliminé au premier tour… en étant civil" },
  { label: "Tir ami", w: 3.5, score: s => isImp(s.role) ? s.friendly : 0, why: () => "a voté contre son propre camp" },
  { label: "Sherlock", w: 3, score: s => s.role === "civ" && s.cast >= 2 && s.hitImp / s.cast >= .6 ? s.hitImp : 0, why: s => `${s.hitImp} votes sur ${s.cast} contre un imposteur` },
  { label: "Fin limier", w: 1.6, score: s => s.role === "civ" && s.cast && s.hitImp === s.cast ? s.hitImp : 0, why: s => `a visé juste ${s.hitImp} fois sur ${s.cast}` },
  { label: "Œil de lynx", w: 1.5, score: s => s.role === "civ" && s.cast && s.hitImp === s.cast ? s.hitImp : 0, why: () => "n'a voté que contre des imposteurs" },
  { label: "Parano", w: 2.5, score: s => s.role === "civ" && s.cast >= 2 && !s.hitImp ? s.cast : 0, why: () => "n'a voté que contre des civils" },
  { label: "Mouton", w: 2, score: s => s.cast >= 3 && s.withMaj / s.cast >= .75 ? s.withMaj / s.cast : 0, why: s => `a voté comme la majorité ${Math.round(s.withMaj / s.cast * 100)} % du temps` },
  { label: "Électron libre", w: 2, score: s => s.cast >= 3 && s.withMaj / s.cast <= .25 ? 1 - s.withMaj / s.cast : 0, why: () => "ne vote jamais comme les autres" },
  { label: "Bouc émissaire", w: 1.2, score: s => s.recv >= 3 ? s.recv : 0, why: s => `${s.recv} votes reçus` },
  { label: "Obsession", w: 1, score: s => s.fanN >= 2 ? s.fanN : 0, why: s => `a voté ${s.fanN} fois contre ${s.fanNick}`, name: s => `Obsédé par ${s.fanNick}` },
  { label: "Ange gardien", w: .8, score: s => s.role === "civ" && s.cast && !s.recv ? 1 : 0, why: () => "personne ne l'a jamais soupçonné" },
  { label: "Insoupçonnable", w: .7, score: s => s.cast && !s.recv ? 1 : 0, why: () => "aucun vote contre lui de toute la partie" }
];
/* g: { ids, roles, out, winner, votes, nick } — votes are optional (none when playing on one phone). */
function computeTitles(g) {
  const outRound = Object.fromEntries((g.out || []).map(o => [o.uid, o.round]));
  const S = Object.fromEntries(g.ids.map(id => [id, { id, role: g.roles?.[id], out: outRound[id] || 0, cast: 0, recv: 0, hitImp: 0, withMaj: 0, friendly: 0, fan: {} }]));
  const byVote = {};
  for (const v of g.votes || []) (byVote[v.round + "." + v.v] ||= []).push(v);
  for (const list of Object.values(byVote)) {
    const counts = {};
    list.forEach(v => { counts[v.target] = (counts[v.target] || 0) + 1; });
    const max = Math.max(...Object.values(counts));
    for (const v of list) {
      const s = S[v.voter], t = S[v.target];
      if (!s || !t) continue;
      s.cast++; t.recv++;
      if (isImp(t.role)) s.hitImp++;
      if (counts[v.target] === max) s.withMaj++;
      if (isImp(s.role) && isImp(t.role)) s.friendly++;
      s.fan[v.target] = (s.fan[v.target] || 0) + 1;
    }
  }
  for (const s of Object.values(S)) { const f = topOf(s.fan); s.fanN = f ? f[1] : 0; s.fanNick = f ? g.nick(f[0]) : ""; }
  const cands = [];
  for (const s of Object.values(S)) for (const rule of TITLE_RULES) {
    const sc = rule.score(s, g);
    if (sc > 0) cands.push({ uid: s.id, label: rule.label, title: rule.name ? rule.name(s) : rule.label, why: rule.why(s), score: sc * rule.w });
  }
  cands.sort((a, b) => b.score - a.score);
  const out = {}, used = new Set();
  for (const c of cands) if (!out[c.uid] && !used.has(c.label)) { out[c.uid] = c; used.add(c.label); }
  for (const id of g.ids) if (!out[id]) out[id] = { label: "Témoin", title: "Témoin", why: "a tout vu, n'a rien dit" };
  return out;
}

/* ---------- state ---------- */
const M = {
  mode: "boot", me: null, code: null, tv: false,
  room: null, roomReady: false, players: [], playersReady: false,
  clues: [], votes: [], secret: null, deal: null, guess: null, customs: [], choices: [],
  pending: null, wordShown: false, renaming: false, handover: false, showQR: false, err: "", flash: "", busy: false, fatal: "",
  installEvt: null, local: null, drafts: { nick: store.get("nick") || "", code: hashCode() }
};
const isMod = () => !M.tv && !!M.room && M.room.hostUid === M.me;
const inRoom = () => !M.tv && M.players.some(p => p.id === M.me);
function pInfo(id) {
  const p = M.players.find(x => x.id === id);
  if (p) return p;
  const c = M.room?.cast?.[id];
  return { id, nick: c ? String(c.nick || "?").slice(0, 18) : "?", color: c?.color };
}

/* ---------- presence ----------
   Each phone stamps its player with the server time every HEARTBEAT_MS, even in the background while the phone
   lets it run. The rules let a player take over once the moderator's stamp is a minute old; the button shows a bit later. */
const HEARTBEAT_MS = 20000, HOST_AWAY_MS = 70000, PLAYER_AWAY_MS = 90000;
let skew = 0, lastHb = 0, mySeen = 0;
const serverNow = () => Date.now() - skew;
const seenMs = p => tsMs(p && p.seen);
const awayFor = p => !p ? Infinity : p.id === M.me ? 0 : serverNow() - seenMs(p);
const isOnline = p => awayFor(p) < PLAYER_AWAY_MS;
const hostPlayer = () => M.players.find(p => p.id === M.room?.hostUid);
function heartbeat() {
  if (Soiree.replaying) return;  // a replay never writes
  if (M.mode !== "room" || !M.code || !inRoom()) return;
  lastHb = Date.now();
  F.updateDoc(rPlayer(M.code, M.me), { seen: F.serverTimestamp(), mod: isMod() }).catch(() => {});
}
setInterval(heartbeat, HEARTBEAT_MS);
/* One tick a second keeps the page fresh and lets the moderator's phone run the automatic steps. */
setInterval(() => { if (M.mode === "room") { render(); if (isMod()) hostSync(); } }, 1000);
const modoAway = () => !isMod() && inRoom() && !!M.room && awayFor(hostPlayer()) >= HOST_AWAY_MS;

/* ---------- Firebase ---------- */
let F = null, DB = null, AUTH = null;
async function loadFirebase() {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")
  ]);
  const fbApp = appMod.getApps()[0] || appMod.initializeApp(firebaseConfig);
  AUTH = authMod.getAuth(fbApp);
  DB = fsMod.getFirestore(fbApp);
  Soiree.useEmulators(authMod, AUTH, fsMod, DB);
  F = { ...fsMod, signInAnonymously: authMod.signInAnonymously };
}
const ROOT = "ucRooms";
const rRoom = c => F.doc(DB, ROOT, c);
const rPlayer = (c, id) => F.doc(DB, ROOT, c, "players", id);
const cPlayers = c => F.collection(DB, ROOT, c, "players");
const rSecret = (c, id) => F.doc(DB, ROOT, c, "secret", id);
const rDeal = c => F.doc(DB, ROOT, c, "deal", "current");
const rGuess = (c, g) => F.doc(DB, ROOT, c, "guess", g);
const cClues = c => F.collection(DB, ROOT, c, "clues");
const rClue = (c, id) => F.doc(DB, ROOT, c, "clues", id);
const cVotes = c => F.collection(DB, ROOT, c, "votes");
const rVote = (c, id) => F.doc(DB, ROOT, c, "votes", id);
const cCustom = c => F.collection(DB, ROOT, c, "custom");
const rCustom = (c, id) => F.doc(DB, ROOT, c, "custom", id);
const cChoices = c => F.collection(DB, ROOT, c, "choices");
const rChoice = (c, id) => F.doc(DB, ROOT, c, "choices", id);

let subs = [], gameSubs = [], unDeal = null, unCustom = null, customKey = "";
function leaveGameSubs() { gameSubs.forEach(u => u()); gameSubs = []; }
function leaveSubs() {
  subs.forEach(u => u()); subs = []; leaveGameSubs();
  if (unDeal) unDeal(); unDeal = null;
  if (unCustom) unCustom(); unCustom = null; customKey = "";
}
function onErr(e) {
  M.err = e && e.code === "permission-denied" ? "Accès refusé à cette partie." : "Connexion à la partie perdue. Recharge la page.";
  render();
}
function subGame() {
  leaveGameSubs();
  Object.assign(M, { clues: [], votes: [], guess: null, choices: [], wordShown: false });
  const g = M.room?.gameId;
  if (!g) return;
  const q = col => F.query(col(M.code), F.where("gameId", "==", g));
  gameSubs.push(F.onSnapshot(q(cClues), s => { M.clues = s.docs.map(d => d.data()); render(); }, onErr));
  gameSubs.push(F.onSnapshot(q(cVotes), s => { M.votes = s.docs.map(d => d.data()); render(); if (isMod()) hostSync(); }, onErr));
  gameSubs.push(F.onSnapshot(rGuess(M.code, g), s => { M.guess = s.exists() ? s.data() : null; render(); hostAuto(); }, onErr));
  gameSubs.push(F.onSnapshot(q(cChoices), s => { M.choices = s.docs.map(d => d.data()); render(); }, () => {}));
}
// Only the moderator can read who has which role; the listener follows whoever is modo now.
function subDeal() {
  if (unDeal && !isMod()) { unDeal(); unDeal = null; M.deal = null; }
  if (unDeal || !isMod()) return;
  unDeal = F.onSnapshot(rDeal(M.code), s => { M.deal = s.exists() ? s.data() : null; render(); hostAuto(); }, e => { if (isMod()) onErr(e); });
}
// House pairs stay secret: each player reads their own, the moderator reads them all.
function subCustom() {
  const key = M.tv ? "" : isMod() ? "all" : inRoom() ? "mine" : "";
  if (key === customKey) return;
  if (unCustom) unCustom();
  unCustom = null; customKey = key; M.customs = [];
  if (!key) return;
  const q = key === "all" ? cCustom(M.code) : F.query(cCustom(M.code), F.where("by", "==", M.me));
  unCustom = F.onSnapshot(q, s => {
    M.customs = s.docs.map(d => { const x = d.data(); return { id: d.id, a: cleanText(x.a, 30), b: cleanText(x.b, 30), by: x.by || "", at: x.at || 0, ok: !!x.ok }; })
      .filter(c => c.a && c.b).sort((a, b) => a.at - b.at);
    render();
  }, () => { M.customs = []; render(); });
}
function enterRoom(code, tv = false) {
  Soiree.roomEntered(code, tv);
  leaveSubs();
  Object.assign(M, { mode: "room", tv, code, room: null, roomReady: false, players: [], playersReady: false, clues: [], votes: [], secret: null, deal: null, guess: null, customs: [], choices: [], pending: null, renaming: false, handover: false, wordShown: false });
  if (!tv) store.set("room", code);
  try { history.replaceState(null, "", "#" + code + (tv ? "-tv" : "")); } catch {}
  subs.push(F.onSnapshot(rRoom(code), s => {
    if (!s.exists()) { M.err = "Cette partie n'existe plus."; exitRoom(); return; }
    const prev = M.room?.gameId;
    M.room = s.data(); M.roomReady = true;
    if (M.room.gameId !== prev) subGame();
    subDeal(); subCustom();
    if (M.pending && (M.pending.g !== M.room.gameId || M.pending.r !== M.room.round || M.pending.v !== M.room.voteN)) M.pending = null;
    if (isMod()) rememberHosted(code);
    render(); hostAuto();
  }, onErr));
  subs.push(F.onSnapshot(cPlayers(code), q => {
    M.players = q.docs.map(d => { const x = d.data({ serverTimestamps: "estimate" }); return { id: d.id, ...x, nick: String(x.nick || "?").slice(0, 18) }; })
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    M.playersReady = true;
    // Learn how far this phone's clock is from the server's, from our own stamp, only when it just changed.
    const mine = q.docs.find(d => d.id === M.me), stamp = mine && !mine.metadata?.hasPendingWrites ? tsMs(mine.data().seen) : 0;
    if (stamp && stamp !== mySeen) {
      if (mySeen && Date.now() - lastHb < 5000) skew = Date.now() - stamp;
      mySeen = stamp;
    }
    subCustom();
    if (inRoom() && Date.now() - lastHb > HEARTBEAT_MS) heartbeat();
    render();
  }, onErr));
  if (!tv) subs.push(F.onSnapshot(rSecret(code, M.me), s => { M.secret = s.exists() ? s.data() : null; render(); }, onErr));
  render();
}
function exitRoom() {
  if (M.code && !M.tv) store.set("last", M.code);
  leaveSubs();
  Object.assign(M, { mode: "home", tv: false, code: null, room: null, players: [], clues: [], votes: [], secret: null, deal: null, guess: null, customs: [], choices: [], pending: null, handover: false });
  store.set("room", null);
  try { history.replaceState(null, "", location.pathname + location.search); } catch {}
  render();
}
async function joinRoom(code, nick, hostUid) {
  const ps = await F.getDocs(cPlayers(code));
  lastHb = Date.now();
  if (ps.docs.some(d => d.id === M.me)) { await F.updateDoc(rPlayer(code, M.me), { nick, mod: hostUid === M.me, seen: F.serverTimestamp() }); return; }
  const used = new Set(ps.docs.map(d => d.data().color));
  const fav = Soiree.color();
  const color = fav && !used.has(fav) ? fav : COLORS.find(c => !used.has(c)) || COLORS[ps.size % COLORS.length];
  await F.setDoc(rPlayer(code, M.me), { nick, color, joinedAt: Date.now(), seen: F.serverTimestamp() });
}
const freshGame = () => ({ gameId: rid(), phase: "lobby", order: [], outIds: [], out: [], cast: {}, compo: null, round: 0, step: "clues", voteN: 1, among: [], revealed: "", whiteUid: "", news: null, result: null });
const freshRoom = () => ({ ...freshGame(), packs: [1], nUc: 1, white: false, oral: false, gages: false, gageLvl: 1, used: [], scores: {} });
/* Every change of the room also stamps it, which tells the cleanup when a room was last used. */
const patchRoom = p => F.updateDoc(rRoom(M.code), { ...p, touchedAt: F.serverTimestamp() });
const okCustoms = () => M.customs.filter(c => c.ok);
function finishGame(r, winner, news, extra = {}) {
  const d = M.deal && M.deal.gameId === r.gameId ? M.deal : null;
  const result = { winner: winner || "", civ: d?.civ || "", uc: d?.uc || "", roles: d?.roles || {} };
  return patchRoom({ ...extra, phase: "end", result, news: news || null, scores: winner ? addScores(r.scores, result.roles, winner) : (r.scores || {}) });
}

/* ---------- moderator's phone: automatic steps ---------- */
// Mr White's guess is checked as soon as it arrives.
let autoKey = "";
function hostAuto() {
  const r = M.room, g = M.guess, d = M.deal;
  if (!isMod() || !r || r.phase !== "play" || r.step !== "white") return;
  if (!g || g.uid !== r.whiteUid || !d || d.gameId !== r.gameId) return;
  const key = r.gameId + "|" + r.round + "|" + r.whiteUid;
  if (autoKey === key) return;
  autoKey = key;
  const ok = sameWord(g.text, d.civ);
  const news = { ...(r.news || {}), guess: cleanText(g.text, 40), ok };
  const v = ok ? "white" : verdictAfter(r.order, r.outIds, d.roles);
  (v ? finishGame(r, v, news) : patchRoom({ step: "out", news })).catch(() => { autoKey = ""; M.err = "Ça n'a pas marché. Recharge la page."; render(); });
}
// The votes show on their own once every survivor still connected has voted.
let hostBusy = false;
async function hostSync() {
  if (Soiree.replaying) return;  // a replay never writes
  const r = M.room;
  if (!isMod() || hostBusy || M.busy || !r || r.phase !== "play") return;
  const seq = roundOrder(r.order || [], r.outIds || [], r.round);
  if (effStep(r, seq, cluesFor(r.round)) !== "vote" || r.revealed === `${r.round}.${r.voteN}` || !everyoneVoted(r, seq)) return;
  hostBusy = true;
  try { await patchRoom({ revealed: `${r.round}.${r.voteN}` }); } catch {}
  hostBusy = false;
}
function everyoneVoted(r, seq) {
  const vm = votesMap(r, seq, false);
  const present = seq.filter(id => isOnline(M.players.find(p => p.id === id)));
  return present.length > 0 && Object.keys(vm).length > 0 && present.every(id => vm[id]);
}

/* ---------- cleanup: rooms this phone created, unused for a day, are deleted ---------- */
function rememberHosted(code) {
  const list = store.json("hosted", []);
  if (!list.includes(code)) { list.push(code); store.set("hosted", JSON.stringify(list.slice(-30))); }
}
async function deleteRoom(code, r) {
  const col = name => F.collection(DB, ROOT, code, name);
  const players = (await F.getDocs(col("players"))).docs;
  // Secrets can't be listed (each is private), so they go by the uids we know.
  for (const id of new Set([...players.map(d => d.id), ...(r.order || [])])) await F.deleteDoc(rSecret(code, id)).catch(() => {});
  await F.deleteDoc(rDeal(code)).catch(() => {});
  for (const name of ["clues", "votes", "guess", "custom", "choices"]) for (const d of (await F.getDocs(col(name))).docs) await F.deleteDoc(d.ref);
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
  const p = { color: null, games: 0, wins: 0, roles: {}, impGames: 0, impSurvived: 0, votedFor: {}, titles: {}, recorded: [], ...store.json("profile", {}) };
  p.roles = { civ: 0, uc: 0, white: 0, ...p.roles };
  return p;
}
function saveProfile(p) { store.set("profile", JSON.stringify(p)); Soiree.statsSaved(p); }  // also kept in the account
function recordGame(r, titles) {
  const res = r.result || {}, role = res.roles?.[M.me];
  if (!role || !res.winner || !r.gameId) return;
  const p = profile();
  if (p.recorded.includes(r.gameId)) return;
  p.games++;
  if (isWinner(role, res.winner)) p.wins++;
  p.roles[role]++;
  if (isImp(role)) { p.impGames++; if (!(r.outIds || []).includes(M.me)) p.impSurvived++; }
  for (const v of M.votes) if (v.voter === M.me) { const n = pInfo(v.target).nick; if (n && n !== "?") p.votedFor[n] = (p.votedFor[n] || 0) + 1; }
  const t = titles[M.me];
  if (t && t.label !== "Témoin") p.titles[t.label] = (p.titles[t.label] || 0) + 1;
  p.recorded = [...p.recorded, r.gameId].slice(-50);
  saveProfile(p);
}

/* ---------- suspicion notes, kept on this phone only ---------- */
function notes(gameId) { const n = store.json("notes", {}); return n.g === gameId ? (n.m || {}) : {}; }
function cycleNote(gameId, id) {
  const m = notes(gameId), cur = m[id];
  if (cur === "sus") m[id] = "ok"; else if (cur === "ok") delete m[id]; else m[id] = "sus";
  store.set("notes", JSON.stringify({ g: gameId, m }));
}
const noteTag = mark => mark ? `<span class="mk ${mark}">${mark === "sus" ? "suspect" : "sûr"}</span>` : "";

/* ---------- shared pieces ---------- */
function av(p, cls = "") {
  const ini = (p.nick || "?").trim().charAt(0) || "?";
  return `<span class="av ${cls}" style="background:${safeColor(p.color)}" aria-hidden="true">${esc(ini)}</span>`;
}
function chip(p, extra = "", cls = "") {
  const room = M.mode === "room" && M.room;
  const mod = room && p.id === M.room.hostUid, away = room && p.id !== M.me && M.players.some(x => x.id === p.id) && !isOnline(p);
  return `<span class="chip ${cls} ${away ? "dim" : ""}">${av(p)}<span class="nm">${esc(p.nick)}</span>${mod ? `<span class="tag">modo</span>` : ""}${away ? `<span class="tag off">absent</span>` : ""}${extra}</span>`;
}
const roleTag = role => `<span class="role r-${esc(role)}">${ROLES[role] || "?"}</span>`;
function header(big, badge = "") {
  return `<header class="top ${big ? "big" : ""}"><h1 class="logo">Under<span class="redact">cover</span></h1>${badge ? `<span class="badge">${esc(badge)}</span>` : ""}</header>`;
}
function errBox() {
  return (M.err ? `<div class="err" role="alert">${esc(M.err)}</div>` : "") + (M.flash ? `<div class="note" role="status">${esc(M.flash)}</div>` : "");
}
function waitMod(text) {
  return `<section class="panel center wait"><div class="label">En attente du modo</div><div class="big dots">${text}</div></section>`;
}
function rulesBox() {
  return `<details class="panel rules"><summary>Comment on joue ?</summary>
    <ol>
      <li>Tout le monde reçoit le même mot secret… sauf l'<b>Undercover</b>, qui a un mot proche. Personne ne sait s'il est Undercover.</li>
      <li><b>Mr White</b>, lui, n'a pas de mot du tout : il bluffe.</li>
      <li>À tour de rôle, chacun donne un indice sur son mot. Pas trop précis (l'Undercover devinerait), pas trop vague (on te soupçonnerait).</li>
      <li>Puis on vote pour éliminer quelqu'un, et son rôle est révélé.</li>
      <li>Mr White éliminé peut encore gagner s'il devine le mot des civils.</li>
      <li>Les civils gagnent quand tous les imposteurs sont éliminés. Les imposteurs gagnent s'il ne reste plus qu'un civil.</li>
    </ol>
    <p class="hint left">Points : ${POINTS.civ} par civil gagnant, ${POINTS.uc} par Undercover gagnant, ${POINTS.white} pour Mr White.</p>
  </details>`;
}
function sw(on, act, title, sub, disabled = false) {
  return `<button class="switch" data-act="${act}" aria-pressed="${!!on}" ${disabled ? "disabled" : ""}><span class="knob"></span><span><b>${title}</b><br><small>${sub}</small></span></button>`;
}
/* o: { n, packs, nUc, white, oral, gages, gageLvl, groupCount (null when house pairs aren't available), acts } */
function settingsPanel(o) {
  const n = Math.max(o.n, 3), c = compo(n, o.nUc, o.white), canWhite = o.n >= WHITE_MIN, a = o.acts;
  const packs = [...PACKS.map(p => ({ id: p.id, name: p.name, desc: p.desc, n: p.pairs.length })),
    ...(o.groupCount != null ? [{ ...GROUP_PACK, n: o.groupCount }] : [])];
  const pool = pairPool(o.packs, Array(o.groupCount || 0).fill(0).map((_, i) => ({ id: i, a: "a", b: "b" }))).length;
  return `<section class="panel">
    <div class="label">Thèmes des mots</div>
    <div class="chips">${packs.map(p => `<button class="pill" data-act="${a.pack}" data-id="${p.id}" aria-pressed="${o.packs.includes(p.id)}" title="${esc(p.desc)}">${esc(p.name)} <small>${p.n}</small></button>`).join("")}</div>
    <p class="hint left">${pool ? `${plural(pool, "paire")} au tirage.` : "Aucune paire dans ces thèmes pour l'instant."}${o.packs.includes(GROUP_PACK.id) && o.groupCount ? " Vos mots maison passent en premier." : ""}</p>
  </section>
  <section class="panel">
    <div class="label">Rôles</div>
    <div class="stepper"><span><b>Undercover</b><small>Un mot proche de celui des civils</small></span>
      <span class="sp"><button class="sbtn" data-act="${a.minus}" ${c.uc <= (c.white ? 0 : 1) ? "disabled" : ""} aria-label="Un undercover de moins">−</button><output>${c.uc}</output><button class="sbtn" data-act="${a.plus}" ${c.uc >= c.cap - c.white ? "disabled" : ""} aria-label="Un undercover de plus">+</button></span></div>
    ${sw(c.white, a.white, "Mr White", canWhite ? `Il n'a pas de mot. Éliminé, il peut encore gagner en devinant celui des civils.${n === 4 && c.white ? (c.uc ? " À 4 avec un Undercover, une seule erreur et les imposteurs gagnent !" : " Mets 1 Undercover si tu veux les deux.") : ""}` : `Possible à partir de ${WHITE_MIN} joueurs.`, !canWhite)}
    ${a.oral ? `<div class="label">Indices</div><div class="toggles">
      <button class="tog" data-act="${a.oral}" data-v="0" aria-pressed="${!o.oral}">Écrits dans l'appli</button>
      <button class="tog" data-act="${a.oral}" data-v="1" aria-pressed="${!!o.oral}">À voix haute</button></div>` : ""}
    <div class="summary"><span>${o.n >= 3 ? compoText(c) : "Il faut au moins 3 joueurs"}</span></div>
  </section>
  <section class="panel">
    <div class="label">Options</div>
    ${sw(o.gages, a.gages, "Gages et vérités", "À la fin de la partie, chaque perdant choisit entre un gage et une vérité.")}
    ${o.gages ? `<div class="toggles">${GAGE_LEVELS.map((l, i) => `<button class="tog" data-act="${a.gageLvl}" data-id="${i + 1}" aria-pressed="${(o.gageLvl || 1) === i + 1}">${l}</button>`).join("")}</div>
      <p class="hint left">Chaque niveau pioche aussi dans les niveaux plus doux. Ce qui touche quelqu'un d'autre se fait avec son accord.</p>` : ""}
  </section>`;
}
function settingsSummary(r, n) {
  const c = compo(Math.max(n, 3), r.nUc, r.white);
  const packs = [...PACKS, GROUP_PACK].filter(p => (r.packs || []).includes(p.id)).map(p => p.name);
  const tags = [...packs, n >= 3 ? compoText(c) : "Au moins 3 joueurs", r.oral ? "Indices à voix haute" : "Indices écrits",
    ...(r.gages ? [`Gages ${GAGE_LEVELS[(r.gageLvl || 1) - 1]}`] : [])];
  return `<div class="summary">${tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>`;
}
// The secret word, hidden until its owner taps.
function wordCard(sec, o) {
  let body;
  if (!sec) body = `<p class="lead">Distribution des mots…</p>`;
  else if (!o.shown) body = `<div class="word redacted" aria-label="Mot caché"><span>████████</span></div>`;
  else if (sec.white) body = `<div class="word">?</div><p class="sub">Tu es <b>Mr White</b> : tu n'as pas de mot. Écoute les indices, fonds-toi dans la masse… et si on te démasque, devine le mot des civils.</p>`;
  else body = `<div class="word">${esc(sec.word)}</div><p class="sub">Civil ou Undercover ? Même toi, tu ne le sais pas.</p>`;
  return `<section class="dossier ${o.shown && sec ? "open" : ""} ${o.out ? "dead" : ""}">
    <div class="dtop"><span class="tab">${esc(o.title || "Ton mot secret")}</span><span class="stamp">${o.out ? "Éliminé" : "Confidentiel"}</span></div>
    ${body}
    ${sec && o.act ? `<button class="btn ${o.shown && !o.primaryWhenShown ? "" : "primary"}" data-act="${o.act}">${o.shown ? (o.hideLabel || "Cacher") : "Voir mon mot"}</button>` : ""}
    ${o.hint ? `<p class="hint">${o.hint}</p>` : ""}
  </section>`;
}
function scoresPanel(ids, scores, pick) {
  const rows = ids.map(id => ({ p: pick(id), n: scores?.[id] || 0 })).sort((a, b) => b.n - a.n);
  if (!rows.some(r => r.n)) return "";
  return `<section class="panel"><div class="label">Classement</div>
    <ol class="rank">${rows.map((r, i) => `<li class="${i === 0 ? "first" : ""}"><span class="pos">${i + 1}</span>${av(r.p)}<span class="who"><b>${esc(r.p.nick)}</b></span><span class="pts">${plural(r.n, "pt")}</span></li>`).join("")}</ol>
  </section>`;
}
const WIN_TEXT = {
  civ: ["Les civils gagnent", "Tous les imposteurs sont démasqués."],
  imp: ["Les imposteurs gagnent", "Il ne reste plus qu'un civil."],
  white: ["Mr White gagne", "Il a deviné le mot des civils."],
  "": ["Partie arrêtée", "Pas de gagnant cette fois."]
};
function endPanels(res, order, outList, pick, news, titles = {}) {
  const [title, sub] = WIN_TEXT[res.winner || ""] || WIN_TEXT[""];
  const outRound = Object.fromEntries((outList || []).map(o => [o.uid, o.round]));
  return `<section class="panel verdict win-${esc(res.winner || "none")}" aria-live="polite">
      <div class="label">Fin de la partie</div><div class="name">${title}</div><div class="sub">${sub}</div>
      ${res.winner === "white" && news?.guess ? `<div class="sub">Sa réponse : « ${esc(news.guess)} »</div>` : ""}
    </section>
    <section class="panel words">
      <div><div class="label">Mot des civils</div><div class="w">${esc(res.civ || "?")}</div></div>
      ${Object.values(res.roles || {}).includes("uc") ? `<div><div class="label">Mot de l'Undercover</div><div class="w">${esc(res.uc || "?")}</div></div>` : ""}
    </section>
    <section class="panel"><div class="label">Les rôles</div>
      <ul class="cast">${order.map(id => { const p = pick(id), role = res.roles?.[id], t = titles[id];
        return `<li class="${isWinner(role, res.winner) ? "won" : ""}">${av(p)}<span class="who"><b>${esc(p.nick)}</b>
          ${t ? `<span class="title">${esc(t.title)}</span>` : ""}
          <small>${outRound[id] ? `Éliminé au tour ${outRound[id]}` : "Jusqu'au bout"}${t ? " · " + esc(t.why) : ""}</small></span>${role ? roleTag(role) : ""}</li>`; }).join("")}</ul>
    </section>`;
}
/* Gages and truths for the losing side, each loser choosing on their own phone. */
function gagesPanel(o) {
  if (!o.on || !o.losers.length) return "";
  return `<section class="panel"><div class="label">Gages des perdants · ${GAGE_LEVELS[(o.lvl || 1) - 1]}</div>${o.losers.map(p => {
    const kind = o.choiceOf(p.id);
    if (kind) return `<div class="gage ${kind}"><div class="gk">${esc(p.nick)} · ${kind === "dare" ? "Gage" : "Vérité"}</div><p>${esc(gageText(kind, o.lvl, o.seed + p.id))}</p></div>`;
    if (o.canChoose(p.id)) return `<div class="gage"><div class="gk">${p.id === M.me ? "À toi de choisir" : `${esc(p.nick)} choisit`}</div>
      <div class="btns"><button class="btn primary" data-act="${o.act}" data-id="dare" data-uid="${esc(p.id)}">Gage</button><button class="btn" data-act="${o.act}" data-id="truth" data-uid="${esc(p.id)}">Vérité</button></div></div>`;
    return `<div class="gage"><div class="gk">${esc(p.nick)}</div><p class="dots">choisit entre gage et vérité</p></div>`;
  }).join("")}</section>`;
}
const shareBtn = act => `<button class="btn" data-act="${act}">Partager le résultat en image</button>`;

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
  const p = profile(), fan = topOf(p.votedFor), title = topOf(p.titles);
  return `<section class="panel">
    <div class="label">Mon profil</div>
    ${p.games ? `<ul class="stats">
        <li><b>${p.games}</b> ${p.games > 1 ? "parties" : "partie"}</li>
        <li><b>${p.wins}</b> ${p.wins > 1 ? "victoires" : "victoire"}</li>
        <li><b>${p.games ? Math.round(p.wins / p.games * 100) : 0} %</b> de réussite</li>
      </ul>
      <p class="hint left">Rôles joués : ${plural(p.roles.civ, "fois")} civil, ${plural(p.roles.uc, "fois")} Undercover, ${plural(p.roles.white, "fois")} Mr White.</p>
      ${p.impGames ? `<p class="hint left">En imposteur, tu as survécu jusqu'au bout <b>${p.impSurvived} fois sur ${p.impGames}</b>.</p>` : ""}
      ${fan ? `<p class="hint left">Tu votes le plus souvent contre <b>${esc(fan[0])}</b> (${fan[1]} fois).</p>` : ""}
      ${title ? `<p class="hint left">Ton titre fétiche : <b>${esc(title[0])}</b>.</p>` : ""}`
      : `<p class="hint left">Tes stats apparaîtront ici après ta première partie en ligne. Elles restent sur ce téléphone.</p>`}
  </section>`;
}
function installPanel() {
  if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) return "";
  if (M.installEvt) return `<button class="btn big" data-act="install">Installer l'appli sur ce téléphone</button>`;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return `<p class="hint">Pour l'installer : bouton Partager de Safari, puis « Sur l'écran d'accueil ».</p>`;
  return "";
}
function renderHome() {
  const invited = M.drafts.code && M.drafts.code.length === 4 && hashCode() === M.drafts.code;
  const nickField = `<input id="nick" data-draft="nick" type="text" maxlength="18" autocomplete="nickname" enterkeyhint="next" placeholder="Ton prénom ou surnom" aria-label="Ton prénom">`;
  const joinForm = `<form class="stack" data-form="join-code">
      <input id="code" class="codein" data-draft="code" type="text" maxlength="4" autocomplete="off" autocapitalize="characters" enterkeyhint="go" placeholder="CODE" aria-label="Code de la partie">
      <button class="btn ${invited ? "primary big" : ""}" type="submit">Rejoindre la partie</button>
    </form>`;
  const last = normCode(store.get("last"));
  return header(true) + errBox() + `<p class="tagline">Un mot secret. Un imposteur parmi vous. Trouvez-le avant qu'il ne vous trouve.</p>
  <section class="panel"><div class="label">Ton prénom</div>${nickField}</section>
  ${last.length === 4 && !invited ? `<button class="btn big" data-act="rejoin" data-code="${esc(last)}">Revenir à la partie ${esc(last)}</button>` : ""}
  ${invited
    ? `<section class="panel"><div class="label">Tu es invité à la partie</div><div class="code">${esc(M.drafts.code)}</div>${joinForm}</section>
       <div class="or">ou</div>
       <button class="btn big" data-act="create">Créer ma propre partie</button>`
    : `<button class="btn primary big" data-act="create">Créer une partie</button>
       <p class="hint">Tu seras le modo : tu règles la partie, tu révèles les votes et tu passes à la suite.</p>
       <div class="or">ou</div>
       <section class="panel"><div class="label">Rejoindre avec un code</div>${joinForm}</section>`}
  ${profilePanel()}
  ${installPanel()}
  ${rulesBox()}
  <p class="foot"><button class="link" data-act="go-local">Jouer à plusieurs sur un seul téléphone</button></p>`;
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
      <p class="hint left">Ouvre ce lien sur le grand écran : il montre le QR code, les indices, les votes et les rôles révélés, sans jouer et sans jamais montrer les mots secrets.</p>
      <div class="row"><input type="text" readonly value="${esc(tvLink())}" aria-label="Lien grand écran" onclick="this.select()"><button class="btn" data-act="copy-tv">Copier</button></div>
    </details>` : ""}
  </section>`;
}
function handoverBlock() {
  const others = M.players.filter(p => p.id !== M.me);
  if (!isMod() || !others.length) return "";
  return M.handover
    ? `<div class="label">Donner le rôle de modo à</div>
       <div class="chips">${others.map(p => `<button class="btn" data-act="handover" data-id="${esc(p.id)}">${esc(p.nick)}</button>`).join("")}</div>
       <button class="link" data-act="handover-cancel" style="align-self:flex-start">Annuler</button>`
    : `<button class="link" data-act="handover-open" style="align-self:flex-start">Passer le rôle de modo à quelqu'un d'autre</button>`;
}
function playersPanel(players, editable) {
  return `<section class="panel">
    <div class="label">À table · ${players.length}</div>
    ${players.length ? `<div class="chips">${players.map(p => chip(p,
      editable && p.id !== M.me ? `<button class="x" data-act="kick" data-id="${esc(p.id)}" aria-label="Retirer ${esc(p.nick)}">×</button>` : "",
      p.id === M.me ? "me" : "")).join("")}</div>`
      : `<p class="hint left">Personne pour l'instant.</p>`}
    ${editable ? handoverBlock() : ""}
    ${inRoom() ? (M.renaming
      ? `<form class="row" data-form="rename"><input id="rename" data-draft="rename" type="text" maxlength="18" autocomplete="off" enterkeyhint="done" placeholder="Nouveau pseudo" aria-label="Nouveau pseudo"><button class="btn primary" type="submit">OK</button></form>
         <button class="link" data-act="rename-cancel" style="align-self:flex-start">Annuler</button>`
      : `<button class="link" data-act="rename-open" style="align-self:flex-start">Changer de pseudo</button>`) : ""}
  </section>`;
}
function customPanel(mod) {
  const list = M.customs;
  return `<section class="panel">
    <div class="label">Mots maison</div>
    <p class="hint left">Inventez vos paires : blagues internes, prénoms, souvenirs du groupe… ${mod
      ? "Tu vois toutes les propositions : valide celles qui entrent dans le thème « Ce groupe »."
      : "Seuls toi et le modo voyez tes paires, et le modo les valide."}</p>
    <form class="pairform" data-form="custom">
      <input id="ca" data-draft="ca" type="text" maxlength="30" autocomplete="off" enterkeyhint="next" placeholder="Un mot" aria-label="Premier mot">
      <span class="vs">≈</span>
      <input id="cb" data-draft="cb" type="text" maxlength="30" autocomplete="off" enterkeyhint="done" placeholder="Mot proche" aria-label="Mot proche">
      <button class="btn" type="submit">Ajouter la paire</button>
    </form>
    ${list.length ? `<ul class="customs">${list.map(c => `<li class="${c.ok ? "" : "wait-ok"}">
        <span><b>${esc(c.a)}</b> ≈ <b>${esc(c.b)}</b>${mod && c.by !== M.me ? ` <small>· ${esc(pInfo(c.by).nick)}</small>` : ""}${c.ok ? "" : `<small class="pending">en attente de validation</small>`}</span>
        <span class="acts">${mod && !c.ok ? `<button class="link" data-act="approve-custom" data-id="${esc(c.id)}">Valider</button>` : ""}
          ${mod || c.by === M.me ? `<button class="link" data-act="del-custom" data-id="${esc(c.id)}">${mod && !c.ok ? "Refuser" : "Retirer"}</button>` : ""}</span>
      </li>`).join("")}</ul>` : ""}
  </section>`;
}
function renderRoom() {
  if (!M.roomReady || !M.playersReady) return header(true, "Partie " + M.code) + `<section class="panel center loading">Connexion à la table…</section>`;
  if (M.tv) return renderTv();
  const r = M.room, players = M.players, mod = isMod();
  const badge = (mod ? "Modo · " : "Partie ") + M.code;
  if (!inRoom()) {
    return header(true, badge) + errBox() + `<section class="panel">
      <p class="lead">${r.phase === "play" ? "Une partie est en cours. Entre ton prénom : tu joueras à la suivante." : "Entre ton prénom pour t'asseoir à la table."}</p>
      <form class="row" data-form="join-room"><input id="nick" data-draft="nick" type="text" maxlength="18" autocomplete="nickname" enterkeyhint="go" placeholder="Ton prénom ou surnom" aria-label="Ton prénom"><button class="btn primary" type="submit">Rejoindre</button></form>
    </section>${playersPanel(players, false)}
    <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
  }
  const top = errBox() + modoGonePanel();
  if (r.phase === "play") return header(false, badge) + top + playScreen(r, mod);
  if (r.phase === "end") return header(true, badge) + top + endScreen(r, players, mod);
  return header(true, badge) + top + lobbyScreen(r, players, mod);
}
// Without a modo nothing moves: anyone at the table can take over.
function modoGonePanel() {
  if (!modoAway()) return "";
  const h = hostPlayer(), away = awayFor(h), mins = Number.isFinite(away) ? Math.floor(away / 60000) : 0;
  return `<section class="panel alert" role="alert">
    <div class="label">Le modo ne répond plus${mins ? ` depuis ${plural(mins, "minute")}` : ""}</div>
    <p class="lead">${h ? `<b>${esc(h.nick)}</b> a sûrement perdu la connexion.` : "Le modo a quitté la table."} Sans modo, la partie est bloquée : quelqu'un doit prendre la relève.</p>
    <button class="btn primary big" data-act="takeover">Devenir le modo</button>
    <p class="hint">La partie continue là où elle en est.</p>
  </section>`;
}
function lobbyScreen(r, players, mod) {
  const scores = scoresPanel(players.map(p => p.id), r.scores, pInfo);
  if (!mod) {
    return `${invitePanel()}${playersPanel(players, false)}
    <section class="panel"><div class="label">Réglages de la partie</div>${settingsSummary(r, players.length)}</section>
    ${waitMod("Le modo prépare la partie")}
    ${customPanel(false)}
    ${scores}${rulesBox()}
    <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button> · <button class="link" data-act="leave">Quitter la partie</button></p>`;
  }
  const packs = r.packs || [], customs = okCustoms();
  const can = players.length >= 3 && pairPool(packs, customs).length > 0;
  return `${invitePanel()}${playersPanel(players, true)}
  ${settingsPanel({ n: players.length, packs, nUc: r.nUc, white: r.white, oral: r.oral, gages: r.gages, gageLvl: r.gageLvl, groupCount: customs.length,
    acts: { pack: "pack", minus: "uc-minus", plus: "uc-plus", white: "white", oral: "oral", gages: "gages", gageLvl: "gage-lvl" } })}
  ${customPanel(true)}
  <button class="btn primary big" data-act="start" ${can ? "" : "disabled"}>Distribuer les mots</button>
  ${players.length < 3 ? `<p class="hint">Il faut au moins trois joueurs.</p>` : ""}
  ${scores}${rulesBox()}
  <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
}
const cluesFor = round => Object.fromEntries(M.clues.filter(c => c.round === round).map(c => [c.uid, cleanText(c.text, 30)]));
function effStep(r, seq, cl) {
  if (r.step !== "clues") return r.step;
  return !r.oral && seq.length && seq.every(id => cl[id]) ? "vote" : "clues";
}
function votesMap(r, voters, withPending = true) {
  const ids = new Set(voters), vm = {};
  for (const v of M.votes) if (v.round === r.round && v.v === r.voteN && ids.has(v.voter)) vm[v.voter] = v.target;
  const pv = M.pending;
  if (withPending && pv && pv.g === r.gameId && pv.r === r.round && pv.v === r.voteN && ids.has(M.me)) vm[M.me] = pv.t;
  return vm;
}
function turnsList(seq, cl, o) {
  return `<ol class="turns">${seq.map((id, i) => { const p = pInfo(id), cur = id === o.cur;
    const right = o.oral ? (i === 0 ? `<span class="pill">commence</span>` : "") : cl[id] ? `<span class="clue">${esc(cl[id])}</span>` : cur ? `<span class="pill">à son tour</span>` : "";
    return `<li class="${cur ? "cur" : ""}">${av(p)}<span class="nm">${esc(p.nick)}${id === M.me ? " <small>(toi)</small>" : ""}</span>${right}</li>`; }).join("")}</ol>`;
}
function historyPanel(r, open = false) {
  if (r.oral || r.round < 2) return "";
  const out = r.out || [], blocks = [];
  for (let k = r.round - 1; k >= 1; k--) {
    const before = out.filter(o => o.round < k).map(o => o.uid), cl = cluesFor(k);
    const seq = roundOrder(r.order, before, k).filter(id => cl[id]);
    if (seq.length) blocks.push(`<div class="label">Tour ${k}</div><div class="chips">${seq.map(id => chip(pInfo(id), `<span class="said">${esc(cl[id])}</span>`)).join("")}</div>`);
  }
  return blocks.length ? `<details class="panel hist" ${open ? "open" : ""}><summary>Indices des tours précédents</summary>${blocks.join("")}</details>` : "";
}
function castPanel(r, withNotes) {
  const out = r.out || [], marks = withNotes ? notes(r.gameId) : {};
  const alive = r.order.filter(id => !r.outIds.includes(id));
  const item = id => {
    const p = pInfo(id);
    if (!withNotes || id === M.me) return chip(p, "", id === M.me ? "me" : "");
    const m = marks[id] || "";
    return `<button class="chip note ${m}" data-act="note" data-id="${esc(id)}" aria-label="Noter ${esc(p.nick)}">${av(p)}<span class="nm">${esc(p.nick)}</span>${noteTag(m)}</button>`;
  };
  return `<section class="panel"><div class="label">En lice · ${alive.length}</div>
    <div class="chips">${alive.map(item).join("")}</div>
    ${withNotes ? `<p class="hint left">Carnet de soupçons : touche un joueur pour le marquer « suspect », puis « sûr ». Toi seul vois tes notes.</p>` : ""}
    ${out.length ? `<div class="label">Éliminés · ${out.length}</div><div class="chips">${out.map(o => chip(pInfo(o.uid), roleTag(o.role), "dim")).join("")}</div>` : ""}
  </section>`;
}
function revealCard(n, p) {
  const line = n.role === "uc" ? "Bien joué, c'était un Undercover !" : n.role === "white" ? `Mr White a répondu « ${esc(n.guess || "?")} » : raté !` : "Aïe, c'était un civil…";
  return `<section class="panel center reveal r-${esc(n.role)}">${av(p, "xl")}<div class="label">Éliminé</div><div class="name">${esc(p.nick)}</div>${roleTag(n.role)}<p class="lead">${line}</p></section>`;
}
/* The round as a player sees it; with tv, as the big screen shows it (nothing secret, no buttons). */
function playScreen(r, mod, tv = false) {
  const order = r.order || [], outIds = r.outIds || [];
  const inGame = !tv && order.includes(M.me), alive = inGame && !outIds.includes(M.me);
  const seq = roundOrder(order, outIds, r.round), cl = cluesFor(r.round), step = effStep(r, seq, cl);
  const c = r.compo || {}, marks = inGame ? notes(r.gameId) : {};
  let h = `<div class="status"><span class="round">Tour ${r.round}</span><span>${esc(compoText({ civ: c.civ || 0, uc: c.uc || 0, white: c.white || 0 }))}</span></div>`;
  const sec = M.secret && M.secret.gameId === r.gameId ? M.secret : null;
  if (inGame) h += wordCard(sec, { shown: M.wordShown, act: "word", out: !alive });
  else if (!tv) h += `<section class="note">Une partie est en cours. Tu joueras à la prochaine : en attendant, regarde et devine qui ment.</section>`;
  if (inGame && !alive && step !== "white") h += `<p class="hint">Tu es éliminé : tu ne parles plus et tu ne votes plus. Pas un mot sur ton mot !</p>`;

  if (step === "clues") {
    const cur = r.oral ? "" : seq.find(id => !cl[id]);
    h += `<section class="panel"><div class="label">${r.oral ? "Chacun donne un indice à voix haute, dans cet ordre" : "Chacun écrit un indice, à tour de rôle"}</div>${turnsList(seq, cl, { oral: r.oral, cur })}
      ${!tv && !r.oral && cur === M.me ? `<form class="row" data-form="clue"><input id="clue" data-draft="clue" type="text" maxlength="30" autocomplete="off" enterkeyhint="send" placeholder="Ton indice" aria-label="Ton indice"><button class="btn primary" type="submit">Envoyer</button></form>
        <p class="hint left">C'est à toi ! Un mot ou deux, sans dire ton mot.</p>` : ""}
      ${mod ? (r.oral
        ? `<button class="btn primary big" data-act="to-vote">Tout le monde a parlé : on vote</button>`
        : `<button class="link" data-act="to-vote" style="align-self:flex-start">Passer au vote sans attendre</button>`) : ""}
    </section>`;
    if (!mod && !tv && r.oral) h += waitMod("Le modo lancera le vote");
  } else if (step === "vote") {
    const key = `${r.round}.${r.voteN}`, revealed = r.revealed === key;
    const among = r.among?.length ? r.among.filter(id => seq.includes(id)) : seq;
    const vm = votesMap(r, seq), mine = vm[M.me];
    const voted = seq.filter(id => vm[id]);
    const waiting = seq.filter(id => !vm[id] && isOnline(M.players.find(p => p.id === id))), absent = seq.filter(id => !vm[id] && !waiting.includes(id));
    if (!r.oral) h += `<section class="panel"><div class="label">Les indices du tour</div>${turnsList(seq, cl, {})}</section>`;
    if (!revealed) {
      const title = r.among?.length ? `Égalité : revote entre ${names(among.map(pInfo))}` : "Qui est l'imposteur ?";
      if (alive) {
        const opts = among.filter(id => id !== M.me);
        h += `<section class="stack"><div class="label">${esc(title)}</div><div class="grid">${opts.map(id => { const p = pInfo(id);
          return `<button class="tile ${id === mine ? "sel" : ""}" data-act="vote" data-id="${esc(id)}" aria-pressed="${id === mine}">${av(p)}<span class="nm">${esc(p.nick)}</span>${noteTag(marks[id])}</button>`; }).join("")}</div>
          ${mine ? `<p class="hint">Tu peux changer d'avis tant que tout le monde n'a pas voté.</p>` : ""}</section>`;
      } else h += `<section class="panel"><div class="label">${esc(title)}</div><p class="lead">Les survivants votent…</p></section>`;
      h += `<section class="panel">
        <div class="label">${waiting.length ? `On attend · ${waiting.length}` : absent.length ? "Tous les présents ont voté" : "Tout le monde a voté"}</div>
        ${waiting.length ? `<div class="chips">${waiting.map(id => chip(pInfo(id))).join("")}</div>` : ""}
        ${absent.length ? `<div class="label">Absents · ${absent.length}</div><div class="chips">${absent.map(id => chip(pInfo(id))).join("")}</div>` : ""}
        ${voted.length ? `<div class="label">Ont voté · ${voted.length}</div><div class="chips">${voted.map(id => chip(pInfo(id), " ✓", "dim")).join("")}</div>` : ""}
        <p class="hint left">Les votes se révèlent tout seuls dès que tout le monde a voté.</p>
        ${mod ? `<button class="btn" data-act="reveal" ${voted.length ? "" : "disabled"}>Révéler maintenant</button>` : ""}
      </section>`;
    } else {
      const { rows, max, top } = tally(among, vm);
      const total = rows.reduce((s, x) => s + x.voters.length, 0);
      const tp = top.map(pInfo);
      h += `<section class="panel verdict" aria-live="polite">
        <div class="label">${top.length > 1 ? "Égalité !" : top.length ? "Le groupe désigne" : "Aucun vote"}</div>
        <div class="name">${top.length ? esc(names(tp)) : "Personne"}</div>
        ${max ? `<div class="sub">${plural(max, "vote")} sur ${total}</div>` : ""}
      </section>
      <section class="panel"><ul class="res">${rows.map(x => { const p = pInfo(x.id);
        return `<li class="${x.voters.length === max && max ? "win" : ""}">${av(p)}<div class="main">
          <div class="line"><span class="nm">${esc(p.nick)}</span><span class="n">${x.voters.length}</span></div>
          <div class="bar"><i style="width:${total ? Math.round(x.voters.length / total * 100) : 0}%"></i></div>
          ${x.voters.length ? `<div class="chips">${x.voters.map(v => chip(pInfo(v))).join("")}</div>` : ""}
        </div></li>`; }).join("")}</ul></section>`;
      if (mod) {
        if (top.length === 1) h += `<button class="btn primary big" data-act="eliminate" data-id="${esc(top[0])}">Éliminer ${esc(tp[0].nick)}</button>`;
        else h += `${top.length > 1 ? `<button class="btn primary big" data-act="revote" data-ids="${esc(top.join(","))}">Revoter entre ${esc(names(tp))}</button>` : ""}
          <button class="btn big" data-act="next-round">Personne n'est éliminé · tour suivant</button>`;
      } else if (!tv) h += waitMod("Le modo annonce la sentence");
    }
  } else if (step === "white") {
    const w = pInfo(r.whiteUid);
    h += `<section class="panel center reveal">${av(w, "xl")}<div class="label">Éliminé</div><div class="name">${esc(w.nick)}</div>${roleTag("white")}
      <p class="lead">Dernière chance : s'il devine le mot des civils, Mr White gagne la partie.</p></section>`;
    if (!tv && r.whiteUid === M.me) h += M.guess
      ? `<section class="panel center wait"><div class="big dots">Réponse envoyée</div></section>`
      : `<section class="panel"><div class="label">Quel est le mot des civils ?</div>
          <form class="row" data-form="guess"><input id="guess" data-draft="guess" type="text" maxlength="40" autocomplete="off" enterkeyhint="send" placeholder="Ta réponse" aria-label="Ta réponse"><button class="btn primary" type="submit">Valider</button></form>
          <p class="hint left">Une seule réponse. Les accents et les majuscules ne comptent pas.</p></section>`;
    else h += `<section class="panel center wait"><div class="big dots">Mr White réfléchit</div></section>`;
  } else if (step === "out") {
    h += revealCard(r.news || {}, pInfo(r.news?.uid));
    h += mod ? `<button class="btn primary big" data-act="next-round">Tour suivant</button>` : tv ? "" : waitMod("Le tour suivant arrive");
  }
  h += historyPanel(r, tv) + castPanel(r, inGame && alive);
  if (tv) return h;
  if (mod && M.handover) h += `<section class="panel">${handoverBlock()}</section>`;
  h += `<p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button>${mod ? ` · <button class="link" data-act="handover-open">Passer le rôle de modo</button> · <button class="link" data-act="end">Arrêter la partie et révéler les mots</button>` : ""}</p>`;
  return h;
}
function roomTitles(r) {
  const res = r.result || {};
  return computeTitles({ ids: r.order || [], roles: res.roles || {}, out: r.out, winner: res.winner, votes: M.votes, nick: id => pInfo(id).nick });
}
function roomGages(r, tv) {
  const res = r.result || {};
  if (!res.winner) return "";
  const losers = (r.order || []).filter(id => res.roles?.[id] && !isWinner(res.roles[id], res.winner)).map(pInfo);
  return gagesPanel({ on: r.gages, losers, lvl: r.gageLvl, seed: r.gameId, act: "choose",
    choiceOf: uid => M.choices.find(c => c.uid === uid)?.kind, canChoose: uid => !tv && uid === M.me });
}
function endScreen(r, players, mod) {
  const res = r.result || {}, order = r.order || [], titles = roomTitles(r);
  recordGame(r, titles);
  const ids = [...new Set(players.map(p => p.id).concat(order))];
  let h = endPanels(res, order, r.out, pInfo, r.news, titles) + roomGages(r, false) + scoresPanel(ids, r.scores, pInfo) + shareBtn("share-img");
  if (!mod) return h + waitMod("Le modo peut relancer une partie") + playersPanel(players, false) + `<p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button> · <button class="link" data-act="leave">Quitter la partie</button></p>`;
  return h + `<button class="btn primary big" data-act="newgame">Nouvelle partie</button>
    <p class="hint">Les joueurs restent à table et gardent leurs points. Tu pourras changer les réglages.</p>${playersPanel(players, true)}
    <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
}

/* ---------- big screen (TV / laptop): watches the game, never plays, never sees a secret word ---------- */
function renderTv() {
  const r = M.room, players = M.players;
  let h = `<header class="top big"><h1 class="logo">Under<span class="redact">cover</span></h1><span class="badge">Partie ${esc(M.code)}</span></header>`;
  if (r.phase === "lobby") {
    h += `<section class="panel center tvjoin">
      <div class="label">Pour jouer, scanne ou tape le code</div>
      <div class="tvrow"><div class="qr big" data-qr="${esc(inviteLink())}"></div><div><div class="code">${esc(M.code)}</div><p class="lead">${esc(location.host + location.pathname)}</p></div></div>
    </section>
    <section class="panel"><div class="label">À table · ${players.length}</div><div class="chips">${players.map(p => chip(p)).join("")}</div></section>
    <section class="panel">${settingsSummary(r, players.length)}</section>`;
  } else if (r.phase === "play") {
    h += playScreen(r, false, true);
  } else {
    const ids = [...new Set(players.map(p => p.id).concat(r.order || []))];
    h += endPanels(r.result || {}, r.order || [], r.out, pInfo, r.news, roomTitles(r)) + roomGages(r, true) + scoresPanel(ids, r.scores, pInfo);
  }
  return h;
}

/* ---------- screens: one phone passed around ---------- */
function newLocal(prev) {
  const saved = store.json("local-names", []);
  return {
    phase: "setup", players: prev?.players || (Array.isArray(saved) ? saved : []),
    packs: (prev?.packs || [1]).filter(id => id !== GROUP_PACK.id), nUc: prev?.nUc ?? 1, white: !!prev?.white, gages: !!prev?.gages, gageLvl: prev?.gageLvl || 1,
    used: prev?.used || [], scores: prev?.scores || {},
    gid: rid(), roles: {}, civ: "", uc: "", order: [], outIds: [], out: [], round: 1, step: "talk",
    dealIdx: 0, handoff: true, pick: null, news: null, result: null, peek: null, choices: {}
  };
}
function saveLocal() {
  store.set("local", JSON.stringify(M.local));
  if (M.local) store.set("local-names", JSON.stringify(M.local.players));
}
const lp = id => M.local.players.find(p => p.id === id) || { id, nick: "?", color: COLORS[9] };
const lSecret = id => { const L = M.local, role = L.roles[id]; return { white: role === "white", word: role === "uc" ? L.uc : L.civ }; };
const localTitles = L => computeTitles({ ids: L.order, roles: L.roles, out: L.out, winner: L.result?.winner, votes: [], nick: id => lp(id).nick });
function handoff(p, label, act, hint = "Les autres, regardez ailleurs.") {
  return `<section class="panel center hand"><div class="label">${label}</div>${av(p, "xl")}<div class="who">${esc(p.nick)}</div>
    <button class="btn primary big" data-act="${act}">C'est moi</button><p class="hint">${hint}</p></section>`;
}
function renderLocal() {
  const L = M.local, n = L.players.length;
  L.choices = L.choices || {};
  const back = `<button class="link" data-act="go-online">Jouer chacun sur son téléphone</button>`;
  const head = big => header(big, "1 téléphone");
  if (L.phase === "setup") {
    return head(true) + errBox() + `<section class="panel">
      <p class="lead">Un seul téléphone qui passe de main en main pour découvrir son mot. Ensuite, indices à voix haute et vote à main levée.</p>
      <form class="row" data-form="l-name"><input id="l-name" data-draft="l-name" type="text" maxlength="18" autocomplete="off" enterkeyhint="done" placeholder="Prénom d'un joueur" aria-label="Prénom d'un joueur"><button class="btn" type="submit">Ajouter</button></form>
      ${n ? `<div class="chips">${L.players.map(p => chip(p, `<button class="x" data-act="l-del" data-id="${esc(p.id)}" aria-label="Retirer ${esc(p.nick)}">×</button>`)).join("")}</div>` : ""}
    </section>
    ${settingsPanel({ n, packs: L.packs, nUc: L.nUc, white: L.white, gages: L.gages, gageLvl: L.gageLvl, groupCount: null,
      acts: { pack: "l-pack", minus: "l-uc-minus", plus: "l-uc-plus", white: "l-white", gages: "l-gages", gageLvl: "l-gage-lvl" } })}
    <button class="btn primary big" data-act="l-start" ${n >= 3 && L.packs.length ? "" : "disabled"}>Distribuer les mots</button>
    ${n < 3 ? `<p class="hint">Ajoute au moins trois joueurs.</p>` : ""}
    ${scoresPanel(L.players.map(p => p.id), L.scores, lp)}${rulesBox()}
    <p class="foot">${back}</p>`;
  }
  if (L.phase === "end") {
    const res = L.result || {};
    const losers = res.winner ? L.order.filter(id => !isWinner(L.roles[id], res.winner)).map(lp) : [];
    return head(true) + endPanels(res, L.order, L.out, lp, L.news, localTitles(L))
      + gagesPanel({ on: L.gages, losers, lvl: L.gageLvl, seed: L.gid, act: "l-choose", choiceOf: uid => L.choices[uid], canChoose: () => true })
      + scoresPanel(L.players.map(p => p.id), L.scores, lp) + shareBtn("l-share") +
      `<button class="btn primary big" data-act="l-start">Rejouer avec les mêmes</button>
       <button class="btn big" data-act="l-setup">Changer les joueurs ou les réglages</button><p class="foot">${back}</p>`;
  }
  if (L.phase === "deal") {
    const id = L.order[L.dealIdx], p = lp(id);
    return head(false) + (L.handoff
      ? handoff(p, `Mot ${L.dealIdx + 1} sur ${L.order.length} · passe le téléphone à`, "l-see")
      : wordCard(lSecret(id), { shown: true, act: "l-dealt", title: p.nick + ", ton mot", hideLabel: L.dealIdx + 1 < L.order.length ? "J'ai retenu, je cache" : "J'ai retenu, on commence", primaryWhenShown: true }));
  }
  // Someone forgot their word.
  if (L.peek) {
    const pk = L.peek;
    let body;
    if (!pk.id) body = `<section class="stack"><div class="label">Qui a oublié son mot ?</div><div class="grid">${L.order.map(id => { const p = lp(id);
      return `<button class="tile" data-act="l-peek-who" data-id="${esc(id)}">${av(p)}<span class="nm">${esc(p.nick)}</span></button>`; }).join("")}</div></section>`;
    else if (pk.handoff) body = handoff(lp(pk.id), "Passe le téléphone à", "l-peek-see");
    else body = wordCard(lSecret(pk.id), { shown: true, act: "l-peek-close", title: lp(pk.id).nick + ", ton mot", hideLabel: "J'ai retenu, je cache", primaryWhenShown: true });
    return head(false) + body + (pk.handoff || !pk.id ? `<p class="foot"><button class="link" data-act="l-peek-close">Annuler</button></p>` : "");
  }
  const seq = roundOrder(L.order, L.outIds, L.round);
  let h = head(false) + `<div class="status"><span class="round">Tour ${L.round}</span><span>${esc(compoText(Object.values(L.roles).reduce((s, x) => (s[x]++, s), { civ: 0, uc: 0, white: 0 })))}</span></div>`;
  if (L.step === "talk") {
    h += `<section class="panel"><div class="label">Chacun donne un indice à voix haute, dans cet ordre</div>
      <ol class="turns">${seq.map((id, i) => { const p = lp(id); return `<li>${av(p)}<span class="nm">${esc(p.nick)}</span>${i === 0 ? `<span class="pill">commence</span>` : ""}</li>`; }).join("")}</ol>
      <button class="btn primary big" data-act="l-to-pick">Tout le monde a parlé : on vote</button></section>`;
  } else if (L.step === "pick") {
    const pick = L.pick && seq.includes(L.pick) ? lp(L.pick) : null;
    h += `<section class="stack"><div class="label">Votez à main levée. Qui est éliminé ?</div><div class="grid">${seq.map(id => { const p = lp(id);
      return `<button class="tile ${id === L.pick ? "sel" : ""}" data-act="l-pick" data-id="${esc(id)}" aria-pressed="${id === L.pick}">${av(p)}<span class="nm">${esc(p.nick)}</span></button>`; }).join("")}</div></section>
      <button class="btn primary big" data-act="l-eliminate" ${pick ? "" : "disabled"}>${pick ? "Éliminer " + esc(pick.nick) : "Choisis qui éliminer"}</button>
      <button class="btn big" data-act="l-next">Égalité : personne n'est éliminé</button>`;
  } else if (L.step === "white") {
    const w = lp(L.news.uid);
    h += `<section class="panel center reveal">${av(w, "xl")}<div class="label">Éliminé</div><div class="name">${esc(w.nick)}</div>${roleTag("white")}
      <p class="lead">Dernière chance : s'il devine le mot des civils, Mr White gagne.</p></section>`;
    h += L.handoff ? handoff(w, "Passe le téléphone à", "l-white-see", "Qu'il écrive sa réponse en secret.")
      : `<section class="panel"><div class="label">${esc(w.nick)}, quel est le mot des civils ?</div>
          <form class="row" data-form="l-guess"><input id="l-guess" data-draft="l-guess" type="text" maxlength="40" autocomplete="off" enterkeyhint="send" placeholder="Ta réponse" aria-label="Ta réponse"><button class="btn primary" type="submit">Valider</button></form></section>`;
  } else if (L.step === "out") {
    h += revealCard(L.news, lp(L.news.uid)) + `<button class="btn primary big" data-act="l-next">Tour suivant</button>`;
  }
  if (L.out.length) h += `<section class="panel"><div class="label">Éliminés · ${L.out.length}</div><div class="chips">${L.out.map(o => chip(lp(o.uid), roleTag(o.role), "dim")).join("")}</div></section>`;
  h += `<p class="foot"><button class="link" data-act="l-peek">Quelqu'un a oublié son mot ?</button> · <button class="link" data-act="l-end">Arrêter la partie</button></p>`;
  return h;
}
function localFinish(winner, news) {
  const L = M.local;
  L.result = { winner: winner || "", civ: L.civ, uc: L.uc, roles: L.roles };
  if (winner) L.scores = addScores(L.scores, L.roles, winner);
  L.news = news || null; L.phase = "end"; L.choices = {};
}

/* ---------- share the result as an image ---------- */
async function shareImage(o) {
  const res = o.res || {};
  const rows = o.ids.map(id => ({ p: o.pick(id), pts: o.scores?.[id] || 0, role: res.roles?.[id], t: o.titles[id] })).sort((a, b) => b.pts - a.pts);
  try { await Promise.all([document.fonts.load("60px 'Dela Gothic One'"), document.fonts.load("800 30px Onest"), document.fonts.load("500 26px Onest"), document.fonts.load("40px 'Special Elite'")]); } catch {}
  const shown = rows.slice(0, 8), W = 1080, H = 560 + shown.length * 150;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const INK = "#17181C", CARD = "#FFFAEE", RED = "#C42E26", GROUND = "#E2C88E", INK2 = "#5A4A26";
  const box = (x, y, w, h, r, fill) => { g.fillStyle = fill; g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); g.fill(); g.stroke(); };
  g.fillStyle = GROUND; g.fillRect(0, 0, W, H);
  g.font = "92px 'Dela Gothic One', 'Arial Black', sans-serif"; g.fillStyle = INK; g.fillText("Under", 70, 150);
  const x0 = 70 + g.measureText("Under").width + 10, cw = g.measureText("cover").width;
  g.save(); g.translate(x0, 150); g.rotate(-0.035); g.fillStyle = INK; g.fillRect(-10, -82, cw + 20, 104); g.fillStyle = GROUND; g.fillText("cover", 0, 0); g.restore();
  const [title] = WIN_TEXT[res.winner || ""] || WIN_TEXT[""];
  g.fillStyle = RED; g.font = "52px 'Dela Gothic One', 'Arial Black', sans-serif"; g.fillText(title, 72, 250);
  g.fillStyle = INK2; g.font = "800 28px Onest, Arial, sans-serif";
  g.fillText(`${new Date().toLocaleDateString("fr-FR")} · LES MOTS SECRETS`, 72, 315);
  g.fillStyle = INK; g.font = "46px 'Special Elite', 'Courier New', monospace";
  g.fillText(`${res.civ || "?"}${Object.values(res.roles || {}).includes("uc") ? `  ≈  ${res.uc || "?"}` : ""}`.slice(0, 38), 72, 372);
  shown.forEach((s, i) => {
    const y = 420 + i * 150, ink = i === 0 ? CARD : INK;
    box(60, y, W - 120, 128, 26, i === 0 ? RED : CARD);
    g.fillStyle = ink; g.font = "52px 'Dela Gothic One', 'Arial Black', sans-serif"; g.fillText(String(i + 1), 95, y + 84);
    g.fillStyle = safeColor(s.p.color); g.beginPath(); g.arc(215, y + 64, 40, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = "38px 'Dela Gothic One', 'Arial Black', sans-serif"; g.textAlign = "center";
    g.fillText((s.p.nick || "?").charAt(0).toUpperCase(), 215, y + 78); g.textAlign = "left";
    g.fillStyle = ink; g.font = "800 40px Onest, Arial, sans-serif"; g.fillText(s.p.nick, 285, y + 58);
    g.font = "500 28px Onest, Arial, sans-serif";
    g.fillText(`${s.role ? ROLES[s.role] + " · " : ""}${s.t ? s.t.title : ""}`.slice(0, 44), 285, y + 100);
    g.textAlign = "right"; g.font = "44px 'Dela Gothic One', 'Arial Black', sans-serif"; g.fillText(`${s.pts} pt${s.pts > 1 ? "s" : ""}`, W - 95, y + 82); g.textAlign = "left";
  });
  g.fillStyle = INK2; g.font = "500 26px Onest, Arial, sans-serif"; g.fillText(location.host || "Undercover", 72, H - 50);
  const blob = await new Promise(ok => c.toBlob(ok, "image/png"));
  const file = new File([blob], "undercover-resultat.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Undercover · le résultat" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  flash("Image du résultat téléchargée.");
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
let lastHtml = "";
function render() {
  document.body.classList.toggle("tv", M.mode === "room" && M.tv);
  let html;
  if (M.mode === "local" && M.local) html = renderLocal();
  else if (M.mode === "room") html = renderRoom();
  else if (M.mode === "home") html = renderHome();
  else if (M.mode === "setup") html = renderSetup();
  else if (M.mode === "fatal") html = renderFatal();
  else html = header(true) + `<section class="panel center loading">Ouverture du dossier…</section>`;
  if (html !== lastHtml) {
    const a = document.activeElement, fid = a && a.id, ss = a && a.selectionStart, se = a && a.selectionEnd;
    const openDetails = [...app.querySelectorAll("details[open] > summary")].map(s => s.textContent);
    app.innerHTML = html;
    lastHtml = html;
    app.querySelectorAll("details > summary").forEach(s => { if (openDetails.includes(s.textContent)) s.parentElement.open = true; });
    app.querySelectorAll("[data-draft]").forEach(i => { i.value = M.drafts[i.dataset.draft] || ""; });
    if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(ss, se); } catch {} } }
    fillQR();
  }
  const playing = (M.mode === "room" && M.room?.phase === "play" && (inRoom() || M.tv)) || (M.mode === "local" && ["deal", "play"].includes(M.local?.phase));
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
// Leaving the page hides the word; coming back re-announces this player at once.
document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") M.wordShown = false; else heartbeat(); render(); });
window.addEventListener("online", () => heartbeat());
let flashT = null, wordT = null;
function flash(msg) { M.flash = msg; render(); clearTimeout(flashT); flashT = setTimeout(() => { M.flash = ""; render(); }, 2500); }
const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

/* ---------- actions ---------- */
async function write(fn, denied = "Action refusée.") {
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
  const nick = cleanText(Soiree.pseudo() || M.drafts.nick, 18);
  if (!nick) { M.err = "Entre d'abord ton prénom."; render(); document.getElementById("nick")?.focus(); return ""; }
  store.set("nick", nick);
  return nick;
};
const modOnly = fn => d => { if (isMod()) fn(d); };
const togglePack = (packs, id) => { const on = packs.includes(id), next = on ? packs.filter(x => x !== id) : packs.concat(id).sort((a, b) => a - b); return next.length ? next : packs; };
const copy = (text, msg) => navigator.clipboard?.writeText(text).then(() => flash(msg), () => flash(text)) ?? flash(text);
const ACT = {
  "create": () => {
    const nick = needNick(); if (!nick) return;
    write(async () => {
      let code = genCode();
      for (let i = 0; i < 6 && (await F.getDoc(rRoom(code))).exists(); i++) code = genCode();
      await F.setDoc(rRoom(code), { ...freshRoom(), hostUid: M.me, createdAt: Date.now(), touchedAt: F.serverTimestamp() });
      lastHb = Date.now();
      await F.setDoc(rPlayer(code, M.me), { nick, color: Soiree.color() || COLORS[0], joinedAt: Date.now(), mod: true, seen: F.serverTimestamp() });
      rememberHosted(code);
      enterRoom(code);
    });
  },
  "exit": () => exitRoom(),
  "rejoin": d => { M.drafts.code = normCode(d.code); FORM["join-code"](); },
  "takeover": () => {
    if (!modoAway() || M.busy) return;
    M.busy = true; M.err = "";
    (async () => {
      try {
        // Only the moderator field changes, so the rules can check the moderator is really gone.
        await F.updateDoc(rRoom(M.code), { hostUid: M.me });
        await F.updateDoc(rPlayer(M.code, M.me), { mod: true, seen: F.serverTimestamp() });
        flash("Tu es le modo. À toi de faire avancer la partie !");
      } catch (e) {
        M.err = e && e.code === "permission-denied" ? "Le modo vient de donner signe de vie, ou quelqu'un a déjà repris la partie." : "Ça n'a pas marché. Réessaie.";
      }
      M.busy = false; render();
    })();
  },
  "handover-open": () => { M.handover = true; render(); },
  "handover-cancel": () => { M.handover = false; render(); },
  "handover": modOnly(d => {
    const p = M.players.find(x => x.id === d.id); if (!p) return;
    M.handover = false;
    write(async () => { await patchRoom({ hostUid: d.id }); flash(`${p.nick} est le nouveau modo.`); });
  }),
  "leave": () => { const code = M.code; write(async () => { await F.deleteDoc(rPlayer(code, M.me)); exitRoom(); }); },
  "share": () => { navigator.share({ title: "Undercover", text: `Rejoins la partie ${M.code} !`, url: inviteLink() }).catch(() => {}); },
  "copy": () => copy(inviteLink(), "Lien d'invitation copié."),
  "copy-tv": () => copy(tvLink(), "Lien grand écran copié."),
  "toggle-qr": () => { M.showQR = !M.showQR; render(); },
  "word": () => {
    M.wordShown = !M.wordShown; clearTimeout(wordT);
    if (M.wordShown) wordT = setTimeout(() => { M.wordShown = false; render(); }, WORD_SHOW_MS);
    render();
  },
  "note": d => { const r = M.room; if (r) { cycleNote(r.gameId, d.id); render(); } },
  "pack": modOnly(d => write(() => patchRoom({ packs: togglePack(M.room.packs || [], +d.id) }))),
  "uc-minus": modOnly(() => { const r = M.room; write(() => patchRoom({ nUc: Math.max(0, compo(Math.max(M.players.length, 3), r.nUc, r.white).uc - 1) })); }),
  "uc-plus": modOnly(() => { const r = M.room, n = Math.max(M.players.length, 3); write(() => patchRoom({ nUc: compo(n, compo(n, r.nUc, r.white).uc + 1, r.white).uc })); }),
  "white": modOnly(() => write(() => patchRoom({ white: !M.room.white }))),
  "oral": modOnly(d => write(() => patchRoom({ oral: d.v === "1" }))),
  "gages": modOnly(() => write(() => patchRoom({ gages: !M.room.gages }))),
  "gage-lvl": modOnly(d => write(() => patchRoom({ gageLvl: Math.min(4, Math.max(1, +d.id || 1)) }))),
  "approve-custom": modOnly(d => write(() => F.updateDoc(rCustom(M.code, d.id), { ok: true }))),
  "del-custom": d => write(() => F.deleteDoc(rCustom(M.code, d.id))),
  "start": modOnly(() => {
    const r = M.room, ids = M.players.map(p => p.id), c = compo(ids.length, r.nUc, r.white);
    if (!c.ok) return;
    const pair = pickPair(r.packs || [1], r.used || [], okCustoms());
    if (!pair) return;
    const { roles, order } = dealRoles(ids, c), gameId = rid();
    const cast = Object.fromEntries(M.players.map(p => [p.id, { nick: p.nick, color: safeColor(p.color) }]));
    M.pending = null; M.handover = false;
    write(async () => {
      const b = F.writeBatch(DB);
      b.set(rDeal(M.code), { gameId, roles, civ: pair.civ, uc: pair.uc });
      for (const id of ids) b.set(rSecret(M.code, id), { gameId, white: roles[id] === "white", word: roles[id] === "white" ? "" : roles[id] === "uc" ? pair.uc : pair.civ });
      b.update(rRoom(M.code), { ...freshGame(), gameId, phase: "play", order, cast, round: 1, compo: { civ: c.civ, uc: c.uc, white: c.white }, used: pair.used, touchedAt: F.serverTimestamp() });
      await b.commit();
      scrollTop();
    });
  }),
  "vote": d => {
    const r = M.room; if (!r || r.phase !== "play" || r.revealed === `${r.round}.${r.voteN}` || d.id === M.me) return;
    const g = r.gameId, round = r.round, v = r.voteN;
    M.pending = { g, r: round, v, t: d.id }; render();
    write(() => F.setDoc(rVote(M.code, `${g}_${round}_${v}_${M.me}`), { gameId: g, round, v, voter: M.me, target: d.id, at: Date.now() }),
      "Trop tard, les votes sont déjà révélés.");
  },
  "choose": d => {
    const r = M.room; if (!r || d.uid !== M.me || r.phase !== "end") return;
    write(() => F.setDoc(rChoice(M.code, `${r.gameId}_${M.me}`), { gameId: r.gameId, uid: M.me, kind: d.id }), "Ce choix n'est plus possible.");
  },
  "to-vote": modOnly(() => write(() => patchRoom({ step: "vote" }))),
  "reveal": modOnly(() => { const r = M.room; write(() => patchRoom({ revealed: `${r.round}.${r.voteN}` })); }),
  "revote": modOnly(d => { const r = M.room; M.pending = null; write(() => patchRoom({ step: "vote", voteN: r.voteN + 1, among: String(d.ids).split(","), revealed: "" })); }),
  "eliminate": modOnly(d => {
    const r = M.room, deal = M.deal, id = d.id;
    if (!r || r.phase !== "play" || !r.order.includes(id) || r.outIds.includes(id)) return;
    if (!deal || deal.gameId !== r.gameId) { M.err = "Les rôles ne sont pas encore chargés. Réessaie dans une seconde."; render(); return; }
    const role = deal.roles[id] || "civ";
    const outIds = r.outIds.concat(id), out = (r.out || []).concat({ uid: id, role, round: r.round }), news = { uid: id, role, round: r.round };
    write(async () => {
      if (role === "white") await patchRoom({ outIds, out, step: "white", whiteUid: id, news });
      else {
        const v = verdictAfter(r.order, outIds, deal.roles);
        await (v ? finishGame(r, v, news, { outIds, out }) : patchRoom({ outIds, out, step: "out", news }));
      }
      scrollTop();
    });
  }),
  "next-round": modOnly(() => {
    const r = M.room; M.pending = null;
    write(async () => { await patchRoom({ round: r.round + 1, step: "clues", voteN: 1, among: [], revealed: "", whiteUid: "" }); scrollTop(); });
  }),
  "end": modOnly(() => { if (confirm("Arrêter la partie et révéler les mots de tout le monde ?")) write(() => finishGame(M.room, "", null)); }),
  "newgame": modOnly(() => {
    const old = M.room?.gameId, code = M.code;
    M.pending = null;
    write(async () => {
      await patchRoom(freshGame());
      if (!old) return;
      try {
        for (const col of [cClues, cVotes, cChoices]) {
          const q = await F.getDocs(F.query(col(code), F.where("gameId", "==", old)));
          for (const d of q.docs) await F.deleteDoc(d.ref);
        }
        await F.deleteDoc(rGuess(code, old));
      } catch {}
    });
  }),
  "kick": modOnly(d => { if (M.room?.phase !== "play") write(() => F.deleteDoc(rPlayer(M.code, d.id))); }),
  "rename-open": () => {
    M.renaming = true; M.drafts.rename = M.players.find(p => p.id === M.me)?.nick || "";
    render();
    const i = document.getElementById("rename"); if (i) { i.focus(); i.select(); }
  },
  "rename-cancel": () => { M.renaming = false; render(); },
  "install": async () => { const e = M.installEvt; M.installEvt = null; render(); if (e) { e.prompt(); try { await e.userChoice; } catch {} } },
  "share-img": () => {
    const r = M.room; if (!r) return;
    const ids = [...new Set(M.players.map(p => p.id).concat(r.order || []))];
    shareImage({ ids, pick: pInfo, scores: r.scores, res: r.result, titles: roomTitles(r) }).catch(() => flash("Impossible de créer l'image."));
  },
  "go-local": () => { M.mode = "local"; if (!M.local) M.local = newLocal(); M.err = ""; saveLocal(); render(); },
  "go-online": () => { M.err = ""; if (M.code) M.mode = "room"; else M.mode = F && M.me ? "home" : (isPlaceholder() ? "setup" : "fatal"); render(); },
  "reload": () => location.reload(),

  /* one phone */
  "l-del": d => { M.local.players = M.local.players.filter(p => p.id !== d.id); saveLocal(); render(); },
  "l-pack": d => { M.local.packs = togglePack(M.local.packs, +d.id); saveLocal(); render(); },
  "l-uc-minus": () => { const L = M.local; L.nUc = Math.max(0, compo(Math.max(L.players.length, 3), L.nUc, L.white).uc - 1); saveLocal(); render(); },
  "l-uc-plus": () => { const L = M.local, n = Math.max(L.players.length, 3); L.nUc = compo(n, compo(n, L.nUc, L.white).uc + 1, L.white).uc; saveLocal(); render(); },
  "l-white": () => { M.local.white = !M.local.white; saveLocal(); render(); },
  "l-gages": () => { M.local.gages = !M.local.gages; saveLocal(); render(); },
  "l-gage-lvl": d => { M.local.gageLvl = Math.min(4, Math.max(1, +d.id || 1)); saveLocal(); render(); },
  "l-start": () => {
    const L = M.local, ids = L.players.map(p => p.id), c = compo(ids.length, L.nUc, L.white);
    const pair = c.ok && pickPair(L.packs, L.used);
    if (!pair) return;
    const { roles, order } = dealRoles(ids, c);
    Object.assign(L, { phase: "deal", gid: rid(), roles, order, civ: pair.civ, uc: pair.uc, used: pair.used, outIds: [], out: [], round: 1, step: "talk", dealIdx: 0, handoff: true, pick: null, news: null, result: null, peek: null, choices: {} });
    saveLocal(); render(); scrollTop();
  },
  "l-setup": () => { M.local.phase = "setup"; saveLocal(); render(); },
  "l-see": () => { M.local.handoff = false; saveLocal(); render(); },
  "l-dealt": () => {
    const L = M.local;
    if (L.dealIdx + 1 < L.order.length) Object.assign(L, { dealIdx: L.dealIdx + 1, handoff: true });
    else Object.assign(L, { phase: "play", step: "talk" });
    saveLocal(); render(); scrollTop();
  },
  "l-to-pick": () => { Object.assign(M.local, { step: "pick", pick: null }); saveLocal(); render(); },
  "l-pick": d => { M.local.pick = d.id; saveLocal(); render(); },
  "l-eliminate": () => {
    const L = M.local, id = L.pick;
    if (!id || L.outIds.includes(id)) return;
    const role = L.roles[id];
    L.outIds.push(id); L.out.push({ uid: id, role, round: L.round });
    L.news = { uid: id, role }; L.pick = null;
    if (role === "white") Object.assign(L, { step: "white", handoff: true });
    else { const v = verdictAfter(L.order, L.outIds, L.roles); if (v) localFinish(v, L.news); else L.step = "out"; }
    saveLocal(); render(); scrollTop();
  },
  "l-white-see": () => { M.local.handoff = false; saveLocal(); render(); },
  "l-next": () => { Object.assign(M.local, { round: M.local.round + 1, step: "talk", pick: null }); saveLocal(); render(); scrollTop(); },
  "l-peek": () => { M.local.peek = { id: null, handoff: true }; saveLocal(); render(); scrollTop(); },
  "l-peek-who": d => { M.local.peek = { id: d.id, handoff: true }; saveLocal(); render(); },
  "l-peek-see": () => { M.local.peek.handoff = false; saveLocal(); render(); },
  "l-peek-close": () => { M.local.peek = null; saveLocal(); render(); },
  "l-choose": d => { M.local.choices[d.uid] = d.id; saveLocal(); render(); },
  "l-share": () => { const L = M.local; shareImage({ ids: L.order, pick: lp, scores: L.scores, res: L.result, titles: localTitles(L) }).catch(() => flash("Impossible de créer l'image.")); },
  "l-end": () => { if (confirm("Arrêter la partie et révéler les mots ?")) { localFinish("", null); saveLocal(); render(); scrollTop(); } }
};
const FORM = {
  "join-code": () => {
    const nick = needNick(); if (!nick) return;
    const code = normCode(M.drafts.code);
    if (code.length !== 4) { M.err = "Le code fait 4 caractères."; render(); return; }
    write(async () => {
      const s = await F.getDoc(rRoom(code));
      if (!s.exists()) { M.err = `Aucune partie avec le code ${code}.`; if (store.get("last") === code) store.set("last", null); return; }
      await joinRoom(code, nick, s.data().hostUid);
      enterRoom(code);
    });
  },
  "join-room": () => { const nick = needNick(); if (nick) write(() => joinRoom(M.code, nick, M.room?.hostUid)); },
  "rename": () => {
    const nick = cleanText(M.drafts.rename, 18);
    if (!nick) return;
    M.renaming = false; store.set("nick", nick); M.drafts.nick = nick;
    write(() => F.updateDoc(rPlayer(M.code, M.me), { nick, mod: isMod() }));
  },
  "custom": () => {
    const a = cleanText(M.drafts.ca, 30), b = cleanText(M.drafts.cb, 30);
    if (!a || !b) { M.err = "Il faut deux mots, un dans chaque case."; render(); return; }
    if (sameWord(a, b)) { M.err = "Les deux mots doivent être différents."; render(); return; }
    M.drafts.ca = ""; M.drafts.cb = "";
    write(() => F.addDoc(cCustom(M.code), { a, b, by: M.me, at: Date.now(), ok: isMod() }), "Impossible d'ajouter cette paire.");
    setTimeout(() => document.getElementById("ca")?.focus(), 0);
  },
  "clue": () => {
    const r = M.room, text = cleanText(M.drafts.clue, 30);
    if (!text || !r || r.phase !== "play") return;
    if (M.secret?.word && sameWord(text, M.secret.word)) { M.err = "C'est ton mot ! Trouve un indice."; render(); return; }
    const g = r.gameId, round = r.round;
    M.drafts.clue = "";
    write(() => F.setDoc(rClue(M.code, `${g}_${round}_${M.me}`), { gameId: g, round, uid: M.me, text, at: Date.now() }));
  },
  "guess": () => {
    const r = M.room, text = cleanText(M.drafts.guess, 40);
    if (!text || !r || r.step !== "white" || r.whiteUid !== M.me) return;
    M.drafts.guess = "";
    write(() => F.setDoc(rGuess(M.code, r.gameId), { uid: M.me, text, at: Date.now() }));
  },
  "l-name": () => {
    const nick = cleanText(M.drafts["l-name"], 18);
    if (!nick) return;
    const L = M.local, used = new Set(L.players.map(p => p.color));
    L.players.push({ id: rid(), nick, color: COLORS.find(c => !used.has(c)) || COLORS[L.players.length % COLORS.length] });
    M.drafts["l-name"] = ""; saveLocal(); render();
  },
  "l-guess": () => {
    const L = M.local, text = cleanText(M.drafts["l-guess"], 40);
    if (!text || L.step !== "white") return;
    M.drafts["l-guess"] = "";
    const ok = sameWord(text, L.civ);
    L.news = { ...L.news, guess: text, ok };
    const v = ok ? "white" : verdictAfter(L.order, L.outIds, L.roles);
    if (v) localFinish(v, L.news); else L.step = "out";
    saveLocal(); render(); scrollTop();
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
document.addEventListener("input", e => {
  const ds = e.target.dataset || {};
  if (ds.draft) M.drafts[ds.draft] = ds.draft === "code" ? (e.target.value = normCode(e.target.value)) : e.target.value;
});
window.addEventListener("hashchange", () => {
  const c = hashCode();
  if (!c || M.mode === "local") return;
  if (hashIsTv() && F && M.me) { if (!(M.code === c && M.tv)) enterRoom(c, true); return; }
  if (c !== M.code) { M.drafts.code = c; if (M.code) exitRoom(); else render(); }
});
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); M.installEvt = e; render(); });
if ("serviceWorker" in navigator && !window.UC_FB) navigator.serviceWorker.register("sw.js").catch(() => {});

/* ---------- boot ---------- */
const isPlaceholder = () => !firebaseConfig.apiKey || /COLLE/.test(firebaseConfig.apiKey);
async function boot() {
  if (await Soiree.replayBoot(M, render)) return;
  const l = store.json("local", null);
  if (l && l.players) M.local = l;
  if (isPlaceholder()) { M.mode = "setup"; render(); return; }
  render();
  try { await loadFirebase(); }
  catch { M.mode = "fatal"; M.fatal = "Impossible de charger le jeu en ligne. Vérifie ta connexion internet."; render(); return; }
  try {
    // Keep the account a player signed into on the home page; otherwise play anonymously.
    await AUTH.authStateReady();
    const u = AUTH.currentUser || (await F.signInAnonymously(AUTH)).user;
    M.me = u.uid;
    await Soiree.start().catch(() => null);
    if (Soiree.pseudo()) M.drafts.nick = Soiree.pseudo();
    await Soiree.syncStats(store).catch(() => {});  // stats follow the account across devices
  }
  catch (e) {
    M.mode = "fatal";
    M.fatal = e && (e.code === "auth/operation-not-allowed" || e.code === "auth/admin-restricted-operation")
      ? "La connexion anonyme n'est pas activée dans Firebase (Authentication › Sign-in method › Anonyme)."
      : "Connexion impossible (" + (e?.code || "réseau") + ").";
    render(); return;
  }
  setTimeout(() => cleanupOldRooms().catch(() => {}), 8000);
  // Sent here by the group: join the host's room straight away, under the account name.
  const auto = Soiree.autoJoinCode();
  if (auto && auto === hashCode()) {
    try {
      const r = await F.getDoc(rRoom(auto));
      if (r.exists()) { await joinRoom(auto, Soiree.pseudo(), r.data().hostUid); enterRoom(auto); return; }
    } catch {}
  }
  const target = hashCode() || store.get("room");
  // A big-screen link opens straight on the game, without joining it.
  if (target && hashIsTv()) { enterRoom(target, true); return; }
  // Back to the table after a reload, or straight in when the link carries a code you already joined.
  if (target) {
    try {
      const [r, p] = await Promise.all([F.getDoc(rRoom(target)), F.getDoc(rPlayer(target, M.me))]);
      if (r.exists() && p.exists()) { enterRoom(target); return; }
      if (!r.exists()) { store.set("room", null); if (hashCode()) M.err = `Aucune partie avec le code ${target}.`; }
    } catch {}
  }
  M.mode = "home"; render();
}
/* ---------- replay journal ----------
   What happened, in words, rebuilt from the game's own history when a game is saved.
   "@id" marks a player: the replay shows their name in their colour. A `board` is the score line after that moment. */
Soiree.setJournal(() => {
  const r = M.room;
  if (!r?.gameId || !(r.order || []).length) return null;
  const order = r.order, res = r.result || {}, roles = res.roles || {}, outs = r.out || [];
  const players = Object.fromEntries(order.map(id => { const p = pInfo(id); return [id, { nick: p.nick, color: p.color }]; }));
  const outRole = Object.fromEntries(outs.map(o => [o.uid, o.role])), alive = new Set(order);
  const board = () => Object.fromEntries(order.map(id => [id, alive.has(id) ? "en jeu" : "éliminé · " + (ROLES[outRole[id]] || "?")]));
  const who = role => role === "white" ? "Mr White" : role === "uc" ? "l'Undercover" : "un civil";
  const events = [{ text: `${plural(order.length, "joueur")} : chacun a reçu un mot secret.`, board: board() }];
  const rounds = Math.max(r.round || 0, 0, ...outs.map(o => o.round || 0));
  for (let n = 1; n <= rounds; n++) {
    const clues = M.clues.filter(c => c.round === n).sort((a, b) => (a.at || 0) - (b.at || 0));
    const votes = M.votes.filter(v => v.round === n), gone = outs.filter(o => o.round === n);
    if (!clues.length && !votes.length && !gone.length) continue;
    events.push({ head: `Tour ${n}`, text: clues.length ? "Les indices :" : r.oral ? "Indices donnés à voix haute." : "" });
    for (const c of clues) events.push({ text: `@${c.uid} : « ${c.text} »` });
    if (votes.length) {
      const lastVote = Math.max(...votes.map(v => v.v || 1)), count = {};
      votes.filter(v => (v.v || 1) === lastVote).forEach(v => { count[v.target] = (count[v.target] || 0) + 1; });
      events.push({ text: "Vote : " + Object.entries(count).sort((a, b) => b[1] - a[1]).map(([id, k]) => `@${id} (${k})`).join(", ") + "." });
    }
    for (const o of gone) {
      alive.delete(o.uid);
      events.push({ text: `@${o.uid} est éliminé : c'était ${who(o.role)}.`, tone: o.role === "civ" ? "lose" : "win", board: board() });
    }
  }
  if (r.news?.guess) events.push({ text: `Mr White propose « ${r.news.guess} » : ${r.news.ok ? "c'est le mot des civils !" : "raté."}` });
  if (res.civ) events.push({ head: "Les mots", text: `Civils : « ${res.civ} »${res.uc ? ` · Undercover : « ${res.uc} »` : ""}` });
  const [title, sub] = WIN_TEXT[res.winner || ""] || WIN_TEXT[""];
  events.push({ text: `${title}. ${sub}`, tone: "win" });
  return { players, events, final: { title, rows: order.map(id => ({ who: id, text: `${ROLES[roles[id]] || "?"}${isWinner(roles[id], res.winner) ? " · gagnant" : ""}` })) } };
});

// Shared layer (account button, own name, group, end-of-game save bar): after every render.
{ const draw = render; render = () => { draw(); Soiree.frame(M); }; }
boot();
