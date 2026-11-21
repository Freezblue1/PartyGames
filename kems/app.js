import { firebaseConfig } from "./config.js";
import * as Soiree from "../soiree.js";
import { GAGES } from "./gages.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const ROOT = "kmRooms";
const TARGETS = [4, 8, 0];
/* Seconds without a swap before four new cards come to the middle (0: only when everyone passes). */
const AUTOS = [8, 15, 0];
const GAGE_LEVELS = ["Soft", "Épicé", "Hot", "Extrême"];
const MIN_SOLO = 2, MIN_TEAM = 4, MAX_PLAYERS = 10, MAX_SHORT = 6, SIPS = 2;
const LOOK_MS = 5000, ARM_MS = 2500, PENDING_MS = 6000;
const COLORS = ["#D93A26","#2F62D0","#18825A","#7C47CC","#B86400","#C2307C","#0F7C8F","#5E5C17","#8C3B1F","#3D4A63"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const K = "kms";
const ROOM_MAX_IDLE_MS = 24 * 3600 * 1000;
const LETTERS = "KEMS";
/* Secret signs the app can draw for a team: small, quiet, and doable while holding a phone. */
const SIGNS = [
  "Se gratter le nez", "Cligner de l'œil", "Se toucher le lobe de l'oreille", "Hausser deux fois les sourcils",
  "Se passer la main dans les cheveux", "Tirer un tout petit bout de langue", "Se mordre la lèvre", "Se tenir le menton",
  "Faire la moue", "Se frotter l'œil", "Tapoter deux fois la table", "Croiser les bras", "Soupirer un grand coup",
  "Siffloter", "Toussoter", "Se gratter la tête", "Gonfler les joues", "Se masser la nuque", "Remonter ses manches",
  "Faire craquer ses doigts", "Sourire en coin", "Plisser les yeux", "Lever le petit doigt", "Se pincer le nez",
  "Se frotter les mains", "Regarder le plafond", "Hocher la tête lentement", "Se toucher l'épaule"
];

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rid = () => Math.random().toString(36).slice(2, 10);
const rand = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const safeColor = c => COLORS.includes(c) ? c : COLORS[0];
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
const hashInt = s => { let h = 5381; for (const c of String(s)) h = (h * 33 + c.codePointAt(0)) >>> 0; return h; };
const tsMs = ts => ts && ts.toMillis ? ts.toMillis() : (typeof ts === "number" ? ts : 0);
const topOf = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])[0];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const clone = o => JSON.parse(JSON.stringify(o));
const secs = ms => Math.max(1, Math.round(ms / 1000));
const lettersOf = n => Array.from({ length: n }, (_, i) => LETTERS[i % 4]).join("");
const targetName = t => t ? lettersOf(t).replace(/(.{4})(?=.)/g, "$1 ") : "Sans fin";

/* ---------- the cards ----------
   A card is a number from 0 to 51: its rank is c % 13 (0 is the 2, 12 the ace), its suit c / 13 (♠ ♥ ♦ ♣). */
const RANKS = ["2","3","4","5","6","7","8","9","10","V","D","R","A"];
// The text selector keeps phones from drawing the hearts and diamonds as emoji.
const SUITS = ["♠︎","♥︎","♦︎","♣︎"];
const SUIT_NAMES = ["pique","cœur","carreau","trèfle"];
const R_ONE = ["2","3","4","5","6","7","8","9","10","valet","dame","roi","as"];
const R_PL = ["2","3","4","5","6","7","8","9","10","valets","dames","rois","as"];
const rk = c => c % 13, st = c => Math.floor(c / 13);
const isRed = c => st(c) === 1 || st(c) === 2;
const cardName = c => `${R_ONE[rk(c)]} de ${SUIT_NAMES[st(c)]}`;
const C = (r, s) => s * 13 + r;
/* The short deck keeps the 7 up to the ace: 32 cards, so a four of a kind comes quicker. */
const newDeck = short => shuffle(Array.from({ length: 52 }, (_, i) => i).filter(c => !short || rk(c) >= 5));
const isQuad = h => Array.isArray(h) && h.length === 4 && h.every(c => rk(c) === rk(h[0]));
const deR = r => (r === 12 ? "d'" : "de ") + R_PL[r];
const byRank = h => h.slice().sort((a, b) => rk(a) - rk(b) || st(a) - st(b));

/* ---------- teams ----------
   teamOf maps each player to a team number; pts holds each team's letters. Alone, every player is a team of one. */
const members = (S, t) => (S.order || []).filter(id => S.teamOf?.[id] === t);
const teamCount = S => (S.pts || []).length;
const partnerOf = (S, id) => S.solo ? "" : members(S, S.teamOf?.[id]).find(x => x !== id) || "";
const opponentsOf = (S, id) => (S.order || []).filter(x => S.teamOf?.[x] !== S.teamOf?.[id]);
const teamName = (S, t, info) => names(members(S, t).map(info));
const vb = (S, t, one, many) => members(S, t).length > 1 ? many : one;
/* The lobby's seating: pairs of two in this order (the modo can shuffle and swap); newcomers go to the end. */
function lobbyOrder(r, players) {
  const here = players.map(p => p.id).slice(0, MAX_PLAYERS);
  const seq = (r.pairs || []).filter(id => here.includes(id));
  for (const id of here) if (!seq.includes(id)) seq.push(id);
  return seq;
}
function startProblem(r, players) {
  const n = Math.min(players.length, MAX_PLAYERS);
  if (r.solo) return n < MIN_SOLO ? `Il faut au moins ${MIN_SOLO} joueurs.` : "";
  if (n < MIN_TEAM) return `En équipes, il faut au moins ${MIN_TEAM} joueurs (ou passe en « Chacun pour soi »).`;
  if (n % 2) return "En équipes de 2, il faut un nombre pair de joueurs (ou passe en « Chacun pour soi »).";
  return "";
}
/* The winning team, or -1 on a tie at the top. */
function leader(S) {
  const p = S.pts || [], max = Math.max(...p);
  return p.length && p.filter(x => x === max).length === 1 ? p.indexOf(max) : -1;
}
const isOver = S => !!S.target && (S.pts || []).some(p => p >= S.target);
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
  secret: null, deal: null, signs: null, moves: [], customs: [], choices: [], rounds: [],
  selHand: null, selMid: null, pending: null, arm: "", armAt: 0, claimed: "", fresh: null, pickSwap: "",
  gkind: "dare", renaming: false, handover: false, showQR: false, err: "", flash: "", busy: false, fatal: "",
  offline: false, offlineSince: 0, installEvt: null,
  drafts: { nick: store.get("nick") || "", code: hashCode() }
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
  if (Soiree.replaying) return;  // a replay never writes
  if (M.mode !== "room" || !M.code || !inRoom()) return;
  lastHb = Date.now();
  F.updateDoc(rPlayer(M.code, M.me), { seen: F.serverTimestamp() }).catch(() => {});
}
setInterval(heartbeat, HEARTBEAT_MS);
/* Four ticks a second keep the countdowns moving and let the moderator's page run the automatic steps. */
setInterval(() => {
  if (M.mode !== "room") return;
  if (M.pending && Date.now() - M.pending.at > PENDING_MS) M.pending = null;
  if (M.arm === "kems" && Date.now() - M.armAt > ARM_MS) M.arm = "";
  render();
  if (isMod()) hostSync();
}, 250);

/* ---------- Firebase ---------- */
let F = null, DB = null, AUTH = null;
async function loadFirebase() {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")
  ]);
  const fbApp = appMod.getApps()[0] || appMod.initializeApp(firebaseConfig);
  AUTH = authMod.getAuth(fbApp);
  DB = fsMod.getFirestore(fbApp);
  F = { ...fsMod, signInAnonymously: authMod.signInAnonymously };
}
const rRoom = c => F.doc(DB, ROOT, c);
const rPlayer = (c, id) => F.doc(DB, ROOT, c, "players", id);
const cPlayers = c => F.collection(DB, ROOT, c, "players");
const rSecret = (c, id) => F.doc(DB, ROOT, c, "secret", id);
const rDeal = c => F.doc(DB, ROOT, c, "deal", "current");
const rSigns = c => F.doc(DB, ROOT, c, "deal", "signs");
const rMove = (c, id) => F.doc(DB, ROOT, c, "moves", id);
const cMoves = c => F.collection(DB, ROOT, c, "moves");
const rRound = (c, id) => F.doc(DB, ROOT, c, "rounds", id);
const cRounds = c => F.collection(DB, ROOT, c, "rounds");
const cCustom = c => F.collection(DB, ROOT, c, "custom");
const rCustom = (c, id) => F.doc(DB, ROOT, c, "custom", id);
const cChoices = c => F.collection(DB, ROOT, c, "choices");
const rChoice = (c, id) => F.doc(DB, ROOT, c, "choices", id);

