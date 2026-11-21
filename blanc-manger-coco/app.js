import { firebaseConfig } from "./config.js";
import { CARDS } from "./cards.js";
import { EXTENSIONS } from "./extensions.js";
import { GAGES } from "./gages.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const ROOT = "bmRooms";
const LEVELS = [
  { id: 1, name: "Soft", desc: "De l'absurde, pour tout le monde" },
  { id: 2, name: "Piquant", desc: "Drague, soirées et gueules de bois" },
  { id: 3, name: "Trash", desc: "Cul, caca et mauvais goût, que des adultes" },
  { id: 4, name: "Extrême", desc: "Encore plus loin. On vous aura prévenus" }
];
const PACKS = [{ id: "base", name: "Le paquet de base", desc: "Un peu de tout", q: CARDS.q, a: CARDS.a }, ...EXTENSIONS];
const MODES = [
  { id: "judge", name: "Juge tournant", desc: "Un juge choisit sa réponse préférée, et qui gagne la manche devient le juge suivant." },
  { id: "vote", name: "Tout le monde vote", desc: "Chacun vote pour la meilleure réponse, jamais la sienne." }
];
const GAGE_LEVELS = ["Soft", "Épicé", "Hot", "Extrême"];
const TARGETS = [3, 5, 7, 10];
const TIMERS = [0, 45, 60, 90];
const HAND = 10, MIN_PLAYERS = 3, SIPS = 2;
const COLORS = ["#D93A26","#2F62D0","#18825A","#7C47CC","#B86400","#C2307C","#0F7C8F","#5E5C17","#8C3B1F","#3D4A63"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const K = "bmc";
const ROOM_MAX_IDLE_MS = 24 * 3600 * 1000;
const BLANK = "___";

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rid = () => Math.random().toString(36).slice(2, 10);
const rand = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const safeColor = c => COLORS.includes(c) ? c : COLORS[0];
const nice = t => esc(t).replace(/ ([?!:;»])/g, " $1").replace(/« /g, "« ");
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
const voix = n => `${n} voix`;
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
const deNick = n => (/^[aeiouyhàâäéèêëîïôöùûü]/i.test(n) ? "d'" : "de ") + n;
const clampLevel = l => Math.min(4, Math.max(1, Math.round(+l) || 1));
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
const qkey = t => hashInt(t).toString(36);
const tsMs = ts => ts && ts.toMillis ? ts.toMillis() : (typeof ts === "number" ? ts : 0);
const sameCards = (a, b) => !!a && !!b && a.length === b.length && a.every((c, i) => c === b[i]);
const topOf = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])[0];

