import { firebaseConfig } from "./config.js";
import { Q } from "./questions.js";
import { GAGES } from "./gages.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const LEVELS = [
  { id: 1, name: "Normal", desc: "Pour tout le monde" },
  { id: 2, name: "Épicé", desc: "Drague, crushs et ragots" },
  { id: 3, name: "Hot", desc: "Sexe et soirées sans filtre" },
  { id: 4, name: "Extrême", desc: "Aucune limite, que des adultes" }
];
/* Themes are found from the words of each question, so new questions get sorted on their own. */
const THEMES = [
  { id: "amour", name: "Amour & drague", re: /crush|rencard|dragu|amour|amoureu|couple|partenaire|baiser|bisou|embrass|flirt|séduire|séduction|mari[ée]|mariage|célibataire|appli|match|saint-valentin|cœur|slow/i },
  { id: "sexe", name: "Sexe", re: /l'amour|coquin|couché|plan cul|plan à|au lit|nude|sext|jouet|fantasm|strip|porno|kamasutra|lingerie|orgie|bdsm|menottes|libertin|échang|body count|position|aphrodisiaque|érotique|sexy/i },
  { id: "soiree", name: "Soirées", re: /soirée|boîte|bar\b|verre|bourré|karaoké|fête|festival|apéro|kebab|\bdj\b|dans[ea]|nouvel an|bouteille|tournée|videur|concert/i },
  { id: "boulot", name: "Boulot", re: /travail|bureau|boulot|collègue|boss|patron|chef\b|cheffe|réunion|entreprise|open space|séminaire|team building|ressources humaines|client|stage|visio|mail/i },
  { id: "voyage", name: "Voyages", re: /vacances|voyage|avion|aéroport|hôtel|train|camping|plage|ski|étranger|touriste|valise|\bmer\b|montagne|croisière|auberge|chalet|île|far west|guide/i },
  { id: "bouffe", name: "Bouffe", re: /mang|pizza|resto|restaurant|frites|cuisin|raclette|fromage|\bplat\b|chips|gâteau|café|bonbon|biscuit|sauce|fondue|dîner|repas|huîtres|chantilly|nourriture|glace|pâtes|céréales|milkshake|ananas|ketchup|crêpes|brunch/i },
  { id: "ecran", name: "Écrans & réseaux", re: /téléphone|appli|instagram|tiktok|message|sexto|photo|selfie|internet|whatsapp|stor(y|ies)|youtube|onglet|écran|vocal|vocaux|émoji|like|profil|webcam|\bia\b|gps|wikipédia|swipe|ghost|mème/i },
  { id: "famille", name: "Famille", re: /parents|famille|familial|mère|père|grand-|frère|sœur|enfant|maman|papa|beaux-parents|bébé/i },
  { id: "groupe", name: "Ce groupe", re: /\bici\b|ce groupe|cette pièce|cette partie|ce jeu/i }
];
const VOTE_TIMERS = [0, 20, 30, 60];
const DEFENSE_S = 30;
const COLORS = ["#D93A26","#2F62D0","#18825A","#7C47CC","#B86400","#C2307C","#0F7C8F","#5E5C17","#8C3B1F","#3D4A63"];
const NUM = ["zéro","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const K = "qdn";
const ROOM_MAX_IDLE_MS = 24 * 3600 * 1000;

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rid = () => Math.random().toString(36).slice(2, 10);
const rand = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const nWord = n => n >= 2 && n <= 12 ? NUM[n] : n > 12 ? String(n) : "";
const safeColor = c => COLORS.includes(c) ? c : COLORS[0];
const nice = t => esc(t).replace(/ ([?!:»])/g, " $1").replace(/« /g, "« ");
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
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
function normQuestion(t) {
  t = String(t || "").trim().replace(/^qui de nous \S+\s*/i, "").replace(/^(\.{2,}|…)\s*/, "").replace(/\s*\?+$/, "");
  return t ? t + " ?" : "";
}

/* ---------- the deck ---------- */
const themesOf = t => THEMES.filter(th => th.re.test(t)).map(th => th.id);
const ITEMS = Object.fromEntries([1, 2, 3, 4].map(l => [l, Q[l].map(t => ({ t, l, th: themesOf(t) }))]));
function levelItems(level, themes) {
  const out = [];
  for (let l = 1; l <= level; l++) for (const it of ITEMS[l]) if (!themes.length || it.th.some(x => themes.includes(x))) out.push(it);
  return out;
}
function themeCounts(level) {
  const c = {};
  for (let l = 1; l <= level; l++) for (const it of ITEMS[l]) for (const th of it.th) c[th] = (c[th] || 0) + 1;
  return c;
}
function poolSize(level, themes, maison, customs) { return levelItems(level, themes).length + (maison ? customs.length : 0); }
/* Every house question always gets played, so the count never goes below them; 0 means the whole pool. */
function dealSize(level, themes, maison, customs, count) {
  const size = poolSize(level, themes, maison, customs), house = maison ? customs.length : 0;
  return count > 0 ? Math.min(size, Math.max(count, house)) : size;
}
/* Questions already asked (on this phone or in this room) go to the back of their pile, so a new game
   starts with ones the group hasn't seen. Each question then comes from a level drawn at random. */
function seenLocal() { return new Set(store.json("seen", [])); }
function markSeen(keys) {
  const s = seenLocal();
  keys.forEach(k => { s.delete(k); s.add(k); });
  store.set("seen", JSON.stringify([...s].slice(-4000)));
}
function buildDeck(level, themes, maison, customs, count, seen = new Set()) {
  const piles = [];
  for (let l = 1; l <= level; l++) {
    const items = ITEMS[l].filter(it => !themes.length || it.th.some(x => themes.includes(x))).map(it => ({ t: it.t, l }));
    if (items.length) piles.push([...shuffle(items.filter(it => !seen.has(qkey(it.t)))), ...shuffle(items.filter(it => seen.has(qkey(it.t))))]);
  }
  const out = maison ? customs.map(t => ({ t, l: "m" })) : [];
  const want = dealSize(level, themes, maison, customs, count);
  while (out.length < want) {
    const open = piles.filter(p => p.length);
    if (!open.length) break;
    out.push(open[rand(open.length)].shift());
  }
  return shuffle(out);
}
/* The same gage or truth on every phone, without anyone having to write it down. */
function gageText(kind, level, seed) {
  const pool = [];
  for (let l = 1; l <= clampLevel(level); l++) pool.push(...GAGES[kind][l]);
  return pool[hashInt(seed + kind) % pool.length];
}

/* ---------- state ---------- */
const M = {
  mode: "boot", me: null, code: null, tv: false,
  room: null, roomReady: false, players: [], playersReady: false, votes: [], customs: [], choices: [],
  pending: null, showVoters: false, renaming: false, handover: false, showQR: false, err: "", flash: "", busy: false, fatal: "",
  offline: false, offlineSince: 0, installEvt: null,
  local: null, drafts: { nick: store.get("nick") || "", code: hashCode() }
};
const isMod = () => !M.tv && !!M.room && M.room.hostUid === M.me;
const inRoom = () => !M.tv && M.players.some(p => p.id === M.me);

/* ---------- presence ----------
   Each phone stamps its player with the server time every HEARTBEAT_MS. The Firestore rules let a player
   take over once the moderator's stamp is older than 50 s; the button shows a bit later, at HOST_AWAY_MS. */
const HEARTBEAT_MS = 25000, HOST_AWAY_MS = 70000, PLAYER_AWAY_MS = 90000;
let skew = 0, lastHb = 0, mySeen = 0;
const serverNow = () => Date.now() - skew;
const seenMs = p => tsMs(p && p.seen);
const awayFor = p => !p ? Infinity : p.id === M.me ? 0 : serverNow() - seenMs(p);
const isOnline = p => awayFor(p) < PLAYER_AWAY_MS;
const hostPlayer = () => M.players.find(p => p.id === M.room?.hostUid);
/* Still sent while the page is in the background (another app opened for a minute), as long as the phone
   lets it run; a locked phone stops it, and that player then counts as absent. */
function heartbeat() {
  if (M.mode !== "room" || !M.code || !inRoom()) return;
  lastHb = Date.now();
  F.updateDoc(rPlayer(M.code, M.me), { seen: F.serverTimestamp() }).catch(() => {});
}
setInterval(heartbeat, HEARTBEAT_MS);
/* One tick a second keeps the timers moving and lets the moderator's page run the automatic steps. */
setInterval(() => {
  if (M.mode === "room") { render(); if (isMod()) hostSync(); }
  else if (M.mode === "local" && M.local?.phase === "play") render();
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
const rRoom = code => F.doc(DB, "rooms", code);
const rPlayer = (code, id) => F.doc(DB, "rooms", code, "players", id);
const cPlayers = code => F.collection(DB, "rooms", code, "players");
const rVote = (code, id) => F.doc(DB, "rooms", code, "votes", id);
const cVotes = code => F.collection(DB, "rooms", code, "votes");
const cCustom = code => F.collection(DB, "rooms", code, "custom");
const rCustom = (code, id) => F.doc(DB, "rooms", code, "custom", id);
const cChoices = code => F.collection(DB, "rooms", code, "choices");
const rChoice = (code, id) => F.doc(DB, "rooms", code, "choices", id);

let subs = [], gameSubs = [];
function leaveSubs() { [...subs, ...gameSubs].forEach(u => u()); subs = []; gameSubs = []; }
function onErr(e) {
  M.err = e && e.code === "permission-denied" ? "Accès refusé à cette partie." : "Connexion à la partie perdue. Recharge la page.";
  render();
}
function subGame() {
  gameSubs.forEach(u => u()); gameSubs = [];
  M.votes = []; M.choices = [];
  const g = M.room?.gameId;
  if (!g) return;
  gameSubs.push(F.onSnapshot(F.query(cVotes(M.code), F.where("gameId", "==", g)), q => { M.votes = q.docs.map(d => d.data()); render(); if (isMod()) hostSync(); }, onErr));
  gameSubs.push(F.onSnapshot(F.query(cChoices(M.code), F.where("gameId", "==", g)), q => { M.choices = q.docs.map(d => d.data()); render(); }, () => {}));
}
function enterRoom(code, tv = false) {
  leaveSubs();
  Object.assign(M, { mode: "room", tv, code, room: null, roomReady: false, players: [], playersReady: false, votes: [], customs: [], choices: [], pending: null, renaming: false, handover: false, showVoters: false, offline: false });
  if (!tv) store.set("room", code);
  try { history.replaceState(null, "", "#" + code + (tv ? "-tv" : "")); } catch {}
  subs.push(F.onSnapshot(rRoom(code), { includeMetadataChanges: true }, s => {
    if (!s.exists()) {
      if (s.metadata.fromCache) return;
      M.err = "Cette partie n'existe plus."; exitRoom(); return;
    }
    if (s.metadata.fromCache && !M.offline) M.offlineSince = Date.now();
    M.offline = s.metadata.fromCache;
    const prev = M.room?.gameId, prevRound = M.room?.round;
    M.room = s.data(); M.roomReady = true;
    if (M.room.gameId !== prev) subGame();
    if (prevRound !== undefined && M.room.round !== prevRound) M.err = "";
    if (M.pending && (M.pending.g !== M.room.gameId || M.pending.r !== M.room.round)) M.pending = null;
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
    if (inRoom() && Date.now() - lastHb > HEARTBEAT_MS) heartbeat();
    if (isMod()) hostSync();
    render();
  }, onErr));
  subs.push(F.onSnapshot(cCustom(code), q => {
    M.customs = q.docs.map(d => { const x = d.data(); return { id: d.id, text: String(x.text || "").slice(0, 160), by: x.by || "", at: x.at || 0, ok: !!x.ok }; })
      .filter(c => c.text).sort((a, b) => a.at - b.at);
    if (isMod()) hostSync();
    render();
  }, onErr));
  render();
}
function exitRoom() {
  leaveSubs();
  Object.assign(M, { mode: "home", tv: false, code: null, room: null, players: [], votes: [], customs: [], choices: [], pending: null });
  store.set("room", null);
  try { history.replaceState(null, "", location.pathname + location.search); } catch {}
  render();
}
async function joinRoom(code, nick) {
  const ps = await F.getDocs(cPlayers(code));
  const mine = ps.docs.find(d => d.id === M.me);
  lastHb = Date.now();
  if (mine) { await F.updateDoc(rPlayer(code, M.me), { nick, seen: F.serverTimestamp() }); return; }
  const used = new Set(ps.docs.map(d => d.data().color));
  const fav = profile().color;
  const color = fav && !used.has(fav) ? fav : COLORS.find(c => !used.has(c)) || COLORS[ps.size % COLORS.length];
  await F.setDoc(rPlayer(code, M.me), { nick, color, joinedAt: Date.now(), seen: F.serverTimestamp() });
}
const freshGame = () => ({ gameId: rid(), phase: "lobby", round: 0, deck: [], revealed: 0, votersShown: 0, skipped: [], paused: false });
const freshRoom = () => ({
  ...freshGame(), level: 1, themes: [], count: 20, maison: true, approve: false, apero: false,
  gages: false, defense: false, voteTimer: 0, played: []
});
/* Every change of the room also stamps it, which tells the cleanup when a room was last used. */
const patchRoom = p => F.updateDoc(rRoom(M.code), { ...p, touchedAt: F.serverTimestamp() });
/* House questions the moderator accepted (or all of them, when approval is off). */
const usableCustoms = (r = M.room) => M.customs.filter(c => !r?.approve || c.ok || c.by === r.hostUid);

/* ---------- moderator's page: automatic steps ---------- */
let hostBusy = false;
async function hostSync() {
  const r = M.room;
  if (!isMod() || hostBusy || !r || r.phase !== "play" || r.paused) return;
  const round = r.round || 1, deck = r.deck || [];
  // House questions added (or accepted) after the start go into the questions not asked yet.
  if (r.maison) {
    const inDeck = new Set(deck.filter(it => it.l === "m").map(it => it.t));
    const missing = usableCustoms(r).filter(c => !inDeck.has(c.text)).map(c => ({ t: c.text, l: "m" }));
    if (missing.length) {
      hostBusy = true;
      try { await patchRoom({ deck: [...deck.slice(0, round), ...shuffle([...deck.slice(round), ...missing])] }); } catch {}
      hostBusy = false;
      return;
    }
  }
  // Results show on their own once every player at the table has voted, or when the vote timer runs out.
  if (r.revealed !== round && (everyoneVoted(round) || voteTimeLeft(r) === 0)) {
    hostBusy = true;
    try { await reveal(); } catch {}
    hostBusy = false;
  }
}
function everyoneVoted(round) {
  const vm = votesMap(round);
  const present = M.players.filter(isOnline);
  return present.length > 0 && Object.keys(vm).length > 0 && present.every(p => vm[p.id]);
}
function voteTimeLeft(r) {
  if (!r.voteTimer || !r.roundAt || r.revealed === r.round) return null;
  const end = tsMs(r.roundAt) + r.voteTimer * 1000;
  const now = r.paused ? tsMs(r.pausedAt) || serverNow() : serverNow();
  return Math.max(0, Math.ceil((end - now) / 1000));
}
function reveal() {
  const r = M.room, item = (r.deck || [])[r.round - 1];
  // Remember the question as played, here and in the room, so the next games deal fresh ones first.
  const key = item && item.l !== "m" ? qkey(item.t) : null;
  if (key) markSeen([key]);
  return patchRoom({ revealed: r.round, revealedAt: F.serverTimestamp(), ...(key ? { played: F.arrayUnion(key) } : {}) });
}

/* ---------- cleanup: rooms this phone created, unused for a day, are deleted ---------- */
function rememberHosted(code) {
  const list = store.json("hosted", []);
  if (!list.includes(code)) { list.push(code); store.set("hosted", JSON.stringify(list.slice(-30))); }
}
async function cleanupOldRooms() {
  const keep = [];
  for (const code of store.json("hosted", [])) {
    try {
      const s = await F.getDoc(rRoom(code));
      if (!s.exists()) continue;
      const r = s.data();
      const last = Math.max(tsMs(r.touchedAt), tsMs(r.createdAt));
      if (r.hostUid !== M.me || code === M.code || Date.now() - last < ROOM_MAX_IDLE_MS) { if (r.hostUid === M.me) keep.push(code); continue; }
      for (const sub of ["votes", "choices", "custom", "players"]) {
        for (const d of (await F.getDocs(F.collection(DB, "rooms", code, sub))).docs) await F.deleteDoc(d.ref);
      }
      await F.deleteDoc(rRoom(code));
    } catch { keep.push(code); }
  }
  store.set("hosted", JSON.stringify(keep));
}

/* ---------- profile, kept on this phone ---------- */
function profile() {
  return { color: null, games: 0, wins: 0, received: 0, votedFor: {}, titles: {}, recorded: [], ...store.json("profile", {}) };
}
function saveProfile(p) { store.set("profile", JSON.stringify(p)); }
function recordGame(gameId, players, rounds, titles) {
  const p = profile();
  if (!gameId || p.recorded.includes(gameId) || !players.some(x => x.id === M.me) || !rounds.length) return;
  for (const { vm } of rounds) {
    const { winners } = tally(players, vm);
    if (winners.some(w => w.p.id === M.me)) p.wins++;
    for (const [v, t] of Object.entries(vm)) {
      if (t === M.me) p.received++;
      if (v === M.me && t !== M.me) { const nick = players.find(x => x.id === t)?.nick; if (nick) p.votedFor[nick] = (p.votedFor[nick] || 0) + 1; }
    }
  }
  const mine = titles[M.me];
  if (mine) p.titles[mine.title] = (p.titles[mine.title] || 0) + 1;
  p.games++;
  p.recorded = [...p.recorded, gameId].slice(-50);
  saveProfile(p);
}
const topOf = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])[0];

/* ---------- end-of-game titles ---------- */
const TITLE_RULES = [
  { label: "Star de la soirée", w: 3, score: s => s.wins >= 2 ? s.wins : 0, why: () => "le plus de verdicts de la partie" },
  { label: "Danger public au lit", w: 2.5, score: s => s.lv[3] + s.lv[4] >= 2 ? s.lv[3] + s.lv[4] : 0, why: s => `${plural(s.lv[3] + s.lv[4], "verdict")} Hot ou Extrême` },
  { label: "Légende locale", w: 2.4, score: s => s.lv.m, why: s => `${plural(s.lv.m, "verdict")} sur les questions maison` },
  { label: "Cœur d'artichaut", w: 2, score: s => s.th.amour >= 2 ? s.th.amour : 0, why: s => `${s.th.amour} verdicts côté cœur` },
  { label: "Bête de soirée", w: 2, score: s => s.th.soiree >= 2 ? s.th.soiree : 0, why: s => `${s.th.soiree} verdicts de soirée` },
  { label: "Pire collègue de l'année", w: 2, score: s => s.th.boulot >= 2 ? s.th.boulot : 0, why: s => `${s.th.boulot} verdicts au boulot` },
  { label: "Touriste en roue libre", w: 2, score: s => s.th.voyage >= 2 ? s.th.voyage : 0, why: s => `${s.th.voyage} verdicts en voyage` },
  { label: "Estomac sur pattes", w: 2, score: s => s.th.bouffe >= 2 ? s.th.bouffe : 0, why: s => `${s.th.bouffe} verdicts à table` },
  { label: "Accro à l'écran", w: 2, score: s => s.th.ecran >= 2 ? s.th.ecran : 0, why: s => `${s.th.ecran} verdicts derrière un écran` },
  { label: "Terreur des repas de famille", w: 2, score: s => s.th.famille >= 2 ? s.th.famille : 0, why: s => `${s.th.famille} verdicts en famille` },
  { label: "Sujet de toutes les conversations", w: 2, score: s => s.th.groupe >= 2 ? s.th.groupe : 0, why: s => `${s.th.groupe} verdicts sur le groupe` },
  { label: "Catastrophe ambulante", w: 1.8, score: s => s.lv[1] >= 2 ? s.lv[1] : 0, why: s => `${s.lv[1]} verdicts du quotidien` },
  { label: "Narcissique en chef", w: 1.6, score: s => s.self >= 2 ? s.self : 0, why: s => `a voté ${s.self} fois pour soi` },
  { label: "Cible préférée du groupe", w: 1, score: s => s.recv >= 3 ? s.recv : 0, why: s => `${plural(s.recv, "vote")} reçus` },
  { label: "Mouton du groupe", w: 4, score: s => s.voted >= 3 && s.withWinner / s.voted >= .7 ? s.withWinner / s.voted : 0, why: s => `a voté comme la majorité ${Math.round(s.withWinner / s.voted * 100)} % du temps` },
  { label: "Électron libre", w: 4, score: s => s.voted >= 3 && s.withWinner / s.voted <= .25 ? 1 - s.withWinner / s.voted : 0, why: () => "ne vote jamais comme les autres" },
  { label: "Fan n°1", w: 1.2, score: s => s.fanN >= 3 ? s.fanN : 0, why: s => `a voté ${s.fanN} fois pour ${s.fanNick}`, name: s => `Fan n°1 de ${s.fanNick}` },
  { label: "Ange, ou génie du mensonge", w: .5, score: s => s.voted && s.recv === 0 ? 1 : 0, why: () => "aucun vote reçu de toute la partie" }
];
function computeTitles(players, rounds) {
  const S = Object.fromEntries(players.map(p => [p.id, { p, wins: 0, recv: 0, self: 0, withWinner: 0, voted: 0, lv: { 1: 0, 2: 0, 3: 0, 4: 0, m: 0 }, th: {}, fan: {} }]));
  for (const { item, vm } of rounds) {
    const { winners } = tally(players, vm);
    const wset = new Set(winners.map(w => w.p.id));
    for (const w of winners) {
      const s = S[w.p.id]; s.wins++;
      s.lv[item.l === "m" ? "m" : clampLevel(item.l)]++;
      for (const t of themesOf(item.t)) s.th[t] = (s.th[t] || 0) + 1;
    }
    for (const [v, t] of Object.entries(vm)) {
      if (!S[v] || !S[t]) continue;
      S[t].recv++; S[v].voted++;
      if (v === t) S[v].self++;
      if (wset.has(t)) S[v].withWinner++;
      if (v !== t) S[v].fan[t] = (S[v].fan[t] || 0) + 1;
    }
  }
  for (const s of Object.values(S)) {
    THEMES.forEach(th => { s.th[th.id] = s.th[th.id] || 0; });
    const f = topOf(s.fan);
    s.fanN = f ? f[1] : 0; s.fanNick = f ? (S[f[0]]?.p.nick || "") : "";
  }
  const cands = [];
  for (const s of Object.values(S)) for (const rule of TITLE_RULES) {
    const sc = rule.score(s);
    if (sc > 0) cands.push({ uid: s.p.id, label: rule.label, title: rule.name ? rule.name(s) : rule.label, why: rule.why(s), score: sc * rule.w });
  }
  cands.sort((a, b) => b.score - a.score);
  const out = {}, used = new Set();
  for (const c of cands) if (!out[c.uid] && !used.has(c.label)) { out[c.uid] = { title: c.title, why: c.why }; used.add(c.label); }
  for (const p of players) if (!out[p.id]) out[p.id] = { title: "Témoin de la soirée", why: "a tout vu, n'a rien dit" };
  return out;
}

/* ---------- shared pieces ---------- */
function av(p, cls = "") {
  const ini = (p.nick || "?").trim().charAt(0) || "?";
  return `<span class="av ${cls}" style="background:${safeColor(p.color)}" aria-hidden="true">${esc(ini)}</span>`;
}
function chip(p, extra = "", cls = "") {
  const room = M.mode === "room" && M.room;
  const mod = room && p.id === M.room.hostUid, away = room && p.id !== M.me && !isOnline(p);
  return `<span class="chip ${cls} ${away ? "dim" : ""}">${av(p)}<span class="nm">${esc(p.nick)}</span>${mod ? `<span class="tag">modo</span>` : ""}${away ? `<span class="tag off">absent</span>` : ""}${extra}</span>`;
}
function header(big, badge = "") {
  return `<header class="top ${big ? "big" : ""}"><h1 class="logo">Qui de nous<span class="num">…</span></h1>${badge ? `<span class="badge">${esc(badge)}</span>` : ""}</header>`;
}
function errBox() {
  return (M.err ? `<div class="err" role="alert">${esc(M.err)}</div>` : "") + (M.flash ? `<div class="note" role="status">${esc(M.flash)}</div>` : "");
}
function heat(l) { return `<span class="heat" aria-hidden="true">${[1, 2, 3, 4].map(i => `<i class="${i <= l ? "f" + l : ""}"></i>`).join("")}</span>`; }
function levelPicker(level, act) {
  return `<div class="levels">${LEVELS.map(L =>
    `<button class="lvl ${L.id === level ? "cur" : L.id < level ? "in" : ""}" data-act="${act}" data-id="${L.id}" aria-pressed="${L.id === level}">
      ${heat(L.id)}<b>${L.name}</b><small>${L.desc}</small></button>`).join("")}</div>
    <p class="hint left">Chaque niveau inclut aussi les questions des niveaux précédents.</p>`;
}
function themePicker(level, themes, act) {
  const counts = themeCounts(level);
  return `<div class="label">Thèmes</div>
    <div class="chips">
      <button class="pill" data-act="${act}" data-id="" aria-pressed="${!themes.length}">Tous</button>
      ${THEMES.map(th => `<button class="pill" data-act="${act}" data-id="${th.id}" aria-pressed="${themes.includes(th.id)}">${th.name} <small>${counts[th.id] || 0}</small></button>`).join("")}
    </div>`;
}
const sliderLabel = (v, size) => v >= size ? `Toutes · ${size}` : plural(v, "question");
function countSlider(count, size, id) {
  if (!size) return `<p class="hint left">Aucune question avec ces thèmes à ce niveau.</p>`;
  const min = Math.min(5, size), v = count && count < size ? Math.max(count, min) : size;
  const pct = size > min ? Math.round((v - min) / (size - min) * 100) : 100;
  return `<div class="slider">
    <div class="sl-top"><span class="label">Nombre de questions</span><output id="${id}-out" class="sl-val">${sliderLabel(v, size)}</output></div>
    <input type="range" id="${id}" data-count="${id}" min="${min}" max="${size}" step="1" value="${v}" style="--p:${pct}%" aria-label="Nombre de questions">
    <div class="sl-scale"><span>${min}</span><span>Toutes</span></div>
  </div>`;
}
function sw(on, act, title, sub) {
  return `<button class="switch" data-act="${act}" aria-pressed="${!!on}"><span class="knob"></span><span><b>${title}</b><br><small>${sub}</small></span></button>`;
}
function maisonSub(n) {
  return n ? (n > 1 ? `Les ${n} questions maison seront toutes posées, en plus du nombre choisi si besoin.` : "La question maison sera posée.")
    : "Ajoutez vos propres questions ci-dessous : elles seront toutes posées.";
}
function settingsPanel(o) {
  const size = poolSize(o.level, o.themes, false, []) + (o.maison ? o.customs.length : 0);
  const a = o.acts;
  return `<section class="panel">
    <div class="label">Niveau</div>
    ${levelPicker(o.level, a.level)}
    ${themePicker(o.level, o.themes, a.theme)}
    ${countSlider(o.count, size, a.count)}
  </section>
  <section class="panel">
    <div class="label">Options</div>
    ${sw(o.maison, a.maison, "Questions maison", maisonSub(o.customs.length))}
    ${a.approve ? sw(o.approve, a.approve, "Valider les questions des joueurs", "Les questions proposées par les autres attendent ton accord avant d'entrer dans le paquet.") : ""}
    ${sw(o.gages, a.gages, "Gages et vérités", "La personne la plus votée choisit entre un gage et une vérité, adaptés au niveau.")}
    ${sw(o.defense, a.defense, "Droit de défense", `La personne la plus votée a ${DEFENSE_S} secondes pour se justifier, chrono sur tous les écrans.`)}
    ${sw(o.apero, a.apero, "Mode apéro", "La personne la plus votée boit une gorgée par vote reçu.")}
    ${a.timer ? `<div class="label">Chrono de vote</div>
      <div class="toggles">${VOTE_TIMERS.map(t => `<button class="tog" data-act="${a.timer}" data-id="${t}" aria-pressed="${(o.voteTimer || 0) === t}">${t ? t + " s" : "Aucun"}</button>`).join("")}</div>
      <p class="hint left">Les résultats s'affichent dès que tout le monde a voté, ou à la fin du chrono.</p>` : ""}
  </section>`;
}
function settingsSummary(r, customsCount) {
  const level = clampLevel(r.level), themes = r.themes || [];
  const n = dealSize(level, themes, r.maison, Array(customsCount).fill(""), r.count ?? 20);
  const tags = [LEVELS[level - 1].name, plural(n, "question"),
    ...(themes.length ? themes.map(id => THEMES.find(t => t.id === id)?.name).filter(Boolean) : []),
    ...(r.maison ? ["+ maison"] : []), ...(r.gages ? ["Gages"] : []), ...(r.defense ? ["Défense"] : []),
    ...(r.voteTimer ? [`Chrono ${r.voteTimer} s`] : []), ...(r.apero ? ["Mode apéro"] : [])];
  return `<div class="summary">${tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>`;
}
function customBlock(list, form, o) {
  return `<section class="panel">
    <div class="label">Questions maison</div>
    <form class="row" data-form="${form}"><input id="${form}" data-draft="${form}" type="text" maxlength="140" autocomplete="off" enterkeyhint="done" placeholder="…a déjà dansé sur une table ?" aria-label="Nouvelle question"><button class="btn" type="submit">Ajouter</button></form>
    ${list.length ? `<ul class="customs">${list.map(q => {
      const waiting = o.pending && o.pending(q);
      return `<li class="${waiting ? "wait-ok" : ""}"><span>…${nice(q.text)}${waiting ? `<small class="tagline">en attente de validation</small>` : ""}</span>
        <span class="acts">${waiting && o.approveAct ? `<button class="link" data-act="${o.approveAct}" data-id="${esc(q.id)}">Valider</button>` : ""}
        ${o.canDel(q) ? `<button class="link" data-act="${o.delAct}" data-id="${esc(q.id)}" aria-label="Supprimer cette question">${waiting && o.approveAct ? "Refuser" : "Retirer"}</button>` : ""}</span></li>`;
    }).join("")}</ul>`
      : `<p class="hint left">Inventez des questions sur vos histoires à vous.</p>`}
  </section>`;
}
function itemLevel(item) {
  if (item.l === "m") return { name: "Maison", l: 0 };
  const l = clampLevel(item.l);
  return { name: LEVELS[l - 1].name, l };
}
function qcard(item, round, total, n) {
  const lv = itemLevel(item);
  return `<article class="qcard" data-key="${esc(round + "|" + item.t)}">
    <div class="meta"><span>Question ${round} sur ${total}</span><span class="lv">${lv.l ? heat(lv.l) : ""}${lv.name}</span></div>
    <div class="who">Qui de nous ${nWord(n)}…</div>
    <p class="q">${nice(item.t)}</p>
  </article>`;
}
function timerBar(left, total, label) {
  if (left == null) return "";
  const pct = total ? Math.max(0, Math.min(100, left / total * 100)) : 0;
  return `<div class="timer ${left <= 5 ? "hurry" : ""}"><div class="tl"><span>${label}</span><b>${left} s</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
}
function voteGrid(players, selected, act) {
  return `<div class="grid">${players.map(p =>
    `<button class="tile ${p.id === selected ? "sel" : ""}" data-act="${act}" data-id="${esc(p.id)}" aria-pressed="${p.id === selected}">${av(p)}<span class="nm">${esc(p.nick)}</span></button>`).join("")}</div>`;
}
function tally(players, vm) {
  const rows = players.map(p => ({ p, n: 0, voters: [] }));
  const by = Object.fromEntries(rows.map(r => [r.p.id, r]));
  const pmap = Object.fromEntries(players.map(p => [p.id, p]));
  for (const [v, t] of Object.entries(vm)) if (by[t] && pmap[v]) { by[t].n++; by[t].voters.push(pmap[v]); }
  rows.sort((a, b) => b.n - a.n);
  const max = rows[0]?.n || 0;
  return { rows, max, winners: max ? rows.filter(r => r.n === max) : [] };
}
function results(players, vm, apero, show, toggleAct) {
  const { rows, max, winners } = tally(players, vm);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const wp = winners.map(w => w.p);
  let verdict;
  if (!winners.length) verdict = `<div class="label">Verdict</div><div class="name">Personne</div><div class="sub">Aucun vote pour cette question.</div>`;
  else verdict = `<div class="label">${winners.length > 1 ? "Égalité !" : "Verdict"}</div>
    <div class="name">${esc(names(wp))}</div>
    <div class="sub">${plural(max, "vote")} sur ${total}</div>
    ${apero ? `<div class="sips">${esc(names(wp))} ${winners.length > 1 ? "boivent" : "boit"} ${plural(max, "gorgée")}</div>` : ""}`;
  return `<section class="panel verdict" aria-live="polite">${verdict}</section>
  <section class="panel">
    <ul class="res">${rows.map(r => `<li class="${r.n === max && max ? "win" : ""}">${av(r.p)}<div class="main">
      <div class="line"><span class="nm">${esc(r.p.nick)}</span><span class="n">${r.n}</span></div>
      <div class="bar"><i style="width:${total ? Math.round(r.n / total * 100) : 0}%"></i></div>
      ${show && r.voters.length ? `<div class="chips">${r.voters.map(v => chip(v)).join("")}</div>` : ""}
    </div></li>`).join("")}</ul>
    ${toggleAct ? `<button class="link" data-act="${toggleAct.act}">${show ? toggleAct.hide : toggleAct.show}</button>` : ""}
  </section>`;
}
/* After the verdict: the defence countdown and the gage / truth choice of each winner. */
function afterVerdict(o) {
  let h = "";
  if (o.defense && o.winners.length && o.defenseLeft != null) {
    h += `<section class="panel center defense">
      <div class="label">Droit de défense</div>
      ${o.defenseLeft > 0
        ? `<div class="count">${o.defenseLeft}</div><p class="lead">${esc(names(o.winners))}, tu as la parole.</p>`
        : `<p class="lead"><b>Le jury a tranché.</b> Plus d'excuses possibles.</p>`}
    </section>`;
  }
  if (o.gages && o.winners.length) {
    h += `<section class="panel"><div class="label">Gage ou vérité</div>${o.winners.map(w => {
      const c = o.choiceOf(w.id);
      if (c) {
        const text = c.kind === "drink" ? `${plural(o.sips, "gorgée")} cul sec, ou presque.` : gageText(c.kind, o.level, o.seed + w.id);
        return `<div class="gage ${c.kind}"><div class="gk">${esc(w.nick)} · ${c.kind === "dare" ? "Gage" : c.kind === "truth" ? "Vérité" : "Boire"}</div><p>${esc(text)}</p></div>`;
      }
      if (o.canChoose(w.id)) {
        return `<div class="gage"><div class="gk">${w.id === o.me ? "À toi de choisir" : `${esc(w.nick)} choisit`}</div>
          <div class="btns">
            <button class="btn primary" data-act="${o.act}" data-id="dare" data-uid="${esc(w.id)}">Gage</button>
            <button class="btn" data-act="${o.act}" data-id="truth" data-uid="${esc(w.id)}">Vérité</button>
            ${o.apero ? `<button class="btn" data-act="${o.act}" data-id="drink" data-uid="${esc(w.id)}">Boire ${o.sips}</button>` : ""}
          </div></div>`;
      }
      return `<div class="gage"><div class="gk">${esc(w.nick)}</div><p class="dots">choisit entre gage et vérité</p></div>`;
    }).join("")}</section>`;
  }
  return h;
}
function palmares(players, rounds, apero, titles) {
  const st = Object.fromEntries(players.map(p => [p.id, { p, wins: 0, sips: 0, qs: [] }]));
  for (const { item, vm } of rounds) {
    const { winners, max } = tally(players, vm);
    winners.forEach(w => { const s = st[w.p.id]; s.wins++; s.sips += max; s.qs.push(item.t); });
  }
  const list = Object.values(st).sort((a, b) => b.wins - a.wins || b.sips - a.sips);
  if (!rounds.length) return `<section class="panel"><p class="lead">Aucune question jouée pour l'instant.</p></section>`;
  return `<section class="panel">
    <div class="label">Palmarès · ${plural(rounds.length, "question")}</div>
    <ol class="rank">${list.map((s, i) => {
      const t = titles[s.p.id];
      return `<li><details>
      <summary><span class="pos">${i + 1}</span>${av(s.p)}<span class="who"><b>${esc(s.p.nick)}</b>
        ${t ? `<span class="title">${esc(t.title)}</span>` : ""}
        <small>${plural(s.wins, "verdict")}${apero ? " · " + plural(s.sips, "gorgée") : ""}${t ? " · " + esc(t.why) : ""}</small></span></summary>
      ${s.qs.length ? `<ul>${s.qs.map(q => `<li>…${nice(q)}</li>`).join("")}</ul>` : `<ul><li>Aucun verdict. Trop sage ?</li></ul>`}
    </details></li>`;
    }).join("")}</ol>
    <button class="btn" data-act="${M.mode === "local" ? "l-share" : "share-img"}">Partager le palmarès en image</button>
  </section>`;
}
function waitMod(text) {
  return `<section class="panel center wait"><div class="label">En attente du modo</div><div class="big dots">${text}</div></section>`;
}
function pauseScreen() {
  return `<section class="panel center pause"><div class="label">Pause</div><div class="big">La partie est en pause</div><p class="hint">Le modo la relance dès que tout le monde est revenu.</p></section>`;
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
  const fan = topOf(p.votedFor), title = topOf(p.titles);
  return `<section class="panel">
    <div class="label">Mon profil</div>
    <div class="swatches" role="group" aria-label="Ma couleur">${COLORS.map(c =>
      `<button class="swatch" data-act="pick-color" data-id="${c}" style="background:${c}" aria-pressed="${p.color === c}" aria-label="Couleur ${c}"></button>`).join("")}</div>
    ${p.games ? `<ul class="stats">
        <li><b>${p.games}</b> ${p.games > 1 ? "parties" : "partie"}</li>
        <li><b>${p.wins}</b> ${p.wins > 1 ? "verdicts" : "verdict"}</li>
        <li><b>${p.received}</b> ${p.received > 1 ? "votes reçus" : "vote reçu"}</li>
      </ul>
      ${fan ? `<p class="hint left">Tu votes le plus souvent pour <b>${esc(fan[0])}</b> (${fan[1]} fois).</p>` : ""}
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
  return header(true) + errBox() + `<section class="panel">
    <div class="label">Ton prénom</div>${nickField}
  </section>
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
      <p class="hint left">Ouvre ce lien sur le grand écran : il montre les questions, les votes et les résultats, sans jouer.</p>
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
function votesMap(r) {
  const ids = new Set(M.players.map(p => p.id));
  const vm = {};
  for (const v of M.votes) if (v.round === r && ids.has(v.voter)) vm[v.voter] = v.target;
  const pv = M.pending;
  if (pv && M.room && pv.g === M.room.gameId && pv.r === r && ids.has(M.me)) vm[M.me] = pv.t;
  return vm;
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
        <button class="btn primary" data-act="takeover">Devenir modo</button>
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
      <p class="lead">${r.phase === "play" ? "Une partie est en cours. Entre ton prénom pour la rejoindre." : "Entre ton prénom pour t'asseoir à la table."}</p>
      <form class="row" data-form="join-room"><input id="nick" data-draft="nick" type="text" maxlength="18" autocomplete="nickname" enterkeyhint="go" placeholder="Ton prénom ou surnom" aria-label="Ton prénom"><button class="btn primary" type="submit">Rejoindre</button></form>
    </section>${playersPanel(players, false)}
    <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
  }
  const top = errBox() + alerts();
  if (r.phase === "play") return header(false, badge) + top + playScreen(r, players, mod);
  if (r.phase === "end") return header(true, badge) + top + endScreen(r, players, mod);
  return header(true, badge) + top + lobbyScreen(r, players, mod);
}
function lobbyScreen(r, players, mod) {
  const level = clampLevel(r.level), themes = r.themes || [], count = r.count ?? 20, maison = !!r.maison;
  const usable = usableCustoms(r).map(c => c.text);
  const n = dealSize(level, themes, maison, usable, count);
  const custom = customBlock(M.customs, "custom", {
    delAct: "del-custom", canDel: q => mod || q.by === M.me,
    pending: q => r.approve && !q.ok && q.by !== r.hostUid,
    approveAct: mod ? "approve-custom" : null
  });
  if (!mod) {
    return `${invitePanel()}${playersPanel(players, false)}
    <section class="panel"><div class="label">Réglages de la partie</div>${settingsSummary(r, usable.length)}</section>
    ${waitMod("Le modo prépare la partie")}
    ${custom}
    <p class="foot"><button class="link" data-act="leave">Quitter la partie</button></p>`;
  }
  const can = players.length >= 2 && n > 0;
  return `${invitePanel()}${playersPanel(players, true)}
  ${settingsPanel({ level, themes, count, maison, approve: r.approve, gages: r.gages, defense: r.defense, apero: r.apero, voteTimer: r.voteTimer, customs: usable,
    acts: { level: "level", theme: "theme", count: "count", maison: "maison", approve: "approve", gages: "gages", defense: "defense", apero: "apero", timer: "timer" } })}
  ${custom}
  <button class="btn primary big" data-act="start" ${can ? "" : "disabled"}>Lancer la partie · ${plural(n, "question")}</button>
  ${players.length < 2 ? `<p class="hint">Il faut au moins deux joueurs.</p>` : ""}
  <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
}
function roundView(r, players) {
  const round = r.round || 1, deck = r.deck || [];
  const vm = votesMap(round);
  // The verdict shows as soon as everyone at the table has voted, even before the moderator's page writes it down.
  const revealed = r.revealed === round || (!r.paused && everyoneVoted(round));
  const { winners, max } = tally(players, vm);
  const defenseLeft = r.defense && r.revealed === round && r.revealedAt
    ? Math.max(0, Math.ceil((tsMs(r.revealedAt) + DEFENSE_S * 1000 - (r.paused ? tsMs(r.pausedAt) : serverNow())) / 1000)) : null;
  return { round, deck, item: deck[round - 1] || { t: "…", l: 1 }, vm, revealed, winners: winners.map(w => w.p), max, defenseLeft };
}
function playScreen(r, players, mod) {
  const v = roundView(r, players);
  const mine = v.vm[M.me];
  const voted = players.filter(p => v.vm[p.id]);
  const waiting = players.filter(p => !v.vm[p.id] && isOnline(p)), absent = players.filter(p => !v.vm[p.id] && !isOnline(p));
  let h = qcard(v.item, v.round, v.deck.length, players.length);
  if (r.paused && !mod) return h + pauseScreen();
  if (!v.revealed) {
    const myPick = players.find(p => p.id === mine);
    h += timerBar(voteTimeLeft(r), r.voteTimer, "Temps pour voter");
    h += `<section class="stack"><div class="label">${mine ? "Ton vote" : "Vote en secret"}</div>${voteGrid(players, mine, "vote")}</section>`;
    if (mod) {
      const all = waiting.length === 0;
      h += `<section class="panel">
        <div class="label">${all ? (absent.length ? "Tous les présents ont voté" : "Tout le monde a voté") : `On attend · ${waiting.length}`}</div>
        ${all ? "" : `<div class="chips">${waiting.map(p => chip(p)).join("")}</div>`}
        ${absent.length ? `<div class="label">Absents · ${absent.length}</div><div class="chips">${absent.map(p => chip(p)).join("")}</div>` : ""}
        ${voted.length ? `<div class="label">Ont voté · ${voted.length}</div><div class="chips">${voted.map(p => chip(p, " ✓", "dim")).join("")}</div>` : ""}
        <p class="hint left">Les résultats s'affichent tout seuls quand tout le monde a voté.</p>
        <div class="btns">
          <button class="btn" data-act="reveal" ${voted.length ? "" : "disabled"}>Révéler maintenant</button>
          <button class="btn" data-act="skip">Passer la question</button>
        </div>
      </section>`;
    } else if (myPick) {
      h += `<section class="panel"><p class="lead">Tu as voté pour <b>${esc(myPick.nick)}</b>. Tu peux changer d'avis jusqu'aux résultats.</p>
          <div class="label">Ont voté · ${voted.length} sur ${players.length}</div><div class="chips">${voted.map(p => chip(p, " ✓", "dim")).join("")}</div></section>`;
    }
  } else {
    // Only the moderator decides whether everyone sees who voted for whom.
    h += results(players, v.vm, r.apero, r.votersShown === v.round,
      mod ? { act: "toggle-voters", show: "Montrer à tout le monde qui a voté pour qui", hide: "Cacher les votes pour tout le monde" } : null);
    h += afterVerdict({
      defense: r.defense, gages: r.gages && r.revealed === v.round, winners: v.winners, defenseLeft: v.defenseLeft,
      level: r.level, seed: r.gameId + "_" + v.round, apero: r.apero, sips: v.max, me: M.me, act: "choose",
      choiceOf: uid => M.choices.find(c => c.round === v.round && c.uid === uid),
      canChoose: uid => uid === M.me
    });
    h += mod
      ? `<button class="btn primary big" data-act="next" data-r="${v.round}">${v.round >= v.deck.length ? "Voir le palmarès" : "Question suivante"}</button>`
      : waitMod(v.round >= v.deck.length ? "Le palmarès arrive" : "Question suivante bientôt");
  }
  if (mod) h += `<p class="foot"><button class="link" data-act="pause">${r.paused ? "Reprendre la partie" : "Mettre en pause"}</button> · <button class="link" data-act="end">Terminer la partie</button></p>`;
  if (mod && r.paused) h = `<div class="note"><b>Partie en pause.</b> Les joueurs voient un écran de pause. <button class="link" data-act="pause">Reprendre</button></div>` + h;
  return h;
}
function playedRounds(r) {
  const deck = r.deck || [], last = Math.min(r.round || 0, deck.length), skipped = new Set(r.skipped || []);
  const rounds = [];
  for (let i = 1; i <= last; i++) {
    if (skipped.has(i) || (i === r.round && r.revealed !== i)) continue;
    const vm = votesMap(i); if (Object.keys(vm).length) rounds.push({ item: deck[i - 1], vm });
  }
  return rounds;
}
function endScreen(r, players, mod) {
  const rounds = playedRounds(r), titles = computeTitles(players, rounds);
  recordGame(r.gameId, players, rounds, titles);
  if (!mod) return palmares(players, rounds, r.apero, titles) + playersPanel(players, false) + waitMod("Le modo peut lancer une nouvelle partie");
  return `${palmares(players, rounds, r.apero, titles)}${playersPanel(players, true)}
  <button class="btn primary big" data-act="newgame">Nouvelle partie</button>
  <p class="hint">Les joueurs restent à table. Tu pourras changer les réglages avant de relancer.</p>`;
}

/* ---------- big screen (TV / laptop): watches the game, never plays ---------- */
function renderTv() {
  const r = M.room, players = M.players;
  let h = `<header class="top big"><h1 class="logo">Qui de nous<span class="num">…</span></h1><span class="badge">Partie ${esc(M.code)}</span></header>` + alerts();
  if (r.phase === "lobby") {
    h += `<section class="panel center tvjoin">
      <div class="label">Pour jouer, scanne ou tape le code</div>
      <div class="tvrow"><div class="qr big" data-qr="${esc(inviteLink())}"></div><div><div class="code">${esc(M.code)}</div><p class="lead">${esc(location.host + location.pathname)}</p></div></div>
    </section>
    <section class="panel"><div class="label">À table · ${players.length}</div><div class="chips">${players.map(p => chip(p)).join("")}</div></section>
    <section class="panel">${settingsSummary(r, usableCustoms(r).length)}</section>`;
  } else if (r.phase === "play") {
    const v = roundView(r, players);
    h += qcard(v.item, v.round, v.deck.length, players.length);
    if (r.paused) return h + pauseScreen();
    if (!v.revealed) {
      const voted = players.filter(p => v.vm[p.id]);
      h += timerBar(voteTimeLeft(r), r.voteTimer, "Temps pour voter");
      h += `<section class="panel"><div class="label">Ont voté · ${voted.length} sur ${players.length}</div>
        <div class="chips">${players.map(p => chip(p, v.vm[p.id] ? " ✓" : "", v.vm[p.id] ? "" : "dim")).join("")}</div></section>`;
    } else {
      h += results(players, v.vm, r.apero, r.votersShown === v.round, null);
      h += afterVerdict({
        defense: r.defense, gages: r.gages && r.revealed === v.round, winners: v.winners, defenseLeft: v.defenseLeft,
        level: r.level, seed: r.gameId + "_" + v.round, apero: r.apero, sips: v.max, act: "",
        choiceOf: uid => M.choices.find(c => c.round === v.round && c.uid === uid), canChoose: () => false
      });
    }
  } else {
    const rounds = playedRounds(r);
    h += palmares(players, rounds, r.apero, computeTitles(players, rounds)).replace(/<button[^>]*share-img[^>]*>.*?<\/button>/, "");
  }
  return h;
}

/* ---------- screens: one phone passed around ---------- */
function newLocal(prev) {
  const saved = store.json("local-names", []);
  return {
    phase: "setup", players: prev?.players || (Array.isArray(saved) ? saved : []),
    level: clampLevel(prev?.level || 1), themes: prev?.themes || [], count: prev?.count ?? 20, maison: prev ? !!prev.maison : true,
    apero: !!prev?.apero, gages: !!prev?.gages, defense: !!prev?.defense, customs: prev?.customs || [],
    gid: rid(), deck: [], round: 0, vm: {}, turn: 0, handoff: true, history: [], showVoters: false, choices: {}, revealedAt: 0
  };
}
function saveLocal() {
  store.set("local", JSON.stringify(M.local));
  if (M.local) store.set("local-names", JSON.stringify(M.local.players));
}
function renderLocal() {
  const L = M.local, n = L.players.length;
  L.themes = L.themes || [];
  const back = `<button class="link" data-act="go-online">Jouer chacun sur son téléphone</button>`;
  if (L.phase === "setup") {
    const customs = L.customs.map(c => c.text), q = dealSize(L.level, L.themes, L.maison, customs, L.count);
    return header(true, "1 téléphone") + errBox() + `<section class="panel">
      <p class="lead">Un seul téléphone qui passe de main en main. Chacun vote en secret à son tour.</p>
      <form class="row" data-form="l-name"><input id="l-name" data-draft="l-name" type="text" maxlength="18" autocomplete="off" enterkeyhint="done" placeholder="Prénom d'un joueur" aria-label="Prénom d'un joueur"><button class="btn" type="submit">Ajouter</button></form>
      ${n ? `<div class="chips">${L.players.map(p => chip(p, `<button class="x" data-act="l-del" data-id="${esc(p.id)}" aria-label="Retirer ${esc(p.nick)}">×</button>`)).join("")}</div>` : ""}
    </section>
    ${settingsPanel({ level: L.level, themes: L.themes, count: L.count, maison: L.maison, gages: L.gages, defense: L.defense, apero: L.apero, customs,
      acts: { level: "l-level", theme: "l-theme", count: "l-count", maison: "l-maison", gages: "l-gages", defense: "l-defense", apero: "l-apero" } })}
    ${customBlock(L.customs, "l-custom", { delAct: "l-del-custom", canDel: () => true })}
    <button class="btn primary big" data-act="l-start" ${n >= 2 && q ? "" : "disabled"}>Lancer la partie · ${plural(q, "question")}</button>
    ${n < 2 ? `<p class="hint">Ajoute au moins deux joueurs.</p>` : ""}
    <p class="foot">${back}</p>`;
  }
  if (L.phase === "end") {
    return header(true, "1 téléphone") + palmares(L.players, L.history, L.apero, computeTitles(L.players, L.history)) +
      `<button class="btn primary big" data-act="l-reset">Nouvelle partie</button><p class="foot">${back}</p>`;
  }
  const item = L.deck[L.round - 1];
  let h = header(false, "1 téléphone") + qcard(item, L.round, L.deck.length, n);
  if (L.turn < n) {
    const p = L.players[L.turn];
    h += L.handoff
      ? `<section class="panel center hand">
          <div class="label">Vote ${L.turn + 1} sur ${n} · passe le téléphone à</div>
          ${av(p)}<div class="who">${esc(p.nick)}</div>
          <button class="btn primary big" data-act="l-me">C'est moi, je vote</button>
          <p class="hint">Les autres, regardez ailleurs.</p>
        </section>`
      : `<section class="stack"><div class="label">${esc(p.nick)}, vote en secret</div>${voteGrid(L.players, null, "l-vote")}</section>`;
  } else {
    const { winners, max } = tally(L.players, L.vm);
    h += results(L.players, L.vm, L.apero, L.showVoters, { act: "l-toggle-voters", show: "Montrer qui a voté pour qui", hide: "Cacher qui a voté quoi" });
    h += afterVerdict({
      defense: L.defense, gages: L.gages, winners: winners.map(w => w.p), level: L.level, seed: L.gid + "_" + L.round, apero: L.apero, sips: max,
      defenseLeft: L.revealedAt ? Math.max(0, Math.ceil((L.revealedAt + DEFENSE_S * 1000 - Date.now()) / 1000)) : null,
      act: "l-choose", choiceOf: uid => L.choices[uid] ? { kind: L.choices[uid] } : null, canChoose: () => true
    });
    h += `<button class="btn primary big" data-act="l-next">${L.round >= L.deck.length ? "Voir le palmarès" : "Question suivante"}</button>`;
  }
  h += `<p class="foot"><button class="link" data-act="l-end">Terminer la partie</button> · ${back}</p>`;
  return h;
}

/* ---------- share the leaderboard as an image ---------- */
async function shareImage(players, rounds, apero) {
  const titles = computeTitles(players, rounds);
  const st = players.map(p => ({ p, wins: 0, sips: 0 }));
  for (const { vm } of rounds) { const { winners, max } = tally(players, vm); winners.forEach(w => { const s = st.find(x => x.p.id === w.p.id); s.wins++; s.sips += max; }); }
  st.sort((a, b) => b.wins - a.wins || b.sips - a.sips);
  try { await Promise.all([document.fonts.load("60px 'Dela Gothic One'"), document.fonts.load("800 30px Onest"), document.fonts.load("500 26px Onest")]); } catch {}
  const shown = st.slice(0, 8), W = 1080, H = 420 + shown.length * 150;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#F2C230"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#1A1813"; g.font = "88px 'Dela Gothic One', 'Arial Black', sans-serif"; g.fillText("Qui de nous", 70, 150);
  g.fillStyle = "#D93A26"; g.fillText("…", 70 + g.measureText("Qui de nous").width + 6, 150);
  g.fillStyle = "#5E4E14"; g.font = "800 30px Onest, Arial, sans-serif";
  g.fillText(`PALMARÈS · ${plural(rounds.length, "QUESTION")} · ${new Date().toLocaleDateString("fr-FR")}`, 72, 215);
  shown.forEach((s, i) => {
    const y = 270 + i * 150, t = titles[s.p.id];
    g.fillStyle = i === 0 ? "#D93A26" : "#FFFBEF"; g.strokeStyle = "#1A1813"; g.lineWidth = 5;
    g.beginPath(); g.roundRect ? g.roundRect(60, y, W - 120, 128, 26) : g.rect(60, y, W - 120, 128); g.fill(); g.stroke();
    const ink = i === 0 ? "#FFFBEF" : "#1A1813";
    g.fillStyle = ink; g.font = "52px 'Dela Gothic One', 'Arial Black', sans-serif"; g.fillText(String(i + 1), 95, y + 84);
    g.fillStyle = safeColor(s.p.color); g.beginPath(); g.arc(215, y + 64, 40, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = "38px 'Dela Gothic One', 'Arial Black', sans-serif"; g.textAlign = "center";
    g.fillText((s.p.nick || "?").charAt(0).toUpperCase(), 215, y + 78); g.textAlign = "left";
    g.fillStyle = ink; g.font = "800 40px Onest, Arial, sans-serif"; g.fillText(s.p.nick, 285, y + 58);
    g.font = "500 28px Onest, Arial, sans-serif";
    g.fillText(`${t ? t.title + " · " : ""}${plural(s.wins, "verdict")}${apero ? " · " + plural(s.sips, "gorgée") : ""}`.slice(0, 60), 285, y + 100);
  });
  g.fillStyle = "#5E4E14"; g.font = "500 26px Onest, Arial, sans-serif"; g.fillText(location.host, 72, H - 50);
  const blob = await new Promise(res => c.toBlob(res, "image/png"));
  const file = new File([blob], "qui-de-nous-palmares.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Qui de nous… le palmarès" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
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
let lastHtml = "", lastCardKey = "", dragging = false;
document.addEventListener("pointerdown", e => { if (e.target.dataset && e.target.dataset.count) dragging = true; });
["pointerup", "pointercancel"].forEach(t => document.addEventListener(t, () => { if (dragging) { dragging = false; setTimeout(render, 0); } }));
function render() {
  if (dragging) return;
  document.body.classList.toggle("tv", M.mode === "room" && M.tv);
  let html;
  if (M.mode === "local" && M.local) html = renderLocal();
  else if (M.mode === "room") html = renderRoom();
  else if (M.mode === "home") html = renderHome();
  else if (M.mode === "setup") html = renderSetup();
  else if (M.mode === "fatal") html = renderFatal();
  else html = header(true) + `<section class="panel center loading">Ouverture de la boîte…</section>`;
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
const toggleIn = (list, id) => id ? (list.includes(id) ? list.filter(x => x !== id) : [...list, id]) : [];
const copy = (text, msg) => navigator.clipboard?.writeText(text).then(() => flash(msg), () => flash(text)) ?? flash(text);
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
  "share": () => { navigator.share({ title: "Qui de nous…", text: `Rejoins la partie ${M.code} !`, url: inviteLink() }).catch(() => {}); },
  "copy": () => copy(inviteLink(), "Lien d'invitation copié."),
  "copy-tv": () => copy(tvLink(), "Lien grand écran copié."),
  "toggle-qr": () => { M.showQR = !M.showQR; render(); },
  "vote": d => {
    const r = M.room; if (!r || r.revealed === r.round || r.phase !== "play" || r.paused) return;
    const g = r.gameId, round = r.round;
    M.pending = { g, r: round, t: d.id }; render();
    write(() => F.setDoc(rVote(M.code, `${g}_${round}_${M.me}`), { gameId: g, round, voter: M.me, target: d.id, at: Date.now() }),
      "Trop tard, les résultats sont déjà tombés.");
  },
  "choose": d => {
    const r = M.room; if (!r || d.uid !== M.me) return;
    write(() => F.setDoc(rChoice(M.code, `${r.gameId}_${r.round}_${M.me}`), { gameId: r.gameId, round: r.round, uid: M.me, kind: d.id }),
      "Ce choix n'est plus possible pour cette question.");
  },
  "reveal": modOnly(() => write(() => reveal())),
  "skip": modOnly(() => {
    const r = M.room, item = (r.deck || [])[r.round - 1];
    if (item && item.l !== "m") markSeen([qkey(item.t)]);
    M.pending = null;
    write(() => patchRoom({ skipped: F.arrayUnion(r.round), ...(r.round >= (r.deck || []).length
      ? { phase: "end" } : { round: r.round + 1, revealed: 0, votersShown: 0, roundAt: F.serverTimestamp(), revealedAt: null }) }));
  }),
  "next": modOnly(d => {
    const r = M.room, round = +d.r; if (!r || r.round !== round) return;
    M.showVoters = false; M.pending = null;
    write(() => patchRoom(round >= (r.deck || []).length ? { phase: "end" }
      : { round: round + 1, revealed: 0, votersShown: 0, roundAt: F.serverTimestamp(), revealedAt: null }));
  }),
  "pause": modOnly(() => {
    const r = M.room;
    if (!r.paused) { write(() => patchRoom({ paused: true, pausedAt: F.serverTimestamp() })); return; }
    // Resuming moves the timers forward by the length of the pause.
    const gap = Math.max(0, serverNow() - tsMs(r.pausedAt));
    const shift = ts => ts ? F.Timestamp.fromMillis(tsMs(ts) + gap) : null;
    write(() => patchRoom({ paused: false, pausedAt: null, ...(r.roundAt ? { roundAt: shift(r.roundAt) } : {}), ...(r.revealedAt ? { revealedAt: shift(r.revealedAt) } : {}) }));
  }),
  "toggle-voters": modOnly(() => {
    const r = M.room;
    write(() => patchRoom({ votersShown: r.votersShown === r.round ? 0 : r.round }));
  }),
  "end": modOnly(() => write(() => patchRoom({ phase: "end", paused: false }))),
  "newgame": modOnly(() => {
    const old = M.room?.gameId, code = M.code;
    M.pending = null;
    write(async () => {
      await patchRoom(freshGame());
      if (!old) return;
      try {
        for (const col of [cVotes(code), cChoices(code)]) {
          const q = await F.getDocs(F.query(col, F.where("gameId", "==", old)));
          for (const d of q.docs) await F.deleteDoc(d.ref);
        }
      } catch {}
    });
  }),
  "level": modOnly(d => write(() => patchRoom({ level: clampLevel(d.id) }))),
  "theme": modOnly(d => write(() => patchRoom({ themes: toggleIn(M.room?.themes || [], d.id) }))),
  "maison": modOnly(() => write(() => patchRoom({ maison: !M.room?.maison }))),
  "approve": modOnly(() => write(() => patchRoom({ approve: !M.room?.approve }))),
  "gages": modOnly(() => write(() => patchRoom({ gages: !M.room?.gages }))),
  "defense": modOnly(() => write(() => patchRoom({ defense: !M.room?.defense }))),
  "apero": modOnly(() => write(() => patchRoom({ apero: !M.room?.apero }))),
  "timer": modOnly(d => write(() => patchRoom({ voteTimer: VOTE_TIMERS.includes(+d.id) ? +d.id : 0 }))),
  "start": modOnly(() => {
    const r = M.room || {};
    const seen = new Set([...seenLocal(), ...(r.played || [])]);
    const deck = buildDeck(clampLevel(r.level), r.themes || [], !!r.maison, usableCustoms(r).map(c => c.text), r.count ?? 20, seen);
    if (!deck.length || M.players.length < 2) return;
    M.showVoters = false; M.pending = null;
    write(() => patchRoom({ phase: "play", round: 1, deck, revealed: 0, votersShown: 0, skipped: [], paused: false, roundAt: F.serverTimestamp(), revealedAt: null }));
  }),
  "kick": modOnly(d => write(() => F.deleteDoc(rPlayer(M.code, d.id)))),
  "del-custom": d => write(() => F.deleteDoc(rCustom(M.code, d.id))),
  "approve-custom": modOnly(d => write(() => F.updateDoc(rCustom(M.code, d.id), { ok: true }))),
  "takeover": () => write(() => F.updateDoc(rRoom(M.code), { hostUid: M.me }),
    "Le modo est revenu entre-temps, ou quelqu'un a déjà repris la partie."),
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
  "share-img": () => { const r = M.room; if (r) shareImage(M.players, playedRounds(r), r.apero).catch(() => flash("Impossible de créer l'image.")); },
  "go-local": () => { M.mode = "local"; if (!M.local || M.local.phase === "end") M.local = newLocal(M.local); M.err = ""; saveLocal(); render(); },
  "go-online": () => { M.err = ""; if (M.code) M.mode = "room"; else M.mode = F && M.me ? "home" : (isPlaceholder() ? "setup" : "fatal"); render(); },
  "reload": () => location.reload(),

  /* one phone */
  "l-del": d => { M.local.players = M.local.players.filter(p => p.id !== d.id); saveLocal(); render(); },
  "l-level": d => { M.local.level = clampLevel(d.id); saveLocal(); render(); },
  "l-theme": d => { M.local.themes = toggleIn(M.local.themes || [], d.id); saveLocal(); render(); },
  "l-maison": () => { M.local.maison = !M.local.maison; saveLocal(); render(); },
  "l-gages": () => { M.local.gages = !M.local.gages; saveLocal(); render(); },
  "l-defense": () => { M.local.defense = !M.local.defense; saveLocal(); render(); },
  "l-apero": () => { M.local.apero = !M.local.apero; saveLocal(); render(); },
  "l-del-custom": d => { M.local.customs = M.local.customs.filter(q => q.id !== d.id); saveLocal(); render(); },
  "l-start": () => {
    const L = M.local, deck = buildDeck(L.level, L.themes || [], L.maison, L.customs.map(c => c.text), L.count, seenLocal());
    if (L.players.length < 2 || !deck.length) return;
    Object.assign(L, { phase: "play", gid: rid(), deck, round: 1, vm: {}, turn: 0, handoff: true, history: [], showVoters: false, choices: {}, revealedAt: 0 });
    saveLocal(); render();
  },
  "l-me": () => { M.local.handoff = false; saveLocal(); render(); },
  "l-vote": d => {
    const L = M.local, p = L.players[L.turn]; if (!p) return;
    L.vm[p.id] = d.id; L.turn++; L.handoff = true;
    if (L.turn >= L.players.length) L.revealedAt = Date.now();
    saveLocal(); render();
  },
  "l-choose": d => { M.local.choices[d.uid] = d.id; saveLocal(); render(); },
  "l-toggle-voters": () => { M.local.showVoters = !M.local.showVoters; render(); },
  "l-next": () => {
    const L = M.local, item = L.deck[L.round - 1];
    L.history.push({ item, vm: L.vm });
    if (item && item.l !== "m") markSeen([qkey(item.t)]);
    if (L.round >= L.deck.length) L.phase = "end";
    else Object.assign(L, { round: L.round + 1, vm: {}, turn: 0, handoff: true, showVoters: false, choices: {}, revealedAt: 0 });
    saveLocal(); render();
  },
  "l-end": () => {
    const L = M.local;
    if (L.phase === "play" && L.turn >= L.players.length && Object.keys(L.vm).length) L.history.push({ item: L.deck[L.round - 1], vm: L.vm });
    L.phase = "end"; saveLocal(); render();
  },
  "l-share": () => { const L = M.local; shareImage(L.players, L.history, L.apero).catch(() => flash("Impossible de créer l'image.")); },
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
    const text = normQuestion(M.drafts.custom);
    if (!text) return;
    M.drafts.custom = "";
    write(async () => {
      await F.addDoc(cCustom(M.code), { text, by: M.me, at: Date.now(), ok: isMod() });
      if (isMod() && !M.room?.maison) await patchRoom({ maison: true });
    });
  },
  "l-name": () => {
    const nick = (M.drafts["l-name"] || "").trim().slice(0, 18);
    if (!nick) return;
    const L = M.local, used = new Set(L.players.map(p => p.color));
    L.players.push({ id: rid(), nick, color: COLORS.find(c => !used.has(c)) || COLORS[L.players.length % COLORS.length] });
    M.drafts["l-name"] = ""; saveLocal(); render();
  },
  "l-custom": () => {
    const text = normQuestion(M.drafts["l-custom"]);
    if (!text) return;
    const L = M.local;
    L.customs.push({ id: rid(), text });
    L.maison = true;
    M.drafts["l-custom"] = ""; saveLocal(); render();
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
  if (ds.count) {
    const r = e.target, min = +r.min, max = +r.max, v = +r.value;
    r.style.setProperty("--p", (max > min ? Math.round((v - min) / (max - min) * 100) : 100) + "%");
    const out = document.getElementById(r.id + "-out");
    if (out) out.textContent = sliderLabel(v, max);
  }
});
// The count is saved when the finger lifts, not on every step of the drag.
document.addEventListener("change", e => {
  const ds = e.target.dataset || {};
  if (!ds.count) return;
  const r = e.target, v = +r.value, count = v >= +r.max ? 0 : v;
  if (ds.count === "l-count") { M.local.count = count; saveLocal(); render(); }
  else if (isMod()) { M.room = { ...M.room, count }; write(() => patchRoom({ count })); }
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
  try {
    // Keep the account a player signed into on the home page; otherwise play anonymously.
    await AUTH.authStateReady();
    const u = AUTH.currentUser || (await F.signInAnonymously(AUTH)).user;
    M.me = u.uid;
    if (!u.isAnonymous && !M.drafts.nick) M.drafts.nick = String((await u.getIdTokenResult().catch(() => null))?.claims.pseudo || "").slice(0, 18);
  }
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