let subs = [], gameSubs = [], hostSubs = [], hostKey = "", unCustom = null, customKey = "";
const off = list => { list.forEach(u => u()); list.length = 0; };
function leaveSubs() {
  off(subs); off(gameSubs); off(hostSubs);
  hostKey = "";
  if (unCustom) unCustom();
  unCustom = null; customKey = "";
}
function onErr(e) {
  M.err = e && e.code === "permission-denied" ? "Accès refusé à cette partie." : "Connexion à la partie perdue. Recharge la page.";
  render();
}
/* The rounds already played (kept out of the room document so it stays small) and the end-of-game choices. */
function subGame() {
  off(gameSubs);
  M.choices = []; M.rounds = [];
  const g = M.room?.gameId;
  if (!g) return;
  gameSubs.push(F.onSnapshot(F.query(cChoices(M.code), F.where("gameId", "==", g)), s => { M.choices = s.docs.map(d => d.data()); render(); }, () => {}));
  gameSubs.push(F.onSnapshot(F.query(cRounds(M.code), F.where("gameId", "==", g)), s => { M.rounds = s.docs.map(d => d.data()).sort((a, b) => a.n - b.n); render(); }, () => {}));
}
/* Only the moderator reads the deck and the signs, and runs everyone's swaps; the listeners follow whoever is modo now. */
const doneMoves = new Set();
function subHost() {
  const key = isMod() && M.room ? M.room.gameId : "";
  if (key === hostKey) return;
  off(hostSubs);
  hostKey = key; M.deal = null; M.signs = null; M.moves = [];
  doneMoves.clear();
  if (!key) return;
  hostSubs.push(F.onSnapshot(rDeal(M.code), s => { M.deal = s.exists() ? s.data() : null; hostSync(); }, () => {}));
  hostSubs.push(F.onSnapshot(rSigns(M.code), s => { M.signs = s.exists() ? s.data() : null; }, () => {}));
  hostSubs.push(F.onSnapshot(F.query(cMoves(M.code), F.where("gameId", "==", key)), s => {
    M.moves = s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    hostSync();
  }, () => {}));
}
/* House gages stay a surprise: each player reads their own, the moderator reads them all. */
function subCustom() {
  const key = M.tv ? "" : isMod() ? "all" : inRoom() ? "mine" : "";
  if (key === customKey) return;
  if (unCustom) unCustom();
  unCustom = null; customKey = key; M.customs = [];
  if (!key) return;
  const q = key === "all" ? cCustom(M.code) : F.query(cCustom(M.code), F.where("by", "==", M.me));
  unCustom = F.onSnapshot(q, s => {
    M.customs = s.docs.map(d => { const x = d.data(); return { id: d.id, kind: x.kind === "truth" ? "truth" : "dare", text: String(x.text || "").slice(0, 140), by: x.by || "", at: x.at || 0, ok: !!x.ok }; })
      .filter(c => c.text).sort((a, b) => a.at - b.at);
    render();
  }, () => { M.customs = []; render(); });
}
const clearHand = () => Object.assign(M, { selHand: null, selMid: null, pending: null, arm: "" });
let lastStep = "";
function enterRoom(code, tv = false) {
  Soiree.roomEntered(code, tv);
  leaveSubs();
  Object.assign(M, { mode: "room", tv, code, room: null, roomReady: false, players: [], playersReady: false,
    secret: null, deal: null, signs: null, moves: [], customs: [], choices: [], rounds: [], renaming: false, handover: false, offline: false, pickSwap: "" });
  clearHand();
  lastStep = "";
  if (!tv) store.set("room", code);
  try { history.replaceState(null, "", "#" + code + (tv ? "-tv" : "")); } catch {}
  subs.push(F.onSnapshot(rRoom(code), { includeMetadataChanges: true }, s => {
    if (!s.exists()) {
      if (s.metadata.fromCache) return;
      M.err = "Cette partie n'existe plus."; exitRoom(); return;
    }
    if (s.metadata.fromCache && !M.offline) M.offlineSince = Date.now();
    M.offline = s.metadata.fromCache;
    const prev = M.room?.gameId;
    M.room = s.data({ serverTimestamps: "estimate" }); M.roomReady = true;
    const r = M.room, step = `${r.gameId}.${r.round}.${r.phase}.${r.step}`;
    if (r.gameId !== prev) subGame();
    if (step !== lastStep) {
      // A new step of the round: forget what was half-picked, and buzz when the swapping starts or the round ends.
      if (lastStep) {
        if (r.phase === "play" && r.step !== "swap") clearHand();
        if (r.phase === "play" && (r.step === "swap" || r.step === "done") && inRoom()) { try { navigator.vibrate?.(r.step === "swap" ? 120 : [80, 60, 80]); } catch {} }
        M.err = "";
      }
      lastStep = step;
    }
    if (M.selMid != null && !(r.mid || []).includes(M.selMid)) M.selMid = null;
    subHost(); subCustom();
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
    subCustom();
    if (inRoom() && Date.now() - lastHb > HEARTBEAT_MS) heartbeat();
    if (isMod()) hostSync();
    render();
  }, onErr));
  if (!tv) subs.push(F.onSnapshot(rSecret(code, M.me), s => {
    const x = s.exists() ? s.data() : null;
    M.secret = x;
    const p = M.pending;
    // The moderator has handled my swap: it went through, or someone took the card first.
    if (p && x && (x.mv === p.id || x.round !== p.round || x.gameId !== p.gameId)) {
      M.pending = null;
      if (x.mv === p.id && !x.ok) flash("Trop tard ! Quelqu'un a pris cette carte avant toi.");
      if (x.mv === p.id && x.ok) { M.fresh = p.take; setTimeout(() => { if (M.fresh === p.take) { M.fresh = null; render(); } }, 1400); }
    }
    render();
  }, () => {}));
  render();
}
function exitRoom() {
  leaveSubs();
  Object.assign(M, { mode: "home", tv: false, code: null, room: null, players: [], secret: null, deal: null, signs: null, moves: [],
    customs: [], choices: [], rounds: [], handover: false });
  clearHand();
  store.set("room", null);
  try { history.replaceState(null, "", location.pathname + location.search); } catch {}
  render();
}
async function joinRoom(code, nick) {
  const ps = await F.getDocs(cPlayers(code));
  lastHb = Date.now();
  if (ps.docs.some(d => d.id === M.me)) { await F.updateDoc(rPlayer(code, M.me), { nick, seen: F.serverTimestamp() }); return; }
  const used = new Set(ps.docs.map(d => d.data().color));
  const fav = Soiree.color();
  const color = fav && !used.has(fav) ? fav : COLORS.find(c => !used.has(c)) || COLORS[ps.size % COLORS.length];
  await F.setDoc(rPlayer(code, M.me), { nick, color, joinedAt: Date.now(), seen: F.serverTimestamp() });
}
const freshGame = () => ({
  gameId: rid(), phase: "lobby", round: 0, seq: 0, step: "look", order: [], cast: {}, teamOf: {}, pts: [],
  mid: [], mseq: 0, midV: 0, midAt: null, lookAt: null, goAt: null, deckLeft: 0, res: null, house: [], shortDeck: false
});
const freshRoom = () => ({
  ...freshGame(), solo: false, pairs: [], signs: true, target: 4, auto: 8, deck32: false,
  gages: false, gageLvl: 1, maison: true, approve: false, apero: false
});
/* Every change of the room also stamps it, which tells the cleanup when a room was last used. */
const patchRoom = p => F.updateDoc(rRoom(M.code), { ...p, touchedAt: F.serverTimestamp() });
/* House gages the moderator accepted (or all of them, when approval is off). */
const usableCustoms = (r = M.room) => M.customs.filter(c => !r?.approve || c.ok || c.by === r.hostUid);

/* ---------- the round, as everyone sees it ---------- */
const myCards = r => M.secret && M.secret.gameId === r.gameId && M.secret.round === r.round && Array.isArray(M.secret.cards) ? M.secret.cards : null;
const lookLeft = r => r && r.step === "look" && r.lookAt ? Math.max(0, Math.ceil((tsMs(r.lookAt) + LOOK_MS - serverNow()) / 1000)) : null;
function autoLeft(r) {
  if (!r || !r.auto || r.phase !== "play" || r.step !== "swap" || !r.midAt) return null;
  return Math.max(0, Math.ceil((tsMs(r.midAt) + r.auto * 1000 - serverNow()) / 1000));
}
/* Players still there who said « Rien pour moi » since the middle last changed. */
function passCount(r) {
  const act = (r.order || []).filter(idOnline);
  return { n: act.filter(id => M.players.find(p => p.id === id)?.pass === r.mseq).length, of: act.length };
}
/* My hand and the middle as I should see them: a swap I just sent shows at once, before the moderator's page confirms it. */
function viewHand(r) {
  const cards = myCards(r);
  if (!cards) return null;
  const p = M.pending, h = cards.slice();
  if (p && h.includes(p.give)) h[h.indexOf(p.give)] = p.take;
  return byRank(h);
}
function viewMid(r) {
  const mid = (r.mid || []).slice(), p = M.pending;
  if (p && mid.includes(p.take)) mid[mid.indexOf(p.take)] = p.give;
  return mid;
}

/* ---------- moderator's page: the deck, everyone's swaps and the calls ----------
   deal/current, which only the moderator can read, holds every hand, the middle, the deck and the discards.
   Each player's four cards are copied to secret/{uid}. A player never writes the table: they drop a move
   (a swap, a Kems or a Contre) in moves/, and this page applies them all in the order the server received them. */
const signFor = (S, id, list) => list ? list[S.teamOf[id]] || "" : "";
const curSigns = S => M.signs && M.signs.gameId === S.gameId ? M.signs.list : null;
const secretDoc = (S, D, id, list, mv = "", ok = true) => ({ gameId: S.gameId, round: D.round, cards: D.hands[id], mv, ok, sign: signFor(S, id, list) });
async function launchRound(S, extra = {}, signs = null) {
  const deck = newDeck(S.shortDeck), ids = S.order, round = (S.round || 0) + 1, n = 4 * ids.length;
  const hands = Object.fromEntries(ids.map((id, i) => [id, deck.slice(4 * i, 4 * i + 4)]));
  const D = { gameId: S.gameId, round, hands, mid: deck.slice(n, n + 4), deck: deck.slice(n + 4), discard: [], sw: {}, renews: 0 };
  const list = signs || curSigns(S);
  const b = F.writeBatch(DB);
  b.update(rRoom(M.code), { ...extra, ...pick(S, ["order", "cast", "teamOf", "pts", "shortDeck"]), round, step: "look",
    lookAt: F.serverTimestamp(), goAt: null, mid: [], mseq: 0, midV: 0, midAt: null, deckLeft: D.deck.length, res: null,
    seq: (S.seq || 0) + 1, touchedAt: F.serverTimestamp() });
  b.set(rDeal(M.code), D);
  if (signs) b.set(rSigns(M.code), { gameId: S.gameId, list: signs });
  for (const id of ids) b.set(rSecret(M.code, id), secretDoc(S, D, id, list));
  await b.commit();
}
function startGame(r) {
  const ids = lobbyOrder(r, M.players), solo = !!r.solo;
  const teamOf = Object.fromEntries(ids.map((id, i) => [id, solo ? i : Math.floor(i / 2)]));
  const nT = solo ? ids.length : ids.length / 2;
  const cast = Object.fromEntries(ids.map(id => { const p = pInfo(id); return [id, { nick: p.nick, color: p.color || COLORS[0] }]; }));
  // The accepted house gages are copied into the game, so every phone draws the same gage at the end.
  const house = r.gages && r.maison ? usableCustoms(r).map(c => ({ kind: c.kind, text: c.text })) : [];
  const signs = !solo && r.signs ? shuffle(SIGNS).slice(0, nT) : null;
  const S = { gameId: r.gameId, seq: r.seq || 0, order: ids, cast, teamOf, pts: Array(nT).fill(0), round: 0, solo,
    shortDeck: !!r.deck32 && ids.length <= MAX_SHORT };
  return launchRound(S, { house, phase: "play" }, signs);
}
function nextRound(r) {
  if (isOver(r)) return patchRoom({ phase: "end" });
  return launchRound(clone(pick(r, ["gameId", "seq", "order", "cast", "teamOf", "pts", "round", "shortDeck", "solo"])));
}
/* After the few seconds to look at your cards, the middle turns over and everyone can swap. */
function goSwap(r, d) {
  return patchRoom({ step: "swap", mid: d.mid, mseq: (r.mseq || 0) + 1, midAt: F.serverTimestamp(), goAt: F.serverTimestamp(), seq: r.seq + 1 });
}
/* Nobody wants the middle: it goes to the discards and four new cards come out. An empty deck is the discards, shuffled. */
function renew(r, d) {
  const D = clone(d);
  D.discard.push(...D.mid);
  if (D.deck.length < 4) { D.deck = D.deck.concat(shuffle(D.discard)); D.discard = []; }
  D.mid = D.deck.slice(0, 4); D.deck = D.deck.slice(4); D.renews = (D.renews || 0) + 1;
  const b = F.writeBatch(DB);
  b.set(rDeal(M.code), D);
  b.update(rRoom(M.code), { mid: D.mid, mseq: (r.mseq || 0) + 1, midV: (r.midV || 0) + 1, midAt: F.serverTimestamp(), deckLeft: D.deck.length, seq: r.seq + 1, touchedAt: F.serverTimestamp() });
  return b.commit();
}
/* A Kems names your partner (alone: yourself), a Contre names an opponent. Right if that player holds four of a kind.
   Right: your team takes a letter. Wrong: with two teams the other one takes it; with more, your team loses one. */