/* ---------- the cards ---------- */
const blanksOf = t => Math.max(1, Math.min(2, (String(t).match(/___/g) || []).length));
/* The packs ticked in the settings; the base pack when none is. */
const packIds = list => { const ok = (list || []).filter(id => PACKS.some(p => p.id === id)); return ok.length ? ok : ["base"]; };
const packCards = (kind, l, packs) => [...new Set(packIds(packs).flatMap(id => PACKS.find(p => p.id === id)[kind][l] || []))];
/* The same text twice in a pile would make two identical cards in a hand. */
const uniq = (list, key = x => x) => { const seen = new Set(); return list.filter(x => !seen.has(key(x)) && seen.add(key(x))); };
const LEVEL_OF = new Map();
for (const p of PACKS) for (const kind of ["q", "a"]) for (const l of [1, 2, 3, 4]) for (const t of p[kind][l] || []) LEVEL_OF.set(kind + t, l);
/* A card that isn't in the box is a house card. */
const lvlOf = (kind, t) => LEVEL_OF.get(kind + t) || "m";
const countCards = (kind, level, packs) => { let n = 0; for (let l = 1; l <= level; l++) n += packCards(kind, l, packs).length; return n; };
function normQuestion(t) {
  t = String(t || "").replace(/\s+/g, " ").trim().replace(/_{2,}|\.{3,}|…/g, BLANK).slice(0, 140);
  if (!t) return "";
  if (!t.includes(BLANK)) return t.replace(/[\s:.?!]+$/, "") + " : " + BLANK + ".";
  // A blank glued to a word gets its spaces, and a sentence ending on a blank gets its full stop.
  t = t.replace(/([^\s«('’])___/g, "$1 ___").replace(/___([^\s.,!?»:;)])/g, "___ $1");
  return /___$/.test(t) ? t + "." : t;
}
const normAnswer = t => String(t || "").replace(/\s+/g, " ").trim().replace(/[\s.]+$/, "").slice(0, 80);
/* The question with the answers slotted into its blanks. An answer opening a sentence gets its capital letter. */
function fillParts(q, cards) {
  const parts = String(q).split(BLANK), out = [];
  let plain = "";
  parts.forEach((p, i) => {
    out.push({ text: p });
    plain += p;
    if (i < parts.length - 1) {
      const c = cards[i], start = !plain.trim() || /[.!?«]\s*$/.test(plain);
      out.push({ card: c ? (start ? cap(c) : c) : null });
      plain += c || "x";
    }
  });
  return out;
}
const fillHtml = (q, cards = []) => fillParts(q, cards).map(x => "text" in x ? nice(x.text)
  : x.card ? `<mark class="fill">${esc(x.card)}</mark>` : `<span class="blank">${"&nbsp;".repeat(12)}<span class="sr">trou</span></span>`).join("");
const fillText = (q, cards = []) => fillParts(q, cards).map(x => "text" in x ? x.text : x.card || "____").join("");
/* Each pile is one level, from the softest up; every card comes from a level drawn at random, weighted 1, 2, 3, 4,
   so the level chosen really shows (in Extrême, seven cards out of ten are Trash or Extrême). */
function mixPiles(piles) {
  const ps = piles.map((p, i) => ({ p: p.slice(), w: i + 1 })).filter(x => x.p.length), out = [];
  while (ps.length) {
    let r = rand(ps.reduce((s, x) => s + x.w, 0)), i = 0;
    while (r >= ps[i].w) r -= ps[i++].w;
    out.push(ps[i].p.shift());
    if (!ps[i].p.length) ps.splice(i, 1);
  }
  return out;
}
/* Questions already asked (on this phone or in this room) go to the back of their pile.
   House cards are mixed into the top of the piles so that they come out early. */
function seenLocal() { return new Set(store.json("seen", [])); }
function markSeen(keys) {
  const s = seenLocal();
  keys.forEach(k => { s.delete(k); s.add(k); });
  store.set("seen", JSON.stringify([...s].slice(-3000)));
}
function buildQDeck(level, packs, house, seen = new Set()) {
  const piles = [];
  for (let l = 1; l <= level; l++) {
    const items = packCards("q", l, packs).map(t => ({ t, l }));
    piles.push([...shuffle(items.filter(it => !seen.has(qkey(it.t)))), ...shuffle(items.filter(it => seen.has(qkey(it.t))))]);
  }
  const rest = mixPiles(piles), head = rest.splice(0, house.length * 2);
  return uniq([...shuffle([...house.map(t => ({ t, l: "m" })), ...head]), ...rest], it => it.t);
}
function buildADeck(level, packs, house) {
  const piles = [];
  for (let l = 1; l <= level; l++) piles.push(shuffle(packCards("a", l, packs)));
  const rest = mixPiles(piles), head = rest.splice(0, house.length * 3);
  return uniq([...shuffle([...house, ...head]), ...rest]);
}
/* The same gage or truth on every phone, without anyone having to write it down. */
function gageText(kind, level, seed) {
  const pool = [];
  for (let l = 1; l <= Math.min(4, Math.max(1, +level || 1)); l++) pool.push(...GAGES[kind][l]);
  return pool[hashInt(seed + kind) % pool.length];
}

/* ---------- state ---------- */
const M = {
  mode: "boot", me: null, code: null, tv: false,
  room: null, roomReady: false, players: [], playersReady: false,
  secret: null, myPlay: null, pick: null, votes: [], choices: [], customs: [], plays: [], deal: null,
  sel: [], selKey: "", proxy: false, ckind: "a",
  renaming: false, handover: false, showQR: false, err: "", flash: "", busy: false, fatal: "",
  offline: false, offlineSince: 0, installEvt: null,
  local: null, drafts: { nick: store.get("nick") || "", code: hashCode() }
};
const isMod = () => !M.tv && !!M.room && M.room.hostUid === M.me;
const inRoom = () => !M.tv && M.players.some(p => p.id === M.me);
const isJudgeMode = r => r?.mode !== "vote";
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
/* One tick a second keeps the timers moving and lets the moderator's page run the automatic steps. */
setInterval(() => { if (M.mode === "room") { render(); if (isMod()) hostSync(); } }, 1000);

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
const rSecret = (c, id) => F.doc(DB, ROOT, c, "secret", id);
const rDeal = c => F.doc(DB, ROOT, c, "deal", "current");
const cPlays = c => F.collection(DB, ROOT, c, "plays");
const rPlay = (c, id) => F.doc(DB, ROOT, c, "plays", id);
const cPicks = c => F.collection(DB, ROOT, c, "picks");
const rPick = (c, id) => F.doc(DB, ROOT, c, "picks", id);
const cVotes = c => F.collection(DB, ROOT, c, "votes");
const rVote = (c, id) => F.doc(DB, ROOT, c, "votes", id);
const cCustom = c => F.collection(DB, ROOT, c, "custom");
const rCustom = (c, id) => F.doc(DB, ROOT, c, "custom", id);
const cChoices = c => F.collection(DB, ROOT, c, "choices");
const rChoice = (c, id) => F.doc(DB, ROOT, c, "choices", id);

let subs = [], gameSubs = [], roundSubs = [], hostSubs = [], roundKey = "", hostKey = "", unCustom = null, customKey = "";
const off = list => { list.forEach(u => u()); list.length = 0; };
function leaveSubs() {
  off(subs); off(gameSubs); off(roundSubs); off(hostSubs);
  roundKey = ""; hostKey = "";
  if (unCustom) unCustom();
  unCustom = null; customKey = "";
}
function onErr(e) {
  M.err = e && e.code === "permission-denied" ? "Accès refusé à cette partie." : "Connexion à la partie perdue. Recharge la page.";
  render();
}
function subGame() {
  off(gameSubs);
  M.votes = []; M.choices = [];
  const g = M.room?.gameId;
  if (!g) return;
  const q = col => F.query(col(M.code), F.where("gameId", "==", g));
  gameSubs.push(F.onSnapshot(q(cVotes), s => { M.votes = s.docs.map(d => d.data()); render(); if (isMod()) hostSync(); }, onErr));
  gameSubs.push(F.onSnapshot(q(cChoices), s => { M.choices = s.docs.map(d => d.data()); render(); }, () => {}));
}
/* The round being played: my own cards on the table (nobody else can read them) and the judge's choice. */
function subRound() {
  const r = M.room, key = r && r.phase === "play" ? `${r.gameId}_${r.round}` : "";
  if (key === roundKey) return;
  off(roundSubs);
  roundKey = key;
  Object.assign(M, { myPlay: null, pick: null, sel: [], selKey: "", proxy: false });
  if (!key) return;
  if (!M.tv) roundSubs.push(F.onSnapshot(rPlay(M.code, key + "_" + M.me), s => { M.myPlay = s.exists() ? s.data() : null; render(); }, () => {}));
  roundSubs.push(F.onSnapshot(rPick(M.code, key), s => { M.pick = s.exists() ? s.data() : null; render(); if (isMod()) hostSync(); }, () => {}));
}
/* Only the moderator reads the piles, every hand and who played which card; the listeners follow whoever is modo now. */
function subHost() {
  const key = isMod() && M.room ? M.room.gameId : "";
  if (key === hostKey) return;
  off(hostSubs);
  hostKey = key; M.deal = null; M.plays = [];
  if (!key) return;
  hostSubs.push(F.onSnapshot(rDeal(M.code), s => { M.deal = s.exists() ? s.data() : null; render(); hostSync(); }, () => {}));
  hostSubs.push(F.onSnapshot(F.query(cPlays(M.code), F.where("gameId", "==", key)), s => { M.plays = s.docs.map(d => d.data()); render(); hostSync(); }, () => {}));
}
/* House cards stay a surprise: each player reads their own, the moderator reads them all. */
function subCustom() {
  const key = M.tv ? "" : isMod() ? "all" : inRoom() ? "mine" : "";
  if (key === customKey) return;
  if (unCustom) unCustom();
  unCustom = null; customKey = key; M.customs = [];
  if (!key) return;
  const q = key === "all" ? cCustom(M.code) : F.query(cCustom(M.code), F.where("by", "==", M.me));
  unCustom = F.onSnapshot(q, s => {
    M.customs = s.docs.map(d => { const x = d.data(); return { id: d.id, kind: x.kind === "q" ? "q" : "a", text: String(x.text || "").slice(0, 150), by: x.by || "", at: x.at || 0, ok: !!x.ok }; })
      .filter(c => c.text).sort((a, b) => a.at - b.at);
    render();
    if (isMod()) hostSync();
  }, () => { M.customs = []; render(); });
}
function enterRoom(code, tv = false) {
  leaveSubs();
  Object.assign(M, { mode: "room", tv, code, room: null, roomReady: false, players: [], playersReady: false,
    secret: null, myPlay: null, pick: null, votes: [], choices: [], customs: [], plays: [], deal: null,
    sel: [], selKey: "", proxy: false, renaming: false, handover: false, offline: false });
  if (!tv) store.set("room", code);
  try { history.replaceState(null, "", "#" + code + (tv ? "-tv" : "")); } catch {}
  subs.push(F.onSnapshot(rRoom(code), { includeMetadataChanges: true }, s => {
    if (!s.exists()) {
      if (s.metadata.fromCache) return;
      M.err = "Cette partie n'existe plus."; exitRoom(); return;
    }
    if (s.metadata.fromCache && !M.offline) M.offlineSince = Date.now();
    M.offline = s.metadata.fromCache;
    const prev = M.room?.gameId, prevStep = M.room ? M.room.round + M.room.step : "";
    M.room = s.data(); M.roomReady = true;
    if (M.room.gameId !== prev) subGame();
    if (prevStep && prevStep !== M.room.round + M.room.step) M.err = "";
    subRound(); subHost(); subCustom();
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
  Object.assign(M, { mode: "home", tv: false, code: null, room: null, players: [], secret: null, myPlay: null, pick: null,
    votes: [], choices: [], customs: [], plays: [], deal: null, handover: false });
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
  gameId: rid(), phase: "lobby", round: 0, step: "answer", order: [], cast: {}, judgeUid: "", jPos: -1,
  q: null, blanks: 1, keys: [], shown: [], res: null, scores: {}, history: [], paused: false
});
const freshRoom = () => ({
  ...freshGame(), mode: "judge", level: 1, target: 5, timer: 0, maison: true, approve: false,
  gages: false, gageLvl: 1, apero: false, packs: ["base"], played: []
});
/* Every change of the room also stamps it, which tells the cleanup when a room was last used. */
const patchRoom = p => F.updateDoc(rRoom(M.code), { ...p, touchedAt: F.serverTimestamp() });
/* House cards the moderator accepted (or all of them, when approval is off). */
const usableCustoms = (r = M.room) => M.customs.filter(c => !r?.approve || c.ok || c.by === r.hostUid);
const reachedTarget = r => Math.max(0, ...Object.values(r.scores || {})) >= (r.target || 5);

/* ---------- the round, as everyone sees it ---------- */
const roundId = r => `${r.gameId}_${r.round}`;
const myHand = r => M.secret && M.secret.gameId === r.gameId && M.secret.round === r.round && Array.isArray(M.secret.hand) ? M.secret.hand : null;
const myCards = r => M.myPlay && M.myPlay.gameId === r.gameId && M.myPlay.round === r.round ? M.myPlay.cards : null;
const mySubKey = r => { const c = myCards(r); return c ? (r.shown || []).find(s => sameCards(s.c, c))?.k || "" : ""; };
const playedIds = r => new Set(M.players.filter(p => p.done === roundId(r)).map(p => p.id));
const pickOk = r => !!M.pick && M.pick.gameId === r.gameId && M.pick.round === r.round && (r.keys || []).includes(M.pick.key);
function voteMap(r) {
  const vm = {}, keys = r.keys || [], order = r.order || [];
  for (const v of M.votes) if (v.round === r.round && keys.includes(v.key) && order.includes(v.voter)) vm[v.voter] = v.key;
  return vm;
}
function timeLeft(r) {
  if (!r || !r.timer || r.phase !== "play") return null;
  const from = r.step === "answer" ? r.roundAt : r.step === "pick" && !isJudgeMode(r) ? r.pickAt : null;
  if (!from) return null;
  const end = tsMs(from) + r.timer * 1000;
  const now = r.paused ? tsMs(r.pausedAt) || serverNow() : serverNow();
  return Math.max(0, Math.ceil((end - now) / 1000));
}

/* ---------- moderator's page: dealing and the automatic steps ----------
   The piles, every hand and who played which card live in deal/current, which only the moderator can read. */
function nextOrder(r) {
  const here = new Set(M.players.map(p => p.id));
  const kept = (r.order || []).filter(id => here.has(id));
  return [...kept, ...M.players.map(p => p.id).filter(id => !kept.includes(id))];
}
function nextJudge(r, order, same) {
  if (!isJudgeMode(r) || !order.length) return "";
  if (same && order.includes(r.judgeUid) && idOnline(r.judgeUid)) return r.judgeUid;
  // Whoever won the round judges the next one; with no winner there (or gone), the seat after the judge's.
  const won = !same && r.step === "result" ? r.res?.authors?.[(r.res?.win || [])[0]] : "";
  if (won && order.includes(won) && idOnline(won)) return won;
  const n = order.length;
  let i = order.indexOf(r.judgeUid);
  // The judge left: whoever took their seat judges next.
  if (i < 0) i = (typeof r.jPos === "number" ? r.jPos : 0) - 1;
  for (let k = 1; k <= n; k++) { const id = order[((i + k) % n + n) % n]; if (idOnline(id)) return id; }
  return order[((i + 1) % n + n) % n];
}
async function newRound(r, d, extra = {}, sameJudge = false) {
  const order = nextOrder(r);
  const qdeck = (d.qdeck || []).slice(), q = qdeck.shift();
  if (!q || order.length < 2) return patchRoom({ phase: "end", paused: false });
  let adeck = (d.adeck || []).slice(), discard = (d.discard || []).slice();
  const hands = { ...(d.hands || {}) };
  for (const id of order) {
    const h = (hands[id] || []).slice();
    while (h.length < HAND) {
      if (!adeck.length) { if (!discard.length) break; adeck = shuffle(discard); discard = []; }
      h.push(adeck.shift());
    }
    hands[id] = h;
  }
  const judge = nextJudge(r, order, sameJudge), round = (r.round || 0) + 1;
  const cast = { ...(r.cast || {}) };
  for (const id of order) { const p = pInfo(id); cast[id] = { nick: p.nick, color: p.color || COLORS[0] }; }
  const b = F.writeBatch(DB);
  b.set(rDeal(M.code), { gameId: r.gameId, qdeck, adeck, discard, hands, map: {}, house: d.house || [] });
  for (const id of order) b.set(rSecret(M.code, id), { gameId: r.gameId, round, hand: hands[id] });
  b.update(rRoom(M.code), {
    ...extra, phase: "play", round, step: "answer", q, blanks: blanksOf(q.t), judgeUid: judge, jPos: order.indexOf(judge),
    order, cast, keys: [], shown: [], res: null, roundAt: F.serverTimestamp(), pickAt: null, paused: false, pausedAt: null,
    touchedAt: F.serverTimestamp(), ...(q.l !== "m" ? { played: F.arrayUnion(qkey(q.t)) } : {})
  });
  await b.commit();
  if (q.l !== "m") markSeen([qkey(q.t)]);
}
/* Cards actually played this round: from someone dealt in, never the judge, and really from their hand. */
function roundPlays(r, d) {
  const n = r.blanks || 1, order = r.order || [];
  return M.plays.filter(p => p.gameId === r.gameId && p.round === r.round && order.includes(p.uid) && p.uid !== r.judgeUid
    && Array.isArray(p.cards) && p.cards.length === n && new Set(p.cards).size === n && p.cards.every(c => (d.hands?.[p.uid] || []).includes(c)));
}
/* Everyone's answers go on the table, shuffled and without names; only deal/current knows whose is whose. */
async function toPick(r, d) {
  const got = roundPlays(r, d);
  if (!got.length) return;
  const map = {}, shown = [];
  for (const p of shuffle(got)) {
    let k = rid().slice(0, 6);
    while (map[k]) k = rid().slice(0, 6);
    map[k] = p.uid; shown.push({ k, c: p.cards });
  }
  const hands = { ...(d.hands || {}) }, discard = [...(d.discard || [])];
  for (const p of got) { hands[p.uid] = hands[p.uid].filter(c => !p.cards.includes(c)); discard.push(...p.cards); }
  const b = F.writeBatch(DB);
  b.update(rDeal(M.code), { hands, discard, map });
  b.update(rRoom(M.code), { step: "pick", shown, keys: Object.keys(map), pickAt: F.serverTimestamp(), touchedAt: F.serverTimestamp() });
  await b.commit();
}
function resolve(r, d) {
  const map = d.map || {}, keys = r.keys || [], order = r.order || [];
  const counts = {}, votes = {};
  let win = [];
  if (isJudgeMode(r)) { if (pickOk(r)) win = [M.pick.key]; }
  else {
    // A vote for your own card doesn't count.
    for (const [voter, k] of Object.entries(voteMap(r))) if (map[k] && map[k] !== voter) { counts[k] = (counts[k] || 0) + 1; votes[voter] = map[k]; }
    const max = Math.max(0, ...Object.values(counts));
    win = max ? keys.filter(k => counts[k] === max) : [];
  }
  const winners = win.map(k => map[k]).filter(Boolean);
  const scores = { ...(r.scores || {}) };
  winners.forEach(u => { scores[u] = (scores[u] || 0) + 1; });
  const played = new Set(Object.values(map));
  const entry = {
    q: r.q, j: r.judgeUid || "", w: winners,
    subs: (r.shown || []).map(s => ({ u: map[s.k] || "", c: s.c, n: counts[s.k] || 0 })),
    m: order.filter(id => id !== r.judgeUid && !played.has(id)),
    ...(isJudgeMode(r) ? {} : { v: votes })
  };
  return patchRoom({ step: "result", res: { win, authors: map, counts }, scores, history: [...(r.history || []), entry] });
}
function houseToAdd(r, d) {
  const have = new Set(d.house || []);
  return usableCustoms(r).filter(c => !have.has(c.id));
}
/* House cards written (or accepted) during the game join the top of the piles. */
function mergeHouse(d, add) {
  const qdeck = (d.qdeck || []).slice(), adeck = (d.adeck || []).slice();
  for (const c of add) {
    if (c.kind === "q") qdeck.splice(rand(Math.min(qdeck.length, 3) + 1), 0, { t: c.text, l: "m" });
    else if (!adeck.includes(c.text) && !Object.values(d.hands || {}).some(h => h.includes(c.text))) adeck.splice(rand(Math.min(adeck.length, 12) + 1), 0, c.text);
  }
  return F.updateDoc(rDeal(M.code), { qdeck, adeck, house: [...(d.house || []), ...add.map(c => c.id)] });
}
function allPlayed(r, got) {
  const done = new Set(got.map(p => p.uid));
  const need = (r.order || []).filter(id => id !== r.judgeUid && idOnline(id));
  return need.length > 0 && need.every(id => done.has(id));
}
function allVoted(r, d) {
  const vm = voteMap(r), map = d.map || {}, keys = r.keys || [];
  const need = (r.order || []).filter(id => idOnline(id) && keys.some(k => map[k] !== id));
  return need.length > 0 && need.every(id => vm[id]);
}
function hostJob(r, d) {
  if (r.maison) { const add = houseToAdd(r, d); if (add.length) return { name: "house", run: () => mergeHouse(d, add) }; }
  if (r.step === "answer") {
    const got = roundPlays(r, d);
    if (got.length && (allPlayed(r, got) || timeLeft(r) === 0)) return { name: "pick", run: () => toPick(r, d) };
  }
  if (r.step === "pick" && (isJudgeMode(r) ? pickOk(r) : allVoted(r, d) || timeLeft(r) === 0)) return { name: "resolve", run: () => resolve(r, d) };
  return null;
}
let hostBusy = false, jobDone = "";
async function hostSync() {
  const r = M.room, d = M.deal;
  if (!isMod() || hostBusy || M.busy || !r || r.phase !== "play" || r.paused || !d || d.gameId !== r.gameId) return;
  const job = hostJob(r, d);
  if (!job) return;
  const key = `${r.gameId}|${r.round}|${r.step}|${job.name}`;
  if (key === jobDone && job.name !== "house") return;
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
  for (const name of ["plays", "picks", "votes", "custom", "choices"]) for (const d of (await F.getDocs(col(name))).docs) await F.deleteDoc(d.ref);
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
  return { color: null, games: 0, wins: 0, rounds: 0, titles: {}, lines: {}, recorded: [], ...store.json("profile", {}) };
}
function saveProfile(p) { store.set("profile", JSON.stringify(p)); }
function recordGame(gameId, ids, scores, hist, titles) {
  const p = profile();
  if (!gameId || p.recorded.includes(gameId) || !ids.includes(M.me) || !hist.length) return;
  const max = Math.max(0, ...ids.map(id => scores[id] || 0));
  p.games++;
  if (max && (scores[M.me] || 0) === max) p.wins++;
  for (const h of hist) if ((h.w || []).includes(M.me)) {
    p.rounds++;
    const mine = (h.subs || []).find(s => s.u === M.me);
    if (mine) { const line = mine.c.map(cap).join(" / "); p.lines[line] = (p.lines[line] || 0) + 1; }
  }
  p.lines = Object.fromEntries(Object.entries(p.lines).sort((a, b) => b[1] - a[1]).slice(0, 40));
  const t = titles[M.me];
  if (t) p.titles[t.title] = (p.titles[t.title] || 0) + 1;
  p.recorded = [...p.recorded, gameId].slice(-50);
  saveProfile(p);
}

/* ---------- end-of-game titles ---------- */
const TITLE_RULES = [
  { label: "Roi de la vanne", w: 3, score: s => s.wins >= 2 ? s.wins : 0, why: s => `${s.wins} manches remportées` },
  { label: "Aucune limite", w: 2.6, score: s => s.trash >= 2 ? s.trash : 0, why: s => `${s.trash} victoires avec des cartes Trash ou Extrême` },
  { label: "Légende locale", w: 2.4, score: s => s.house, why: s => `${plural(s.house, "victoire")} avec une carte maison` },
  { label: "Chouchou", w: 2.2, score: s => s.petN >= 2 ? s.petN : 0, why: s => `${s.petNick} a choisi sa carte ${s.petN} fois`, name: s => `Chouchou ${deNick(s.petNick)}` },
  { label: "Mouton", w: 3, score: s => s.cast >= 3 && s.withWin / s.cast >= .7 ? s.withWin / s.cast : 0, why: s => `a voté pour la carte gagnante ${Math.round(s.withWin / s.cast * 100)} % du temps` },
  { label: "Électron libre", w: 3, score: s => s.cast >= 3 && s.withWin / s.cast <= .2 ? 1 - s.withWin / s.cast : 0, why: () => "ne vote jamais comme les autres" },
  { label: "Génie incompris", w: 1.8, score: s => s.plays >= 3 && !s.wins ? s.plays : 0, why: s => `${s.plays} cartes jouées, zéro victoire` },
  { label: "Fan n°1", w: 1.6, score: s => s.fanN >= 2 ? s.fanN : 0, why: s => `a choisi ${s.fanNick} ${s.fanN} fois en jugeant`, name: s => `Fan n°1 ${deNick(s.fanNick)}` },
  { label: "Machine à voix", w: 1.4, score: s => s.recv >= 4 ? s.recv : 0, why: s => `${voix(s.recv)} reçues` },
  { label: "Toujours en retard", w: 1, score: s => s.missed >= 2 ? s.missed : 0, why: s => `${s.missed} manches sans jouer` }
];
function computeTitles(ids, hist, nick) {
  const S = Object.fromEntries(ids.map(id => [id, { id, wins: 0, trash: 0, house: 0, plays: 0, missed: 0, recv: 0, cast: 0, withWin: 0, pet: {}, fan: {} }]));
  for (const h of hist) {
    const w = new Set(h.w || []);
    for (const s of h.subs || []) {
      const x = S[s.u];
      if (!x) continue;
      x.plays++; x.recv += s.n || 0;
      if (!w.has(s.u)) continue;
      x.wins++;
      const lv = [h.q?.l, ...(s.c || []).map(c => lvlOf("a", c))];
      if (lv.includes(3) || lv.includes(4)) x.trash++;
      if (lv.includes("m")) x.house++;
      if (h.j && S[h.j]) { x.pet[h.j] = (x.pet[h.j] || 0) + 1; S[h.j].fan[s.u] = (S[h.j].fan[s.u] || 0) + 1; }
    }
    for (const id of h.m || []) if (S[id]) S[id].missed++;
    for (const [voter, author] of Object.entries(h.v || {})) { const x = S[voter]; if (x) { x.cast++; if (w.has(author)) x.withWin++; } }
  }
  for (const x of Object.values(S)) {
    const p = topOf(x.pet), f = topOf(x.fan);
    x.petN = p ? p[1] : 0; x.petNick = p ? nick(p[0]) : "";
    x.fanN = f ? f[1] : 0; x.fanNick = f ? nick(f[0]) : "";
  }
  const cands = [];
  for (const s of Object.values(S)) for (const rule of TITLE_RULES) {
    const sc = rule.score(s);
    if (sc > 0) cands.push({ uid: s.id, label: rule.label, title: rule.name ? rule.name(s) : rule.label, why: rule.why(s), score: sc * rule.w });
  }
  cands.sort((a, b) => b.score - a.score);
  const out = {}, used = new Set();
  for (const c of cands) if (!out[c.uid] && !used.has(c.label)) { out[c.uid] = c; used.add(c.label); }
  for (const id of ids) if (!out[id]) out[id] = { title: "Témoin de la soirée", why: "a tout vu, n'a rien dit" };
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
  return `<header class="top ${big ? "big" : ""}"><h1 class="logo">Blanc&#8209;manger <span class="coco">coco</span></h1>${badge ? `<span class="badge">${esc(badge)}</span>` : ""}</header>`;
}
function errBox() {
  return (M.err ? `<div class="err" role="alert">${esc(M.err)}</div>` : "") + (M.flash ? `<div class="note" role="status">${esc(M.flash)}</div>` : "");
}
function heat(l) { return `<span class="heat" aria-hidden="true">${[1, 2, 3, 4].map(i => `<i class="${i <= l ? "f" + l : ""}"></i>`).join("")}</span>`; }
const levelTag = l => l === "m" ? "Maison" : `${heat(clampLevel(l))}${LEVELS[clampLevel(l) - 1].name}`;
function levelPicker(level, act) {
  return `<div class="levels">${LEVELS.map(L =>
    `<button class="lvl ${L.id === level ? "cur" : L.id < level ? "in" : ""}" data-act="${act}" data-id="${L.id}" aria-pressed="${L.id === level}">
      ${heat(L.id)}<b>${L.name}</b><small>${L.desc}</small></button>`).join("")}</div>`;
}
function sw(on, act, title, sub) {
  return `<button class="switch" data-act="${act}" aria-pressed="${!!on}"><span class="knob"></span><span><b>${title}</b><br><small>${sub}</small></span></button>`;
}
const togs = (list, cur, act, label) => `<div class="toggles">${list.map(v => `<button class="tog" data-act="${act}" data-id="${v}" aria-pressed="${cur === v}">${label(v)}</button>`).join("")}</div>`;
function deckSize(level, packs, house) {
  const hq = house.filter(c => c.kind === "q").length;
  return { q: countCards("q", level, packs) + hq, a: countCards("a", level, packs) + house.length - hq };
}
function deckCounts(level, packs, house) {
  const s = deckSize(level, packs, house);
  return `${s.q} questions · ${s.a} réponses${house.length ? ` · dont ${house.length} maison` : ""}`;
}
/* Enough cards to play: a question, and a full hand for everyone. */
function deckProblem(level, packs, house, players) {
  const s = deckSize(level, packs, house);
  if (!s.q) return "Aucune question dans ces paquets à ce niveau : monte le niveau ou ajoute un paquet.";
  if (s.a < players * HAND) return `Pas assez de réponses pour ${players} joueurs : ajoute un paquet ou monte le niveau.`;
  return "";
}
function packPicker(level, packs, act) {
  const on = packIds(packs);
  return `<div class="label">Paquets</div>
    <div class="levels two">${PACKS.map(p => {
      const n = countCards("q", level, [p.id]) + countCards("a", level, [p.id]);
      return `<button class="lvl ${on.includes(p.id) ? "cur" : ""}" data-act="${act}" data-id="${p.id}" aria-pressed="${on.includes(p.id)}">
        <b>${esc(p.name)}</b><small>${esc(p.desc)}</small><small class="n">${n ? plural(n, "carte") + " à ce niveau" : "Rien à ce niveau"}</small></button>`;
    }).join("")}</div>`;
}
/* o: { mode, level, packs, target, timer, maison, approve, gages, gageLvl, apero, house, acts } — a missing act hides its setting. */
function settingsPanel(o) {
  const a = o.acts;
  return `<section class="panel">
    ${a.mode ? `<div class="label">Qui choisit la meilleure réponse</div>
      <div class="levels two">${MODES.map(m => `<button class="lvl ${o.mode === m.id ? "cur" : ""}" data-act="${a.mode}" data-id="${m.id}" aria-pressed="${o.mode === m.id}"><b>${m.name}</b><small>${m.desc}</small></button>`).join("")}</div>` : ""}
    <div class="label">Niveau</div>
    ${levelPicker(o.level, a.level)}
    ${packPicker(o.level, o.packs, a.pack)}
    <p class="hint left">Chaque niveau garde aussi les cartes plus douces, mais pioche surtout dans le sien. ${deckCounts(o.level, o.packs, o.house)}.</p>
    <div class="label">Points pour gagner</div>
    ${togs(TARGETS, o.target, a.target, v => v)}
    ${a.timer ? `<div class="label">Chrono pour jouer${o.mode === "vote" ? " et pour voter" : ""}</div>
      ${togs(TIMERS, o.timer || 0, a.timer, v => v ? v + " s" : "Aucun")}
      <p class="hint left">Les réponses arrivent dès que tout le monde a joué, ou à la fin du chrono.</p>` : ""}
  </section>
  <section class="panel">
    <div class="label">Options</div>
    ${sw(o.maison, a.maison, "Cartes maison", "Vos propres questions et réponses, glissées en haut des pioches.")}
    ${a.approve ? sw(o.approve, a.approve, "Valider les cartes des joueurs", "Les cartes proposées par les autres attendent ton accord avant d'entrer dans les pioches.") : ""}
    ${sw(o.gages, a.gages, "Gages et vérités", "À la fin, le ou les derniers du classement choisissent entre un gage et une vérité.")}
    ${o.gages ? `${togs([1, 2, 3, 4], o.gageLvl || 1, a.gageLvl, v => GAGE_LEVELS[v - 1])}
      <p class="hint left">Chaque niveau pioche aussi dans les plus doux. Ce qui touche quelqu'un d'autre se fait avec son accord.</p>` : ""}
    ${sw(o.apero, a.apero, "Mode apéro", `Qui gagne la manche distribue ${SIPS} gorgées.`)}
  </section>`;
}
function settingsSummary(r) {
  const tags = [MODES.find(m => m.id === (r.mode || "judge")).name, LEVELS[clampLevel(r.level) - 1].name,
    ...packIds(r.packs).map(id => PACKS.find(p => p.id === id).name), `${r.target || 5} points`,
    ...(r.timer ? [`Chrono ${r.timer} s`] : []), ...(r.maison ? ["Cartes maison"] : []),
    ...(r.gages ? [`Gages ${GAGE_LEVELS[(r.gageLvl || 1) - 1]}`] : []), ...(r.apero ? ["Mode apéro"] : [])];
  return `<div class="summary">${tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>`;
}
/* o: { form, kind, kindAct, delAct, canDel, pending, approveAct, empty } */
function customBlock(list, o) {
  const q = o.kind === "q";
  return `<section class="panel">
    <div class="label">Cartes maison</div>
    <div class="toggles">${[["a", "Une réponse"], ["q", "Une question"]].map(([k, n]) => `<button class="tog" data-act="${o.kindAct}" data-id="${k}" aria-pressed="${o.kind === k}">${n}</button>`).join("")}</div>
    <form class="row" data-form="${o.form}"><input id="${o.form}" data-draft="${o.form}" type="text" maxlength="${q ? 150 : 80}" autocomplete="off" enterkeyhint="done"
      placeholder="${q ? "Ma plus grande honte : ___." : "le barbecue de tonton Gérard"}" aria-label="${q ? "Nouvelle question" : "Nouvelle réponse"}"><button class="btn" type="submit">Ajouter</button></form>
    <p class="hint left">${q ? "Écris ___ à la place du trou (deux trous au plus)." : "Quelques mots qui se glissent dans un trou, comme sur une carte blanche."}</p>
    ${list.length ? `<ul class="customs">${list.map(c => {
      const waiting = o.pending && o.pending(c);
      return `<li class="${waiting ? "wait-ok" : ""}"><span><small class="tagline">${c.kind === "q" ? "Question" : "Réponse"}${waiting ? " · en attente de validation" : ""}</small>${c.kind === "q" ? fillHtml(c.text) : esc(cap(c.text))}</span>
        <span class="acts">${waiting && o.approveAct ? `<button class="link" data-act="${o.approveAct}" data-id="${esc(c.id)}">Valider</button>` : ""}
        ${o.canDel(c) ? `<button class="link" data-act="${o.delAct}" data-id="${esc(c.id)}" aria-label="Supprimer cette carte">${waiting && o.approveAct ? "Refuser" : "Retirer"}</button>` : ""}</span></li>`;
    }).join("")}</ul>` : `<p class="hint left">${o.empty}</p>`}
  </section>`;
}
/* The black card. */
function qcard(q, cards, left, key) {
  return `<article class="qcard" data-key="${esc(key)}">
    <div class="meta"><span>${esc(left)}</span><span class="lv">${levelTag(q?.l ?? 1)}</span></div>
    <p class="q">${fillHtml(q?.t || "…", cards || [])}</p>
    <div class="brand" aria-hidden="true">Blanc-manger coco</div>
  </article>`;
}
/* The white cards in a hand; with two blanks, the order of the taps is the order in the sentence. */
function handGrid(hand, sel, act, n) {
  return `<div class="hand">${hand.map((t, i) => {
    const at = sel.indexOf(t);
    return `<button class="acard ${at >= 0 ? "sel" : ""}" data-act="${act}" data-id="${i}" aria-pressed="${at >= 0}">${at >= 0 && n > 1 ? `<span class="nb">${at + 1}</span>` : ""}<span class="t">${esc(cap(t))}</span></button>`;
  }).join("")}</div>`;
}
const toggleSel = (sel, t, n) => sel.includes(t) ? sel.filter(x => x !== t) : n === 1 ? [t] : sel.length < n ? [...sel, t] : [...sel.slice(0, n - 1), t];
/* The answers on the table. o: { act, sel, mine, authors, counts, win, info } */
function subsList(q, shown, o) {
  const info = o.info || pInfo;
  return `<div class="subs">${shown.map(s => {
    const own = o.mine === s.k, won = (o.win || []).includes(s.k), a = o.authors?.[s.k];
    const inner = `<span class="s">${fillHtml(q.t, s.c)}</span>
      ${a ? `<span class="by">${chip(info(a))}${o.counts ? `<b class="n">${voix(o.counts[s.k] || 0)}</b>` : ""}${won ? `<span class="tag win">+1</span>` : ""}</span>`
        : own ? `<span class="by"><span class="tag">ta carte</span></span>` : ""}`;
    return o.act && !own
      ? `<button class="sub ${o.sel === s.k ? "sel" : ""}" data-act="${o.act}" data-id="${esc(s.k)}" aria-pressed="${o.sel === s.k}">${inner}</button>`
      : `<div class="sub ${won || (!o.act && o.sel === s.k) ? "win" : ""} ${own ? "own" : ""}">${inner}</div>`;
  }).join("")}</div>`;
}
function timerBar(left, total, label) {
  if (left == null) return "";
  const pct = total ? Math.max(0, Math.min(100, left / total * 100)) : 0;
  return `<div class="timer ${left <= 5 ? "hurry" : ""}"><div class="tl"><span>${label}</span><b>${left} s</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
}
function scoresPanel(ids, scores, target, info, judge = "") {
  const rows = ids.map(id => ({ p: info(id), n: scores[id] || 0 })).sort((a, b) => b.n - a.n);
  return `<section class="panel"><div class="label">Scores · premier à ${target} points</div>
    <ol class="scores">${rows.map(x => `<li>${av(x.p)}<span class="nm">${esc(x.p.nick)}${x.p.id === judge ? ` <span class="tag">juge</span>` : ""}</span>
      <span class="pips" aria-hidden="true">${Array.from({ length: target }, (_, i) => `<i class="${i < x.n ? "on" : ""}"></i>`).join("")}</span><b class="n">${x.n}</b></li>`).join("")}</ol></section>`;
}
const scoreIds = r => [...new Set([...(r.order || []), ...Object.keys(r.scores || {})])];
function palmares(ids, scores, hist, titles, info, shareAct) {
  if (!hist.length) return `<section class="panel"><p class="lead">Aucune manche jouée pour l'instant.</p></section>`;
  const rows = ids.map(id => ({ id, p: info(id), pts: scores[id] || 0,
    lines: hist.filter(h => (h.w || []).includes(id)).map(h => ({ q: h.q, c: (h.subs || []).find(s => s.u === id)?.c || [] })) }))
    .sort((a, b) => b.pts - a.pts);
  return `<section class="panel">
    <div class="label">Palmarès · ${plural(hist.length, "manche")}</div>
    <ol class="rank">${rows.map((s, i) => {
      const t = titles[s.id];
      return `<li><details>
      <summary><span class="pos">${i + 1}</span>${av(s.p)}<span class="who"><b>${esc(s.p.nick)}</b>
        ${t ? `<span class="title">${esc(t.title)}</span>` : ""}
        <small>${plural(s.pts, "point")}${t ? " · " + esc(t.why) : ""}</small></span></summary>
      ${s.lines.length ? `<ul>${s.lines.map(l => `<li>${fillHtml(l.q.t, l.c)}</li>`).join("")}</ul>` : `<ul><li>Aucune manche gagnée. Trop sage ?</li></ul>`}
    </details></li>`;
    }).join("")}</ol>
    ${shareAct ? `<button class="btn" data-act="${shareAct}">Partager le palmarès en image</button>` : ""}
  </section>`;
}
/* Gages and truths for the last of the ranking, each choosing on their own phone. */
function gagesPanel(o) {
  if (!o.on || !o.losers.length) return "";
  return `<section class="panel"><div class="label">Gages des derniers · ${GAGE_LEVELS[(o.lvl || 1) - 1]}</div>${o.losers.map(p => {
    const kind = o.choiceOf(p.id);
    if (kind) return `<div class="gage ${kind}"><div class="gk">${esc(p.nick)} · ${kind === "dare" ? "Gage" : "Vérité"}</div><p>${esc(gageText(kind, o.lvl, o.seed + p.id))}</p></div>`;
    if (o.canChoose(p.id)) return `<div class="gage"><div class="gk">${p.id === M.me ? "À toi de choisir" : `${esc(p.nick)} choisit`}</div>
      <div class="btns"><button class="btn primary" data-act="${o.act}" data-id="dare" data-uid="${esc(p.id)}">Gage</button><button class="btn" data-act="${o.act}" data-id="truth" data-uid="${esc(p.id)}">Vérité</button></div></div>`;
    return `<div class="gage"><div class="gk">${esc(p.nick)}</div><p class="dots">choisit entre gage et vérité</p></div>`;
  }).join("")}</section>`;
}
function losersOf(ids, scores) {
  if (ids.length < 2) return [];
  const pts = ids.map(id => scores[id] || 0), min = Math.min(...pts), max = Math.max(...pts);
  return min < max ? ids.filter(id => (scores[id] || 0) === min) : [];
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
      <li>Chacun reçoit <b>${HAND} cartes réponses</b>, en secret, sur son téléphone.</li>
      <li>À chaque manche, une <b>carte question</b> à trous s'affiche.</li>
      <li>Chacun choisit dans sa main la carte qui la complète le mieux. Ou le pire.</li>
      <li>Le <b>juge</b> de la manche lit toutes les réponses à voix haute, sans savoir qui a joué quoi, et choisit sa préférée. Qui gagne la manche devient le juge de la suivante.</li>
      <li>Variante : <b>tout le monde vote</b> pour la meilleure, jamais pour la sienne.</li>
      <li>Chaque manche gagnée rapporte un point. Le premier qui atteint le score fixé gagne la partie.</li>
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
  const line = topOf(p.lines), title = topOf(p.titles);
  return `<section class="panel">
    <div class="label">Mon profil</div>
    <div class="swatches" role="group" aria-label="Ma couleur">${COLORS.map(c =>
      `<button class="swatch" data-act="pick-color" data-id="${c}" style="background:${c}" aria-pressed="${p.color === c}" aria-label="Couleur ${c}"></button>`).join("")}</div>
    ${p.games ? `<ul class="stats">
        <li><b>${p.games}</b> ${p.games > 1 ? "parties" : "partie"}</li>
        <li><b>${p.wins}</b> ${p.wins > 1 ? "victoires" : "victoire"}</li>
        <li><b>${p.rounds}</b> ${p.rounds > 1 ? "manches gagnées" : "manche gagnée"}</li>
      </ul>
      ${line ? `<p class="hint left">Ta carte qui gagne le plus : <b>${esc(line[0])}</b> (${line[1]} fois).</p>` : ""}
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
  return header(true) + `<p class="tagline">Une question à trous. Une main de cartes. Et la réponse la plus drôle (ou la pire) gagne.</p>` + errBox() + `<section class="panel">
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
      <p class="hint left">Ouvre ce lien sur le grand écran : il montre les questions, les réponses à lire et les scores, sans jamais montrer les mains.</p>
      <div class="row"><input type="text" readonly value="${esc(tvLink())}" aria-label="Lien grand écran" onclick="this.select()"><button class="btn" data-act="copy-tv">Copier</button></div>
    </details>` : ""}
  </section>`;
}
function playersPanel(players, editable) {
  return `<section class="panel">
    <div class="label">À table · ${players.length}</div>
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
      <p class="lead">${r.phase === "play" ? "Une partie est en cours. Entre ton prénom : tu recevras tes cartes à la prochaine manche." : "Entre ton prénom pour t'asseoir à la table."}</p>
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
  const custom = customBlock(M.customs, {
    form: "custom", kind: M.ckind, kindAct: "ckind", delAct: "del-custom", canDel: c => mod || c.by === M.me,
    pending: c => r.approve && !c.ok && c.by !== r.hostUid, approveAct: mod ? "approve-custom" : null,
    empty: mod ? "Ajoutez vos propres cartes : vos blagues à vous, vos prénoms, vos histoires. Les autres joueurs peuvent en proposer aussi."
      : "Ajoute tes propres cartes. Personne ne les voit à part toi et le modo : elles arriveront par surprise en pleine partie."
  });
  if (!mod) {
    return `${invitePanel()}${playersPanel(players, false)}
    <section class="panel"><div class="label">Réglages de la partie</div>${settingsSummary(r)}</section>
    ${waitMod("Le modo prépare la partie")}
    ${custom}${rulesBox()}
    <p class="foot"><button class="link" data-act="leave">Quitter la partie</button> · <button class="link" data-act="exit">Retour à l'accueil</button></p>`;
  }
  const house = r.maison ? usableCustoms(r) : [];
  const why = players.length < MIN_PLAYERS ? `Il faut au moins ${MIN_PLAYERS} joueurs.` : deckProblem(clampLevel(r.level), r.packs, house, players.length);
  return `${invitePanel()}${playersPanel(players, true)}
  ${settingsPanel({ mode: r.mode || "judge", level: clampLevel(r.level), packs: r.packs, target: r.target || 5, timer: r.timer, maison: r.maison, approve: r.approve,
    gages: r.gages, gageLvl: r.gageLvl, apero: r.apero, house,
    acts: { mode: "mode", level: "level", pack: "pack", target: "target", timer: "timer", maison: "maison", approve: "approve", gages: "gages", gageLvl: "gage-lvl", apero: "apero" } })}
  ${custom}
  <button class="btn primary big" data-act="start" ${why ? "disabled" : ""}>Distribuer les cartes</button>
  ${why ? `<p class="hint on-ground">${esc(why)}</p>` : ""}
  <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
}
const roundLabel = (r, info = pInfo) => `Manche ${r.round}` + (isJudgeMode(r) && r.judgeUid ? ` · juge : ${info(r.judgeUid).nick}` : "");
function playScreen(r, mod) {
  let h;
  if (r.paused && !mod) h = qcard(r.q, [], roundLabel(r), r.round + "|" + r.q?.t) + pauseScreen();
  else h = r.step === "answer" ? answerView(r, mod) : r.step === "pick" ? pickView(r, mod) : resultView(r, mod);
  h += scoresPanel(r.order || [], r.scores || {}, r.target || 5, pInfo, isJudgeMode(r) ? r.judgeUid : "");
  if (mod) {
    h += `<p class="foot"><button class="link" data-act="pause">${r.paused ? "Reprendre la partie" : "Mettre en pause"}</button> · <button class="link" data-act="end">Terminer la partie</button></p>`;
    if (r.paused) h = `<div class="note"><b>Partie en pause.</b> Les joueurs voient un écran de pause. <button class="link" data-act="pause">Reprendre</button></div>` + h;
  }
  return h;
}
function playedPanel(r, mod) {
  const need = (r.order || []).filter(id => id !== r.judgeUid), done = playedIds(r);
  const waiting = need.filter(id => !done.has(id) && idOnline(id)), absent = need.filter(id => !done.has(id) && !idOnline(id));
  let h = `<section class="panel">
    <div class="label">Ont joué · ${need.filter(id => done.has(id)).length} sur ${need.length}</div>
    <div class="chips">${need.map(id => chip(pInfo(id), done.has(id) ? " ✓" : "", done.has(id) ? "" : "dim")).join("")}</div>`;
  if (mod) {
    h += `${absent.length ? `<p class="hint left">${esc(names(absent.map(pInfo)))} ${absent.length > 1 ? "ne répondent plus : on ne les attend pas" : "ne répond plus : on ne l'attend pas"}.</p>` : ""}
      <p class="hint left">${waiting.length ? "Les réponses arrivent toutes seules quand tout le monde a joué." : "Tout le monde a joué."}</p>
      <div class="btns">
        <button class="btn" data-act="force-pick" ${done.size ? "" : "disabled"}>${isJudgeMode(r) ? "Donner les réponses au juge" : "Passer au vote"}</button>
        <button class="btn" data-act="skip">Passer la question</button>
      </div>
      ${isJudgeMode(r) ? `<button class="link" data-act="change-judge" style="align-self:flex-start">Changer de juge</button>` : ""}`;
  }
  return h + `</section>`;
}
function answerView(r, mod) {
  const iJudge = isJudgeMode(r) && r.judgeUid === M.me, dealt = (r.order || []).includes(M.me);
  const n = r.blanks || 1, hand = myHand(r), played = myCards(r);
  const cur = M.sel.length || !played ? M.sel : played;
  let h = qcard(r.q, iJudge || !dealt ? [] : cur, roundLabel(r), r.round + "|" + r.q?.t);
  h += timerBar(timeLeft(r), r.timer, "Temps pour jouer");
  if (iJudge) {
    h += `<section class="panel center judge"><div class="label">C'est toi le juge</div>
      <p class="lead">Les autres choisissent leur carte. Tu liras ensuite toutes les réponses à voix haute, sans savoir qui a joué quoi.</p></section>`;
  } else if (!dealt) {
    h += `<section class="panel"><p class="lead">Tu recevras tes cartes à la prochaine manche.</p></section>`;
  } else if (!hand) {
    h += `<section class="panel center loading">Distribution des cartes…</section>`;
  } else {
    const changed = cur.length === n && !sameCards(cur, played);
    h += `<section class="stack">
      <div class="label on-ground">${played && !M.sel.length ? "C'est joué · tu peux encore changer d'avis" : n > 1 ? `Choisis ${n} cartes, dans l'ordre du texte` : "Choisis ta carte"}</div>
      ${handGrid(hand, cur, "card", n)}
    </section>
    <div class="playbar">${changed
      ? `<button class="btn primary big" data-act="play">${played ? "Changer ma réponse" : n > 1 ? "Jouer ces cartes" : "Jouer cette carte"}</button>`
      : played ? `<p class="note">Ta réponse est sur la table. On attend les autres.</p>`
      : `<p class="note">${n > 1 && cur.length ? `Encore ${n - cur.length} carte à choisir.` : "Touche une carte pour la glisser dans le trou."}</p>`}</div>`;
  }
  return h + playedPanel(r, mod);
}
function pickView(r, mod) {
  const shown = r.shown || [], myKey = mySubKey(r);
  let h = qcard(r.q, [], roundLabel(r), r.round + "|" + r.q?.t);
  if (isJudgeMode(r)) {
    const judge = pInfo(r.judgeUid), iJudge = judge.id === M.me, done = pickOk(r) ? M.pick.key : "";
    const away = !iJudge && !idOnline(judge.id);
    if (!done && (iJudge || (mod && (away || M.proxy)))) {
      h += `<section class="stack"><div class="label on-ground">${iJudge ? "Lis chaque réponse à voix haute, puis choisis ta préférée" : `Tu choisis à la place de ${esc(judge.nick)}`}</div>
        ${subsList(r.q, shown, { act: "sel-sub", sel: M.selKey, mine: myKey })}</section>
        <div class="playbar"><button class="btn primary big" data-act="pick" ${M.selKey ? "" : "disabled"}>Cette réponse gagne</button></div>`;
    } else {
      h += `<section class="stack"><div class="label on-ground">${done ? "Le juge a choisi" : `${esc(judge.nick)} lit les réponses et choisit`}</div>
        ${subsList(r.q, shown, { sel: done, mine: myKey })}</section>`;
      if (mod && !iJudge && !done) h += `<p class="foot">${away ? `<b>${esc(judge.nick)} ne répond plus.</b> ` : ""}<button class="link" data-act="proxy">Choisir à la place du juge</button></p>`;
    }
  } else {
    const vm = voteMap(r), mine = vm[M.me], voter = (r.order || []).includes(M.me);
    const order = r.order || [], voted = order.filter(id => vm[id]);
    h += timerBar(timeLeft(r), r.timer, "Temps pour voter");
    h += `<section class="stack"><div class="label on-ground">${voter ? (mine ? "Ton vote est pris · tu peux changer d'avis" : "Vote pour la meilleure réponse") : "Les joueurs votent"}</div>
      ${subsList(r.q, shown, { act: voter ? "vote" : "", sel: mine, mine: myKey })}</section>
      <section class="panel"><div class="label">Ont voté · ${voted.length} sur ${order.length}</div>
        <div class="chips">${order.map(id => chip(pInfo(id), vm[id] ? " ✓" : "", vm[id] ? "" : "dim")).join("")}</div>
        ${mod ? `<p class="hint left">Le résultat tombe tout seul quand tout le monde a voté.</p>
          <button class="btn" data-act="force-result" ${voted.length ? "" : "disabled"}>Révéler maintenant</button>` : ""}
      </section>`;
  }
  return h;
}
function verdictPanel(r, res, info) {
  const authors = res.authors || {}, wp = (res.win || []).map(k => info(authors[k])).filter(p => p.id);
  if (!wp.length) return `<section class="panel verdict"><div class="label">Verdict</div><div class="name">Personne</div><div class="vsub">Aucune voix pour cette manche.</div></section>`;
  const max = Math.max(0, ...Object.values(res.counts || {}));
  return `<section class="panel verdict" aria-live="polite">
    <div class="label">${wp.length > 1 ? "Égalité !" : "Manche remportée par"}</div>
    <div class="name">${esc(names(wp))}</div>
    <div class="vsub">${isJudgeMode(r) ? `Le choix de ${esc(info(r.judgeUid).nick)}` : voix(max)} · +1 point</div>
    ${r.apero ? `<div class="sips">${esc(names(wp))} ${wp.length > 1 ? "distribuent" : "distribue"} ${SIPS} gorgées</div>` : ""}
  </section>`;
}
function resultView(r, mod) {
  const res = r.res || {}, win = res.win || [], shown = r.shown || [];
  const first = shown.find(s => s.k === win[0]);
  let h = qcard(r.q, first ? first.c : [], roundLabel(r), r.round + "|" + r.q?.t);
  h += verdictPanel(r, res, pInfo);
  h += `<section class="stack"><div class="label on-ground">Qui a joué quoi</div>${subsList(r.q, shown, { authors: res.authors || {}, counts: isJudgeMode(r) ? null : res.counts || {}, win })}</section>`;
  const champ = reachedTarget(r);
  h += mod ? `<button class="btn primary big" data-act="next" ${M.deal ? "" : "disabled"}>${champ ? "Voir le classement final" : "Manche suivante"}</button>`
    : waitMod(champ ? "Le classement final arrive" : "Manche suivante bientôt");
  return h;
}
function endScreen(r, players, mod) {
  const ids = scoreIds(r), hist = r.history || [], scores = r.scores || {};
  const titles = computeTitles(ids, hist, id => pInfo(id).nick);
  recordGame(r.gameId, ids, scores, hist, titles);
  const losers = losersOf(ids, scores).map(pInfo);
  const h = palmares(ids, scores, hist, titles, pInfo, "share-img")
    + gagesPanel({ on: r.gages, losers, lvl: r.gageLvl, seed: r.gameId, act: "choose",
      choiceOf: uid => M.choices.find(c => c.uid === uid)?.kind, canChoose: uid => uid === M.me });
  if (!mod) return h + playersPanel(players, false) + waitMod("Le modo peut lancer une nouvelle partie");
  return h + playersPanel(players, true) + `<button class="btn primary big" data-act="newgame">Nouvelle partie</button>
    <p class="hint on-ground">Les joueurs restent à table. Tu pourras changer les réglages avant de redistribuer.</p>`;
}

/* ---------- big screen (TV / laptop): watches the game, never plays, never sees a hand ---------- */
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
    const key = r.round + "|" + r.q?.t;
    if (r.paused) return h + qcard(r.q, [], roundLabel(r), key) + pauseScreen();
    let main;
    if (r.step === "answer") {
      main = qcard(r.q, [], roundLabel(r), key) + timerBar(timeLeft(r), r.timer, "Temps pour jouer") + playedPanel(r, false);
    } else if (r.step === "pick") {
      const vm = voteMap(r), done = isJudgeMode(r) && pickOk(r) ? M.pick.key : "";
      main = qcard(r.q, [], roundLabel(r), key) + (isJudgeMode(r) ? "" : timerBar(timeLeft(r), r.timer, "Temps pour voter"))
        + `<section class="stack"><div class="label on-ground">${isJudgeMode(r) ? `${esc(pInfo(r.judgeUid).nick)} lit les réponses` : `Votez ! · ${Object.keys(vm).length} sur ${(r.order || []).length}`}</div>
          ${subsList(r.q, r.shown || [], { sel: done })}</section>`;
    } else {
      const res = r.res || {}, first = (r.shown || []).find(s => s.k === (res.win || [])[0]);
      main = qcard(r.q, first ? first.c : [], roundLabel(r), key) + verdictPanel(r, res, pInfo)
        + `<section class="stack">${subsList(r.q, r.shown || [], { authors: res.authors || {}, counts: isJudgeMode(r) ? null : res.counts || {}, win: res.win || [] })}</section>`;
    }
    h += `<div class="tvgrid"><div class="stack">${main}</div><div class="stack">${scoresPanel(r.order || [], r.scores || {}, r.target || 5, pInfo, isJudgeMode(r) ? r.judgeUid : "")}</div></div>`;
  } else {
    const ids = scoreIds(r), hist = r.history || [];
    h += palmares(ids, r.scores || {}, hist, computeTitles(ids, hist, id => pInfo(id).nick), pInfo, "");
  }
  return h;
}

/* ---------- screens: one phone passed around (always with a judge) ---------- */
function newLocal(prev) {
  const saved = store.json("local-names", []);
  return {
    phase: "setup", players: prev?.players || (Array.isArray(saved) ? saved : []),
    level: clampLevel(prev?.level || 1), target: prev?.target || 5, maison: prev ? !!prev.maison : true, customs: prev?.customs || [],
    gages: !!prev?.gages, gageLvl: prev?.gageLvl || 1, apero: !!prev?.apero, packs: packIds(prev?.packs),
    gid: rid(), qdeck: [], adeck: [], discard: [], hands: {}, round: 0, judge: -1, q: null, step: "answer",
    turn: 0, handoff: true, plays: {}, sel: [], shown: [], selKey: "", win: "", scores: {}, history: [], choices: {}
  };
}
function saveLocal() {
  store.set("local", JSON.stringify(M.local));
  if (M.local) store.set("local-names", JSON.stringify(M.local.players));
}
const lp = id => M.local.players.find(p => p.id === id) || { id, nick: "?", color: COLORS[0] };
const lJudge = L => L.players[L.judge] || L.players[0];
function lAnswering(L) {
  const n = L.players.length, out = [];
  for (let k = 1; k < n; k++) out.push(L.players[(L.judge + k) % n]);
  return out;
}
function lNewRound(L) {
  const q = L.qdeck.shift();
  if (!q || L.players.length < 2) { L.phase = "end"; return; }
  if (q.l !== "m") markSeen([qkey(q.t)]);
  // Whoever won the round judges the next one; with no winner, the next player round the table.
  const won = L.players.findIndex(p => p.id === L.win);
  L.judge = won >= 0 ? won : (L.judge + 1) % L.players.length;
  Object.assign(L, { round: L.round + 1, q, step: "answer", turn: 0, handoff: true, plays: {}, sel: [], shown: [], selKey: "", win: "" });
  for (const p of L.players) {
    const h = L.hands[p.id] || (L.hands[p.id] = []);
    while (h.length < HAND) {
      if (!L.adeck.length) { if (!L.discard.length) break; L.adeck = shuffle(L.discard); L.discard = []; }
      h.push(L.adeck.shift());
    }
  }
}
function lAdvance(L) {
  L.sel = []; L.turn++; L.handoff = true;
  if (L.turn < lAnswering(L).length) return;
  L.shown = shuffle(Object.entries(L.plays).map(([u, c]) => ({ k: rid(), u, c })));
  if (L.shown.length) L.step = "pick";
  else lNewRound(L);
}
function handoff(p, label, act, hint) {
  return `<section class="panel center hand-off">
    <div class="label">${label}</div>
    ${av(p)}<div class="who">${esc(p.nick)}</div>
    <button class="btn primary big" data-act="${act}">C'est moi</button>
    <p class="hint">${hint}</p>
  </section>`;
}
const lWhy = L => L.players.length < MIN_PLAYERS ? `Ajoute au moins ${MIN_PLAYERS} joueurs.` : deckProblem(L.level, L.packs, L.maison ? L.customs : [], L.players.length);
function renderLocal() {
  const L = M.local, n = L.players.length;
  const back = `<button class="link" data-act="go-online">Jouer chacun sur son téléphone</button>`;
  if (L.phase === "setup") {
    return header(true, "1 téléphone") + errBox() + `<section class="panel">
      <p class="lead">Un seul téléphone qui passe de main en main. Chacun regarde sa main en secret, et le juge lit les réponses.</p>
      <form class="row" data-form="l-name"><input id="l-name" data-draft="l-name" type="text" maxlength="18" autocomplete="off" enterkeyhint="done" placeholder="Prénom d'un joueur" aria-label="Prénom d'un joueur"><button class="btn" type="submit">Ajouter</button></form>
      ${n ? `<div class="chips">${L.players.map(p => chip(p, `<button class="x" data-act="l-del" data-id="${esc(p.id)}" aria-label="Retirer ${esc(p.nick)}">×</button>`)).join("")}</div>` : ""}
    </section>
    ${settingsPanel({ level: L.level, packs: L.packs, target: L.target, maison: L.maison, gages: L.gages, gageLvl: L.gageLvl, apero: L.apero, house: L.maison ? L.customs : [],
      acts: { level: "l-level", pack: "l-pack", target: "l-target", maison: "l-maison", gages: "l-gages", gageLvl: "l-gage-lvl", apero: "l-apero" } })}
    ${customBlock(L.customs, { form: "l-custom", kind: M.ckind, kindAct: "ckind", delAct: "l-del-custom", canDel: () => true, empty: "Ajoutez vos propres cartes : vos blagues à vous, vos prénoms, vos histoires." })}
    <button class="btn primary big" data-act="l-start" ${lWhy(L) ? "disabled" : ""}>Distribuer les cartes</button>
    ${lWhy(L) ? `<p class="hint on-ground">${esc(lWhy(L))}</p>` : ""}
    ${rulesBox()}
    <p class="foot">${back}</p>`;
  }
  const ids = L.players.map(p => p.id);
  if (L.phase === "end") {
    const titles = computeTitles(ids, L.history, id => lp(id).nick);
    return header(true, "1 téléphone") + palmares(ids, L.scores, L.history, titles, lp, "l-share")
      + gagesPanel({ on: L.gages, losers: losersOf(ids, L.scores).map(lp), lvl: L.gageLvl, seed: L.gid, act: "l-choose", choiceOf: uid => L.choices[uid], canChoose: () => true })
      + `<button class="btn primary big" data-act="l-reset">Nouvelle partie</button><p class="foot">${back}</p>`;
  }
  const judge = lJudge(L), label = `Manche ${L.round} · juge : ${judge.nick}`, key = L.round + "|" + L.q.t, nb = blanksOf(L.q.t);
  let h = header(false, "1 téléphone");
  if (L.step === "answer") {
    const p = lAnswering(L)[L.turn];
    if (L.handoff) {
      h += qcard(L.q, [], label, key) + handoff(p, `Joueur ${L.turn + 1} sur ${n - 1} · passe le téléphone à`, "l-me", "Les autres, regardez ailleurs.");
      h += `<p class="foot"><button class="link" data-act="l-pass">${esc(p.nick)} passe son tour</button></p>`;
    } else {
      const ok = L.sel.length === nb;
      h += qcard(L.q, L.sel, label, key) + `<section class="stack"><div class="label on-ground">${esc(p.nick)}, ${nb > 1 ? `choisis ${nb} cartes, dans l'ordre` : "choisis ta carte"}</div>
        ${handGrid(L.hands[p.id] || [], L.sel, "l-card", nb)}</section>
        <div class="playbar">${ok ? `<button class="btn primary big" data-act="l-play">${nb > 1 ? "Jouer ces cartes" : "Jouer cette carte"}</button>` : `<p class="note">Touche une carte pour la glisser dans le trou.</p>`}</div>`;
    }
  } else if (L.step === "pick") {
    if (L.handoff) h += qcard(L.q, [], label, key) + handoff(judge, "Toutes les réponses sont là · passe le téléphone au juge", "l-me", "Le juge lit chaque réponse à voix haute.");
    else h += qcard(L.q, [], label, key) + `<section class="stack"><div class="label on-ground">${esc(judge.nick)}, lis chaque réponse à voix haute, puis choisis ta préférée</div>
      ${subsList(L.q, L.shown, { act: "l-sel-sub", sel: L.selKey })}</section>
      <div class="playbar"><button class="btn primary big" data-act="l-pick" ${L.selKey ? "" : "disabled"}>Cette réponse gagne</button></div>`;
  } else {
    const authors = Object.fromEntries(L.shown.map(s => [s.k, s.u])), win = L.shown.filter(s => s.u === L.win).map(s => s.k);
    const first = L.shown.find(s => s.k === win[0]);
    const champ = Math.max(0, ...Object.values(L.scores)) >= L.target;
    h += qcard(L.q, first ? first.c : [], label, key)
      + verdictPanel({ mode: "judge", judgeUid: judge.id, apero: L.apero }, { win, authors }, lp)
      + `<section class="stack"><div class="label on-ground">Qui a joué quoi</div>${subsList(L.q, L.shown, { authors, win, info: lp })}</section>
      <button class="btn primary big" data-act="l-next">${champ ? "Voir le classement final" : "Manche suivante"}</button>`;
  }
  h += scoresPanel(ids, L.scores, L.target, lp, judge.id);
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
async function shareImage(ids, scores, hist, info) {
  const titles = computeTitles(ids, hist, id => info(id).nick);
  const rows = ids.map(id => ({ p: info(id), pts: scores[id] || 0 })).sort((a, b) => b.pts - a.pts).slice(0, 8);
  // The line of the night: the winning answer with the most votes, else the last one.
  const best = hist.filter(h => (h.w || []).length).map(h => ({ h, s: h.subs.find(s => s.u === h.w[0]) })).filter(x => x.s)
    .sort((a, b) => (b.s.n || 0) - (a.s.n || 0))[0] || null;
  try { await Promise.all([document.fonts.load("60px 'Archivo Black'"), document.fonts.load("800 30px Onest"), document.fonts.load("500 26px Onest")]); } catch {}
  const W = 1080, c = document.createElement("canvas"), g = c.getContext("2d");
  g.font = "800 40px Onest, Arial, sans-serif";
  const bestLines = best ? wrapLines(g, fillText(best.h.q.t, best.s.c), W - 200).slice(0, 5) : [];
  const bestH = best ? 120 + bestLines.length * 52 : 0;
  const H = 300 + bestH + rows.length * 150 + 60;
  c.width = W; c.height = H;
  g.fillStyle = "#F0566B"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#1A1416"; g.font = "84px 'Archivo Black', 'Arial Black', sans-serif"; g.fillText("Blanc-manger", 70, 140);
  const x0 = 70 + g.measureText("Blanc-manger ").width;
  g.save(); g.translate(x0, 140); g.rotate(-0.05);
  g.font = "84px 'Archivo Black', 'Arial Black', sans-serif";
  const cw = g.measureText("coco").width;
  g.fillStyle = "#1A1416"; g.beginPath(); g.roundRect ? g.roundRect(-10, -82, cw + 24, 104, 14) : g.rect(-10, -82, cw + 24, 104); g.fill();
  g.fillStyle = "#FFFDF9"; g.fillText("coco", 2, 0); g.restore();
  g.fillStyle = "#3B1820"; g.font = "800 30px Onest, Arial, sans-serif";
  g.fillText(`PALMARÈS · ${plural(hist.length, "MANCHE")} · ${new Date().toLocaleDateString("fr-FR")}`, 72, 210);
  let y = 250;
  if (best) {
    g.fillStyle = "#16110F"; g.beginPath(); g.roundRect ? g.roundRect(60, y, W - 120, bestH - 30, 26) : g.rect(60, y, W - 120, bestH - 30); g.fill();
    g.fillStyle = "#FF8FA0"; g.font = "800 26px Onest, Arial, sans-serif"; g.fillText(`LA PHRASE DE LA SOIRÉE · ${info(best.h.w[0]).nick.toUpperCase()}`, 100, y + 56);
    g.fillStyle = "#FFFDF9"; g.font = "800 40px Onest, Arial, sans-serif";
    bestLines.forEach((l, i) => g.fillText(l, 100, y + 112 + i * 52));
    y += bestH;
  }
  rows.forEach((s, i) => {
    const t = titles[s.p.id];
    g.fillStyle = i === 0 ? "#1A1416" : "#FFFDF9"; g.strokeStyle = "#1A1416"; g.lineWidth = 5;
    g.beginPath(); g.roundRect ? g.roundRect(60, y, W - 120, 128, 26) : g.rect(60, y, W - 120, 128); g.fill(); g.stroke();
    const ink = i === 0 ? "#FFFDF9" : "#1A1416";
    g.fillStyle = ink; g.font = "52px 'Archivo Black', 'Arial Black', sans-serif"; g.fillText(String(i + 1), 95, y + 84);
    g.fillStyle = safeColor(s.p.color); g.beginPath(); g.arc(215, y + 64, 40, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = "38px 'Archivo Black', 'Arial Black', sans-serif"; g.textAlign = "center";
    g.fillText((s.p.nick || "?").charAt(0).toUpperCase(), 215, y + 78); g.textAlign = "left";
    g.fillStyle = ink; g.font = "800 40px Onest, Arial, sans-serif"; g.fillText(s.p.nick, 285, y + 58);
    g.font = "500 28px Onest, Arial, sans-serif";
    g.fillText(`${t ? t.title + " · " : ""}${plural(s.pts, "point")}`.slice(0, 60), 285, y + 100);
    y += 150;
  });
  g.fillStyle = "#3B1820"; g.font = "500 26px Onest, Arial, sans-serif"; g.fillText(location.host, 72, H - 40);
  const blob = await new Promise(res => c.toBlob(res, "image/png"));
  const file = new File([blob], "blanc-manger-coco-palmares.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Blanc-manger coco, le palmarès" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  flash("Image du palmarès téléchargée.");
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
let lastHtml = "", lastCardKey = "";
function render() {
  document.body.classList.toggle("tv", M.mode === "room" && M.tv);
  let html;
  if (M.mode === "local" && M.local) html = renderLocal();
  else if (M.mode === "room") html = renderRoom();
  else if (M.mode === "home") html = renderHome();
  else if (M.mode === "setup") html = renderSetup();
  else if (M.mode === "fatal") html = renderFatal();
  else html = header(true) + `<section class="panel center loading">On mélange les cartes…</section>`;
  if (html !== lastHtml) {
    const a = document.activeElement, fid = a && a.id, ss = a && a.selectionStart, se = a && a.selectionEnd;
    const openDetails = [...app.querySelectorAll("details[open] summary")].map(s => s.textContent);
    app.innerHTML = html;
    lastHtml = html;
    app.querySelectorAll("details summary").forEach(s => { if (openDetails.includes(s.textContent)) s.parentElement.open = true; });
    app.querySelectorAll("[data-draft]").forEach(i => { i.value = M.drafts[i.dataset.draft] || ""; });
    if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(ss, se); } catch {} } }
    const card = app.querySelector(".qcard");
    const key = card ? card.dataset.key : "";
    if (card && key !== lastCardKey) { card.classList.add("enter"); window.scrollTo({ top: 0, behavior: "smooth" }); }
    lastCardKey = key;
    fillQR();
  }
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
/* Ticks or unticks a pack; the last ticked one stays. */
function togglePack(list, id) {
  const on = packIds(list);
  if (!PACKS.some(p => p.id === id)) return on;
  if (on.includes(id)) return on.length > 1 ? on.filter(x => x !== id) : on;
  return PACKS.map(p => p.id).filter(x => x === id || on.includes(x));
}
const roomSetting = (k, v) => modOnly(d => write(() => patchRoom({ [k]: v(d, M.room || {}) })));
/* A house card typed in the form: a question gets its blank, an answer loses its final full stop. */
function readCustom(draft) {
  const kind = M.ckind === "q" ? "q" : "a";
  const text = kind === "q" ? normQuestion(M.drafts[draft]) : normAnswer(M.drafts[draft]);
  if (text.length < 2) return null;
  if (kind === "q" && (text.match(/___/g) || []).length > 2) { M.err = "Deux trous au plus par question."; render(); return null; }
  M.drafts[draft] = ""; M.err = "";
  return { kind, text };
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
  "share": () => { navigator.share({ title: "Blanc-manger coco", text: `Rejoins la partie ${M.code} !`, url: inviteLink() }).catch(() => {}); },
  "copy": () => copy(inviteLink(), "Lien d'invitation copié."),
  "copy-tv": () => copy(tvLink(), "Lien grand écran copié."),
  "toggle-qr": () => { M.showQR = !M.showQR; render(); },
  "ckind": d => { M.ckind = d.id === "q" ? "q" : "a"; render(); document.getElementById(M.mode === "local" ? "l-custom" : "custom")?.focus(); },

  /* playing a round */
  "card": d => {
    const r = M.room, hand = r && myHand(r);
    if (!hand || r.step !== "answer") return;
    const t = hand[+d.id];
    if (t != null) { M.sel = toggleSel(M.sel, t, r.blanks || 1); render(); }
  },
  "play": () => {
    const r = M.room, n = r?.blanks || 1;
    if (!r || r.step !== "answer" || M.sel.length !== n) return;
    const g = r.gameId, round = r.round, cards = M.sel.slice();
    write(async () => {
      const b = F.writeBatch(DB);
      b.set(rPlay(M.code, `${g}_${round}_${M.me}`), { gameId: g, round, uid: M.me, cards, at: Date.now() });
      b.update(rPlayer(M.code, M.me), { done: `${g}_${round}` });
      await b.commit();
      if (sameCards(M.sel, cards)) M.sel = [];
    }, "Trop tard, les réponses sont déjà sur la table.");
  },
  "sel-sub": d => { M.selKey = d.id; render(); },
  "pick": () => {
    const r = M.room;
    if (!r || r.step !== "pick" || !M.selKey) return;
    write(() => F.setDoc(rPick(M.code, roundId(r)), { gameId: r.gameId, round: r.round, key: M.selKey, by: M.me }),
      "Ce choix n'est plus possible.");
  },
  "proxy": modOnly(() => { M.proxy = true; render(); }),
  "vote": d => {
    const r = M.room;
    if (!r || r.step !== "pick" || isJudgeMode(r) || r.paused) return;
    write(() => F.setDoc(rVote(M.code, `${roundId(r)}_${M.me}`), { gameId: r.gameId, round: r.round, voter: M.me, key: d.id, at: Date.now() }),
      "Trop tard, le résultat est déjà tombé.");
  },
  "choose": d => {
    const r = M.room; if (!r || d.uid !== M.me) return;
    write(() => F.setDoc(rChoice(M.code, `${r.gameId}_${M.me}`), { gameId: r.gameId, uid: M.me, kind: d.id }), "Ce choix n'est plus possible.");
  },
  "force-pick": modOnly(() => { const r = M.room, d = M.deal; if (r && d && r.step === "answer" && !hostBusy) write(() => toPick(r, d)); }),
  "force-result": modOnly(() => { const r = M.room, d = M.deal; if (r && d && r.step === "pick" && !hostBusy) write(() => resolve(r, d)); }),
  "skip": modOnly(() => { const r = M.room, d = M.deal; if (r && d && r.step === "answer") write(() => newRound(r, d, {}, true)); }),
  "change-judge": modOnly(() => {
    const r = M.room, order = r?.order || [];
    if (!r || r.step !== "answer" || !isJudgeMode(r)) return;
    const j = nextJudge(r, order, false);
    write(() => patchRoom({ judgeUid: j, jPos: order.indexOf(j) }));
  }),
  "next": modOnly(() => {
    const r = M.room, d = M.deal;
    if (!r || !d || r.step !== "result") return;
    write(() => reachedTarget(r) ? patchRoom({ phase: "end", paused: false }) : newRound(r, d));
  }),
  "pause": modOnly(() => {
    const r = M.room;
    if (!r.paused) { write(() => patchRoom({ paused: true, pausedAt: F.serverTimestamp() })); return; }
    // Resuming moves the timers forward by the length of the pause.
    const gap = Math.max(0, serverNow() - tsMs(r.pausedAt));
    const shift = ts => F.Timestamp.fromMillis(tsMs(ts) + gap);
    write(() => patchRoom({ paused: false, pausedAt: null, ...(r.roundAt ? { roundAt: shift(r.roundAt) } : {}), ...(r.pickAt ? { pickAt: shift(r.pickAt) } : {}) }));
  }),
  "end": modOnly(() => write(() => patchRoom({ phase: "end", paused: false }))),
  "newgame": modOnly(() => {
    const old = M.room?.gameId, code = M.code;
    write(async () => {
      await patchRoom(freshGame());
      if (!old) return;
      try {
        for (const col of [cPlays(code), cPicks(code), cVotes(code), cChoices(code)]) {
          const q = await F.getDocs(F.query(col, F.where("gameId", "==", old)));
          for (const d of q.docs) await F.deleteDoc(d.ref);
        }
      } catch {}
    });
  }),
  "start": modOnly(() => {
    const r = M.room;
    const house = r?.maison ? usableCustoms(r) : [];
    if (!r || M.players.length < MIN_PLAYERS || deckProblem(clampLevel(r.level), r.packs, house, M.players.length)) return;
    const seen = new Set([...seenLocal(), ...(r.played || [])]);
    const level = clampLevel(r.level);
    const d = { gameId: r.gameId, qdeck: buildQDeck(level, r.packs, house.filter(c => c.kind === "q").map(c => c.text), seen),
      adeck: buildADeck(level, r.packs, house.filter(c => c.kind === "a").map(c => c.text)), discard: [], hands: {}, map: {}, house: house.map(c => c.id) };
    write(() => newRound({ ...r, round: 0, order: [], cast: {}, judgeUid: "", jPos: rand(M.players.length) }, d, { scores: {}, history: [] }));
  }),
  "mode": roomSetting("mode", d => d.id === "vote" ? "vote" : "judge"),
  "level": roomSetting("level", d => clampLevel(d.id)),
  "pack": roomSetting("packs", (d, r) => togglePack(r.packs, d.id)),
  "target": roomSetting("target", d => TARGETS.includes(+d.id) ? +d.id : 5),
  "timer": roomSetting("timer", d => TIMERS.includes(+d.id) ? +d.id : 0),
  "maison": roomSetting("maison", (d, r) => !r.maison),
  "approve": roomSetting("approve", (d, r) => !r.approve),
  "gages": roomSetting("gages", (d, r) => !r.gages),
  "gage-lvl": roomSetting("gageLvl", d => Math.min(4, Math.max(1, +d.id || 1))),
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
  "share-img": () => { const r = M.room; if (r) shareImage(scoreIds(r), r.scores || {}, r.history || [], pInfo).catch(() => flash("Impossible de créer l'image.")); },
  "go-local": () => { M.mode = "local"; if (!M.local || M.local.phase === "end") M.local = newLocal(M.local); M.err = ""; saveLocal(); render(); },
  "go-online": () => { M.err = ""; if (M.code) M.mode = "room"; else M.mode = F && M.me ? "home" : (isPlaceholder() ? "setup" : "fatal"); render(); },
  "reload": () => location.reload(),

  /* one phone */
  "l-del": d => { M.local.players = M.local.players.filter(p => p.id !== d.id); saveLocal(); render(); },
  "l-level": d => { M.local.level = clampLevel(d.id); saveLocal(); render(); },
  "l-pack": d => { M.local.packs = togglePack(M.local.packs, d.id); saveLocal(); render(); },
  "l-target": d => { M.local.target = TARGETS.includes(+d.id) ? +d.id : 5; saveLocal(); render(); },
  "l-maison": () => { M.local.maison = !M.local.maison; saveLocal(); render(); },
  "l-gages": () => { M.local.gages = !M.local.gages; saveLocal(); render(); },
  "l-gage-lvl": d => { M.local.gageLvl = Math.min(4, Math.max(1, +d.id || 1)); saveLocal(); render(); },
  "l-apero": () => { M.local.apero = !M.local.apero; saveLocal(); render(); },
  "l-del-custom": d => { M.local.customs = M.local.customs.filter(c => c.id !== d.id); saveLocal(); render(); },
  "l-start": () => {
    const L = M.local;
    if (lWhy(L)) return;
    const house = L.maison ? L.customs : [];
    Object.assign(L, { phase: "play", gid: rid(), round: 0, judge: rand(L.players.length) - 1, win: "", hands: {}, discard: [], scores: {}, history: [], choices: {},
      qdeck: buildQDeck(L.level, L.packs, house.filter(c => c.kind === "q").map(c => c.text), seenLocal()),
      adeck: buildADeck(L.level, L.packs, house.filter(c => c.kind === "a").map(c => c.text)) });
    lNewRound(L);
    saveLocal(); render();
  },
  "l-me": () => { M.local.handoff = false; saveLocal(); render(); },
  "l-card": d => {
    const L = M.local, p = lAnswering(L)[L.turn], t = p && (L.hands[p.id] || [])[+d.id];
    if (t != null) { L.sel = toggleSel(L.sel, t, blanksOf(L.q.t)); saveLocal(); render(); }
  },
  "l-play": () => {
    const L = M.local, p = lAnswering(L)[L.turn];
    if (!p || L.sel.length !== blanksOf(L.q.t)) return;
    L.plays[p.id] = L.sel.slice();
    L.hands[p.id] = (L.hands[p.id] || []).filter(c => !L.sel.includes(c));
    L.discard.push(...L.sel);
    lAdvance(L); saveLocal(); render();
  },
  "l-pass": () => { lAdvance(M.local); saveLocal(); render(); },
  "l-sel-sub": d => { M.local.selKey = d.id; saveLocal(); render(); },
  "l-pick": () => {
    const L = M.local, s = L.shown.find(x => x.k === L.selKey);
    if (!s) return;
    const judge = lJudge(L);
    L.win = s.u; L.scores[s.u] = (L.scores[s.u] || 0) + 1;
    L.history.push({ q: L.q, j: judge.id, w: [s.u], subs: L.shown.map(x => ({ u: x.u, c: x.c, n: 0 })),
      m: lAnswering(L).map(p => p.id).filter(id => !L.plays[id]) });
    L.step = "result"; saveLocal(); render();
  },
  "l-next": () => {
    const L = M.local;
    if (Math.max(0, ...Object.values(L.scores)) >= L.target) L.phase = "end"; else lNewRound(L);
    saveLocal(); render();
  },
  "l-end": () => { M.local.phase = "end"; saveLocal(); render(); },
  "l-choose": d => { M.local.choices[d.uid] = d.id; saveLocal(); render(); },
  "l-share": () => { const L = M.local; shareImage(L.players.map(p => p.id), L.scores, L.history, lp).catch(() => flash("Impossible de créer l'image.")); },
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
    write(async () => {
      await F.addDoc(cCustom(M.code), { ...c, by: M.me, at: Date.now(), ok: isMod() });
      if (isMod() && !M.room?.maison) await patchRoom({ maison: true });
    }, "Impossible d'ajouter cette carte.");
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
    M.local.maison = true;
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
boot();
