import { firebaseConfig } from "./config.js";
import * as Soiree from "../soiree.js";
import { GAGES } from "./gages.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const ROOT = "pdRooms";
const STARTS = [3, 4, 5, 6];
const TIMERS = [0, 30, 45, 60];
const GAGE_LEVELS = ["Soft", "Épicé", "Hot", "Extrême"];
const MIN_PLAYERS = 2, MAX_PLAYERS = 10, SIPS = 2;
const COLORS = ["#D93A26","#2F62D0","#18825A","#7C47CC","#B86400","#C2307C","#0F7C8F","#5E5C17","#8C3B1F","#3D4A63"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const K = "pdo";
const ROOM_MAX_IDLE_MS = 24 * 3600 * 1000;

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rid = () => Math.random().toString(36).slice(2, 10);
const rand = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const safeColor = c => COLORS.includes(c) ? c : COLORS[0];
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
const deNick = n => (/^[aeiouyhàâäéèêëîïôöùûü]/i.test(n) ? "d'" : "de ") + n;
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
const pct = x => (x > 0 && x < .01 ? "moins de 1" : x < 1 && x > .99 ? "99" : Math.round(x * 100)) + " %";

/* ---------- the dice and the bids ----------
   A bid is { u: who, q: how many dice, f: which face }. Face 1 is the paco, wild for every other face
   except in a palifico round. */
const roll = n => Array.from({ length: n }, () => rand(6) + 1).sort((a, b) => a - b);
const matches = (d, f, pal) => d === f || (!pal && f !== 1 && d === 1);
const countIn = (dice, f, pal) => (dice || []).filter(d => matches(d, f, pal)).length;
const countAll = (hands, f, pal) => Object.values(hands || {}).reduce((s, h) => s + countIn(h, f, pal), 0);
const bidText = b => b.f === 1 ? plural(b.q, "paco") : `${plural(b.q, "dé")} de ${b.f}`;
/* The smallest quantity that beats the last bid on face f, or null when f can't be bid at all.
   Going to pacos halves the quantity (rounded up); leaving them doubles it plus one.
   In a palifico round the face stays put, except for a player down to a single die ("free"). */
function minQ(prev, f, pal, free) {
  if (!prev) return f === 1 && !pal ? null : 1;
  if (pal) {
    if (!free) return f === prev.f ? prev.q + 1 : null;
    return f > prev.f ? prev.q : prev.q + 1;
  }
  if (prev.f !== 1) return f === 1 ? Math.ceil(prev.q / 2) : f > prev.f ? prev.q : prev.q + 1;
  return f === 1 ? prev.q + 1 : prev.q * 2 + 1;
}
function bidOk(prev, q, f, pal, free, total) {
  const m = minQ(prev, f, pal, free);
  return Number.isInteger(q) && Number.isInteger(f) && f >= 1 && f <= 6 && m != null && q >= m && q <= total;
}
function nextAlive(order, dice, from) {
  const n = order.length, i = order.indexOf(from);
  for (let k = 1; k <= n; k++) { const id = order[((i + k) % n + n) % n]; if ((dice[id] || 0) > 0) return id; }
  return "";
}
/* Lifting the cups. Dudo: the bid is true when there are at least that many, then the doubter loses a die, else the bidder.
   Calza: exactly that many wins back a die (never above the start), anything else loses one.
   Whoever lost (or won) a die starts the next round; if they are out, the next player still in. */
function settle({ kind, caller, bid, hands, pal, dice, start, order }) {
  const count = countAll(hands, bid.f, pal), next = { ...dice };
  let lose = "", gain = "";
  if (kind === "calza") { if (count === bid.q) gain = caller; else lose = caller; }
  else lose = count >= bid.q ? caller : bid.u;
  if (gain) next[gain] = Math.min(start, (next[gain] || 0) + 1);
  if (lose) next[lose] = Math.max(0, (next[lose] || 0) - 1);
  const who = lose || gain, out = lose && !next[lose] ? lose : "";
  return { count, lose, gain, out, dice: next, starter: next[who] > 0 ? who : nextAlive(order, next, who) };
}
/* The face a player would naturally open on: the one they hold most of, pacos included. */
function bestFace(hand, pal) {
  let best = 2, n = -1;
  for (let f = 2; f <= 6; f++) { const c = countIn(hand, f, pal); if (c > n) { best = f; n = c; } }
  return best;
}
/* Chances, from one player's own dice: how likely the others hide at least (or exactly) what is missing. */
function binom(n, p) {
  const out = [];
  let t = Math.pow(1 - p, n);
  for (let k = 0; k <= n; k++) { out.push(t); t = t * (n - k) / (k + 1) * p / (1 - p); }
  return out;
}
function odds(hand, b, total, pal) {
  const mine = countIn(hand, b.f, pal), others = Math.max(0, total - hand.length), need = b.q - mine;
  const pmf = binom(others, pal || b.f === 1 ? 1 / 6 : 1 / 3);
  const atLeast = need <= 0 ? 1 : pmf.slice(need).reduce((s, x) => s + x, 0);
  return { mine, others, need, atLeast: Math.min(1, atLeast), exact: need < 0 ? 0 : pmf[need] || 0 };
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
  secret: null, move: null, deal: null, customs: [], choices: [],
  bq: 0, bf: 0, bkey: "", peek: false, cup: store.get("cup") === "1", gkind: "dare",
  renaming: false, handover: false, showQR: false, err: "", flash: "", busy: false, fatal: "",
  offline: false, offlineSince: 0, installEvt: null,
  local: null, drafts: { nick: store.get("nick") || "", code: hashCode() }
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
/* One tick a second keeps the timers moving and lets the moderator's page run the automatic steps. */
setInterval(() => { if (M.mode === "room") { render(); if (isMod()) hostSync(); } }, 1000);

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
const rRoom = c => F.doc(DB, ROOT, c);
const rPlayer = (c, id) => F.doc(DB, ROOT, c, "players", id);
const cPlayers = c => F.collection(DB, ROOT, c, "players");
const rSecret = (c, id) => F.doc(DB, ROOT, c, "secret", id);
const rDeal = c => F.doc(DB, ROOT, c, "deal", "current");
const rMove = (c, id) => F.doc(DB, ROOT, c, "moves", id);
const cMoves = c => F.collection(DB, ROOT, c, "moves");
const cCustom = c => F.collection(DB, ROOT, c, "custom");
const rCustom = (c, id) => F.doc(DB, ROOT, c, "custom", id);
const cChoices = c => F.collection(DB, ROOT, c, "choices");
const rChoice = (c, id) => F.doc(DB, ROOT, c, "choices", id);

let subs = [], gameSubs = [], turnSubs = [], hostSubs = [], turnKey = "", hostKey = "", unCustom = null, customKey = "";
const off = list => { list.forEach(u => u()); list.length = 0; };
function leaveSubs() {
  off(subs); off(gameSubs); off(turnSubs); off(hostSubs);
  turnKey = ""; hostKey = "";
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
  gameSubs.push(F.onSnapshot(F.query(cChoices(M.code), F.where("gameId", "==", g)), s => { M.choices = s.docs.map(d => d.data()); render(); }, () => {}));
}
/* The move of the player whose turn it is: one document per turn, which only they can write. */
function subTurn() {
  const r = M.room, key = r && r.phase === "play" && r.step === "bid" ? `${r.gameId}_${r.seq}` : "";
  if (key === turnKey) return;
  off(turnSubs);
  turnKey = key; M.move = null;
  if (!key) return;
  turnSubs.push(F.onSnapshot(rMove(M.code, key), s => { M.move = s.exists() ? s.data() : null; render(); if (isMod()) hostSync(); }, () => {}));
}
/* Only the moderator reads every cup; the listener follows whoever is modo now. */
function subHost() {
  const key = isMod() && M.room ? M.room.gameId : "";
  if (key === hostKey) return;
  off(hostSubs);
  hostKey = key; M.deal = null;
  if (!key) return;
  hostSubs.push(F.onSnapshot(rDeal(M.code), s => { M.deal = s.exists() ? s.data() : null; render(); hostSync(); }, () => {}));
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
function enterRoom(code, tv = false) {
  Soiree.roomEntered(code, tv);
  leaveSubs();
  Object.assign(M, { mode: "room", tv, code, room: null, roomReady: false, players: [], playersReady: false,
    secret: null, move: null, deal: null, customs: [], choices: [], renaming: false, handover: false, offline: false });
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
    subTurn(); subHost(); subCustom();
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
  if (!tv) subs.push(F.onSnapshot(rSecret(code, M.me), s => { M.secret = s.exists() ? s.data() : null; render(); }, () => {}));
  render();
}
function exitRoom() {
  leaveSubs();
  Object.assign(M, { mode: "home", tv: false, code: null, room: null, players: [], secret: null, move: null, deal: null,
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
  const fav = Soiree.color();
  const color = fav && !used.has(fav) ? fav : COLORS.find(c => !used.has(c)) || COLORS[ps.size % COLORS.length];
  await F.setDoc(rPlayer(code, M.me), { nick, color, joinedAt: Date.now(), seen: F.serverTimestamp() });
}
const freshGame = () => ({
  gameId: rid(), phase: "lobby", round: 0, seq: 0, step: "bid", order: [], cast: {}, dice: {}, out: [], turnUid: "",
  bid: null, bids: [], pal: false, palUsed: [], res: null, history: [], house: [], paused: false
});
const freshRoom = () => ({
  ...freshGame(), start: 5, palOn: true, calza: true, help: false, timer: 0,
  gages: false, gageLvl: 1, maison: true, approve: false, apero: false
});
/* Every change of the room also stamps it, which tells the cleanup when a room was last used. */
const patchRoom = p => F.updateDoc(rRoom(M.code), { ...p, touchedAt: F.serverTimestamp() });
/* House gages the moderator accepted (or all of them, when approval is off). */
const usableCustoms = (r = M.room) => M.customs.filter(c => !r?.approve || c.ok || c.by === r.hostUid);

/* ---------- the round, as everyone sees it ---------- */
const totalDice = r => (r.order || []).reduce((s, id) => s + (r.dice?.[id] || 0), 0);
const aliveIds = r => (r.order || []).filter(id => (r.dice?.[id] || 0) > 0);
const myDice = r => M.secret && M.secret.gameId === r.gameId && M.secret.round === r.round && Array.isArray(M.secret.dice) ? M.secret.dice : null;
const moveNow = r => M.move && M.move.gameId === r.gameId && M.move.seq === r.seq ? M.move : null;
function timeLeft(r) {
  if (!r || !r.timer || r.phase !== "play" || r.step !== "bid" || !r.turnAt) return null;
  const end = tsMs(r.turnAt) + r.timer * 1000;
  const now = r.paused ? tsMs(r.pausedAt) || serverNow() : serverNow();
  return Math.max(0, Math.ceil((end - now) / 1000));
}
/* Final order: still in the game first (most dice first), then the last one out down to the first. */
function ranking(order, dice, out) {
  const alive = order.filter(id => (dice[id] || 0) > 0).sort((a, b) => dice[b] - dice[a]);
  return [...alive, ...[...out].reverse().filter(id => order.includes(id)), ...order.filter(id => !(dice[id] > 0) && !out.includes(id))];
}
/* The gage goes to the first one out; in a game stopped early, to whoever has the fewest dice. */
function losersOf(order, dice, out) {
  if (order.length < 2) return [];
  if (out.length) return [out[0]];
  const alive = order.filter(id => dice[id] > 0), n = alive.map(id => dice[id]);
  const min = Math.min(...n), max = Math.max(...n);
  return min < max ? alive.filter(id => dice[id] === min) : [];
}

/* ---------- moderator's page: rolling the dice and running the turns ----------
   Every cup lives in deal/current, which only the moderator can read. Each player's own dice are copied to secret/{uid}. */
async function dealRound(base, starter, pal, extra = {}) {
  const alive = (base.order || []).filter(id => (base.dice[id] || 0) > 0);
  const hands = Object.fromEntries(alive.map(id => [id, roll(base.dice[id])]));
  const round = (base.round || 0) + 1;
  const b = F.writeBatch(DB);
  b.set(rDeal(M.code), { gameId: base.gameId, round, hands });
  for (const id of alive) b.set(rSecret(M.code, id), { gameId: base.gameId, round, dice: hands[id] });
  b.update(rRoom(M.code), {
    ...extra, phase: "play", round, seq: (base.seq || 0) + 1, step: "bid", turnUid: starter, bid: null, bids: [], pal: !!pal, res: null,
    turnAt: F.serverTimestamp(), paused: false, pausedAt: null, touchedAt: F.serverTimestamp()
  });
  await b.commit();
}
function startGame(r) {
  const ids = M.players.map(p => p.id).slice(0, MAX_PLAYERS);
  const dice = Object.fromEntries(ids.map(id => [id, r.start || 5]));
  const cast = Object.fromEntries(ids.map(id => { const p = pInfo(id); return [id, { nick: p.nick, color: p.color || COLORS[0] }]; }));
  // The accepted house gages are copied into the game, so every phone draws the same gage at the end.
  const house = r.gages && r.maison ? usableCustoms(r).map(c => ({ kind: c.kind, text: c.text })) : [];
  return dealRound({ ...r, order: ids, dice, round: 0 }, ids[rand(ids.length)], false,
    { order: ids, cast, dice, out: [], palUsed: [], history: [], house });
}
/* A player who left the table during the round is out at the next one. */
function nextRound(r) {
  const here = new Set(M.players.map(p => p.id));
  const dice = { ...(r.dice || {}) }, out = [...(r.out || [])];
  for (const id of r.order || []) if (dice[id] > 0 && !here.has(id)) { dice[id] = 0; out.push(id); }
  const alive = (r.order || []).filter(id => dice[id] > 0);
  if (alive.length < 2) return patchRoom({ phase: "end", dice, out, paused: false });
  let starter = r.res?.starter;
  if (!(dice[starter] > 0)) starter = nextAlive(r.order, dice, starter);
  const pal = !!r.res?.pal && dice[r.res.lose] === 1;
  return dealRound({ ...r, dice }, starter, pal, { dice, out });
}
function reveal(r, d, kind, caller) {
  const s = settle({ kind, caller, bid: r.bid, hands: d.hands || {}, pal: !!r.pal, dice: r.dice || {}, start: r.start || 5, order: r.order || [] });
  const palUsed = r.palUsed || [];
  // A player who just fell to a single die gets their palifico round, once per game.
  const pal = !!r.palOn && !!s.lose && s.dice[s.lose] === 1 && !palUsed.includes(s.lose);
  const entry = { n: r.round, pal: !!r.pal, t: totalDice(r), one: aliveIds(r).filter(id => r.dice[id] === 1), bids: r.bids || [],
    k: kind, u: caller, bid: r.bid, count: s.count, lose: s.lose, gain: s.gain, out: s.out };
  return patchRoom({
    step: "reveal", seq: r.seq + 1, dice: s.dice, out: s.out ? [...(r.out || []), s.out] : r.out || [],
    palUsed: pal ? [...palUsed, s.lose] : palUsed, history: [...(r.history || []), entry],
    res: { k: kind, u: caller, bid: r.bid, hands: d.hands || {}, count: s.count, lose: s.lose, gain: s.gain, out: s.out, starter: s.starter, pal,
      up: !!s.gain && s.dice[s.gain] > (r.dice[s.gain] || 0) }
  });
}
/* A move that doesn't hold (a bid too low, a dudo with nothing to doubt) just gives the same player another go. */
function applyMove(r, d, mv) {
  const uid = r.turnUid;
  const retry = () => patchRoom({ seq: r.seq + 1 });
  if (mv.kind === "bid") {
    const q = +mv.q, f = +mv.f;
    if (!bidOk(r.bid, q, f, !!r.pal, r.dice[uid] === 1, totalDice(r))) return retry();
    const bid = { u: uid, q, f };
    return patchRoom({ bid, bids: [...(r.bids || []), bid], turnUid: nextAlive(r.order, r.dice, uid), seq: r.seq + 1, turnAt: F.serverTimestamp() });
  }
  if (!r.bid || (mv.kind === "calza" && !r.calza)) return retry();
  return reveal(r, d, mv.kind === "calza" ? "calza" : "dudo", uid);
}
/* When the timer runs out: the smallest raise on the same face, or dudo if nothing is left to bid. */
function autoMove(r, d) {
  const uid = r.turnUid, hand = d.hands?.[uid] || [], total = totalDice(r), free = r.dice[uid] === 1, pal = !!r.pal;
  if (!r.bid) { const f = bestFace(hand, pal); return { kind: "bid", f, q: Math.max(1, countIn(hand, f, pal)) }; }
  for (const f of [r.bid.f, 2, 3, 4, 5, 6, 1]) { const q = minQ(r.bid, f, pal, free); if (q != null && q <= total) return { kind: "bid", q, f }; }
  return { kind: "dudo" };
}
/* An absent player is skipped, unless that would hand the turn back to whoever made the bid. */
function skipTarget(r) {
  const order = r.order || [], n = order.length, i = order.indexOf(r.turnUid);
  for (let k = 1; k < n; k++) {
    const id = order[(i + k) % n];
    if ((r.dice[id] || 0) > 0 && idOnline(id)) return id === r.bid?.u ? "" : id;
  }
  return "";
}
function hostJob(r, d) {
  if (r.step !== "bid") return null;
  const mv = moveNow(r);
  if (mv && mv.uid === r.turnUid) return { name: "move", run: () => applyMove(r, d, mv) };
  if (timeLeft(r) === 0) return { name: "auto", run: () => applyMove(r, d, autoMove(r, d)) };
  if (!idOnline(r.turnUid)) { const to = skipTarget(r); if (to) return { name: "skip", run: () => patchRoom({ turnUid: to, seq: r.seq + 1, turnAt: F.serverTimestamp() }) }; }
  return null;
}
let hostBusy = false, jobDone = "";
async function hostSync() {
  if (Soiree.replaying) return;  // a replay never writes
  const r = M.room, d = M.deal;
  if (!isMod() || hostBusy || M.busy || !r || r.phase !== "play" || r.paused || !d || d.gameId !== r.gameId || d.round !== r.round) return;
  const job = hostJob(r, d);
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
  // Cups can't be listed (each is private), so they go by the uids we know.
  for (const id of new Set([...players.map(d => d.id), ...(r.order || [])])) await F.deleteDoc(rSecret(code, id)).catch(() => {});
  await F.deleteDoc(rDeal(code)).catch(() => {});
  for (const name of ["moves", "custom", "choices"]) for (const d of (await F.getDocs(col(name))).docs) await F.deleteDoc(d.ref);
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
function playerStats(ids, hist) {
  const S = Object.fromEntries(ids.map(id => [id, { id, bids: 0, pacos: 0, ratio: 0, rq: 0, rt: 0, dudoOk: 0, dudoKo: 0,
    calzaOk: 0, calzaKo: 0, caught: 0, honest: 0, lost: 0, one: 0, outAt: 0, faces: {} }]));
  for (const h of hist) {
    for (const b of h.bids || []) {
      const x = S[b.u];
      if (!x) continue;
      x.bids++; x.faces[b.f] = (x.faces[b.f] || 0) + 1;
      if (b.f === 1) x.pacos++;
      // A paco bid weighs double: it says as much as twice as many dice of another face.
      const ratio = (b.f === 1 && !h.pal ? b.q * 2 : b.q) / (h.t || 1);
      if (ratio > x.ratio) { x.ratio = ratio; x.rq = b.q; x.rt = h.t; x.rf = b.f; }
    }
    for (const id of h.one || []) if (S[id]) S[id].one++;
    const c = S[h.u], bidder = h.bid && S[h.bid.u];
    if (h.k === "dudo") {
      const truthful = h.count >= h.bid.q;
      if (c) truthful ? c.dudoKo++ : c.dudoOk++;
      if (bidder) truthful ? bidder.honest++ : bidder.caught++;
    } else if (c) h.gain ? c.calzaOk++ : c.calzaKo++;
    if (h.lose && S[h.lose]) S[h.lose].lost++;
    if (h.out && S[h.out]) S[h.out].outAt = h.n;
  }
  return S;
}

/* ---------- profile, kept on this phone ---------- */
function profile() {
  return { color: null, games: 0, wins: 0, dudos: 0, calzas: 0, titles: {}, faces: {}, recorded: [], ...store.json("profile", {}) };
}
function saveProfile(p) { store.set("profile", JSON.stringify(p)); Soiree.statsSaved(p); }  // also kept in the account
function recordGame(gameId, ids, rank, hist, titles) {
  const p = profile();
  if (!gameId || p.recorded.includes(gameId) || !ids.includes(M.me) || !hist.length) return;
  const s = playerStats(ids, hist)[M.me];
  p.games++;
  if (rank[0] === M.me) p.wins++;
  p.dudos += s.dudoOk; p.calzas += s.calzaOk;
  for (const [f, n] of Object.entries(s.faces)) p.faces[f] = (p.faces[f] || 0) + n;
  const t = titles[M.me];
  if (t) p.titles[t.title] = (p.titles[t.title] || 0) + 1;
  p.recorded = [...p.recorded, gameId].slice(-50);
  saveProfile(p);
}

/* ---------- end-of-game titles ---------- */
const TITLE_RULES = [
  { label: "Roi du calza", w: 4, score: s => s.calzaOk, why: s => s.calzaOk > 1 ? `${s.calzaOk} calzas réussis` : "un calza réussi, pile le bon compte" },
  { label: "Kamikaze", w: 4, score: s => s.ratio >= .55 ? s.ratio : 0, why: s => `a annoncé ${s.rf === 1 ? plural(s.rq, "paco") : s.rq + " dés"} avec ${s.rt} dés en jeu` },
  { label: "Détecteur de mensonges", w: 3, score: s => s.dudoOk >= 2 ? s.dudoOk : 0, why: s => `${s.dudoOk} dudos gagnants` },
  { label: "Poker face", w: 2.8, score: s => s.honest >= 2 ? s.honest : 0, why: s => `${s.honest} annonces mises en doute… et vraies` },
  { label: "Menteur démasqué", w: 2.4, score: s => s.caught >= 2 ? s.caught : 0, why: s => `${s.caught} bluffs démasqués` },
  { label: "Increvable", w: 2.2, score: s => s.one >= 3 ? s.one : 0, why: s => `${s.one} manches avec un seul dé` },
  { label: "Parano", w: 2, score: s => s.dudoKo >= 2 ? s.dudoKo : 0, why: s => `${s.dudoKo} dudos ratés` },
  { label: "Amoureux des pacos", w: 1.6, score: s => s.pacos >= 3 ? s.pacos : 0, why: s => `${s.pacos} annonces en pacos` },
  { label: "Tête brûlée", w: 1.4, score: s => s.calzaKo >= 2 ? s.calzaKo : 0, why: s => `${s.calzaKo} calzas ratés` },
  { label: "Grande gueule", w: .5, score: s => s.bids >= 8 ? s.bids : 0, why: s => `${s.bids} annonces` }
];
function computeTitles(ids, hist) {
  const S = playerStats(ids, hist), cands = [];
  for (const s of Object.values(S)) for (const rule of TITLE_RULES) {
    const sc = rule.score(s);
    if (sc > 0) cands.push({ uid: s.id, label: rule.label, title: rule.label, why: rule.why(s), score: sc * rule.w });
  }
  cands.sort((a, b) => b.score - a.score);
  const out = {}, used = new Set();
  for (const c of cands) if (!out[c.uid] && !used.has(c.label)) { out[c.uid] = c; used.add(c.label); }
  for (const id of ids) if (!out[id]) out[id] = { title: "Joueur de l'ombre", why: "pas un mot de trop" };
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
  return `<header class="top ${big ? "big" : ""}"><h1 class="logo">Perudo</h1>${badge ? `<span class="badge">${esc(badge)}</span>` : ""}</header>`;
}
function errBox() {
  return (M.err ? `<div class="err" role="alert">${esc(M.err)}</div>` : "") + (M.flash ? `<div class="note" role="status">${esc(M.flash)}</div>` : "");
}
/* A die drawn in SVG; the paco (1) carries a star instead of a pip. */
const PIPS = { 2: [[8, 8], [22, 22]], 3: [[8, 8], [15, 15], [22, 22]], 4: [[8, 8], [22, 8], [8, 22], [22, 22]],
  5: [[8, 8], [22, 8], [15, 15], [8, 22], [22, 22]], 6: [[8, 8], [22, 8], [8, 15], [22, 15], [8, 22], [22, 22]] };
const STAR = "M15 6.5L17.23 12.43L23.56 12.72L18.61 16.67L20.29 22.78L15 19.3L9.71 22.78L11.39 16.67L6.44 12.72L12.77 12.43Z";
function die(v, cls = "", i = 0) {
  const inner = v === 1 ? `<path d="${STAR}"/>` : (PIPS[v] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3"/>`).join("");
  return `<span class="die ${v === 1 ? "paco" : ""} ${cls}" style="--i:${i}" role="img" aria-label="${v === 1 ? "paco" : v}"><svg viewBox="0 0 30 30" aria-hidden="true">${inner}</svg></span>`;
}
const bidHtml = (b, cls = "") => `<span class="bid ${cls}" aria-label="${esc(bidText(b))}"><b class="q">${b.q}</b><span class="x" aria-hidden="true">×</span>${die(b.f)}</span>`;
function sw(on, act, title, sub) {
  return `<button class="switch" data-act="${act}" aria-pressed="${!!on}"><span class="knob"></span><span><b>${title}</b><br><small>${sub}</small></span></button>`;
}
const togs = (list, cur, act, label) => `<div class="toggles">${list.map(v => `<button class="tog" data-act="${act}" data-id="${v}" aria-pressed="${cur === v}">${label(v)}</button>`).join("")}</div>`;
/* o: { start, timer, palOn, calza, help, gages, gageLvl, maison, approve, apero, acts } — a missing act hides its setting. */
function settingsPanel(o) {
  const a = o.acts;
  return `<section class="panel">
    <div class="label">Dés par joueur</div>
    ${togs(STARTS, o.start || 5, a.start, v => v)}
    ${a.timer ? `<div class="label">Chrono par tour</div>
      ${togs(TIMERS, o.timer || 0, a.timer, v => v ? v + " s" : "Aucun")}
      <p class="hint left">Au bout du chrono, l'appli surenchérit au minimum à la place du joueur.</p>` : ""}
  </section>
  <section class="panel">
    <div class="label">Règles</div>
    ${sw(o.palOn, a.palOn, "Palifico", "Qui tombe à un seul dé ouvre une manche spéciale : pacos sans joker, et la valeur annoncée ne change plus.")}
    ${sw(o.calza, a.calza, "Calza", "Parier que l'annonce est pile juste : on regagne un dé si c'est vrai, on en perd un sinon.")}
    ${sw(o.help, a.help, "Aide au calcul", "Chacun voit, d'après ses propres dés, les chances que l'annonce soit vraie.")}
  </section>
  <section class="panel">
    <div class="label">Options</div>
    ${sw(o.gages, a.gages, "Gages et vérités", "À la fin, le premier sorti choisit entre un gage et une vérité.")}
    ${o.gages ? `${togs([1, 2, 3, 4], o.gageLvl || 1, a.gageLvl, v => GAGE_LEVELS[v - 1])}
      <p class="hint left">Chaque niveau pioche aussi dans les plus doux. Ce qui touche quelqu'un d'autre se fait avec son accord.</p>
      ${sw(o.maison, a.maison, "Gages maison", "Vos propres gages et vérités : ils ont une chance sur deux de sortir.")}
      ${a.approve && o.maison ? sw(o.approve, a.approve, "Valider les gages des joueurs", "Les gages proposés par les autres attendent ton accord.") : ""}` : ""}
    ${sw(o.apero, a.apero, "Mode apéro", `Qui perd un dé boit ${SIPS} gorgées. Un calza réussi en distribue ${SIPS}.`)}
  </section>`;
}
function settingsSummary(r) {
  const tags = [plural(r.start || 5, "dé") + " chacun", ...(r.timer ? [`Chrono ${r.timer} s`] : []), ...(r.palOn ? ["Palifico"] : []),
    ...(r.calza ? ["Calza"] : []), ...(r.help ? ["Aide au calcul"] : []), ...(r.gages ? [`Gages ${GAGE_LEVELS[(r.gageLvl || 1) - 1]}`] : []),
    ...(r.gages && r.maison ? ["Gages maison"] : []), ...(r.apero ? ["Mode apéro"] : [])];
  return `<div class="summary">${tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>`;
}
/* o: { form, delAct, canDel, pending, approveAct, empty } */
function customBlock(list, o) {
  const dare = M.gkind === "dare";
  return `<section class="panel">
    <div class="label">Gages maison</div>
    <div class="toggles">${[["dare", "Un gage"], ["truth", "Une vérité"]].map(([k, n]) => `<button class="tog" data-act="gkind" data-id="${k}" aria-pressed="${M.gkind === k}">${n}</button>`).join("")}</div>
    <form class="row" data-form="${o.form}"><input id="${o.form}" data-draft="${o.form}" type="text" maxlength="140" autocomplete="off" enterkeyhint="done"
      placeholder="${dare ? "Appelle ton ex et chante-lui un tube des années 80." : "Quel est ton pire mensonge de la soirée ?"}" aria-label="${dare ? "Nouveau gage" : "Nouvelle vérité"}"><button class="btn" type="submit">Ajouter</button></form>
    ${list.length ? `<ul class="customs">${list.map(c => {
      const waiting = o.pending && o.pending(c);
      return `<li class="${waiting ? "wait-ok" : ""}"><span><small class="tagline">${c.kind === "truth" ? "Vérité" : "Gage"}${waiting ? " · en attente de validation" : ""}</small>${esc(c.text)}</span>
        <span class="acts">${waiting && o.approveAct ? `<button class="link" data-act="${o.approveAct}" data-id="${esc(c.id)}">Valider</button>` : ""}
        ${o.canDel(c) ? `<button class="link" data-act="${o.delAct}" data-id="${esc(c.id)}" aria-label="Supprimer ce gage">${waiting && o.approveAct ? "Refuser" : "Retirer"}</button>` : ""}</span></li>`;
    }).join("")}</ul>` : `<p class="hint left">${o.empty}</p>`}
  </section>`;
}
/* My own dice. With the cup on, they only show while the button is held down. */
function myDicePanel(dice, key, label = "Tes dés") {
  const show = !M.cup || M.peek;
  return `<section class="panel mydice" data-key="${esc(key)}">
    <div class="label">${label} · ${dice.length}</div>
    ${show ? `<div class="dice">${dice.map((v, i) => die(v, "", i)).join("")}</div>`
      : `<button class="btn cupbtn" data-hold="1" aria-label="Maintenir pour voir tes dés">Maintiens pour soulever le gobelet</button>`}
    <button class="link" data-act="cup" style="align-self:flex-start">${M.cup ? "Toujours montrer mes dés" : "Cacher mes dés sous le gobelet"}</button>
  </section>`;
}
/* The current bid, and whose turn it is. */
function bidNow(r, info, opts = {}) {
  const b = r.bid, turn = info(r.turnUid), me = !opts.noMe && r.turnUid === M.me;
  return `<section class="panel center bidnow" data-key="${esc(`b${r.round}.${b ? b.q + "." + b.f : 0}`)}">
    <div class="label">${b ? `Annonce de ${esc(info(b.u).nick)}` : `Manche ${r.round} · personne n'a encore annoncé`}</div>
    ${b ? bidHtml(b, "big") : `<div class="nobid">À ${esc(turn.nick)} d'ouvrir</div>`}
    <div class="turn ${me ? "me" : ""}">${me ? "À toi de jouer !" : `${av(turn)}<span>${esc(turn.nick)} réfléchit<span class="dots"></span></span>`}</div>
  </section>${r.pal ? `<div class="note pal"><b>Palifico !</b> Les pacos ne sont pas des jokers, et la valeur annoncée ne change plus, sauf pour qui n'a qu'un dé.</div>` : ""}`;
}
/* The bid builder. o: { key, prev, pal, free, total, hand, calza, help, pfx } */
function initDraft(o) {
  if (M.bkey === o.key) return;
  M.bkey = o.key;
  const can = f => { const m = minQ(o.prev, f, o.pal, o.free); return m != null && m <= o.total; };
  const pref = [o.prev?.f, bestFace(o.hand || [], o.pal), 2, 3, 4, 5, 6, 1].filter(Boolean);
  M.bf = pref.find(can) || 0;
  M.bq = M.bf ? minQ(o.prev, M.bf, o.pal, o.free) : 0;
}
function composer(o) {
  initDraft(o);
  const m = M.bf ? minQ(o.prev, M.bf, o.pal, o.free) : null;
  const ok = m != null && M.bq >= m && M.bq <= o.total;
  const faces = [1, 2, 3, 4, 5, 6].map(f => {
    const mf = minQ(o.prev, f, o.pal, o.free), can = mf != null && mf <= o.total;
    return `<button class="face ${f === M.bf ? "cur" : ""}" data-act="${o.pfx}face" data-id="${f}" aria-pressed="${f === M.bf}" ${can ? "" : "disabled"} aria-label="${f === 1 ? "Pacos" : "Des " + f}${can ? `, au moins ${mf}` : ""}">${die(f)}<small>${can ? "≥ " + mf : "—"}</small></button>`;
  }).join("");
  let help = "";
  if (o.help && o.hand) {
    const lines = [];
    if (ok) { const x = odds(o.hand, { q: M.bq, f: M.bf }, o.total, o.pal); lines.push(`Ton annonce : tu en as ${x.mine}${x.need > 0 ? `, il en manque ${x.need} chez les autres` : ""}. Vraie dans <b>${pct(x.atLeast)}</b> des cas.`); }
    if (o.prev) { const x = odds(o.hand, o.prev, o.total, o.pal); lines.push(`L'annonce en cours est vraie dans <b>${pct(x.atLeast)}</b> des cas${o.calza ? `, pile juste dans <b>${pct(x.exact)}</b>` : ""}.`); }
    help = lines.length ? `<div class="help">${lines.map(l => `<p>${l}</p>`).join("")}</div>` : "";
  }
  return `<section class="panel bidbox">
    <div class="label">Ton annonce</div>
    <div class="faces">${faces}</div>
    ${!o.pal ? `<p class="hint left">Passer aux pacos : la moitié des dés, arrondie au-dessus. En sortir : le double plus un.</p>` : ""}
    ${M.bf ? `<div class="qty">
      <button class="btn step" data-act="${o.pfx}less" ${M.bq <= (m || 1) ? "disabled" : ""} aria-label="Un dé de moins">−</button>
      ${bidHtml({ q: M.bq, f: M.bf }, "big")}
      <button class="btn step" data-act="${o.pfx}more" ${M.bq >= o.total ? "disabled" : ""} aria-label="Un dé de plus">+</button>
    </div>
    <button class="btn primary big" data-act="${o.pfx}bid" ${ok ? "" : "disabled"}>Annoncer ${esc(bidText({ q: M.bq, f: M.bf }))}</button>`
      : `<p class="lead">Impossible de monter plus haut : à toi de trancher.</p>`}
    ${o.prev ? `<div class="btns calls">
      <button class="btn dudo" data-act="${o.pfx}dudo">Dudo !<small>Je n'y crois pas</small></button>
      ${o.calza ? `<button class="btn calza" data-act="${o.pfx}calza">Calza !<small>C'est pile juste</small></button>` : ""}
    </div>` : `<p class="hint left">${o.pal ? "Palifico : tu peux ouvrir sur n'importe quelle valeur, même les pacos." : "On n'ouvre pas une manche sur les pacos."}</p>`}
    ${help}
  </section>`;
}
/* Everyone at the table, with the number of dice under each cup. */
function tablePanel(r, info, opts = {}) {
  const order = r.order || [], live = r.phase === "play" && r.step === "bid";
  return `<section class="panel">
    <div class="label">La table · ${plural(totalDice(r), "dé")} en jeu</div>
    <ol class="seats">${order.map(id => {
      const p = info(id), n = r.dice?.[id] || 0, turn = live && id === r.turnUid;
      const away = opts.online && id !== M.me && !idOnline(id);
      return `<li class="${turn ? "turn" : ""} ${n ? "" : "out"}">${av(p)}<span class="nm">${esc(p.nick)}${opts.online && id === M.room?.hostUid ? ` <span class="tag">modo</span>` : ""}${away && n ? ` <span class="tag off">absent</span>` : ""}${turn ? ` <span class="tag win">son tour</span>` : ""}</span>
        ${n ? `<span class="cups" aria-label="${plural(n, "dé")}">${Array.from({ length: n }, () => "<i></i>").join("")}</span><b class="n">${n}</b>` : `<span class="tag off">hors jeu</span>`}</li>`;
    }).join("")}</ol>
  </section>`;
}
function bidsPanel(bids, info) {
  if (!bids.length) return "";
  return `<section class="panel"><div class="label">Annonces de la manche</div>
    <ol class="bids">${[...bids].reverse().map((b, i) => `<li class="${i ? "" : "last"}">${av(info(b.u))}<span class="nm">${esc(info(b.u).nick)}</span>${bidHtml(b)}</li>`).join("")}</ol></section>`;
}
/* Lifting the cups: every die on the table, the ones that count in colour. */
function revealPanel(res, order, info, o = {}) {
  const b = res.bid, pal = !!o.pal, caller = info(res.u);
  const lose = res.lose && info(res.lose), gain = res.gain && info(res.gain);
  // A calza that hits while the player still has all their dice wins nothing more.
  const capped = gain && !res.up;
  let verdict;
  if (lose) verdict = `${esc(lose.nick)} perd un dé${res.out ? " et sort du jeu" : ""}`;
  else verdict = capped ? `${esc(gain.nick)} garde tous ses dés` : `${esc(gain.nick)} regagne un dé`;
  const ids = order.filter(id => res.hands?.[id]);
  return `<section class="panel center verdict reveal" data-key="${esc("r" + o.key)}" aria-live="polite">
    <div class="label">${esc(caller.nick)} : ${res.k === "calza" ? "Calza !" : "Dudo !"}</div>
    <div class="vsub">sur l'annonce de ${esc(info(b.u).nick)}</div>
    ${bidHtml(b, "big")}
    <div class="count">Il y en avait <b>${res.count}</b></div>
    <div class="vsub">${b.f === 1 || pal ? "" : "pacos compris · "}${res.k === "calza" ? (res.count === b.q ? "pile juste !" : "pas pile juste") : res.count >= b.q ? "l'annonce était vraie" : "c'était du bluff"}</div>
    <div class="name">${verdict}</div>
    ${o.apero ? `<div class="sips">${lose ? `${esc(lose.nick)} boit ${SIPS} gorgées` : `${esc(gain.nick)} distribue ${SIPS} gorgées`}</div>` : ""}
  </section>
  <section class="panel"><div class="label">Sous les gobelets</div>
    <ul class="hands">${ids.map(id => {
      const p = info(id), h = res.hands[id], n = countIn(h, b.f, pal);
      return `<li>${chip(p)}<span class="dice">${h.map((v, i) => die(v, matches(v, b.f, pal) ? "hit" : "miss", i)).join("")}</span><b class="n">${n}</b></li>`;
    }).join("")}</ul>
  </section>`;
}
function palmares(rank, dice, hist, titles, info, shareAct) {
  if (!hist.length) return `<section class="panel"><p class="lead">Aucune manche jouée pour l'instant.</p></section>`;
  const S = playerStats(rank, hist);
  return `<section class="panel">
    <div class="label">Classement · ${plural(hist.length, "manche")}</div>
    <ol class="rank">${rank.map((id, i) => {
      const p = info(id), t = titles[id], s = S[id], n = dice[id] || 0;
      const where = i === 0 && n ? `Vainqueur · ${plural(n, "dé")} ${n > 1 ? "restants" : "restant"}` : n ? `${plural(n, "dé")} ${n > 1 ? "restants" : "restant"}` : s.outAt ? `hors jeu à la manche ${s.outAt}` : "a quitté la table";
      const facts = [s.bids && plural(s.bids, "annonce"), (s.dudoOk || s.dudoKo) && `dudos : ${s.dudoOk} gagné${s.dudoOk > 1 ? "s" : ""}, ${s.dudoKo} raté${s.dudoKo > 1 ? "s" : ""}`,
        (s.calzaOk || s.calzaKo) && `calzas : ${s.calzaOk} réussi${s.calzaOk > 1 ? "s" : ""}, ${s.calzaKo} raté${s.calzaKo > 1 ? "s" : ""}`,
        s.caught && `${plural(s.caught, "bluff")} ${s.caught > 1 ? "démasqués" : "démasqué"}`, s.honest && `${plural(s.honest, "annonce")} ${s.honest > 1 ? "vraies mises" : "vraie mise"} en doute`,
        s.pacos && `${plural(s.pacos, "annonce")} en pacos`, s.lost && `${plural(s.lost, "dé")} ${s.lost > 1 ? "perdus" : "perdu"}`].filter(Boolean);
      return `<li><details>
      <summary><span class="pos">${i + 1}</span>${av(p)}<span class="who"><b>${esc(p.nick)}</b>
        ${t ? `<span class="title">${esc(t.title)}</span>` : ""}
        <small>${esc(where)}${t ? " · " + esc(t.why) : ""}</small></span></summary>
      <ul>${facts.length ? facts.map(f => `<li>${esc(f)}</li>`).join("") : "<li>Pas une annonce. Très mystérieux.</li>"}</ul>
    </details></li>`;
    }).join("")}</ol>
    ${shareAct ? `<button class="btn" data-act="${shareAct}">Partager le classement en image</button>` : ""}
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
  return `<div class="timer ${left <= 5 ? "hurry" : ""}"><div class="tl"><span>${label}</span><b>${left} s</b></div><div class="bar"><i style="width:${pctW}%"></i></div></div>`;
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
      <li>Chacun a <b>5 dés</b> sous son gobelet : ici, sur son téléphone. Personne d'autre ne les voit.</li>
      <li>À tour de rôle, on annonce combien il y a <b>au moins</b> de dés d'une valeur sur toute la table : « 4 dés de 3 ».</li>
      <li>Les 1, les <b>pacos</b>, sont des jokers : ils comptent pour toutes les valeurs. On n'ouvre pas une manche sur les pacos.</li>
      <li>Chaque annonce doit monter : plus de dés, ou autant de dés d'une valeur plus forte. Passer aux pacos : la moitié des dés, arrondie au-dessus. En sortir : le double plus un.</li>
      <li>Tu n'y crois pas ? <b>Dudo !</b> On soulève les gobelets. Annonce fausse : son auteur perd un dé. Annonce vraie : c'est toi qui en perds un.</li>
      <li><b>Calza !</b> Tu paries que c'est pile juste. Gagné : tu regagnes un dé. Perdu : tu en perds un.</li>
      <li><b>Palifico</b> : qui tombe à un seul dé ouvre la manche suivante. Les pacos n'y sont plus des jokers, et la valeur annoncée ne change plus.</li>
      <li>Le dernier qui a encore des dés gagne.</li>
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
  const p = profile();
  const face = topOf(p.faces), title = topOf(p.titles);
  return `<section class="panel">
    <div class="label">Mon profil</div>
    ${p.games ? `<ul class="stats">
        <li><b>${p.games}</b> ${p.games > 1 ? "parties" : "partie"}</li>
        <li><b>${p.wins}</b> ${p.wins > 1 ? "victoires" : "victoire"}</li>
        <li><b>${p.dudos}</b> ${p.dudos > 1 ? "dudos gagnants" : "dudo gagnant"}</li>
      </ul>
      ${p.calzas ? `<p class="hint left">Calzas réussis : <b>${p.calzas}</b>.</p>` : ""}
      ${face ? `<p class="hint left">Ta valeur fétiche : <b>${+face[0] === 1 ? "les pacos" : "le " + face[0]}</b> (${plural(face[1], "annonce")}).</p>` : ""}
      ${title ? `<p class="hint left">Ton titre fétiche : <b>${esc(title[0])}</b>.</p>` : ""}`
      : `<p class="hint left">Tes stats apparaîtront ici après ta première partie en ligne. Elles restent sur ce téléphone.</p>`}
  </section>`;
}
function installPanel() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) return "";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (M.installEvt) return `<button class="btn big" data-act="install">Installer l'appli sur ce téléphone</button>`;
  if (ios) return `<p class="hint">Pour l'installer : bouton Partager de Safari, puis « Sur l'écran d'accueil ».</p>`;
  return "";
}
function renderHome() {
  const invited = M.drafts.code && M.drafts.code.length === 4 && hashCode() === M.drafts.code;
  const nickField = `<input id="nick" data-draft="nick" type="text" maxlength="18" autocomplete="nickname" enterkeyhint="next" placeholder="Ton prénom ou surnom" aria-label="Ton prénom">`;
  const joinForm = `<form class="stack" data-form="join-code">
      <input id="code" class="codein" data-draft="code" type="text" maxlength="4" autocomplete="off" autocapitalize="characters" enterkeyhint="go" placeholder="CODE" aria-label="Code de la partie">
      <button class="btn ${invited ? "primary big" : ""}" type="submit">Rejoindre la partie</button>
    </form>`;
  return header(true) + `<p class="tagline">Des dés sous un gobelet, des annonces de plus en plus folles, et un seul mot pour démasquer les menteurs : Dudo !</p>
  <div class="hero-dice" aria-hidden="true">${[1, 5, 3, 1, 6].map((v, i) => die(v, "", i)).join("")}</div>` + errBox() + `<section class="panel">
    <div class="label">Ton prénom</div>${nickField}
  </section>
  ${invited
    ? `<section class="panel"><div class="label">Tu es invité à la partie</div><div class="code">${esc(M.drafts.code)}</div>${joinForm}</section>
       <div class="or">ou</div>
       <button class="btn big" data-act="create">Créer ma propre partie</button>`
    : `<button class="btn primary big" data-act="create">Créer une partie</button>
       <p class="hint on-ground">Tu seras le modo : tu règles la partie et tu lances les manches.</p>
       <div class="or">ou</div>
       <section class="panel"><div class="label">Rejoindre avec un code</div>${joinForm}</section>`}
  ${rulesBox()}
  ${profilePanel()}
  ${installPanel()}
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
      <p class="hint left">Ouvre ce lien sur le grand écran : il montre la table, les annonces et les gobelets soulevés, jamais les dés cachés.</p>
      <div class="row"><input type="text" readonly value="${esc(tvLink())}" aria-label="Lien grand écran" onclick="this.select()"><button class="btn" data-act="copy-tv">Copier</button></div>
    </details>` : ""}
  </section>`;
}
function playersPanel(players, editable) {
  return `<section class="panel">
    <div class="label">À table · ${players.length}${players.length > MAX_PLAYERS ? ` (${MAX_PLAYERS} au plus par partie)` : ""}</div>
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
  if (!M.roomReady || !M.playersReady) return header(true, "Partie " + M.code) + `<section class="panel center loading">Connexion à la table…</section>`;
  if (M.tv) return renderTv();
  const r = M.room, players = M.players, mod = isMod();
  const badge = (mod ? "Modo · " : "Partie ") + M.code;
  if (!inRoom()) {
    return header(true, badge) + errBox() + `<section class="panel">
      <p class="lead">${r.phase === "play" ? "Une partie est en cours. Entre ton prénom : tu la regardes, et tu joues à la suivante." : "Entre ton prénom pour t'asseoir à la table."}</p>
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
      : "Propose tes propres gages. Personne ne les voit à part toi et le modo : ils tomberont peut-être sur le perdant."
  }) : "";
  if (!mod) {
    return `${invitePanel()}${playersPanel(players, false)}
    <section class="panel"><div class="label">Réglages de la partie</div>${settingsSummary(r)}</section>
    ${waitMod("Le modo prépare la partie")}
    ${custom}${rulesBox()}
    <p class="foot"><button class="link" data-act="leave">Quitter la partie</button> · <button class="link" data-act="exit">Retour à l'accueil</button></p>`;
  }
  const why = players.length < MIN_PLAYERS ? `Il faut au moins ${MIN_PLAYERS} joueurs.` : "";
  return `${invitePanel()}${playersPanel(players, true)}
  ${settingsPanel({ start: r.start, timer: r.timer, palOn: r.palOn, calza: r.calza, help: r.help, gages: r.gages, gageLvl: r.gageLvl, maison: r.maison, approve: r.approve, apero: r.apero,
    acts: { start: "start-dice", timer: "timer", palOn: "pal-on", calza: "calza-on", help: "help", gages: "gages", gageLvl: "gage-lvl", maison: "maison", approve: "approve", apero: "apero" } })}
  ${custom}
  <button class="btn primary big" data-act="start" ${why ? "disabled" : ""}>Secouer les gobelets</button>
  ${why ? `<p class="hint on-ground">${esc(why)}</p>` : players.length > MAX_PLAYERS ? `<p class="hint on-ground">Seuls les ${MAX_PLAYERS} premiers arrivés jouent cette partie.</p>` : ""}
  <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
}
function playScreen(r, mod) {
  const dealt = (r.order || []).includes(M.me), mine = r.dice?.[M.me] || 0;
  let h = "";
  if (r.paused && !mod) return bidNow(r, pInfo) + pauseScreen() + tablePanel(r, pInfo, { online: true });
  if (r.paused) h += `<div class="note"><b>Partie en pause.</b> Les joueurs voient un écran de pause. <button class="link" data-act="pause">Reprendre</button></div>`;
  if (r.step === "bid") {
    const hand = myDice(r), myTurn = r.turnUid === M.me, sent = moveNow(r);
    h += bidNow(r, pInfo);
    h += timerBar(timeLeft(r), r.timer, myTurn ? "Ton temps" : "Temps de " + pInfo(r.turnUid).nick);
    if (!dealt) h += `<section class="panel"><p class="lead">Tu regardes cette partie. Tu joueras à la prochaine.</p></section>`;
    else if (!mine) h += `<section class="panel"><p class="lead">Tu es hors jeu. Reste pour voir qui va gagner !</p></section>`;
    else if (!hand) h += `<section class="panel center loading">On secoue les gobelets…</section>`;
    else {
      h += myDicePanel(hand, `${r.gameId}.${r.round}`);
      if (myTurn && !sent) {
        h += composer({ key: `${r.gameId}.${r.seq}`, prev: r.bid, pal: !!r.pal, free: mine === 1, total: totalDice(r), hand, calza: !!r.calza, help: !!r.help, pfx: "" });
      } else if (myTurn) {
        h += `<p class="note">C'est envoyé…</p>`;
      } else if (r.help && r.bid) {
        const x = odds(hand, r.bid, totalDice(r), !!r.pal);
        h += `<div class="help"><p>D'après tes dés, l'annonce en cours est vraie dans <b>${pct(x.atLeast)}</b> des cas.</p></div>`;
      }
    }
    h += bidsPanel(r.bids || [], pInfo);
  } else {
    const res = r.res;
    h += res ? revealPanel(res, r.order || [], pInfo, { pal: !!r.pal, apero: r.apero, key: `${r.gameId}.${r.round}` }) : "";
    const over = aliveIds(r).length < 2;
    if (res?.pal && !over) h += `<div class="note pal"><b>Palifico</b> pour ${esc(pInfo(res.lose).nick)} à la prochaine manche.</div>`;
    h += mod ? `<button class="btn primary big" data-act="next">${over ? "Voir le classement final" : "Manche suivante"}</button>`
      : waitMod(over ? "Le classement final arrive" : "Manche suivante bientôt");
  }
  h += tablePanel(r, pInfo, { online: true });
  if (mod) {
    const turnAway = r.step === "bid" && r.turnUid !== M.me;
    h += `<p class="foot">${turnAway ? `<button class="link" data-act="skip-turn">Passer le tour de ${esc(pInfo(r.turnUid).nick)}</button> · ` : ""}<button class="link" data-act="pause">${r.paused ? "Reprendre la partie" : "Mettre en pause"}</button> · <button class="link" data-act="end">Terminer la partie</button></p>`;
    if (r.step === "bid" && !idOnline(r.turnUid)) h += `<p class="hint on-ground">${esc(pInfo(r.turnUid).nick)} ne répond plus : son tour passe tout seul au suivant.</p>`;
  }
  return h;
}
function endScreen(r, players, mod) {
  const order = r.order || [], hist = r.history || [], dice = r.dice || {};
  const rank = ranking(order, dice, r.out || []);
  const titles = computeTitles(order, hist);
  recordGame(r.gameId, order, rank, hist, titles);
  const losers = losersOf(order, dice, r.out || []).map(pInfo);
  const h = winnerPanel(rank, dice, pInfo, hist.length) + palmares(rank, dice, hist, titles, pInfo, "share-img")
    + gagesPanel({ on: r.gages, losers, lvl: r.gageLvl, seed: r.gameId, house: r.house || [], act: "choose",
      choiceOf: uid => M.choices.find(c => c.uid === uid)?.kind, canChoose: uid => uid === M.me });
  if (!mod) return h + playersPanel(players, false) + waitMod("Le modo peut lancer une nouvelle partie");
  return h + playersPanel(players, true) + `<button class="btn primary big" data-act="newgame">Nouvelle partie</button>
    <p class="hint on-ground">Les joueurs restent à table. Tu pourras changer les réglages avant de relancer.</p>`;
}
function winnerPanel(rank, dice, info, rounds) {
  const w = rank[0];
  if (!w || !rounds) return "";
  const alone = rank.filter(id => dice[id] > 0).length === 1;
  return `<section class="panel center verdict"><div class="label">${alone ? "Dernier gobelet debout" : "En tête quand la partie s'arrête"}</div>
    ${av(info(w), "huge")}<div class="name">${esc(info(w).nick)}</div><div class="vsub">${plural(dice[w] || 0, "dé")} ${dice[w] > 1 ? "restants" : "restant"} · ${plural(rounds, "manche")}</div></section>`;
}

/* ---------- big screen (TV / laptop): watches the game, never sees a hidden die ---------- */
function renderTv() {
  const r = M.room, players = M.players;
  let h = header(true, "Partie " + M.code) + alerts();
  if (r.phase === "lobby") {
    h += `<section class="panel center tvjoin">
      <div class="label">Pour jouer, scanne ou tape le code</div>
      <div class="tvrow"><div class="qr big" data-qr="${esc(inviteLink())}"></div><div><div class="code">${esc(M.code)}</div><p class="lead">${esc(location.host + location.pathname)}</p></div></div>
    </section>
    <section class="panel"><div class="label">À table · ${players.length}</div><div class="chips">${players.map(p => chip(p)).join("")}</div></section>
    <section class="panel">${settingsSummary(r)}</section>`;
  } else if (r.phase === "play") {
    if (r.paused) return h + bidNow(r, pInfo, { noMe: true }) + pauseScreen();
    const main = r.step === "bid"
      ? bidNow(r, pInfo, { noMe: true }) + timerBar(timeLeft(r), r.timer, "Temps de " + pInfo(r.turnUid).nick) + bidsPanel(r.bids || [], pInfo)
      : r.res ? revealPanel(r.res, r.order || [], pInfo, { pal: !!r.pal, apero: r.apero, key: `${r.gameId}.${r.round}` }) : "";
    h += `<div class="tvgrid"><div class="stack">${main}</div><div class="stack">${tablePanel(r, pInfo, { online: true })}</div></div>`;
  } else {
    const order = r.order || [], hist = r.history || [], rank = ranking(order, r.dice || {}, r.out || []);
    h += winnerPanel(rank, r.dice || {}, pInfo, hist.length) + palmares(rank, r.dice || {}, hist, computeTitles(order, hist), pInfo, "");
  }
  return h;
}

/* ---------- screens: one phone passed around ---------- */
function newLocal(prev) {
  const saved = store.json("local-names", []);
  return {
    phase: "setup", players: prev?.players || (Array.isArray(saved) ? saved : []),
    start: prev?.start || 5, palOn: prev ? !!prev.palOn : true, calza: prev ? !!prev.calza : true, help: !!prev?.help,
    gages: !!prev?.gages, gageLvl: prev?.gageLvl || 1, maison: prev ? !!prev.maison : true, apero: !!prev?.apero, customs: prev?.customs || [],
    gid: rid(), order: [], dice: {}, hands: {}, out: [], palUsed: [], round: 0, seq: 0, step: "bid", turnUid: "",
    bid: null, bids: [], pal: false, res: null, history: [], handoff: true, choices: {}
  };
}
function saveLocal() {
  store.set("local", JSON.stringify(M.local));
  if (M.local) store.set("local-names", JSON.stringify(M.local.players));
}
const lp = id => M.local.players.find(p => p.id === id) || { id, nick: "?", color: COLORS[0] };
function lDeal(L, starter, pal) {
  const alive = L.order.filter(id => L.dice[id] > 0);
  L.hands = Object.fromEntries(alive.map(id => [id, roll(L.dice[id])]));
  Object.assign(L, { round: L.round + 1, seq: L.seq + 1, step: "bid", turnUid: starter, bid: null, bids: [], pal: !!pal, res: null, handoff: true });
}
function lCall(L, kind) {
  if (!L.bid || (kind === "calza" && !L.calza)) return;
  const before = { ...L.dice }, caller = L.turnUid;
  const s = settle({ kind, caller, bid: L.bid, hands: L.hands, pal: L.pal, dice: L.dice, start: L.start, order: L.order });
  const pal = L.palOn && !!s.lose && s.dice[s.lose] === 1 && !L.palUsed.includes(s.lose);
  L.history.push({ n: L.round, pal: L.pal, t: L.order.reduce((n, id) => n + (before[id] || 0), 0), one: L.order.filter(id => before[id] === 1),
    bids: L.bids, k: kind, u: caller, bid: L.bid, count: s.count, lose: s.lose, gain: s.gain, out: s.out });
  L.res = { k: kind, u: caller, bid: L.bid, hands: L.hands, count: s.count, lose: s.lose, gain: s.gain, out: s.out, starter: s.starter, pal,
    up: !!s.gain && s.dice[s.gain] > (before[s.gain] || 0) };
  L.dice = s.dice;
  if (s.out) L.out.push(s.out);
  if (pal) L.palUsed.push(s.lose);
  L.step = "reveal"; L.seq++;
}
function handoff(p, label, act, hint) {
  return `<section class="panel center hand-off">
    <div class="label">${label}</div>
    ${av(p)}<div class="who">${esc(p.nick)}</div>
    <button class="btn primary big" data-act="${act}">C'est moi</button>
    <p class="hint">${hint}</p>
  </section>`;
}
const lTotal = L => L.order.reduce((n, id) => n + (L.dice[id] || 0), 0);
const lWhy = L => L.players.length < MIN_PLAYERS ? `Ajoute au moins ${MIN_PLAYERS} joueurs.` : L.players.length > MAX_PLAYERS ? `${MAX_PLAYERS} joueurs au plus.` : "";
function renderLocal() {
  const L = M.local, n = L.players.length;
  const back = `<button class="link" data-act="go-online">Jouer chacun sur son téléphone</button>`;
  if (L.phase === "setup") {
    return header(true, "1 téléphone") + errBox() + `<section class="panel">
      <p class="lead">Un seul téléphone qui passe de main en main. À ton tour, tu regardes tes dés en secret, tu annonces, et tu passes au suivant.</p>
      <form class="row" data-form="l-name"><input id="l-name" data-draft="l-name" type="text" maxlength="18" autocomplete="off" enterkeyhint="done" placeholder="Prénom d'un joueur" aria-label="Prénom d'un joueur"><button class="btn" type="submit">Ajouter</button></form>
      ${n ? `<div class="chips">${L.players.map(p => chip(p, `<button class="x" data-act="l-del" data-id="${esc(p.id)}" aria-label="Retirer ${esc(p.nick)}">×</button>`)).join("")}</div>` : ""}
      <p class="hint left">Ajoutez-vous dans l'ordre où vous êtes assis : on joue chacun son tour, dans ce sens.</p>
    </section>
    ${settingsPanel({ start: L.start, palOn: L.palOn, calza: L.calza, help: L.help, gages: L.gages, gageLvl: L.gageLvl, maison: L.maison, apero: L.apero,
      acts: { start: "l-start-dice", palOn: "l-pal-on", calza: "l-calza-on", help: "l-help", gages: "l-gages", gageLvl: "l-gage-lvl", maison: "l-maison", apero: "l-apero" } })}
    ${L.gages && L.maison ? customBlock(L.customs, { form: "l-custom", delAct: "l-del-custom", canDel: () => true, empty: "Ajoutez vos propres gages et vérités, rien que pour ce groupe." }) : ""}
    <button class="btn primary big" data-act="l-start" ${lWhy(L) ? "disabled" : ""}>Secouer les gobelets</button>
    ${lWhy(L) ? `<p class="hint on-ground">${esc(lWhy(L))}</p>` : ""}
    ${rulesBox()}
    <p class="foot">${back}</p>`;
  }
  const view = { ...L, phase: "play" };
  if (L.phase === "end") {
    const rank = ranking(L.order, L.dice, L.out), titles = computeTitles(L.order, L.history);
    const house = L.gages && L.maison ? L.customs : [];
    return header(true, "1 téléphone") + winnerPanel(rank, L.dice, lp, L.history.length) + palmares(rank, L.dice, L.history, titles, lp, "l-share")
      + gagesPanel({ on: L.gages, losers: losersOf(L.order, L.dice, L.out).map(lp), lvl: L.gageLvl, seed: L.gid, house, act: "l-choose", choiceOf: uid => L.choices[uid], canChoose: () => true })
      + `<button class="btn primary big" data-act="l-reset">Nouvelle partie</button><p class="foot">${back}</p>`;
  }
  let h = header(false, "1 téléphone");
  if (L.step === "bid") {
    const p = lp(L.turnUid);
    if (L.handoff) {
      h += bidNow(view, lp, { noMe: true }) + handoff(p, "Passe le téléphone à", "l-me", "Les autres, regardez ailleurs.");
    } else {
      const hand = L.hands[p.id] || [];
      h += bidNow(view, lp, { noMe: true }) + myDicePanel(hand, `${L.gid}.${L.round}.${p.id}`, `Les dés de ${p.nick}`)
        + composer({ key: `l${L.gid}.${L.seq}`, prev: L.bid, pal: L.pal, free: L.dice[p.id] === 1, total: lTotal(L), hand, calza: L.calza, help: L.help, pfx: "l-" });
    }
    h += bidsPanel(L.bids, lp);
  } else {
    const over = L.order.filter(id => L.dice[id] > 0).length < 2;
    h += revealPanel(L.res, L.order, lp, { pal: L.pal, apero: L.apero, key: `${L.gid}.${L.round}` });
    if (L.res.pal && !over) h += `<div class="note pal"><b>Palifico</b> pour ${esc(lp(L.res.lose).nick)} à la prochaine manche.</div>`;
    h += `<button class="btn primary big" data-act="l-next">${over ? "Voir le classement final" : "Manche suivante"}</button>`;
  }
  h += tablePanel(view, lp);
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
/* The move of the night: a calza that hit, else the boldest bid that held up against a dudo, else the last round. */
function bestMove(hist, info) {
  const calza = [...hist].reverse().find(h => h.k === "calza" && h.gain);
  if (calza) return `${info(calza.u).nick} a fait calza sur ${bidText(calza.bid)} : il y en avait pile ${calza.count}.`;
  const held = hist.filter(h => h.k === "dudo" && h.count >= h.bid.q).sort((a, b) => b.bid.q / (b.t || 1) - a.bid.q / (a.t || 1))[0];
  if (held) return `${info(held.bid.u).nick} a annoncé ${bidText(held.bid)}, ${info(held.u).nick} a crié dudo… il y en avait ${held.count}.`;
  const last = hist[hist.length - 1];
  return last ? `${info(last.u).nick} a crié dudo sur ${bidText(last.bid)} : il n'y en avait que ${last.count}.` : "";
}
async function shareImage(order, dice, out, hist, info) {
  const rank = ranking(order, dice, out), titles = computeTitles(order, hist);
  const rows = rank.slice(0, 8).map(id => ({ p: info(id), n: dice[id] || 0 }));
  const move = bestMove(hist, info);
  try { await Promise.all([document.fonts.load("60px 'Titan One'"), document.fonts.load("800 30px Onest"), document.fonts.load("500 26px Onest")]); } catch {}
  const W = 1080, c = document.createElement("canvas"), g = c.getContext("2d");
  g.font = "800 40px Onest, Arial, sans-serif";
  const moveLines = move ? wrapLines(g, move, W - 200).slice(0, 5) : [];
  const moveH = move ? 120 + moveLines.length * 52 : 0;
  const H = 300 + moveH + rows.length * 150 + 60;
  c.width = W; c.height = H;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  g.fillStyle = "#1F9E93"; g.fillRect(0, 0, W, H);
  // A woven band, like the cloth the dice are rolled on.
  ["#D9481E", "#F2B233", "#C2307C", "#10201E", "#FFF8EC"].forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 10, W, 10); });
  g.fillStyle = "#10201E"; g.font = "96px 'Titan One', 'Arial Black', sans-serif"; g.fillText("Perudo", 70, 160);
  g.fillStyle = "#0B3B37"; g.font = "800 30px Onest, Arial, sans-serif";
  g.fillText(`CLASSEMENT · ${plural(hist.length, "MANCHE")} · ${new Date().toLocaleDateString("fr-FR")}`, 72, 220);
  let y = 260;
  if (move) {
    g.fillStyle = "#10201E"; rr(60, y, W - 120, moveH - 30, 26); g.fill();
    g.fillStyle = "#F2B233"; g.font = "800 26px Onest, Arial, sans-serif"; g.fillText("LE COUP DE LA SOIRÉE", 100, y + 56);
    g.fillStyle = "#FFF8EC"; g.font = "800 40px Onest, Arial, sans-serif";
    moveLines.forEach((l, i) => g.fillText(l, 100, y + 112 + i * 52));
    y += moveH;
  }
  rows.forEach((s, i) => {
    const t = titles[s.p.id];
    g.fillStyle = i === 0 ? "#10201E" : "#FFF8EC"; g.strokeStyle = "#10201E"; g.lineWidth = 5;
    rr(60, y, W - 120, 128, 26); g.fill(); g.stroke();
    const ink = i === 0 ? "#FFF8EC" : "#10201E";
    g.fillStyle = ink; g.font = "52px 'Titan One', 'Arial Black', sans-serif"; g.fillText(String(i + 1), 95, y + 84);
    g.fillStyle = safeColor(s.p.color); g.beginPath(); g.arc(215, y + 64, 40, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = "38px 'Titan One', 'Arial Black', sans-serif"; g.textAlign = "center";
    g.fillText((s.p.nick || "?").charAt(0).toUpperCase(), 215, y + 78); g.textAlign = "left";
    g.fillStyle = ink; g.font = "800 40px Onest, Arial, sans-serif"; g.fillText(s.p.nick, 285, y + 58);
    g.font = "500 28px Onest, Arial, sans-serif";
    g.fillText(`${t ? t.title + " · " : ""}${s.n ? plural(s.n, "dé") : "hors jeu"}`.slice(0, 60), 285, y + 100);
    y += 150;
  });
  g.fillStyle = "#0B3B37"; g.font = "500 26px Onest, Arial, sans-serif"; g.fillText(location.host, 72, H - 40);
  const blob = await new Promise(res => c.toBlob(res, "image/png"));
  const file = new File([blob], "perudo-classement.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Perudo, le classement" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
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
let lastHtml = "", lastKeys = {}, lastTurn = "";
function render() {
  document.body.classList.toggle("tv", M.mode === "room" && M.tv);
  let html;
  if (M.mode === "local" && M.local) html = renderLocal();
  else if (M.mode === "room") html = renderRoom();
  else if (M.mode === "home") html = renderHome();
  else if (M.mode === "setup") html = renderSetup();
  else if (M.mode === "fatal") html = renderFatal();
  else html = header(true) + `<section class="panel center loading">On secoue les gobelets…</section>`;
  // French spacing: « Dudo ! » never breaks before its exclamation mark.
  html = html.replace(/ ([!?:;»])(?=[\s<"]|$)/g, " $1").replace(/« /g, "« ");
  if (html !== lastHtml) {
    const a = document.activeElement, fid = a && a.id, ss = a && a.selectionStart, se = a && a.selectionEnd;
    const openDetails = [...app.querySelectorAll("details[open] summary")].map(s => s.textContent);
    app.innerHTML = html;
    lastHtml = html;
    app.querySelectorAll("details summary").forEach(s => { if (openDetails.includes(s.textContent)) s.parentElement.open = true; });
    app.querySelectorAll("[data-draft]").forEach(i => { i.value = M.drafts[i.dataset.draft] || ""; });
    if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(ss, se); } catch {} } }
    // New dice, a new bid, cups lifted: each gets its little animation once.
    const keys = {};
    for (const [sel, cls] of [[".mydice", "roll"], [".bidnow", "enter"], [".reveal", "lift"]]) {
      const el = app.querySelector(sel), k = el ? el.dataset.key : "";
      if (el && k !== lastKeys[sel]) el.classList.add(cls);
      keys[sel] = k;
    }
    if (keys[".reveal"] && keys[".reveal"] !== lastKeys[".reveal"]) window.scrollTo({ top: 0, behavior: "smooth" });
    lastKeys = keys;
    fillQR();
  }
  // A short buzz when it becomes your turn.
  const r = M.room, turn = M.mode === "room" && !M.tv && r?.phase === "play" && r.step === "bid" && !r.paused && r.turnUid === M.me ? r.gameId + r.seq : "";
  if (turn && turn !== lastTurn) { try { navigator.vibrate?.([80, 60, 80]); } catch {} }
  lastTurn = turn;
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
/* The bid builder, shared by both modes: face taps, plus and minus. */
function draftFace(prev, pal, free, f) {
  const m = minQ(prev, f, pal, free);
  if (m == null) return;
  // Switching between pacos and the other faces starts again from the smallest bid; otherwise the quantity stays.
  M.bq = M.bf && (M.bf === 1) !== (f === 1) ? m : Math.max(m, M.bq);
  M.bf = f; render();
}
const draftStep = (d, total) => { M.bq = Math.max(1, Math.min(total, M.bq + d)); render(); };
function sendMove(kind) {
  const r = M.room;
  if (!r || r.phase !== "play" || r.step !== "bid" || r.turnUid !== M.me || r.paused || moveNow(r)) return;
  const mv = { gameId: r.gameId, seq: r.seq, uid: M.me, kind, at: Date.now() };
  if (kind === "bid") {
    if (!bidOk(r.bid, M.bq, M.bf, !!r.pal, r.dice[M.me] === 1, totalDice(r))) return;
    Object.assign(mv, { q: M.bq, f: M.bf });
  }
  write(() => F.setDoc(rMove(M.code, `${r.gameId}_${r.seq}`), mv), "Trop tard, ce n'est plus ton tour.");
}
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
  "share": () => { navigator.share({ title: "Perudo", text: `Rejoins la partie ${M.code} !`, url: inviteLink() }).catch(() => {}); },
  "copy": () => copy(inviteLink(), "Lien d'invitation copié."),
  "copy-tv": () => copy(tvLink(), "Lien grand écran copié."),
  "toggle-qr": () => { M.showQR = !M.showQR; render(); },
  "gkind": d => { M.gkind = d.id === "truth" ? "truth" : "dare"; render(); document.getElementById(M.mode === "local" ? "l-custom" : "custom")?.focus(); },
  "cup": () => { M.cup = !M.cup; M.peek = false; store.set("cup", M.cup ? "1" : null); render(); },

  /* playing a turn */
  "face": d => { const r = M.room; if (r) draftFace(r.bid, !!r.pal, r.dice[M.me] === 1, +d.id); },
  "less": () => { const r = M.room; if (r) draftStep(-1, totalDice(r)); },
  "more": () => { const r = M.room; if (r) draftStep(1, totalDice(r)); },
  "bid": () => sendMove("bid"),
  "dudo": () => sendMove("dudo"),
  "calza": () => sendMove("calza"),
  "choose": d => {
    const r = M.room; if (!r || d.uid !== M.me) return;
    write(() => F.setDoc(rChoice(M.code, `${r.gameId}_${M.me}`), { gameId: r.gameId, uid: M.me, kind: d.id }), "Ce choix n'est plus possible.");
  },
  "skip-turn": modOnly(() => {
    const r = M.room;
    if (!r || r.step !== "bid") return;
    const order = r.order || [], i = order.indexOf(r.turnUid);
    const to = order.slice(i + 1).concat(order.slice(0, i)).find(id => r.dice[id] > 0 && id !== r.bid?.u);
    if (to) write(() => patchRoom({ turnUid: to, seq: r.seq + 1, turnAt: F.serverTimestamp() }));
  }),
  "next": modOnly(() => {
    const r = M.room;
    if (!r || r.step !== "reveal") return;
    write(() => nextRound(r));
  }),
  "pause": modOnly(() => {
    const r = M.room;
    if (!r.paused) { write(() => patchRoom({ paused: true, pausedAt: F.serverTimestamp() })); return; }
    // Resuming moves the timer forward by the length of the pause.
    const gap = Math.max(0, serverNow() - tsMs(r.pausedAt));
    write(() => patchRoom({ paused: false, pausedAt: null, ...(r.turnAt ? { turnAt: F.Timestamp.fromMillis(tsMs(r.turnAt) + gap) } : {}) }));
  }),
  "end": modOnly(() => write(() => patchRoom({ phase: "end", paused: false }))),
  "newgame": modOnly(() => {
    const old = M.room?.gameId, code = M.code;
    write(async () => {
      await patchRoom(freshGame());
      if (!old) return;
      try {
        for (const col of [cMoves(code), cChoices(code)]) {
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
  "start-dice": roomSetting("start", d => STARTS.includes(+d.id) ? +d.id : 5),
  "timer": roomSetting("timer", d => TIMERS.includes(+d.id) ? +d.id : 0),
  "pal-on": roomSetting("palOn", (d, r) => !r.palOn),
  "calza-on": roomSetting("calza", (d, r) => !r.calza),
  "help": roomSetting("help", (d, r) => !r.help),
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
  "install": async () => { const e = M.installEvt; M.installEvt = null; render(); if (e) { e.prompt(); try { await e.userChoice; } catch {} } },
  "share-img": () => { const r = M.room; if (r) shareImage(r.order || [], r.dice || {}, r.out || [], r.history || [], pInfo).catch(() => flash("Impossible de créer l'image.")); },
  "go-local": () => { M.mode = "local"; if (!M.local || M.local.phase === "end") M.local = newLocal(M.local); M.err = ""; saveLocal(); render(); },
  "go-online": () => { M.err = ""; if (M.code) M.mode = "room"; else M.mode = F && M.me ? "home" : (isPlaceholder() ? "setup" : "fatal"); render(); },
  "reload": () => location.reload(),

  /* one phone */
  "l-del": d => { M.local.players = M.local.players.filter(p => p.id !== d.id); saveLocal(); render(); },
  "l-start-dice": d => { M.local.start = STARTS.includes(+d.id) ? +d.id : 5; saveLocal(); render(); },
  "l-pal-on": () => { M.local.palOn = !M.local.palOn; saveLocal(); render(); },
  "l-calza-on": () => { M.local.calza = !M.local.calza; saveLocal(); render(); },
  "l-help": () => { M.local.help = !M.local.help; saveLocal(); render(); },
  "l-gages": () => { M.local.gages = !M.local.gages; saveLocal(); render(); },
  "l-gage-lvl": d => { M.local.gageLvl = Math.min(4, Math.max(1, +d.id || 1)); saveLocal(); render(); },
  "l-maison": () => { M.local.maison = !M.local.maison; saveLocal(); render(); },
  "l-apero": () => { M.local.apero = !M.local.apero; saveLocal(); render(); },
  "l-del-custom": d => { M.local.customs = M.local.customs.filter(c => c.id !== d.id); saveLocal(); render(); },
  "l-start": () => {
    const L = M.local;
    if (lWhy(L)) return;
    const order = L.players.map(p => p.id);
    Object.assign(L, { phase: "play", gid: rid(), order, dice: Object.fromEntries(order.map(id => [id, L.start])), out: [], palUsed: [], round: 0, seq: 0, history: [], choices: {} });
    lDeal(L, order[rand(order.length)], false);
    saveLocal(); render();
  },
  "l-me": () => { M.local.handoff = false; M.peek = false; saveLocal(); render(); },
  "l-face": d => { const L = M.local; draftFace(L.bid, L.pal, L.dice[L.turnUid] === 1, +d.id); },
  "l-less": () => draftStep(-1, lTotal(M.local)),
  "l-more": () => draftStep(1, lTotal(M.local)),
  "l-bid": () => {
    const L = M.local, uid = L.turnUid;
    if (!bidOk(L.bid, M.bq, M.bf, L.pal, L.dice[uid] === 1, lTotal(L))) return;
    L.bid = { u: uid, q: M.bq, f: M.bf };
    L.bids = [...L.bids, L.bid];
    L.turnUid = nextAlive(L.order, L.dice, uid);
    L.seq++; L.handoff = true;
    saveLocal(); render();
  },
  "l-dudo": () => { lCall(M.local, "dudo"); saveLocal(); render(); },
  "l-calza": () => { lCall(M.local, "calza"); saveLocal(); render(); },
  "l-next": () => {
    const L = M.local;
    if (L.order.filter(id => L.dice[id] > 0).length < 2) L.phase = "end";
    else lDeal(L, L.res.starter, L.res.pal && L.dice[L.res.lose] === 1);
    saveLocal(); render();
  },
  "l-end": () => { M.local.phase = "end"; saveLocal(); render(); },
  "l-choose": d => { M.local.choices[d.uid] = d.id; saveLocal(); render(); },
  "l-share": () => { const L = M.local; shareImage(L.order, L.dice, L.out, L.history, lp).catch(() => flash("Impossible de créer l'image.")); },
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
  "custom": () => {
    const c = readCustom("custom");
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
    const c = readCustom("l-custom");
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
/* Holding the cup button shows the dice; letting go, or sliding off, hides them again. */
document.addEventListener("pointerdown", e => { if (e.target.closest("[data-hold]")) { e.preventDefault(); M.peek = true; render(); } });
const unpeek = () => { if (M.peek) { M.peek = false; render(); } };
for (const ev of ["pointerup", "pointercancel", "blur"]) window.addEventListener(ev, unpeek);
document.addEventListener("contextmenu", e => { if (e.target.closest(".mydice")) e.preventDefault(); });
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
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

/* ---------- boot ---------- */
const isPlaceholder = () => !firebaseConfig.apiKey || /COLLE/.test(firebaseConfig.apiKey);
async function boot() {
  if (await Soiree.replayBoot(M, render)) return;
  M.local = store.json("local", null);
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
/* ---------- replay journal ----------
   What happened, in words, rebuilt from the game's own history when a game is saved.
   "@id" marks a player: the replay shows their name in their colour. A `board` is the score line after that moment. */
Soiree.setJournal(() => {
  const ord = i => `${i + 1}${i ? "e" : "er"}`;
  const r = M.room;
  if (!r?.gameId || !(r.order || []).length) return null;
  const order = r.order, start = r.start || 5, dice = Object.fromEntries(order.map(id => [id, start]));
  const players = Object.fromEntries(order.map(id => { const p = pInfo(id); return [id, { nick: p.nick, color: p.color }]; }));
  const board = () => Object.fromEntries(order.map(id => [id, dice[id] > 0 ? plural(dice[id], "dé") : "éliminé"]));
  const events = [{ text: `${plural(order.length, "joueur")}, ${plural(start, "dé")} chacun.`, board: board() }];
  for (const h of r.history || []) {
    events.push({ head: `Manche ${h.n}${h.pal ? " · palifico" : ""}`, text: `${plural(h.t, "dé")} sous les gobelets.` });
    for (const b of h.bids || []) events.push({ text: `@${b.u} annonce ${bidText(b)}.` });
    if (!h.bid) continue;
    events.push({ text: h.k === "calza" ? `@${h.u} dit « Calza ! » : il y a pile ${bidText(h.bid)}.` : `@${h.u} dit « Dudo ! » : il n'y a pas ${bidText(h.bid)}.` });
    if (h.lose) dice[h.lose] = Math.max(0, dice[h.lose] - 1);
    if (h.gain) dice[h.gain] = Math.min(start, dice[h.gain] + 1);
    const seen = h.count ? bidText({ q: h.count, f: h.bid.f }) : "aucun";
    const who = h.gain ? ` @${h.gain} regagne un dé.` : h.lose ? ` @${h.lose} perd un dé${h.out ? " et quitte la partie" : ""}.` : "";
    events.push({ text: `On soulève les gobelets : ${seen}.${who}`, tone: h.gain ? "win" : "lose", board: board() });
  }
  const end = r.dice || {}, rank = ranking(order, end, r.out || []);
  return { players, events, final: { title: "Classement", rows: rank.map((id, i) => ({ who: id, text: `${ord(i)} · ${end[id] > 0 ? plural(end[id], "dé") : "éliminé"}` })) } };
});

// Shared layer (account button, own name, group, end-of-game save bar): after every render.
{ const draw = render; render = () => { draw(); Soiree.frame(M); }; }
boot();