function judge(S, d, m) {
  const target = m.kind === "kems" ? (S.solo ? m.uid : partnerOf(S, m.uid)) : m.target;
  if (!target || !S.order.includes(target)) return null;
  if (m.kind === "contre" && S.teamOf[target] === S.teamOf[m.uid]) return null;
  const ok = isQuad(d.hands[target]), mine = S.teamOf[m.uid], nT = teamCount(S);
  const all = Array.from({ length: nT }, (_, t) => t);
  const res = { kind: m.kind, by: m.uid, target, ok, win: -1, drop: -1, lose: [], q: ok ? rk(d.hands[target][0]) : -1 };
  if (ok) { res.win = mine; res.lose = m.kind === "contre" ? [S.teamOf[target]] : all.filter(t => t !== mine); }
  else { res.lose = [mine]; if (nT === 2) res.win = 1 - mine; else res.drop = mine; }
  return res;
}
async function applyMoves(r, d0, queue) {
  const d = clone(d0), b = F.writeBatch(DB), acks = new Map();
  let res = null, swaps = 0;
  for (const m of queue) {
    b.delete(rMove(M.code, m.id)); doneMoves.add(m.id);
    if (res || m.gameId !== r.gameId || m.round !== r.round || !r.order.includes(m.uid)) continue;
    if (m.kind === "swap") {
      if (r.step !== "swap") continue;
      const hand = d.hands[m.uid], ti = d.mid.indexOf(m.take), gi = hand ? hand.indexOf(m.give) : -1;
      const ok = ti >= 0 && gi >= 0;
      if (ok) { d.mid[ti] = m.give; hand[gi] = m.take; d.sw[m.uid] = (d.sw[m.uid] || 0) + 1; swaps++; }
      acks.set(m.uid, { mv: m.id, ok });
    } else if (m.kind === "kems" || m.kind === "contre") res = judge(r, d, m);
  }
  const upd = { seq: r.seq + 1, touchedAt: F.serverTimestamp() };
  if (swaps) Object.assign(upd, { mid: d.mid, mseq: (r.mseq || 0) + swaps, midAt: F.serverTimestamp() });
  if (res) {
    const pts = r.pts.slice(), lost = res.drop >= 0 && pts[res.drop] > 0;
    if (res.win >= 0) pts[res.win]++;
    if (lost) pts[res.drop]--;
    const quads = r.order.filter(id => isQuad(d.hands[id]));
    const dur = r.goAt ? Math.max(0, serverNow() - tsMs(r.goAt)) : 0;
    res.lost = lost;
    Object.assign(res, { n: r.round, pts, hands: d.hands, quads, dur });
    Object.assign(upd, { step: "done", res, pts, mid: d.mid, doneAt: F.serverTimestamp() });
    b.set(rRound(M.code, `${r.gameId}_${r.round}`), { gameId: r.gameId, n: r.round, kind: res.kind, by: res.by, target: res.target, ok: res.ok,
      win: res.win, drop: lost ? res.drop : -1, lose: res.lose, dur, sw: d.sw, q: quads, renews: d.renews || 0 });
  }
  b.update(rRoom(M.code), upd);
  if (swaps || res) b.set(rDeal(M.code), d);
  const list = curSigns(r);
  for (const [uid, a] of acks) b.set(rSecret(M.code, uid), secretDoc(r, d, uid, list, a.mv, a.ok));
  await b.commit();
}
/* Moves wait in the order the server stamped them. */
const queued = () => M.moves.filter(m => !doneMoves.has(m.id)).sort((a, b) => tsMs(a.ts) - tsMs(b.ts) || (a.id < b.id ? -1 : 1));
function allPassed(r) {
  const c = passCount(r);
  return c.of > 0 && c.n === c.of;
}
function hostJob(r, d) {
  if (r.step === "done" || !d || d.gameId !== r.gameId || d.round !== r.round) return null;
  if (r.step === "look" && lookLeft(r) === 0) return { name: "go", run: () => goSwap(r, d) };
  const q = queued();
  if (q.length) return { name: "moves:" + q.map(m => m.id).join(","), run: () => applyMoves(r, d, q) };
  if (r.step === "swap" && (allPassed(r) || autoLeft(r) === 0)) return { name: "renew", run: () => renew(r, d) };
  return null;
}
let hostBusy = false, jobDone = "";
async function hostSync() {
  if (Soiree.replaying) return;  // a replay never writes
  const r = M.room;
  if (!isMod() || hostBusy || !r || r.phase !== "play") return;
  const job = hostJob(r, M.deal);
  if (!job) return;
  const key = `${r.gameId}|${r.seq}|${job.name}`;
  if (key === jobDone) return;
  hostBusy = true;
  try { await job.run(); jobDone = key; } catch {}
  hostBusy = false;
}

/* ---------- cleanup: rooms this phone created, unused for a day, are deleted ---------- */
function rememberHosted(code) {
  const list = store.json("hosted", []);
  if (!list.includes(code)) { list.push(code); store.set("hosted", JSON.stringify(list.slice(-30))); }
}
async function deleteRoom(code, r) {
  const col = name => F.collection(DB, ROOT, code, name);
  const players = (await F.getDocs(col("players"))).docs;
  // Hands can't be listed (each is private), so they go by the uids we know.
  for (const id of new Set([...players.map(d => d.id), ...(r.order || [])])) await F.deleteDoc(rSecret(code, id)).catch(() => {});
  await F.deleteDoc(rDeal(code)).catch(() => {});
  await F.deleteDoc(rSigns(code)).catch(() => {});
  for (const name of ["moves", "rounds", "custom", "choices"]) for (const d of (await F.getDocs(col(name))).docs) await F.deleteDoc(d.ref);
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

/* ---------- what each player did, for the titles, the leaderboard and the profile ---------- */
function playerStats(S, hist) {
  const X = Object.fromEntries((S.order || []).map(id => [id, { id, rounds: 0, sw: 0, kOk: 0, kKo: 0, cOk: 0, cKo: 0,
    caught: 0, sent: 0, quads: 0, missed: 0, fast: Infinity }]));
  for (const h of hist) {
    for (const id of S.order || []) { X[id].rounds++; X[id].sw += h.sw?.[id] || 0; }
    const by = X[h.by], tg = X[h.target];
    if (by && h.kind === "kems") { if (h.ok) { by.kOk++; if (h.dur > 0) by.fast = Math.min(by.fast, h.dur); } else by.kKo++; }
    if (by && h.kind === "contre") h.ok ? by.cOk++ : by.cKo++;
    if (tg && h.ok && h.kind === "contre") tg.caught++;
    if (tg && h.ok && h.kind === "kems" && h.target !== h.by) tg.sent++;
    // A four of a kind nobody called for you: the sign was missed.
    for (const id of h.q || []) { const x = X[id]; if (!x) continue; x.quads++; if (S.teamOf?.[id] !== h.win) x.missed++; }
  }
  return X;
}
/* Players by their team's letters, then by what they brought to it. */
function ranking(S, hist) {
  const X = playerStats(S, hist), pts = S.pts || [];
  const own = id => (X[id]?.kOk || 0) + (X[id]?.cOk || 0) - (X[id]?.kKo || 0) - (X[id]?.cKo || 0) + (X[id]?.sent || 0);
  return [...(S.order || [])].sort((a, b) => (pts[S.teamOf[b]] || 0) - (pts[S.teamOf[a]] || 0) || S.teamOf[a] - S.teamOf[b] || own(b) - own(a));
}
/* The gage goes to the team with the fewest letters (nobody, when everyone is level). */
function losersOf(S) {
  const p = S.pts || [];
  if (p.length < 2) return [];
  const min = Math.min(...p), max = Math.max(...p);
  return min < max ? (S.order || []).filter(id => p[S.teamOf[id]] === min) : [];
}

/* ---------- profile, kept on this phone ---------- */
function profile() {
  return { color: null, games: 0, wins: 0, kems: 0, contres: 0, titles: {}, recorded: [], ...store.json("profile", {}) };
}
function saveProfile(p) { store.set("profile", JSON.stringify(p)); }
function recordGame(S, hist, titles) {
  const p = profile();
  if (!S.gameId || p.recorded.includes(S.gameId) || !(S.order || []).includes(M.me) || !hist.length) return;
  const s = playerStats(S, hist)[M.me];
  p.games++;
  if (leader(S) === S.teamOf[M.me]) p.wins++;
  p.kems += s.kOk; p.contres += s.cOk;
  const t = titles[M.me];
  if (t) p.titles[t.title] = (p.titles[t.title] || 0) + 1;
  p.recorded = [...p.recorded, S.gameId].slice(-50);
  saveProfile(p);
}

/* ---------- end-of-game titles ---------- */
const TITLE_RULES = [
  { label: "Éclair", w: 9, score: s => s.fast < 12000 ? 12 - s.fast / 1000 : 0, why: s => `un Kems en ${secs(s.fast)} s` },
  { label: "Œil de lynx", w: 6, score: s => s.cOk, why: s => `${plural(s.cOk, "contre")} ${s.cOk > 1 ? "gagnés" : "gagné"}` },
  { label: "Télépathe", w: 4, team: true, score: s => s.kOk >= 2 ? s.kOk : 0, why: s => `${s.kOk} Kems annoncés juste` },
  { label: "Collectionneur", w: 4, solo: true, score: s => s.kOk >= 2 ? s.kOk : 0, why: s => `${s.kOk} carrés annoncés` },
  { label: "Le Mime", w: 4, team: true, score: s => s.sent >= 2 ? s.sent : 0, why: s => `${s.sent} signes reçus 5 sur 5` },
  { label: "Grillé", w: 5, score: s => s.caught, why: s => `démasqué ${s.caught} fois` },
  { label: "Signal brouillé", w: 3, team: true, score: s => s.missed >= 2 ? s.missed : 0, why: s => `${s.missed} carrés que personne n'a vus` },
  { label: "Parano", w: 3, score: s => s.cKo >= 2 ? s.cKo : 0, why: s => `${s.cKo} contres dans le vide` },
  { label: "Mytho", w: 3, score: s => s.kKo >= 2 ? s.kKo : 0, why: s => `${s.kKo} Kems dans le vide` },
  { label: "Mains de fée", w: 1, score: s => s.rounds >= 2 && s.sw / s.rounds >= 5 ? s.sw / s.rounds : 0, why: s => `${Math.round(s.sw / s.rounds)} échanges par manche` },
  { label: "Le Sphinx", w: 1.5, score: s => s.rounds >= 3 && s.sw / s.rounds <= 1.5 ? 3 - s.sw / s.rounds : 0, why: () => "presque jamais un échange" }
];
function computeTitles(S, hist) {
  const X = playerStats(S, hist), cands = [];
  for (const s of Object.values(X)) for (const rule of TITLE_RULES) {
    if ((rule.team && S.solo) || (rule.solo && !S.solo)) continue;
    const sc = rule.score(s);
    if (sc > 0) cands.push({ uid: s.id, title: rule.label, why: rule.why(s), score: sc * rule.w });
  }
  cands.sort((a, b) => b.score - a.score);
  const out = {}, used = new Set();
  for (const c of cands) if (!out[c.uid] && !used.has(c.title)) { out[c.uid] = c; used.add(c.title); }
  for (const id of S.order || []) if (!out[id]) out[id] = { title: "Visage de marbre", why: "impassible du début à la fin" };
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
  return `<header class="top ${big ? "big" : ""}"><h1 class="logo">Kems</h1>${badge ? `<span class="badge">${esc(badge)}</span>` : ""}</header>`;
}
function errBox() {
  return (M.err ? `<div class="err" role="alert">${esc(M.err)}</div>` : "") + (M.flash ? `<div class="note" role="status">${esc(M.flash)}</div>` : "");
}
/* A card, always cream so it reads the same in both themes; a missing card is shown face down. */
function card(c, cls = "", i = 0) {
  if (c == null || c < 0) return `<span class="card back ${cls}" style="--i:${i}" role="img" aria-label="carte cachée"></span>`;
  return `<span class="card ${isRed(c) ? "red" : ""} ${cls}" style="--i:${i}" role="img" aria-label="${cardName(c)}"><b>${RANKS[rk(c)]}</b><i>${SUITS[st(c)]}</i></span>`;
}
function sw(on, act, title, sub) {
  return `<button class="switch" data-act="${act}" aria-pressed="${!!on}"><span class="knob"></span><span><b>${title}</b><br><small>${sub}</small></span></button>`;
}
const togs = (list, cur, act, label) => `<div class="toggles">${list.map(v => `<button class="tog" data-act="${act}" data-id="${v}" aria-pressed="${cur === v}">${label(v)}</button>`).join("")}</div>`;
const autoName = v => v ? `${v} s sans échange` : "Quand tous passent";
/* The letters a team has written: K E M S, the ones still to win drawn empty. */
function kemsBoxes(n, target) {
  const len = target || Math.max(4, Math.ceil((n + 1) / 4) * 4);
  return `<span class="kl" aria-label="${n} ${n > 1 ? "lettres" : "lettre"}">${Array.from({ length: len }, (_, i) => `<i class="${i < n ? "on" : ""}">${LETTERS[i % 4]}</i>`).join("")}</span>`;
}
function settingsPanel(r) {
  return `<section class="panel">
    <div class="label">Façon de jouer</div>
    ${togs(["team", "solo"], r.solo ? "solo" : "team", "solo", v => v === "solo" ? "Chacun pour soi" : "Équipes de 2")}
    <p class="hint left">${r.solo ? "Pas de signe : tu annonces toi-même ton carré. Dès 2 joueurs, même en nombre impair."
      : "La vraie règle : un signe secret entre partenaires. 4 joueurs ou plus, en nombre pair."}</p>
    ${r.solo ? "" : sw(r.signs, "signs", "Signes tirés au sort", "Chaque équipe reçoit un signe secret, affiché sur ses deux téléphones seulement. Sinon, mettez-vous d'accord entre vous.")}
    <div class="label">Pour gagner</div>
    ${togs(TARGETS, r.target ?? 4, "target", v => v ? targetName(v) : "Sans fin")}
    <p class="hint left">${r.target ? `Chaque manche gagnée écrit une lettre. La première équipe qui écrit ${targetName(r.target)} gagne la partie.` : "On joue jusqu'à ce que le modo arrête : la meilleure équipe gagne."}</p>
    <div class="label">Nouvelles cartes au milieu</div>
    ${togs(AUTOS, r.auto ?? 8, "auto", autoName)}
    <p class="hint left">Dans tous les cas, quand tout le monde appuie sur « Rien pour moi », 4 nouvelles cartes arrivent.</p>
    ${sw(r.deck32, "deck32", "Jeu de 32 cartes", `Du 7 à l'as : les carrés tombent plus vite. Jusqu'à ${MAX_SHORT} joueurs (au-delà, on joue avec 52 cartes).`)}
  </section>
  <section class="panel">
    <div class="label">Options</div>
    ${sw(r.gages, "gages", "Gages et vérités", "À la fin, l'équipe qui a le moins de lettres choisit entre un gage et une vérité.")}
    ${r.gages ? `${togs([1, 2, 3, 4], r.gageLvl || 1, "gage-lvl", v => GAGE_LEVELS[v - 1])}
      <p class="hint left">Chaque niveau pioche aussi dans les plus doux. Ce qui touche quelqu'un d'autre se fait avec son accord.</p>
      ${sw(r.maison, "maison", "Gages maison", "Vos propres gages et vérités : ils ont une chance sur deux de sortir.")}
      ${r.maison ? sw(r.approve, "approve", "Valider les gages des joueurs", "Les gages proposés par les autres attendent ton accord.") : ""}` : ""}
    ${sw(r.apero, "apero", "Mode apéro", `L'équipe qui perd la manche boit ${SIPS} gorgées.`)}
  </section>`;
}
function settingsSummary(r) {
  const tags = [r.solo ? "Chacun pour soi" : "Équipes de 2", ...(!r.solo && r.signs ? ["Signes tirés au sort"] : []),
    r.target ? `Premier à ${targetName(r.target)}` : "Sans fin", "Nouvelles cartes : " + autoName(r.auto ?? 8).toLowerCase(),
    ...(r.deck32 ? ["32 cartes"] : []), ...(r.gages ? [`Gages ${GAGE_LEVELS[(r.gageLvl || 1) - 1]}`] : []),
    ...(r.gages && r.maison ? ["Gages maison"] : []), ...(r.apero ? ["Mode apéro"] : [])];
  return `<div class="summary">${tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>`;
}
/* The pairs in the lobby. The modo touches two players to swap them. */
function teamsPanel(r, players, editable) {
  const seq = lobbyOrder(r, players), pairs = [];
  for (let i = 0; i < seq.length; i += 2) pairs.push(seq.slice(i, i + 2));
  const who = id => {
    const p = pInfo(id);
    return editable ? `<button class="chip pick ${M.pickSwap === id ? "on" : ""} ${id === M.me ? "me" : ""}" data-act="team-pick" data-id="${esc(id)}">${av(p)}<span class="nm">${esc(p.nick)}</span></button>`
      : chip(p, "", id === M.me ? "me" : "");
  };
  return `<section class="panel">
    <div class="label">Les équipes</div>
    ${pairs.length ? `<ol class="pairs">${pairs.map((pr, i) => `<li><span class="pn">${i + 1}</span><span class="pm">${pr.map(who).join(`<span class="amp">&amp;</span>`)}${pr.length < 2 ? `<span class="hint">attend un partenaire</span>` : ""}</span></li>`).join("")}</ol>` : ""}
    ${editable ? `<button class="btn" data-act="team-shuffle">Mélanger les équipes</button>
      <p class="hint left">${M.pickSwap ? "Touche le joueur avec qui l'échanger." : "Touche deux joueurs pour les échanger."} Les partenaires s'assoient face à face.</p>`
      : `<p class="hint left">Assieds-toi en face de ton partenaire.</p>`}
  </section>`;
}
/* o: { form, delAct, canDel, pending, approveAct, empty } */
function customBlock(list, o) {
  const dare = M.gkind === "dare";
  return `<section class="panel">
    <div class="label">Gages maison</div>
    <div class="toggles">${[["dare", "Un gage"], ["truth", "Une vérité"]].map(([k, n]) => `<button class="tog" data-act="gkind" data-id="${k}" aria-pressed="${M.gkind === k}">${n}</button>`).join("")}</div>
    <form class="row" data-form="${o.form}"><input id="${o.form}" data-draft="${o.form}" type="text" maxlength="140" autocomplete="off" enterkeyhint="done"
      placeholder="${dare ? "Fais ton signe secret devant tout le monde, en le faisant passer pour une danse." : "Quel signe secret tu as déjà raté en vrai ?"}" aria-label="${dare ? "Nouveau gage" : "Nouvelle vérité"}"><button class="btn" type="submit">Ajouter</button></form>
    ${list.length ? `<ul class="customs">${list.map(c => {
      const waiting = o.pending && o.pending(c);
      return `<li class="${waiting ? "wait-ok" : ""}"><span><small class="tagline">${c.kind === "truth" ? "Vérité" : "Gage"}${waiting ? " · en attente de validation" : ""}</small>${esc(c.text)}</span>
        <span class="acts">${waiting && o.approveAct ? `<button class="link" data-act="${o.approveAct}" data-id="${esc(c.id)}">Valider</button>` : ""}
        ${o.canDel(c) ? `<button class="link" data-act="${o.delAct}" data-id="${esc(c.id)}" aria-label="Supprimer ce gage">${waiting && o.approveAct ? "Refuser" : "Retirer"}</button>` : ""}</span></li>`;
    }).join("")}</ul>` : `<p class="hint left">${o.empty}</p>`}
  </section>`;
}
/* Every team's letters. */
function scoresPanel(S, info, o = {}) {
  const nT = teamCount(S), mine = S.teamOf?.[M.me];
  const lead = leader(S);
  return `<section class="panel scores">
    <div class="label">${o.title || `Manche ${S.round || 1}`}${S.target ? ` · premier à ${targetName(S.target)}` : ""}</div>
    <ol class="teams">${Array.from({ length: nT }, (_, t) => {
      const ms = members(S, t).map(info);
      return `<li class="${!o.noMe && t === mine ? "mine" : ""} ${lead === t && (S.pts[t] || 0) > 0 ? "lead" : ""}"><span class="tn"><span class="avs sm">${ms.map(p => av(p)).join("")}</span><span class="nm">${esc(names(ms))}</span></span>${kemsBoxes(S.pts[t] || 0, S.target)}</li>`;
    }).join("")}</ol>
  </section>`;
}
/* The middle of the table. Touching a card picks it; a card of your own hand then swaps them. */
function midPanel(r, o = {}) {
  const look = r.step === "look", mid = look ? [null, null, null, null] : viewMid(r), p = M.pending;
  const left = lookLeft(r), a = autoLeft(r), pc = passCount(r);
  const myPass = M.players.find(x => x.id === M.me)?.pass === r.mseq;
  let foot = "";
  if (look) foot = `<div class="countdown" aria-live="polite">${left ? `Ça part dans <b>${left}</b>` : "Kems !"}</div>`;
  else if (o.tap) foot = `<div class="passrow">
      <button class="btn pass" data-act="pass" aria-pressed="${myPass}">${myPass ? "Je passe ✓" : "Rien pour moi"}</button>
      <span class="pc">${pc.n}/${pc.of} ${pc.n > 1 ? "passent" : "passe"}${a != null ? `<br><small>nouvelles dans ${a} s</small>` : ""}</span>
    </div>`;
  else foot = `<div class="vsub">${pc.n}/${pc.of} ${pc.n > 1 ? "passent" : "passe"}${a != null ? ` · nouvelles cartes dans ${a} s` : ""}</div>`;
  return `<section class="panel center felt midp">
    <div class="label">Le milieu${r.deckLeft != null && !look ? ` · ${plural(r.deckLeft, "carte")} dans le paquet` : ""}</div>
    <div class="mid" data-key="${esc(`${r.gameId}.${r.round}`)}" data-cards="${mid.join(",")}">${mid.map((c, i) => {
      if (c == null) return card(null, "", i);
      const cls = [M.selMid === c ? "sel" : "", p && p.give === c ? "pend" : ""].join(" ");
      return o.tap ? `<button class="cb" data-tap="mid" data-card="${c}" ${p ? "disabled" : ""} aria-label="Prendre le ${cardName(c)}">${card(c, cls, i)}</button>` : card(c, cls, i);
    }).join("")}</div>
    ${foot}
  </section>`;
}
function handPanel(r) {
  const hand = viewHand(r), p = M.pending, look = r.step === "look";
  if (!hand) return `<section class="panel center loading">On distribue…</section>`;
  const hint = look ? "Regarde bien ta main. Les échanges commencent dans un instant."
    : p ? "Échange envoyé…"
    : M.selHand != null ? "Touche maintenant la carte du milieu que tu prends."
    : M.selMid != null ? "Touche maintenant la carte que tu donnes."
    : "Touche une de tes cartes, puis une carte du milieu, pour les échanger.";
  return `<section class="panel myhand" data-key="${esc(`${r.gameId}.${r.round}`)}">
    <div class="label">Ta main</div>
    <div class="hand">${hand.map((c, i) => {
      const cls = [M.selHand === c ? "sel" : "", p && p.take === c ? "pend" : "", M.fresh === c ? "fresh" : ""].join(" ");
      return `<button class="cb" data-tap="hand" data-card="${c}" ${p || look ? "disabled" : ""} aria-label="Donner le ${cardName(c)}">${card(c, cls, i)}</button>`;
    }).join("")}</div>
    <p class="hint">${hint}</p>
  </section>`;
}
/* KEMS for your partner (alone: for yourself), CONTRE against an opponent. Both ask for a second touch. */
function claimPanel(r) {
  const key = `${r.gameId}.${r.round}`;
  if (M.claimed === key) return `<section class="panel center"><p class="lead dots">Annonce envoyée</p></section>`;
  if (M.arm === "contre") {
    return `<section class="panel contrebox">
      <div class="label">Contre ! Qui a un carré ?</div>
      <div class="opps">${opponentsOf(r, M.me).map(id => { const p = pInfo(id); return `<button class="btn opp" data-act="contre-on" data-id="${esc(id)}">${av(p)}<span>${esc(p.nick)}</span></button>`; }).join("")}</div>
      <button class="link" data-act="disarm" style="align-self:center">Annuler</button>
    </section>`;
  }
  const partner = partnerOf(r, M.me), armed = M.arm === "kems";
  return `<div class="claims">
    <button class="btn kems ${armed ? "armed" : ""}" data-tap="kems">${armed ? "Sûr ?" : "Kems !"}<small>${armed ? "Touche encore" : r.solo ? "J'ai un carré" : `${esc(pInfo(partner).nick)} a un carré`}</small></button>
    <button class="btn contre" data-tap="contre">Contre !<small>Un adversaire a un carré</small></button>
  </div>`;
}
/* Your partner and your secret sign, hidden until you open it. */
function teamPanel(r) {
  if (r.solo) return "";
  const partner = partnerOf(r, M.me), sign = M.secret && M.secret.gameId === r.gameId ? M.secret.sign : "";
  return `<details class="panel team">
    <summary class="label">Ton partenaire : ${esc(pInfo(partner).nick)}${sign ? " · votre signe" : ""}</summary>
    ${sign ? `<p class="sign">${esc(sign)}</p><p class="hint left">Fais ce signe quand tu as un carré, discrètement. Et surveille ${esc(pInfo(partner).nick)} : s'il le fait, appuie sur Kems !</p>`
      : `<p class="hint left">Mettez-vous d'accord sur un signe discret. Quand ${esc(pInfo(partner).nick)} le fait, appuie sur Kems !</p>`}
  </details>`;
}
/* The end of a round: who called what, the hand it was about, and the letters. */
function resultPanel(S, res, info) {
  const by = info(res.by), tg = info(res.target), self = res.by === res.target;
  const what = res.kind === "kems" ? (self ? `${esc(by.nick)} annonce un carré` : `${esc(by.nick)} annonce un carré chez ${esc(tg.nick)}`)
    : `${esc(by.nick)} accuse ${esc(tg.nick)} d'avoir un carré`;
  const pts = res.pts || S.pts || [];
  const out = [];
  if (res.win >= 0) out.push(`${esc(teamName(S, res.win, info))} ${vb(S, res.win, "écrit", "écrivent")} la lettre <b class="letter">${LETTERS[(pts[res.win] - 1) % 4]}</b>`);
  if (res.drop >= 0) out.push(res.lost ? `${esc(teamName(S, res.drop, info))} ${vb(S, res.drop, "perd", "perdent")} une lettre` : `${esc(teamName(S, res.drop, info))} n'${vb(S, res.drop, "avait", "avaient")} pas encore de lettre à perdre`);
  const over = S.target && pts.some(p => p >= S.target), champ = over ? pts.findIndex(p => p >= S.target) : -1;
  let sips = "";
  if (S.apero && res.lose.length) {
    const ds = res.lose.flatMap(t => members(S, t)).map(info);
    sips = `<div class="sips">${esc(names(ds))} ${ds.length > 1 ? "boivent" : "boit"} ${SIPS} gorgées</div>`;
  }
  const hands = Object.entries(res.hands || {}).sort((a, b) => S.order.indexOf(a[0]) - S.order.indexOf(b[0]));
  return `<section class="panel center verdict reveal ${res.ok ? "ok" : "ko"}" data-key="${esc(`r${S.gameId}.${res.n}`)}" aria-live="polite">
    <div class="label">${res.kind === "kems" ? "Kems !" : "Contre !"}</div>
    <div class="what">${what}</div>
    <div class="hole big">${byRank(res.hands[res.target] || []).map((c, i) => card(c, res.ok ? "hit" : "", i)).join("")}</div>
    <div class="name">${res.ok ? `Carré ${deR(res.q)} !` : "Pas de carré !"}</div>
    ${out.map(t => `<div class="vsub">${t}</div>`).join("")}
    ${over ? `<div class="champ">${esc(teamName(S, champ, info))} ${vb(S, champ, "gagne", "gagnent")} la partie !</div>` : ""}
    ${sips}
  </section>
  <section class="panel"><div class="label">Les mains</div>
    <ul class="hands">${hands.map(([id, h]) => `<li>${chip(info(id))}<span class="hole sm">${byRank(h).map((c, i) => card(c, isQuad(h) ? "hit" : "", i)).join("")}</span>${isQuad(h) ? `<span class="tag win">carré</span>` : ""}</li>`).join("")}</ul>
    ${(res.quads || []).filter(id => id !== res.target).length ? `<p class="hint left">${esc(names(res.quads.filter(id => id !== res.target).map(info)))} ${res.quads.filter(id => id !== res.target).length > 1 ? "avaient" : "avait"} aussi un carré !</p>` : ""}
  </section>`;
}
function palmares(S, hist, titles, info, shareAct) {
  if (!hist.length) return `<section class="panel"><p class="lead">Aucune manche jouée pour l'instant.</p></section>`;
  const X = playerStats(S, hist), rank = ranking(S, hist);
  return `<section class="panel">
    <div class="label">Classement · ${plural(hist.length, "manche")}</div>
    <ol class="rank">${rank.map((id, i) => {
      const p = info(id), t = titles[id], s = X[id], pts = S.pts?.[S.teamOf[id]] || 0;
      const facts = [s.kOk && `${plural(s.kOk, "Kems")} ${s.kOk > 1 ? "réussis" : "réussi"}`, s.kKo && `${plural(s.kKo, "Kems")} dans le vide`,
        s.cOk && `${plural(s.cOk, "contre")} ${s.cOk > 1 ? "gagnés" : "gagné"}`, s.cKo && `${plural(s.cKo, "contre")} ${s.cKo > 1 ? "ratés" : "raté"}`,
        !S.solo && s.sent && `${plural(s.sent, "signe")} bien ${s.sent > 1 ? "passés" : "passé"}`, s.caught && `démasqué ${s.caught} fois`,
        s.quads && `${plural(s.quads, "carré")} en main`, s.sw && `${plural(s.sw, "échange")}`].filter(Boolean);
      return `<li><details>
      <summary><span class="pos">${i + 1}</span>${av(p)}<span class="who"><b>${esc(p.nick)}</b>
        ${t ? `<span class="title">${esc(t.title)}</span>` : ""}
        <small>${plural(pts, "lettre")}${S.solo ? "" : ` avec ${esc(names(members(S, S.teamOf[id]).filter(x => x !== id).map(info)))}`}${t ? " · " + esc(t.why) : ""}</small></span></summary>
      <ul>${facts.length ? facts.map(f => `<li>${esc(f)}</li>`).join("") : "<li>Pas une carte échangée. Très mystérieux.</li>"}</ul>
    </details></li>`;
    }).join("")}</ol>
    ${shareAct ? `<button class="btn" data-act="${shareAct}">Partager le classement en image</button>` : ""}
  </section>`;
}
/* Gages and truths for the losers, each choosing on their own phone. */
function gagesPanel(o) {
  if (!o.on || !o.losers.length) return "";
  return `<section class="panel"><div class="label">Gage ${o.losers.length > 1 ? "des perdants" : "du perdant"} · ${GAGE_LEVELS[(o.lvl || 1) - 1]}</div>${o.losers.map(p => {
    const kind = o.choiceOf(p.id);
    if (kind) return `<div class="gage ${kind}"><div class="gk">${esc(p.nick)} · ${kind === "dare" ? "Gage" : "Vérité"}</div><p>${esc(gageText(kind, o.lvl, o.seed + p.id, o.house))}</p></div>`;
    if (p.id === M.me) return `<div class="gage"><div class="gk">À toi de choisir</div>
      <div class="btns"><button class="btn primary" data-act="choose" data-id="dare">Gage</button><button class="btn" data-act="choose" data-id="truth">Vérité</button></div></div>`;
    return `<div class="gage"><div class="gk">${esc(p.nick)}</div><p class="dots">choisit entre gage et vérité</p></div>`;
  }).join("")}</section>`;
}
function waitMod(text) {
  return `<section class="panel center wait"><div class="label">En attente du modo</div><div class="big dots">${text}</div></section>`;
}
function rulesBox() {
  return `<details class="panel rules"><summary class="label">Comment on joue</summary>
    <ol>
      <li>On joue <b>par équipes de deux</b>, assis <b>en face de son partenaire</b>. Chaque équipe a un <b>signe secret</b> : l'appli peut le tirer au sort, ou vous le choisissez entre vous.</li>
      <li>Chacun reçoit <b>4 cartes</b>, visibles seulement sur son téléphone. <b>4 cartes</b> sont au milieu, visibles sur tous les téléphones.</li>
      <li>Au top, <b>tout le monde échange en même temps</b>, aussi vite qu'il veut : une de tes cartes contre une du milieu. Tu as toujours 4 cartes. Le plus rapide prend la carte.</li>
      <li>Plus personne n'en veut ? Appuyez sur <b>Rien pour moi</b> : quand tout le monde passe, ou après quelques secondes sans échange, 4 nouvelles cartes arrivent.</li>
      <li>Le but : un <b>carré</b>, 4 cartes de même valeur. Là, fais ton signe à ton partenaire, sans te faire voir des autres.</li>
      <li>Ton partenaire a fait son signe ? Appuie sur <b>KEMS !</b> S'il a bien un carré, votre équipe gagne la manche. Sinon, c'est l'équipe adverse qui la gagne.</li>
      <li>Tu as repéré le signe d'un adversaire ? Appuie sur <b>CONTRE !</b> et désigne-le. S'il a un carré, ton équipe gagne la manche. Sinon, c'est la sienne.</li>
      <li>Chaque manche gagnée écrit une lettre : la première équipe qui écrit <b>K E M S</b> gagne la partie.</li>
    </ol>
    <p class="hint left"><b>Chacun pour soi</b> (pour un nombre impair) : pas de signe, tu appuies toi-même sur Kems quand tu as un carré, et tu peux toujours contrer les autres. À plus de deux, une fausse annonce te coûte une lettre.</p>
  </details>`;
}

/* ---------- screens: home ---------- */
function renderSetup() {
  return header(true) + `<section class="panel">
    <p class="lead"><b>Le jeu en ligne n'est pas encore branché.</b></p>
    <p class="note">Colle la configuration de ton projet Firebase dans le fichier <b>config.js</b>, puis remets le site en ligne.</p>
  </section>`;
}
function renderFatal() {
  return header(true) + `<section class="panel"><p class="lead">${esc(M.fatal)}</p>
    <button class="btn primary big" data-act="reload">Réessayer</button></section>`;
}
function profilePanel() {
  const p = profile(), title = topOf(p.titles);
  return `<section class="panel">
    <div class="label">Mon profil</div>
    ${p.games ? `<ul class="stats">
        <li><b>${p.games}</b> ${p.games > 1 ? "parties" : "partie"}</li>
        <li><b>${p.wins}</b> ${p.wins > 1 ? "victoires" : "victoire"}</li>
        <li><b>${p.kems}</b> Kems ${p.kems > 1 ? "réussis" : "réussi"}</li>
      </ul>
      ${p.contres ? `<p class="hint left">Contres gagnés : <b>${p.contres}</b>.</p>` : ""}
      ${title ? `<p class="hint left">Ton titre fétiche : <b>${esc(title[0])}</b>.</p>` : ""}`
      : `<p class="hint left">Tes stats apparaîtront ici après ta première partie. Elles restent sur ce téléphone.</p>`}
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
  return header(true) + `<p class="tagline">Un carré en main, un clin d'œil à ton partenaire… et il crie KEMS ! Le jeu de cartes à signes secrets, chacun sur son téléphone.</p>
  <div class="hero-cards" aria-hidden="true">${[C(11, 0), C(11, 1), C(11, 2), C(11, 3)].map((c, i) => card(c, "", i)).join("")}</div>` + errBox() + `<section class="panel">
    <div class="label">Ton prénom</div>${nickField}
  </section>
  ${invited
    ? `<section class="panel"><div class="label">Tu es invité à la partie</div><div class="code">${esc(M.drafts.code)}</div>${joinForm}</section>
       <div class="or">ou</div>
       <button class="btn big" data-act="create">Créer ma propre partie</button>`
    : `<button class="btn primary big" data-act="create">Créer une partie</button>
       <p class="hint on-ground">Tu seras le modo : tu règles la partie, et ton téléphone fait le donneur.</p>
       <div class="or">ou</div>
       <section class="panel"><div class="label">Rejoindre avec un code</div>${joinForm}</section>`}
  ${rulesBox()}
  ${profilePanel()}
  ${installPanel()}`;
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
      <p class="hint left">Ouvre ce lien sur le grand écran : il montre le milieu, les lettres et les résultats, jamais les mains.</p>
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
    h += `<div class="note" role="status"><b>Connexion perdue.</b> Le jeu se reconnecte tout seul : ne ferme pas la page.</div>`;
  }
  if (!isMod() && inRoom() && M.room) {
    const away = awayFor(hostPlayer());
    if (away >= HOST_AWAY_MS) {
      const mins = Number.isFinite(away) ? Math.floor(away / 60000) : 0;
      h += `<section class="panel alert">
        <p class="lead"><b>Le modo ne répond plus${mins ? ` depuis ${plural(mins, "minute")}` : ""}.</b></p>
        <p class="hint left">Son téléphone s'est peut-être mis en veille ou a perdu le réseau. Sans lui, plus aucun échange ne passe. Quelqu'un peut reprendre la partie exactement là où elle en est.</p>
        <button class="btn primary" data-act="takeover">Devenir le modo</button>
      </section>`;
    }
  }
  return h;
}
function renderRoom() {
  if (!M.roomReady || !M.playersReady) return header(true, "Partie " + M.code) + `<section class="panel center loading">Connexion à la table…</section>`;
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
  const custom = r.gages && r.maison ? customBlock(M.customs, {
    form: "custom", delAct: "del-custom", canDel: c => mod || c.by === M.me,
    pending: c => r.approve && !c.ok && c.by !== r.hostUid, approveAct: mod ? "approve-custom" : null,
    empty: mod ? "Ajoutez vos propres gages et vérités, rien que pour ce groupe. Les autres joueurs peuvent en proposer aussi."
      : "Propose tes propres gages. Personne ne les voit à part toi et le modo : ils tomberont peut-être sur les perdants."
  }) : "";
  const teams = r.solo ? "" : teamsPanel(r, players, mod);
  if (!mod) {
    return `${invitePanel()}${playersPanel(players, false)}${teams}
    <section class="panel"><div class="label">Réglages de la partie</div>${settingsSummary(r)}</section>
    ${waitMod("Le modo prépare la partie")}
    ${custom}${rulesBox()}
    <p class="foot"><button class="link" data-act="leave">Quitter la partie</button> · <button class="link" data-act="exit">Retour à l'accueil</button></p>`;
  }
  const why = startProblem(r, players);
  return `${invitePanel()}${playersPanel(players, true)}
  ${settingsPanel(r)}${teams}
  ${custom}
  <button class="btn primary big" data-act="start" ${why ? "disabled" : ""}>Distribuer les cartes</button>
  ${why ? `<p class="hint on-ground">${esc(why)}</p>` : players.length > MAX_PLAYERS ? `<p class="hint on-ground">Seuls les ${MAX_PLAYERS} premiers arrivés jouent cette partie.</p>` : ""}
  ${rulesBox()}
  <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
}
function playScreen(r, mod) {
  const seated = (r.order || []).includes(M.me);
  let h = "";
  if (r.step === "done") {
    const over = isOver(r);
    h += r.res ? resultPanel(r, r.res, pInfo) : "";
    h += mod ? `<button class="btn primary big" data-act="next">${over ? "Voir le classement final" : "Manche suivante"}</button>`
      : waitMod(over ? "Le classement final arrive" : "Le modo lance la manche suivante");
    h += scoresPanel(r, pInfo, { title: `Après la manche ${r.round}` });
  } else {
    h += scoresPanel(r, pInfo) + midPanel(r, { tap: seated && r.step === "swap" });
    if (seated) h += handPanel(r) + claimPanel(r) + teamPanel(r);
    else h += `<section class="panel"><p class="lead">Tu regardes cette partie. Tu joueras à la suivante.</p></section>`;
  }
  if (mod) h += `<p class="foot">${r.step === "swap" ? `<button class="link" data-act="force-renew">Nouvelles cartes au milieu</button> · ` : ""}<button class="link" data-act="end">Terminer la partie</button></p>`;
  return h;
}
function endScreen(r, players, mod) {
  const hist = M.rounds, titles = computeTitles(r, hist);
  recordGame(r, hist, titles);
  const h = winnerPanel(r, pInfo, hist.length) + palmares(r, hist, titles, pInfo, "share-img")
    + gagesPanel({ on: r.gages, losers: losersOf(r).map(pInfo), lvl: r.gageLvl, seed: r.gameId, house: r.house || [],
      choiceOf: uid => M.choices.find(c => c.uid === uid)?.kind });
  if (!mod) return h + playersPanel(players, false) + waitMod("Le modo peut lancer une nouvelle partie");
  return h + playersPanel(players, true) + `<button class="btn primary big" data-act="newgame">Nouvelle partie</button>
    <p class="hint on-ground">Tout le monde reste. Tu pourras changer les équipes et les réglages avant de relancer.</p>`;
}
function winnerPanel(S, info, rounds) {
  const w = leader(S);
  if (!rounds) return "";
  if (w < 0) return `<section class="panel center verdict"><div class="label">Fin de la partie</div><div class="name">Égalité !</div><div class="vsub">${plural(rounds, "manche")}</div></section>`;
  const ms = members(S, w).map(info);
  return `<section class="panel center verdict"><div class="label">${S.solo ? "Le gagnant" : "L'équipe gagnante"}</div>
    ${ms.length === 1 ? av(ms[0], "huge") : `<div class="avs">${ms.map(p => av(p)).join("")}</div>`}
    <div class="name">${esc(names(ms))}</div>${kemsBoxes(S.pts[w], S.target)}<div class="vsub">${plural(rounds, "manche")}</div></section>`;
}

/* ---------- big screen (TV / laptop): watches the game, never sees a hand ---------- */
function renderTv() {
  const r = M.room, players = M.players;
  let h = header(true, "Partie " + M.code) + alerts();
  if (r.phase === "lobby") {
    h += `<section class="panel center tvjoin">
      <div class="label">Pour jouer, scanne ou tape le code</div>
      <div class="tvrow"><div class="qr big" data-qr="${esc(inviteLink())}"></div><div><div class="code">${esc(M.code)}</div><p class="lead">${esc(location.host + location.pathname)}</p></div></div>
    </section>
    <section class="panel"><div class="label">Joueurs · ${players.length}</div><div class="chips">${players.map(p => chip(p)).join("")}</div></section>
    ${r.solo ? "" : teamsPanel(r, players, false)}
    <section class="panel">${settingsSummary(r)}</section>`;
  } else if (r.phase === "play") {
    const main = r.step === "done" ? (r.res ? resultPanel(r, r.res, pInfo) : "") : midPanel(r, {});
    h += `<div class="tvgrid"><div class="stack">${main}</div><div class="stack">${scoresPanel(r, pInfo, { noMe: true })}</div></div>`;
  } else {
    const hist = M.rounds;
    h += winnerPanel(r, pInfo, hist.length) + palmares(r, hist, computeTitles(r, hist), pInfo, "");
  }
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
/* The round of the night: the quickest right call, else the first contre that hit. */
function bestMove(S, hist, info) {
  const k = hist.filter(h => h.ok && h.kind === "kems" && h.dur > 0).sort((a, b) => a.dur - b.dur)[0];
  if (k) return k.by === k.target ? `${info(k.by).nick} a annoncé son carré en ${secs(k.dur)} secondes.`
    : `${info(k.by).nick} a capté le signe de ${info(k.target).nick} en ${secs(k.dur)} secondes.`;
  const c = hist.find(h => h.ok && h.kind === "contre");
  return c ? `${info(c.by).nick} a démasqué ${info(c.target).nick}, carré en main.` : "";
}
async function shareImage(S, hist, info) {
  const rank = ranking(S, hist), titles = computeTitles(S, hist);
  const rows = rank.slice(0, 8).map(id => ({ p: info(id), n: S.pts?.[S.teamOf[id]] || 0 }));
  const move = bestMove(S, hist, info);
  try { await Promise.all([document.fonts.load("60px Bungee"), document.fonts.load("800 30px Onest"), document.fonts.load("500 26px Onest")]); } catch {}
  const W = 1080, cv = document.createElement("canvas"), g = cv.getContext("2d");
  g.font = "800 40px Onest, Arial, sans-serif";
  const moveLines = move ? wrapLines(g, move, W - 200).slice(0, 5) : [];
  const moveH = move ? 120 + moveLines.length * 52 : 0;
  const H = 300 + moveH + rows.length * 150 + 60;
  cv.width = W; cv.height = H;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  g.fillStyle = "#2338C4"; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 40) { g.fillStyle = "#FFD23F"; g.fillRect(x, 0, 16, 22); g.fillStyle = "#FF4A2E"; g.fillRect(x + 16, 0, 16, 22); g.fillStyle = "#FFF8E9"; g.fillRect(x + 32, 0, 8, 22); }
  g.font = "100px Bungee, 'Arial Black', sans-serif"; g.fillStyle = "#0D1030"; g.fillText("KEMS", 76, 166); g.fillStyle = "#FFD23F"; g.fillText("KEMS", 70, 160);
  g.fillStyle = "#C9D0FF"; g.font = "800 30px Onest, Arial, sans-serif";
  g.fillText(`CLASSEMENT · ${plural(hist.length, "MANCHE")} · ${new Date().toLocaleDateString("fr-FR")}`, 72, 220);
  let y = 260;
  if (move) {
    g.fillStyle = "#0D1030"; rr(60, y, W - 120, moveH - 30, 26); g.fill();
    g.fillStyle = "#FFD23F"; g.font = "800 26px Onest, Arial, sans-serif"; g.fillText("LE COUP DE LA SOIRÉE", 100, y + 56);
    g.fillStyle = "#FFF8E9"; g.font = "800 40px Onest, Arial, sans-serif";
    moveLines.forEach((l, i) => g.fillText(l, 100, y + 112 + i * 52));
    y += moveH;
  }
  rows.forEach((s, i) => {
    const t = titles[s.p.id], ink = "#0D1030";
    g.fillStyle = rows[0].n === s.n && s.n > 0 ? "#FFD23F" : "#FFF8E9"; g.strokeStyle = ink; g.lineWidth = 5;
    rr(60, y, W - 120, 128, 26); g.fill(); g.stroke();
    g.fillStyle = ink; g.font = "48px Bungee, 'Arial Black', sans-serif"; g.fillText(String(i + 1), 92, y + 84);
    g.fillStyle = safeColor(s.p.color); g.beginPath(); g.arc(215, y + 64, 40, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = "36px Bungee, 'Arial Black', sans-serif"; g.textAlign = "center";
    g.fillText((s.p.nick || "?").charAt(0).toUpperCase(), 215, y + 77); g.textAlign = "left";
    g.fillStyle = ink; g.font = "800 40px Onest, Arial, sans-serif"; g.fillText(s.p.nick, 285, y + 58);
    g.font = "500 28px Onest, Arial, sans-serif";
    g.fillText(`${t ? t.title + " · " : ""}${plural(s.n, "lettre")}`.slice(0, 50), 285, y + 100);
    g.font = "34px Bungee, 'Arial Black', sans-serif"; g.textAlign = "right";
    g.fillText(lettersOf(Math.min(s.n, 8)) || "—", W - 96, y + 78); g.textAlign = "left";
    y += 150;
  });
  g.fillStyle = "#C9D0FF"; g.font = "500 26px Onest, Arial, sans-serif"; g.fillText(location.host, 72, H - 40);
  const blob = await new Promise(res => cv.toBlob(res, "image/png"));
  const file = new File([blob], "kems-classement.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Kems, le classement" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
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
let lastHtml = "", lastKeys = {}, lastMid = { key: "", cards: [] };
function render() {
  document.body.classList.toggle("tv", M.mode === "room" && M.tv);
  let html;
  if (M.mode === "room") html = renderRoom();
  else if (M.mode === "home") html = renderHome();
  else if (M.mode === "setup") html = renderSetup();
  else if (M.mode === "fatal") html = renderFatal();
  else html = header(true) + `<section class="panel center loading">On mélange les cartes…</section>`;
  // French spacing: « Kems ! » never breaks before its exclamation mark.
  html = html.replace(/ ([!?:;»])(?=[\s<"]|$)/g, " $1").replace(/« /g, "« ");
  if (html !== lastHtml) {
    const a = document.activeElement, fid = a && a.id, ss = a && a.selectionStart, se = a && a.selectionEnd;
    const openDetails = [...app.querySelectorAll("details[open] summary")].map(s => s.textContent);
    app.innerHTML = html;
    lastHtml = html;
    app.querySelectorAll("details summary").forEach(s => { if (openDetails.includes(s.textContent)) s.parentElement.open = true; });
    app.querySelectorAll("[data-draft]").forEach(i => { i.value = M.drafts[i.dataset.draft] || ""; });
    if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(ss, se); } catch {} } }
    // A new hand, a round's verdict: each gets its little animation once.
    const keys = {};
    for (const [sel, cls] of [[".myhand", "deal"], [".reveal", "lift"]]) {
      const el = app.querySelector(sel), k = el ? el.dataset.key : "";
      if (el && k !== lastKeys[sel]) el.classList.add(cls);
      keys[sel] = k;
    }
    if (keys[".reveal"] && keys[".reveal"] !== lastKeys[".reveal"]) window.scrollTo({ top: 0, behavior: "smooth" });
    lastKeys = keys;
    // A card that just landed in the middle flips in.
    const md = app.querySelector(".mid[data-key]");
    if (md) {
      const k = md.dataset.key, cards = md.dataset.cards.split(",");
      [...md.children].forEach((el, i) => { if (cards[i] && (k !== lastMid.key || cards[i] !== lastMid.cards[i])) el.classList.add("new"); });
      lastMid = { key: k, cards };
    }
    fillQR();
  }
  const playing = M.mode === "room" && M.room?.phase === "play" && (inRoom() || M.tv);
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
  const nick = (Soiree.pseudo() || M.drafts.nick || "").trim().slice(0, 18);
  if (!nick) { M.err = "Entre d'abord ton prénom."; render(); document.getElementById("nick")?.focus(); return ""; }
  store.set("nick", nick);
  return nick;
};
const modOnly = fn => d => { if (isMod()) fn(d); };
const copy = (text, msg) => navigator.clipboard?.writeText(text).then(() => flash(msg), () => flash(text)) ?? flash(text);
const roomSetting = (k, v) => modOnly(d => write(() => patchRoom({ [k]: v(d, M.room || {}) })));
function readCustom(draft) {
  const text = String(M.drafts[draft] || "").replace(/\s+/g, " ").trim().slice(0, 140);
  if (text.length < 3) return null;
  M.drafts[draft] = ""; M.err = "";
  return { kind: M.gkind === "truth" ? "truth" : "dare", text };
}
const canPlay = r => r && r.phase === "play" && (r.step === "look" || r.step === "swap") && (r.order || []).includes(M.me);
/* A swap goes out as soon as both cards are picked. Sent without waiting on anything else, so it stays quick. */
function trySwap() {
  const r = M.room, cards = myCards(r);
  if (M.selHand == null || M.selMid == null) { render(); return; }
  const give = M.selHand, take = M.selMid;
  M.selHand = M.selMid = null;
  if (!canPlay(r) || r.step !== "swap" || M.pending || !cards || !cards.includes(give) || !(r.mid || []).includes(take)) { render(); return; }
  const id = `${r.gameId}_${M.me}_${rid()}`;
  M.pending = { id, gameId: r.gameId, round: r.round, give, take, at: Date.now() };
  render();
  F.setDoc(rMove(M.code, id), { gameId: r.gameId, round: r.round, uid: M.me, kind: "swap", give, take, ts: F.serverTimestamp() })
    .catch(() => { if (M.pending?.id === id) { M.pending = null; flash("L'échange n'est pas passé. Réessaie."); } });
}
function sendClaim(kind, target = "") {
  const r = M.room;
  if (!canPlay(r)) return;
  const key = `${r.gameId}.${r.round}`;
  if (M.claimed === key) return;
  M.arm = ""; M.claimed = key;
  const id = `${r.gameId}_${M.me}_${rid()}`;
  render();
  F.setDoc(rMove(M.code, id), { gameId: r.gameId, round: r.round, uid: M.me, kind, target, ts: F.serverTimestamp() })
    .catch(() => { if (M.claimed === key) M.claimed = ""; flash("Trop tard, la manche est finie."); });
}
/* Touches on the cards and the two big buttons act as the finger lands, not when it lifts: every tenth of a second counts. */
const TAP = {
  "hand": d => {
    const c = +d.card;
    M.selHand = M.selHand === c ? null : c;
    trySwap();
  },
  "mid": d => {
    const c = +d.card;
    M.selMid = M.selMid === c ? null : c;
    trySwap();
  },
  "kems": () => {
    if (M.arm === "kems" && Date.now() - M.armAt < ARM_MS) { sendClaim("kems"); return; }
    M.arm = "kems"; M.armAt = Date.now(); render();
  },
  "contre": () => { M.arm = "contre"; render(); }
};
const ACT = {
  "create": () => {
    const nick = needNick(); if (!nick) return;
    write(async () => {
      let code = genCode();
      for (let i = 0; i < 6 && (await F.getDoc(rRoom(code))).exists(); i++) code = genCode();
      await F.setDoc(rRoom(code), { ...freshRoom(), hostUid: M.me, createdAt: Date.now(), touchedAt: F.serverTimestamp() });
      lastHb = Date.now();
      await F.setDoc(rPlayer(code, M.me), { nick, color: Soiree.color() || COLORS[0], joinedAt: Date.now(), seen: F.serverTimestamp() });
      rememberHosted(code);
      enterRoom(code);
    });
  },
  "exit": () => exitRoom(),
  "leave": () => { const code = M.code; write(async () => { await F.deleteDoc(rPlayer(code, M.me)); exitRoom(); }); },
  "share": () => { navigator.share({ title: "Kems", text: `Rejoins la partie de Kems ${M.code} !`, url: inviteLink() }).catch(() => {}); },
  "copy": () => copy(inviteLink(), "Lien d'invitation copié."),
  "copy-tv": () => copy(tvLink(), "Lien grand écran copié."),
  "toggle-qr": () => { M.showQR = !M.showQR; render(); },
  "gkind": d => { M.gkind = d.id === "truth" ? "truth" : "dare"; render(); document.getElementById("custom")?.focus(); },

  /* playing */
  "pass": () => {
    const r = M.room;
    if (!canPlay(r) || r.step !== "swap") return;
    const mine = M.players.find(p => p.id === M.me)?.pass === r.mseq;
    F.updateDoc(rPlayer(M.code, M.me), { pass: mine ? -1 : r.mseq }).catch(() => {});
  },
  "contre-on": d => sendClaim("contre", d.id),
  "disarm": () => { M.arm = ""; render(); },
  "choose": d => {
    const r = M.room; if (!r) return;
    write(() => F.setDoc(rChoice(M.code, `${r.gameId}_${M.me}`), { gameId: r.gameId, uid: M.me, kind: d.id === "truth" ? "truth" : "dare" }), "Ce choix n'est plus possible.");
  },
  "next": modOnly(() => {
    const r = M.room;
    if (!r || r.step !== "done") return;
    write(() => nextRound(r));
  }),
  "force-renew": modOnly(() => {
    const r = M.room, d = M.deal;
    if (!r || r.step !== "swap" || !d || d.round !== r.round || d.gameId !== r.gameId) return;
    write(() => renew(r, d));
  }),
  "end": modOnly(() => write(() => patchRoom({ phase: "end" }))),
  "newgame": modOnly(() => {
    const old = M.room?.gameId, code = M.code;
    write(async () => {
      await patchRoom(freshGame());
      if (!old) return;
      try {
        for (const col of [cMoves(code), cChoices(code), cRounds(code)]) {
          const q = await F.getDocs(F.query(col, F.where("gameId", "==", old)));
          for (const d of q.docs) await F.deleteDoc(d.ref);
        }
      } catch {}
    });
  }),
  "start": modOnly(() => {
    const r = M.room;
    if (!r || startProblem(r, M.players)) return;
    write(() => startGame(r));
  }),
  "solo": roomSetting("solo", d => d.id === "solo"),
  "signs": roomSetting("signs", (d, r) => !r.signs),
  "target": roomSetting("target", d => TARGETS.includes(+d.id) ? +d.id : 4),
  "auto": roomSetting("auto", d => AUTOS.includes(+d.id) ? +d.id : 8),
  "deck32": roomSetting("deck32", (d, r) => !r.deck32),
  "gages": roomSetting("gages", (d, r) => !r.gages),
  "gage-lvl": roomSetting("gageLvl", d => Math.min(4, Math.max(1, +d.id || 1))),
  "maison": roomSetting("maison", (d, r) => !r.maison),
  "approve": roomSetting("approve", (d, r) => !r.approve),
  "apero": roomSetting("apero", (d, r) => !r.apero),
  "team-shuffle": modOnly(() => { M.pickSwap = ""; write(() => patchRoom({ pairs: shuffle(lobbyOrder(M.room, M.players)) })); }),
  "team-pick": modOnly(d => {
    if (!M.pickSwap || M.pickSwap === d.id) { M.pickSwap = M.pickSwap === d.id ? "" : d.id; render(); return; }
    const seq = lobbyOrder(M.room, M.players), a = seq.indexOf(M.pickSwap), b = seq.indexOf(d.id);
    M.pickSwap = "";
    if (a < 0 || b < 0) { render(); return; }
    [seq[a], seq[b]] = [seq[b], seq[a]];
    write(() => patchRoom({ pairs: seq }));
  }),
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
  "install": async () => { const e = M.installEvt; M.installEvt = null; render(); if (e) { e.prompt(); try { await e.userChoice; } catch {} } },
  "share-img": () => { const r = M.room; if (r) shareImage(r, M.rounds, pInfo).catch(() => flash("Impossible de créer l'image.")); },
  "reload": () => location.reload()
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
  "custom": () => {
    const c = readCustom("custom");
    if (!c) return;
    write(() => F.addDoc(cCustom(M.code), { ...c, by: M.me, at: Date.now(), ok: isMod() }), "Impossible d'ajouter ce gage.");
  }
};
document.addEventListener("pointerdown", e => {
  if (e.button > 0) return;
  const b = e.target.closest("[data-tap]");
  if (!b || b.disabled || !app.contains(b)) return;
  const fn = TAP[b.dataset.tap];
  if (fn) { e.preventDefault(); fn(b.dataset); }
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled || !app.contains(b)) return;
  const fn = ACT[b.dataset.act];
  if (fn) { e.preventDefault(); fn(b.dataset); }
});
// The keyboard still works on the cards and the big buttons.
document.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const b = e.target.closest?.("[data-tap]");
  if (!b || b.disabled) return;
  e.preventDefault(); TAP[b.dataset.tap]?.(b.dataset);
});
document.addEventListener("contextmenu", e => { if (e.target.closest(".myhand,.midp,.claims")) e.preventDefault(); });
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
  if (!c) return;
  if (hashIsTv() && F && M.me) { if (!(M.code === c && M.tv)) enterRoom(c, true); return; }
  if (c !== M.code) { M.drafts.code = c; if (M.code) exitRoom(); else render(); }
});
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); M.installEvt = e; render(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

/* ---------- boot ---------- */
const isPlaceholder = () => !firebaseConfig.apiKey || /COLLE/.test(firebaseConfig.apiKey);
async function boot() {
  if (await Soiree.replayBoot(M, render)) return;
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
  }
  catch (e) {
    M.mode = "fatal";
    M.fatal = e && (e.code === "auth/operation-not-allowed" || e.code === "auth/admin-restricted-operation")
      ? "La connexion anonyme n'est pas activée dans Firebase (Authentication › Sign-in method › Anonyme)."
      : "Connexion impossible (" + (e?.code || "réseau") + ").";
    render(); return;
  }
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
      if (r.exists() && p.exists()) { enterRoom(target); setTimeout(cleanupOldRooms, 8000); return; }
      if (!r.exists()) { store.set("room", null); if (hashCode()) M.err = `Aucune partie avec le code ${target}.`; }
    } catch {}
  }
  M.mode = "home"; render();
  setTimeout(cleanupOldRooms, 8000);
}
// Shared layer (account button, own name, group, recording for replays): after every render.
{ const draw = render; render = () => { draw(); Soiree.frame(M); }; }
boot();
