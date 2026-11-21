import { firebaseConfig } from "./config.js";
import { ROLES, EXTRA, SPECIALS, BASE, EXPANSIONS, ROLE_ORDER, CAMPS, WOLF_ROLES } from "./roles.js";
import { GAGES } from "./gages.js";

const FB = window.LG_FB || "https://www.gstatic.com/firebasejs/10.12.2/";
const QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
// Gage themes: four levels from the list, and "Ce groupe", the gages the players wrote and the moderator accepted.
const GAGE_THEMES = [{ id: 1, name: "Soft" }, { id: 2, name: "Épicé" }, { id: 3, name: "Hot" }, { id: 4, name: "Extrême" }, { id: 5, name: "Ce groupe" }];
const GROUP_THEME = 5;
const ROOM_MAX_IDLE_MS = 24 * 3600 * 1000;
const COLORS = ["#D9473B","#3A6FD8","#2E9A62","#8A55D6","#C77A12","#C63C88","#159AAE","#7A7A1E","#A4502E","#56627E","#B3262C","#3F8F3A"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const K = "lg";
const MIN_PLAYERS = 4;
const CARD_SHOW_MS = 8000;
const POINTS = { village: 1, wolves: 2, love: 3, angel: 3, white: 4 };
// The suggested line-up uses the base box only, never the Thief (he changes the deck) nor the expansions.
const AUTO_SPECIALS = ["seer", "witch", "hunter", "cupid", "girl"];
// The official rules are written for 8 to 18 players.
const OFFICIAL_MIN = 8;
const TIMERS = [0, 120, 180, 300];

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rid = () => Math.random().toString(36).slice(2, 10);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const safeColor = c => COLORS.includes(c) ? c : COLORS[9];
const plural = (n, w, ws) => `${n} ${n > 1 ? (ws || w + "s") : w}`;
const genCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const normCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
/* Links look like #ABCD (join) or #ABCD-tv (big screen). */
const hashCode = () => { const c = normCode(location.hash.slice(1).split("-")[0]); return c.length === 4 ? c : ""; };
const hashIsTv = () => /-tv$/i.test(location.hash);
const store = {
  get(k) { try { return localStorage.getItem(K + "-" + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(K + "-" + k) : localStorage.setItem(K + "-" + k, v); } catch {} },
  json(k, d) { try { return JSON.parse(this.get(k) || "null") ?? d; } catch { return d; } }
};
const hashInt = s => { let h = 5381; for (const c of String(s)) h = (h * 33 + c.codePointAt(0)) >>> 0; return h; };
const tsMs = ts => ts && typeof ts.toMillis === "function" ? ts.toMillis() : typeof ts === "number" ? ts : 0;
const topOf = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])[0];
const joinNames = ns => ns.length <= 1 ? ns.join("") : ns.slice(0, -1).join(", ") + " et " + ns[ns.length - 1];
const names = list => joinNames(list.map(p => p.nick));
const cleanText = (s, max) => String(s || "").trim().replace(/\s+/g, " ").slice(0, max);
const roleName = id => (ROLES[id] || EXTRA[id] || {}).name || "?";
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/* ---------- rules of the game ---------- */
// The wolves must start as a minority.
const maxWolves = n => Math.max(1, Math.floor((n - 1) / 2));
// Official line-up: 2 wolves from 8 to 11 players, 3 from 12 to 18 (below 8, the app's own scale).
// The suggested specials are the base box's, added one by one as the table grows.
function autoPick(n) {
  const wolves = n < 7 ? 1 : n < 12 ? 2 : 3;
  const k = n < 6 ? 1 : n < 8 ? 2 : n < 10 ? 3 : n < 12 ? 4 : 5;
  return { wolves: Math.min(wolves, maxWolves(n)), specials: AUTO_SPECIALS.slice(0, Math.min(k, n - wolves)) };
}
// With the Thief, two more Simple Villagers go in the deck: the two cards left over stay in the middle.
function compOf(s, n) {
  const N = Math.max(n, MIN_PLAYERS);
  let wolves, specials;
  if (!s || s.auto !== false) ({ wolves, specials } = autoPick(N));
  else {
    wolves = Math.min(Math.max(1, Math.round(+s.wolves || 1)), maxWolves(N));
    specials = SPECIALS.filter(x => (s.specials || []).includes(x));
  }
  const extra = specials.includes("thief") ? 2 : 0, villagers = N + extra - wolves - specials.length;
  // The White Wolf and the Infect Father are wolves too: the pack must stay a minority.
  // Cupid can pair a wolf with a villager, who then plays against the village too: count him in, or a small table is lost from the start.
  const pack = wolves + specials.filter(x => WOLF_ROLES.includes(x)).length, max = maxWolves(specials.includes("cupid") ? N - 2 : N);
  return { wolves, specials, villagers, extra, pack, max, n: N, tooManyWolves: pack > max, ok: n >= MIN_PLAYERS && villagers >= extra && pack <= max };
}
// The Thief is always dealt to a player, and at least one wolf always is.
function dealCards(ids, c) {
  const cards = [...Array(c.wolves).fill("wolf"), ...c.specials.filter(x => x !== "thief"), ...Array(c.villagers).fill("villager")];
  let extra = [], hand = cards;
  for (let i = 0; i < 200; i++) {
    const sh = shuffle(cards);
    extra = sh.slice(0, c.extra); hand = sh.slice(c.extra);
    if (hand.includes("wolf") || hand.includes("infect")) break;
  }
  if (c.extra) hand = shuffle(hand.concat("thief"));
  const roles = {};
  ids.forEach((id, i) => { roles[id] = hand[i]; });
  return { roles, extra };
}
const compCounts = c => { const o = { wolf: c.wolves }; c.specials.forEach(x => { o[x] = 1; }); if (c.villagers > 0) o.villager = c.villagers; return o; };
const aliveIds = r => (r.order || []).filter(id => !(r.outIds || []).includes(id));
// Who wakes with the pack: the wolf cards, plus the players infected or turned (the Wild Child) during the game.
// d is the deal, or the end result: both carry roles and infected.
const inPack = (d, id) => WOLF_ROLES.includes(d?.roles?.[id]) || (d?.infected || []).includes(id);
const mixedLovers = (d, L) => (L || []).length === 2 && inPack(d, L[0]) !== inPack(d, L[1]);
// Unless the villager can still turn it round: the Captain's double vote when the day comes first.
// (The Witch can't: one potion a night, she either saves herself or poisons the wolf and dies with him.)
const lastStand = (v, d, r) => r?.after === "day" && r.mayor === v;
function verdict(order, outIds, d, r) {
  const al = order.filter(id => !outIds.includes(id)), lovers = d.lovers || [];
  if (!al.length) return "none";
  if (al.length === 1 && d.roles[al[0]] === "whitewolf") return "white";
  if (mixedLovers(d, lovers) && al.length === 2 && lovers.every(id => al.includes(id))) return "love";
  // Official rule: the village wins with the last wolf gone, the wolves with the last villager gone.
  // A White Wolf still alive among the pack keeps the game going: he plays alone.
  const w = al.filter(id => inPack(d, id)).length;
  if (!w) return "village";
  // One wolf face to face with one villager: the wolf has won, he eats him the next night.
  if (al.length === 2 && w === 1 && !lastStand(al.find(id => !inPack(d, id)), d, r)) return al.some(id => d.roles[id] === "whitewolf") ? "white" : "wolves";
  if (w === al.length) return al.some(id => d.roles[id] === "whitewolf") ? "" : "wolves";
  return "";
}
function isWinner(id, res) {
  const L = res.lovers || [], role = res.roles?.[id];
  if (res.winner === "love") return L.includes(id);
  if (res.winner === "angel") return role === "angel";
  if (res.winner === "white") return role === "whitewolf";
  if (mixedLovers(res, L) && L.includes(id)) return false;
  return res.winner === "village" ? !inPack(res, id) : res.winner === "wolves" ? inPack(res, id) && role !== "whitewolf" : false;
}
function addScores(scores, res) {
  const s = { ...(scores || {}) };
  for (const id of Object.keys(res.roles || {})) if (isWinner(id, res)) s[id] = (s[id] || 0) + (POINTS[res.winner] || 0);
  return s;
}
// Deaths pull their lover along; a dead Hunter must shoot and a dead Mayor must name an heir.
function killChain(r, d, deaths, when) {
  const outIds = [...(r.outIds || [])], out = [...(r.out || [])], pending = [...(r.pending || [])], dead = [], q = deaths.slice();
  while (q.length) {
    const x = q.shift();
    if (outIds.includes(x.uid) || !r.order.includes(x.uid)) continue;
    const role = d.roles[x.uid] || "villager", e = { uid: x.uid, role, cause: x.cause, when };
    outIds.push(x.uid); out.push(e); dead.push(e);
    const L = d.lovers || [];
    if (L.includes(x.uid)) { const p = L[0] === x.uid ? L[1] : L[0]; if (!outIds.includes(p)) q.push({ uid: p, cause: "love" }); }
    if (role === "hunter") pending.push({ kind: "hunter", uid: x.uid });
    if (r.mayor === x.uid) pending.push({ kind: "heir", uid: x.uid });
  }
  return { outIds, out, pending, dead: dead.map(e => e.uid) };
}
function tally(candidates, vm, weight) {
  const by = Object.fromEntries(candidates.map(id => [id, []]));
  for (const [v, t] of Object.entries(vm)) if (by[t]) by[t].push(v);
  const rows = candidates.map(id => ({ id, voters: by[id], n: by[id].reduce((s, v) => s + weight(v), 0) })).sort((a, b) => b.n - a.n);
  const max = rows[0]?.n || 0;
  return { rows, max, top: max ? rows.filter(r => r.n === max).map(r => r.id) : [] };
}

/* ---------- gages and truths ---------- */
// The pool of the chosen themes; "Ce groupe" adds the house gages the moderator accepted.
function gagePool(kind, themes, customs = []) {
  const pool = [];
  for (const t of themes || []) if (GAGES[kind][t]) pool.push(...GAGES[kind][t]);
  if ((themes || []).includes(GROUP_THEME)) pool.push(...customs.filter(c => c.kind === kind).map(c => c.text));
  return pool.length ? pool : GAGES[kind][1];
}
// The same gage or truth on every phone, without anyone having to write it down.
const gageText = (kind, themes, seed, customs) => { const pool = gagePool(kind, themes, customs); return pool[hashInt(seed + kind) % pool.length]; };

/* ---------- end-of-game titles ---------- */
const TITLE_RULES = [
  { label: "Loup solitaire", w: 10, score: (s, g) => s.role === "whitewolf" && g.winner === "white" ? 1 : 0, why: () => "le dernier survivant, seul contre tous" },
  { label: "Ange triomphant", w: 9, score: (s, g) => s.role === "angel" && g.winner === "angel" ? 1 : 0, why: () => "s'est fait éliminer au bon moment" },
  { label: "Loup parfait", w: 8, score: s => s.wolf && !s.out && !s.recv ? 1 : 0, why: () => "loup, pas un seul vote contre lui" },
  { label: "Grand méchant loup", w: 6, score: (s, g) => s.wolf && !s.out && g.winner === "wolves" ? 1 : 0, why: () => "loup jusqu'au bout, et vainqueur" },
  { label: "Fine gâchette", w: 6, score: s => s.role === "hunter" && s.shotWolf ? 1 : 0, why: () => "sa dernière flèche a eu un loup" },
  { label: "Roméo", w: 5, score: s => s.cause === "love" ? 1 : 0, why: () => "mort de chagrin d'amour" },
  { label: "Démasqué d'entrée", w: 4.5, score: s => s.wolf && s.cause === "vote" && s.when === "J1" ? 1 : 0, why: () => "loup éliminé dès le premier vote" },
  { label: "Premier repas", w: 4, score: s => s.cause === "night" && s.when === "N1" ? 1 : 0, why: () => "dévoré dès la première nuit" },
  { label: "Martyr", w: 4, score: s => !s.wolf && s.cause === "vote" ? 1 : 0, why: () => "éliminé par le village… en étant innocent" },
  { label: "Traître à la meute", w: 3.5, score: s => s.wolf ? s.friendly : 0, why: () => "a voté contre un autre loup" },
  { label: "Flair de Voyante", w: 3, score: s => !s.wolf && s.cast >= 2 && s.hitWolf / s.cast >= .6 ? s.hitWolf : 0, why: s => `${s.hitWolf} votes sur ${s.cast} contre un loup` },
  { label: "Parano", w: 2.5, score: s => !s.wolf && s.cast >= 2 && !s.hitWolf ? s.cast : 0, why: () => "n'a voté que contre des innocents" },
  { label: "Mouton", w: 2, score: s => s.cast >= 3 && s.withMaj / s.cast >= .75 ? s.withMaj / s.cast : 0, why: s => `a voté comme la majorité ${Math.round(s.withMaj / s.cast * 100)} % du temps` },
  { label: "Électron libre", w: 2, score: s => s.cast >= 3 && s.withMaj / s.cast <= .25 ? 1 - s.withMaj / s.cast : 0, why: () => "ne vote jamais comme les autres" },
  { label: "Bouc émissaire", w: 1.2, score: s => s.recv >= 3 ? s.recv : 0, why: s => `${s.recv} votes reçus` },
  { label: "Obsession", w: 1, score: s => s.fanN >= 2 ? s.fanN : 0, why: s => `a voté ${s.fanN} fois contre ${s.fanNick}`, name: s => `Obsédé par ${s.fanNick}` },
  { label: "Survivant", w: .9, score: s => !s.wolf && !s.out ? 1 : 0, why: () => "toujours debout à la fin" },
  { label: "Insoupçonnable", w: .7, score: s => s.cast && !s.recv ? 1 : 0, why: () => "aucun vote contre lui de toute la partie" }
];
/* g: { ids, roles, infected, out, winner, votes (village votes only), nick } */
function computeTitles(g) {
  const outBy = Object.fromEntries((g.out || []).map(o => [o.uid, o]));
  const S = Object.fromEntries(g.ids.map(id => [id, { id, role: g.roles?.[id], wolf: inPack(g, id), out: !!outBy[id], cause: outBy[id]?.cause || "", when: outBy[id]?.when || "", cast: 0, recv: 0, hitWolf: 0, withMaj: 0, friendly: 0, fan: {}, shotWolf: false }]));
  const shot = (g.out || []).find(o => o.cause === "shot");
  if (shot && inPack(g, shot.uid)) for (const s of Object.values(S)) if (s.role === "hunter") s.shotWolf = true;
  const byKey = {};
  for (const v of g.votes || []) (byKey[v.key] ||= []).push(v);
  for (const list of Object.values(byKey)) {
    const counts = {};
    list.forEach(v => { counts[v.target] = (counts[v.target] || 0) + 1; });
    const max = Math.max(...Object.values(counts));
    for (const v of list) {
      const s = S[v.voter], t = S[v.target];
      if (!s || !t) continue;
      s.cast++; t.recv++;
      if (t.wolf) s.hitWolf++;
      if (counts[v.target] === max) s.withMaj++;
      if (s.wolf && t.wolf) s.friendly++;
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
  votes: [], acts: [], wolfVotes: [], myAct: null, localAct: null, secret: null, deal: null, customs: [], choices: [], wills: {},
  pending: null, sel: "", multi: [], wdraft: { save: false, poison: "" }, selKey: "",
  cardShown: false, sheet: null, renaming: false, handover: false, showQR: false, err: "", flash: "", busy: false, fatal: "",
  installEvt: null, drafts: { nick: store.get("nick") || "", code: hashCode(), gkind: "dare" }
};
// The big screen (TV) only watches: it never plays, never leads, never sees a secret.
const isMod = () => !M.tv && !!M.room && M.room.hostUid === M.me;
const seated = () => !M.tv && M.players.some(p => p.id === M.me);
const inRoom = () => seated() || isMod();
// The narrator is picked by the moderator: in the lobby, only among the seated players.
const narrId = () => { const r = M.room; if (!r?.narrator) return ""; return r.phase === "lobby" && !M.players.some(p => p.id === r.narrator) ? "" : r.narrator; };
const narrator = () => !M.tv && !!M.me && narrId() === M.me;
// The narrator alone moves the story along (nightfall, dawn, debate, votes); without one, the moderator does.
const canLead = () => narrId() ? narrator() : isMod();
// Pausing stays open to the moderator too, in case the narrator is busy.
const canPause = () => isMod() || narrator();
const leader = () => narrId() ? "du meneur" : "du modo";
function pInfo(id) {
  const p = M.players.find(x => x.id === id);
  if (p) return p;
  const c = M.room?.cast?.[id];
  return { id, nick: c ? String(c.nick || "?").slice(0, 18) : "?", color: c?.color };
}
const mySecret = () => M.secret && M.room && M.secret.gameId === M.room.gameId ? M.secret : null;
const curKey = r => `${r.gameId}_${r.seq}`;
function myAct(r) {
  for (const a of [M.myAct, M.localAct]) if (a && a.gameId === r.gameId && a.key === r.seq) return a;
  return null;
}
const actMap = r => Object.fromEntries(M.acts.filter(a => a.gameId === r.gameId && a.key === r.seq).map(a => [a.uid, a]));
const wolfMap = r => Object.fromEntries(M.wolfVotes.filter(a => a.gameId === r.gameId && a.key === r.seq).map(a => [a.uid, a]));

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
const ROOT = "lgRooms";
const rRoom = c => F.doc(DB, ROOT, c);
const rPlayer = (c, id) => F.doc(DB, ROOT, c, "players", id);
const cPlayers = c => F.collection(DB, ROOT, c, "players");
const rSecret = (c, id) => F.doc(DB, ROOT, c, "secret", id);
const rDeal = c => F.doc(DB, ROOT, c, "deal", "current");
const cActs = c => F.collection(DB, ROOT, c, "acts");
const rAct = (c, id) => F.doc(DB, ROOT, c, "acts", id);
const cWolves = c => F.collection(DB, ROOT, c, "wolves");
const rWolf = (c, id) => F.doc(DB, ROOT, c, "wolves", id);
const cVotes = c => F.collection(DB, ROOT, c, "votes");
const rVote = (c, id) => F.doc(DB, ROOT, c, "votes", id);
const cCustom = c => F.collection(DB, ROOT, c, "custom");
const rCustom = (c, id) => F.doc(DB, ROOT, c, "custom", id);
const cChoices = c => F.collection(DB, ROOT, c, "choices");
const rChoice = (c, id) => F.doc(DB, ROOT, c, "choices", id);
const rWill = (c, id) => F.doc(DB, ROOT, c, "wills", id);
const cWills = c => F.collection(DB, ROOT, c, "wills");

let subs = [], gameSubs = [], unDeal = null, unActs = null, unWolves = null, unMyAct = null, myActKey = "", unCustom = null, customKey = "";
function stop(u) { if (u) u(); return null; }
function leaveGameSubs() {
  gameSubs.forEach(u => u()); gameSubs = [];
  unActs = stop(unActs); unWolves = stop(unWolves); unMyAct = stop(unMyAct); myActKey = "";
}
function leaveSubs() { subs.forEach(u => u()); subs = []; leaveGameSubs(); unDeal = stop(unDeal); unCustom = stop(unCustom); customKey = ""; leaveWills(); }
function onErr(e) {
  M.err = e && e.code === "permission-denied" ? "Accès refusé à cette partie." : "Connexion à la partie perdue. Recharge la page.";
  render();
}
function subGame() {
  leaveGameSubs();
  Object.assign(M, { votes: [], acts: [], wolfVotes: [], choices: [], myAct: null, localAct: null, cardShown: false }); leaveWills();
  const g = M.room?.gameId;
  if (!g) return;
  const q = col => F.query(col(M.code), F.where("gameId", "==", g));
  gameSubs.push(F.onSnapshot(q(cVotes), s => { M.votes = s.docs.map(d => d.data()); render(); hostAuto(); }, onErr));
  gameSubs.push(F.onSnapshot(q(cChoices), s => { M.choices = s.docs.map(d => d.data()); render(); }, () => {}));
}
// Everything below is private: night actions are for the moderator and the narrator, the pack's votes for the wolves.
// The listeners follow whoever is moderator or narrator now (the moderator may hand over in the middle of a game).
function subPrivate() {
  const r = M.room, g = r?.gameId;
  if (!g || r.phase === "lobby" || M.tv) return;
  const q = col => F.query(col(M.code), F.where("gameId", "==", g));
  const sees = isMod() || narrator();
  if (!sees && (unDeal || unActs)) { unDeal = stop(unDeal); unActs = stop(unActs); M.deal = null; M.acts = []; }
  if (sees && !unDeal) unDeal = F.onSnapshot(rDeal(M.code), s => { M.deal = s.exists() ? s.data() : null; render(); hostAuto(); }, () => { unDeal = null; });
  if (sees && !unActs) unActs = F.onSnapshot(q(cActs), s => { M.acts = s.docs.map(d => d.data()); render(); hostAuto(); }, () => { unActs = null; });
  const sec = mySecret();
  // Without access to the pack's votes (not a wolf any more), drop the listener quietly.
  if (!unWolves && (sees || myPack(sec))) unWolves = F.onSnapshot(q(cWolves), s => { M.wolfVotes = s.docs.map(d => d.data()); render(); hostAuto(); }, () => { unWolves = null; M.wolfVotes = []; render(); });
  if (seated() && r.order?.includes(M.me) && myActKey !== curKey(r)) {
    unMyAct = stop(unMyAct); myActKey = curKey(r); M.myAct = null;
    unMyAct = F.onSnapshot(rAct(M.code, `${g}_${r.seq}_${M.me}`), s => { M.myAct = s.exists() ? s.data() : null; render(); }, () => {});
  }
}
// House gages stay secret: each player reads their own, the moderator reads them all.
function subCustom() {
  const key = M.tv ? "" : isMod() ? "all" : seated() ? "mine" : "";
  if (key === customKey) return;
  unCustom = stop(unCustom); customKey = key; M.customs = [];
  if (!key) return;
  const q = key === "all" ? cCustom(M.code) : F.query(cCustom(M.code), F.where("by", "==", M.me));
  unCustom = F.onSnapshot(q, s => {
    M.customs = s.docs.map(d => { const x = d.data(); return { id: d.id, kind: x.kind === "truth" ? "truth" : "dare", text: cleanText(x.text, 140), by: x.by || "", at: x.at || 0, ok: !!x.ok }; })
      .filter(c => c.text).sort((a, b) => a.at - b.at);
    render();
  }, () => { M.customs = []; render(); });
}
function enterRoom(code, tv = false) {
  leaveSubs();
  Object.assign(M, { mode: "room", tv, code, room: null, roomReady: false, players: [], playersReady: false, votes: [], acts: [], wolfVotes: [], customs: [], choices: [], myAct: null, localAct: null, secret: null, deal: null, pending: null, renaming: false, handover: false, cardShown: false });
  if (!tv) store.set("room", code);
  try { history.replaceState(null, "", "#" + code + (tv ? "-tv" : "")); } catch {}
  subs.push(F.onSnapshot(rRoom(code), s => {
    if (!s.exists()) { M.err = "Cette partie n'existe plus."; exitRoom(); return; }
    const prev = M.room?.gameId;
    M.room = s.data(); M.roomReady = true;
    if (M.room.gameId !== prev) subGame();
    if (M.selKey !== curKey(M.room)) Object.assign(M, { selKey: curKey(M.room), sel: "", multi: [], wdraft: { save: false, poison: "" } });
    subPrivate(); subCustom(); subWills();
    const r = M.room;
    if (M.pending && (M.pending.k !== `${r.gameId}_${r.seq}.${r.voteN}`)) M.pending = null;
    if (isMod()) rememberHosted(code);
    render(); hostAuto();
  }, onErr));
  subs.push(F.onSnapshot(cPlayers(code), q => {
    M.players = q.docs.map(d => ({ id: d.id, ...d.data(), nick: String(d.data().nick || "?").slice(0, 18) })).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    M.playersReady = true; subPrivate(); subCustom();
    if (seated() && Date.now() - lastHb > HEARTBEAT_MS) heartbeat();
    render();
  }, onErr));
  if (!tv) subs.push(F.onSnapshot(rSecret(code, M.me), s => { M.secret = s.exists() ? s.data() : null; subPrivate(); render(); }, onErr));
  render();
}
function exitRoom() {
  if (M.code && !M.tv) store.set("last", M.code);
  leaveSubs();
  Object.assign(M, { mode: "home", tv: false, code: null, room: null, players: [], votes: [], acts: [], wolfVotes: [], customs: [], choices: [], myAct: null, localAct: null, secret: null, deal: null, pending: null, handover: false });
  store.set("room", null);
  try { history.replaceState(null, "", location.pathname + location.search); } catch {}
  render();
}
async function joinRoom(code, nick) {
  const ps = await F.getDocs(cPlayers(code));
  if (ps.docs.some(d => d.id === M.me)) { await F.updateDoc(rPlayer(code, M.me), { nick, mod: false }); return; }
  const used = new Set(ps.docs.map(d => d.data().color)), fav = profile().color;
  const color = fav && !used.has(fav) ? fav : COLORS.find(c => !used.has(c)) || COLORS[ps.size % COLORS.length];
  await F.setDoc(rPlayer(code, M.me), { nick, color, joinedAt: Date.now(), seen: F.serverTimestamp() });
}
const freshGame = () => ({
  gameId: rid(), phase: "lobby", order: [], cast: {}, comp: null, seq: 0, step: "", night: 0, day: 0,
  outIds: [], out: [], idiots: [], mayor: "", pending: [], after: "", actorUid: "", done: [],
  vkind: "", voteN: 1, among: [], revealed: "", news: null, timerEnd: 0, result: null
});
const freshRoom = () => ({ ...freshGame(), narrator: "", settings: { auto: true, wolves: 1, specials: [], mayor: true, timer: 180, gages: false, gageThemes: [1] }, scores: {} });
const okCustoms = () => M.customs.filter(c => c.ok);

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
  for (const name of ["acts", "wolves", "votes", "custom", "choices", "wills"]) for (const d of (await F.getDocs(col(name))).docs) await F.deleteDoc(d.ref);
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
  const p = { color: null, games: 0, wins: 0, roles: {}, wolfGames: 0, survived: 0, votedFor: {}, titles: {}, recorded: [], ...store.json("profile", {}) };
  p.roles = { ...p.roles };
  return p;
}
function saveProfile(p) { store.set("profile", JSON.stringify(p)); }
function recordGame(r, titles) {
  const res = r.result || {}, role = res.roles?.[M.me];
  if (!role || !res.winner || res.winner === "none" || !r.gameId) return;
  const p = profile();
  if (p.recorded.includes(r.gameId)) return;
  p.games++;
  if (isWinner(M.me, res)) p.wins++;
  p.roles[role] = (p.roles[role] || 0) + 1;
  if (inPack(res, M.me)) p.wolfGames++;
  if (!(r.outIds || []).includes(M.me)) p.survived++;
  for (const v of villageVotes()) if (v.voter === M.me) { const n = pInfo(v.target).nick; if (n && n !== "?") p.votedFor[n] = (p.votedFor[n] || 0) + 1; }
  const t = titles[M.me];
  if (t && t.label !== "Témoin") p.titles[t.label] = (p.titles[t.label] || 0) + 1;
  p.recorded = [...p.recorded, r.gameId].slice(-50);
  saveProfile(p);
}
// The village's elimination votes (not the Captain's election).
const villageVotes = () => M.votes.filter(v => v.vk !== "mayor");

/* ---------- suspicion notes, kept on this phone only ---------- */
function notes(gameId) { const n = store.json("notes", {}); return n.g === gameId ? (n.m || {}) : {}; }
function cycleNote(gameId, id) {
  const m = notes(gameId), cur = m[id];
  if (cur === "sus") m[id] = "ok"; else if (cur === "ok") delete m[id]; else m[id] = "sus";
  store.set("notes", JSON.stringify({ g: gameId, m }));
}
const noteTag = mark => mark ? `<span class="mk ${mark}">${mark === "sus" ? "suspect" : "sûr"}</span>` : "";

/* ---------- presence ----------
   Each phone stamps its player with the server time every HEARTBEAT_MS. The rules let a player take over once the
   moderator's stamp is a minute old; the button shows a bit later. */
const HEARTBEAT_MS = 20000, HOST_AWAY_MS = 70000, PLAYER_AWAY_MS = 90000;
let lastHb = 0;
const awayFor = p => !p ? Infinity : p.id === M.me ? 0 : !tsMs(p.seen) ? 0 : Date.now() - tsMs(p.seen);
const isAway = p => !!p && M.players.some(x => x.id === p.id) && awayFor(p) >= PLAYER_AWAY_MS;
const awayTag = p => isAway(p) ? `<span class="tag off">absent</span>` : "";
const hostPlayer = () => M.players.find(p => p.id === M.room?.hostUid);
function heartbeat() {
  if (M.mode !== "room" || !M.code || !seated()) return;
  lastHb = Date.now();
  F.updateDoc(rPlayer(M.code, M.me), { seen: F.serverTimestamp(), mod: isMod() }).catch(() => {});
}
setInterval(heartbeat, HEARTBEAT_MS);
// A slow tick keeps "absent" tags and the take-over button fresh.
setInterval(() => { if (M.mode === "room") render(); }, 5000);
const modoAway = () => !isMod() && seated() && !!M.room && awayFor(hostPlayer()) >= HOST_AWAY_MS;
const narratorAway = () => isMod() && !!narrId() && narrId() !== M.me && M.room?.phase === "play" && awayFor(M.players.find(p => p.id === narrId())) >= HOST_AWAY_MS;
// Without a moderator nothing moves: anyone at the table can take over. A narrator gone silent can be replaced by the app.
function takeoverPanel() {
  if (modoAway()) {
    const h = hostPlayer(), away = awayFor(h), mins = Number.isFinite(away) ? Math.floor(away / 60000) : 0;
    return `<section class="panel alert" role="alert"><div class="label">Le modo ne répond plus${mins ? ` depuis ${plural(mins, "minute")}` : ""}</div>
      <p class="lead">${h ? `<b>${esc(h.nick)}</b> a sûrement perdu la connexion.` : "Le modo a quitté le village."} Sans modo, la partie est bloquée : quelqu'un doit prendre la relève.</p>
      <button class="btn primary big" data-act="takeover">Devenir le modo</button><p class="hint">La partie continue là où elle en est.</p></section>`;
  }
  if (narratorAway()) return `<section class="panel alert" role="alert"><div class="label">Le meneur ne répond plus</div>
      <p class="lead"><b>${esc(pInfo(narrId()).nick)}</b> a sûrement perdu la connexion.</p>
      <button class="btn primary big" data-act="narrator-app">L'appli prend le relais du meneur</button></section>`;
  return "";
}

/* ---------- wills: written while alive, readable by everyone once their author is dead ---------- */
let willSubs = {};
function subWills() {
  const r = M.room, g = r?.gameId;
  if (!g || r.phase === "lobby") return;
  const want = new Set(r.phase === "end" ? r.order || [] : (r.outIds || []).filter(id => (r.order || []).includes(id)));
  if (seated() && (r.order || []).includes(M.me)) want.add(M.me);
  for (const id of want) {
    const k = `${g}_${id}`;
    if (willSubs[k]) continue;
    willSubs[k] = F.onSnapshot(rWill(M.code, k), s => { const t = s.exists() ? cleanText(s.data().text, 200) : ""; if (t) M.wills[id] = t; else delete M.wills[id]; render(); }, () => { delete willSubs[k]; });
  }
}
function leaveWills() { Object.values(willSubs).forEach(u => u()); willSubs = {}; M.wills = {}; }

/* ---------- the story of the game, published by the moderator's phone at the end ----------
   Lines are lists of pieces: "@uid" becomes a name, "%role" a card, anything else stays as it is. */
function buildRecap(r, d) {
  const sections = [], outs = r.out || [];
  const actOf = (kind, n) => M.acts.filter(a => a.gameId === r.gameId && a.night === n && a.kind === kind);
  for (let n = 1; n <= (r.night || 0); n++) {
    const L = [];
    if (n === 1 && d.thief) L.push(d.roles[d.thief] !== "thief" ? ["🦹 ", "@" + d.thief, " prend au centre la carte ", "%" + d.roles[d.thief]] : ["🦹 ", "@" + d.thief, " garde sa carte"]);
    if (n === 1 && (d.lovers || []).length === 2) L.push(["💘 Cupidon unit ", "@" + d.lovers[0], " et ", "@" + d.lovers[1]]);
    if (n === 1 && d.model) L.push(["🧒 L'Enfant sauvage prend ", "@" + d.model, " pour modèle"]);
    (d.seerLog || []).filter(x => x.n === n).forEach(x => L.push(["🔮 La Voyante regarde ", "@" + x.uid, " : ", "%" + x.role]));
    (d.foxLog || []).filter(x => x.n === n).forEach(x => L.push(["🦊 Le Renard flaire ", "@" + x.uid, ` et ses voisins : ${x.wolf ? "un loup !" : "aucun loup"}`]));
    actOf("guard", n).forEach(a => L.push(["🛡️ Le Salvateur protège ", "@" + a.target]));
    // The pack of that night, not today's: everyone who voted, all on the same name.
    const pv = Object.values(packVotes(r, n)).map(v => v.target), t = pv.length && pv.every(v => v === pv[0]) ? pv[0] : "";
    L.push(t ? ["🐺 Les loups choisissent ", "@" + t] : ["🐺 Les loups ne se mettent d'accord sur personne"]);
    if (d.infection?.n === n) L.push(["🧛 Le Père des Loups infecte ", "@" + d.infection.uid, " : il rejoint la meute"]);
    (d.spied || []).filter(x => x.n === n).forEach(x => L.push(["👧 La Petite Fille espionne et reconnaît ", "@" + x.uid, d.girlCaught?.n === n ? "… mais elle est surprise !" : ""]));
    actOf("white", n).forEach(a => L.push(a.target ? ["🐺 Le Loup Blanc dévore ", "@" + a.target] : ["🐺 Le Loup Blanc épargne la meute"]));
    actOf("witch", n).forEach(a => { if (a.save) L.push(["🧪 La Sorcière sauve la victime"]); if (a.poison) L.push(["🧪 La Sorcière empoisonne ", "@" + a.poison]); });
    actOf("raven", n).forEach(a => { if (a.target) L.push(["🐦‍⬛ Le Corbeau désigne ", "@" + a.target]); });
    outs.filter(o => o.when === "N" + n).forEach(o => L.push(["☠️ ", "@" + o.uid, o.cause === "love" ? " meurt de chagrin (" : " meurt (", "%" + o.role, ")"]));
    sections.push({ t: `Nuit ${n}`, l: L });
    if (n > (r.day || 0)) continue;
    const D = [];
    (r.mayorLog || []).filter(x => x.day === n).forEach(x => D.push(x.how === "heir" ? ["🎖️ ", "@" + x.by, " confie la médaille à ", x.uid ? "@" + x.uid : "personne"] : ["🎖️ ", "@" + x.uid, x.how === "draw" ? " est tiré au sort Capitaine" : " est élu Capitaine"]));
    const byKey = {};
    M.votes.filter(v => v.vk !== "mayor" && v.day === n).forEach(v => (byKey[v.key] ||= []).push(v));
    Object.keys(byKey).sort().forEach(k => D.push(["⚖️ Vote : ", ...byKey[k].flatMap((v, i) => [i ? " · " : "", "@" + v.voter, " → ", "@" + v.target])]));
    outs.filter(o => o.when === "J" + n).forEach(o => D.push(["☠️ ", "@" + o.uid, o.cause === "vote" ? " est éliminé·e par le village (" : o.cause === "shot" ? " reçoit la flèche du Chasseur (" : " meurt de chagrin (", "%" + o.role, ")"]));
    sections.push({ t: `Jour ${n}`, l: D });
  }
  return sections.filter(s => s.l.length);
}
const recapPiece = x => x.startsWith("@") ? `<b>${esc(pInfo(x.slice(1)).nick)}</b>` : x.startsWith("%") ? `${ROLES[x.slice(1)]?.icon || ""} ${roleName(x.slice(1))}` : esc(x);
function recapPanel(r) {
  if (r.recapFor !== r.gameId || !(r.recap || []).length) return "";
  return `<details class="panel recap" open><summary>📜 Le récap de la partie</summary>${r.recap.map(s => `<div class="label">${esc(s.t)}</div><ul class="live">${s.l.map(l => `<li>${l.map(recapPiece).join("")}</li>`).join("")}</ul>`).join("")}</details>`;
}
/* ---------- group statistics, kept in the room across games ---------- */
function addStats(r) {
  const res = r.result || {}, st = JSON.parse(JSON.stringify(r.stats || {}));
  if (!res.winner || res.winner === "none") return st;
  const votes = villageVotes();
  for (const id of r.order || []) {
    const s = st[id] ||= { g: 0, w: 0, wg: 0, ww: 0, n1: 0, sv: 0, c: 0, h: 0 };
    const wolf = inPack(res, id), won = isWinner(id, res), out = (r.out || []).find(o => o.uid === id);
    s.g++; if (won) s.w++;
    if (wolf) { s.wg++; if (won) s.ww++; }
    if (out && out.when === "N1") s.n1++;
    if (!out) s.sv++;
    for (const v of votes) if (v.voter === id) { s.c++; if (inPack(res, v.target)) s.h++; }
  }
  return st;
}
let recapBusy = "";
function publishRecap(r) {
  if (recapBusy === r.gameId) return;
  recapBusy = r.gameId;
  // A moment of patience, so that the last night's actions and votes have reached this phone.
  setTimeout(() => {
    const r2 = M.room, d2 = M.deal;
    if (!r2 || r2.gameId !== r.gameId || r2.recapFor === r.gameId || !d2 || d2.gameId !== r.gameId) { recapBusy = ""; return; }
    patchRoom({ recap: buildRecap(r2, d2), recapFor: r2.gameId, stats: addStats(r2) }).catch(() => { recapBusy = ""; });
  }, 1500);
}
function statsPanel(r) {
  const st = r.stats || {}, ids = Object.keys(st).filter(id => st[id].g);
  if (!ids.length) return "";
  const best = (score, ok) => { const c = ids.filter(id => ok(st[id])).sort((a, b) => score(st[b]) - score(st[a])); return c.length && score(st[c[0]]) > 0 ? c[0] : ""; };
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const hl = [
    ["🏆 Le plus de victoires", best(s => s.w, () => true), s => plural(s.w, "victoire")],
    ["🐺 Meilleur loup", best(s => s.ww, s => s.wg), s => `${s.ww} victoire${s.ww > 1 ? "s" : ""} sur ${s.wg} en loup`],
    ["🍖 Toujours mangé en premier", best(s => s.n1, () => true), s => `mort la première nuit ${plural(s.n1, "fois", "fois")}`],
    ["👃 Meilleur flair au vote", best(s => s.h / (s.c || 1), s => s.c >= 3), s => `${pct(s.h, s.c)} % de votes contre un loup`],
    ["🛡️ Increvable", best(s => s.sv, () => true), s => `${plural(s.sv, "partie")} jusqu'au bout`]
  ].filter(x => x[1]);
  return `<details class="panel stats-g"><summary>📊 Statistiques du groupe</summary>
    ${hl.length ? `<ul class="live">${hl.map(([t, id, f]) => `<li>${t} : <b>${esc(pInfo(id).nick)}</b> <small>· ${f(st[id])}</small></li>`).join("")}</ul>` : ""}
    <div class="stabwrap"><table class="stab"><thead><tr><th></th><th>Parties</th><th>Victoires</th><th>En loup</th><th>Flair</th></tr></thead><tbody>
    ${ids.sort((a, b) => st[b].w - st[a].w).map(id => { const s = st[id]; return `<tr><td>${esc(pInfo(id).nick)}</td><td>${s.g}</td><td>${s.w}</td><td>${s.ww}/${s.wg}</td><td>${s.c ? pct(s.h, s.c) + " %" : "—"}</td></tr>`; }).join("")}
    </tbody></table></div></details>`;
}

/* ---------- saved line-ups, kept on this phone ---------- */
const savedComps = () => store.json("comps", []);
const COMP_KEYS = ["wolves", "specials", "mayor", "timer", "gages", "gageThemes"];
function compsPanel() {
  const list = savedComps();
  return `<details class="panel comps"><summary>💾 Mes compositions</summary>
    ${list.length ? `<ul class="customs">${list.map((c, i) => `<li><span><b>${esc(c.name)}</b> <small>· ${c.settings.wolves} loup${c.settings.wolves > 1 ? "s" : ""}${(c.settings.specials || []).length ? " · " + c.settings.specials.map(x => ROLES[x]?.icon || "").join("") : ""}</small></span>
      <span class="acts"><button class="link" data-act="comp-load" data-id="${i}">Charger</button><button class="link" data-act="comp-del" data-id="${i}" aria-label="Supprimer ${esc(c.name)}">×</button></span></li>`).join("")}</ul>` : `<p class="hint left">Enregistre la composition actuelle pour la retrouver en un clic la prochaine fois.</p>`}
    <form class="row" data-form="comp-save"><input id="compname" data-draft="compname" type="text" maxlength="30" autocomplete="off" enterkeyhint="done" placeholder="Ex. : Soirée à 10" aria-label="Nom de la composition"><button class="btn" type="submit">Enregistrer</button></form>
  </details>`;
}

/* Every change of the room also stamps it, which tells the cleanup when a room was last used. */
const patchRoom = p => F.updateDoc(rRoom(M.code), { ...p, touchedAt: F.serverTimestamp() });

/* ---------- the night, one role at a time ---------- */
// Official wake-up order: night 1 opens with the preparation (Thief, Cupid, the Lovers, the Wild Child),
// then every night the Seer, the Fox, the Salvateur, the wolves (the Little Girl may spy on them),
// the White Wolf (every other night), the Witch and the Raven.
const NIGHT_ORDER = ["thief", "cupid", "lovers", "wildchild", "seer", "fox", "guard", "wolves", "whitewolf", "witch", "raven"];
const FIRST_NIGHT_ONLY = ["thief", "cupid", "lovers", "wildchild"];
// Steps follow the cards dealt (public), not who is still alive: a dead role is still called, so nobody can tell.
function nightSteps(r, n) {
  const c = r.comp || {};
  const has = { thief: c.thief, cupid: c.cupid, lovers: c.cupid, wildchild: c.wildchild, seer: c.seer, fox: c.fox, guard: c.guard,
    wolves: c.wolf || c.infect || c.whitewolf, whitewolf: c.whitewolf && n % 2 === 0, witch: c.witch, raven: c.raven };
  return NIGHT_ORDER.filter(s => has[s] && (n === 1 || !FIRST_NIGHT_ONLY.includes(s)));
}
const ROLE_OF_STEP = { thief: "thief", cupid: "cupid", wildchild: "wildchild", seer: "seer", fox: "fox", guard: "guard", whitewolf: "whitewolf", witch: "witch", raven: "raven" };
const holders = (r, d, role) => aliveIds(r).filter(id => d.roles[id] === role);
const packAlive = (r, d) => aliveIds(r).filter(id => inPack(d, id));
// The Little Girl spies only while she is not a wolf herself.
const girlsAlive = (r, d) => holders(r, d, "girl").filter(id => !inPack(d, id));
// Who has something to do during this step.
function stepActors(r, d, s) {
  if (s === "lovers") return (d.lovers || []).filter(id => aliveIds(r).includes(id));
  if (s === "thief") return r.night === 1 && d.thief && aliveIds(r).includes(d.thief) ? [d.thief] : [];
  if (s === "wolves") return [...packAlive(r, d), ...girlsAlive(r, d)];
  if (s === "witch") { const p = d.potions || {}; return p.life || p.death ? holders(r, d, "witch") : []; }
  if (s === "fox") return d.foxLost ? [] : holders(r, d, "fox");
  if (s === "whitewolf") return packAlive(r, d).some(id => d.roles[id] !== "whitewolf") ? holders(r, d, "whitewolf") : [];
  return ROLE_OF_STEP[s] ? holders(r, d, ROLE_OF_STEP[s]) : [];
}
// Has the step been played? (The wolves must agree; the Little Girl must have decided.)
function stepDone(r, d, s) {
  const acts = actMap(r), who = stepActors(r, d, s);
  if (s === "wolves") return (!packAlive(r, d).length || !!packChoice(r, d, r.night)) && girlsAlive(r, d).every(id => acts[id]);
  return who.every(id => acts[id]);
}
const nightPatch = r => {
  const n = r.night + 1, steps = nightSteps(r, n);
  return { step: "night", night: n, nsteps: steps, ni: 0, nstep: steps[0] || "dawn", awake: false, seq: r.seq + 1, done: [], pending: [], news: null, vkind: "", voteN: 1, among: [], revealed: "", timerEnd: 0, actorUid: "" };
};
// The narrator puts the role back to sleep: the next one can be called.
const sleepPatch = r => { const i = (r.ni || 0) + 1; return { ni: i, nstep: (r.nsteps || [])[i] || "dawn", awake: false, seq: r.seq + 1 }; };
const dayPatch = r => ({ step: "day", seq: r.seq + 1, done: [], actorUid: "", timerEnd: r.settings?.timer ? Date.now() + r.settings.timer * 1000 : 0 });
const votePatch = (r, vkind) => ({ step: "vote", vkind, seq: r.seq + 1, voteN: 1, among: [], revealed: "", done: [], timerEnd: 0 });
// Once his model is dead, the Wild Child counts as a wolf, even before the moderator's phone has told him.
function withWild(r, d) {
  const child = (r.order || []).find(id => d?.roles?.[id] === "wildchild");
  if (!child || !d.model || !(r.outIds || []).includes(d.model) || (r.outIds || []).includes(child) || (d.infected || []).includes(child)) return d;
  return { ...d, infected: [...(d.infected || []), child] };
}
function endPatch(r, d, winner) {
  const dd = d ? withWild(r, d) : null;
  const result = { winner: winner === "none" ? "none" : winner || "", roles: dd?.roles || {}, lovers: dd?.lovers || [], infected: dd?.infected || [], thief: dd?.thief || "", extra: dd?.extra || [] };
  return { phase: "end", step: "", seq: r.seq + 1, result, paused: false, scores: winner && winner !== "none" ? addScores(r.scores, result) : (r.scores || {}) };
}
// After a death: the game may be over, unless a Hunter or a Captain still has something to do.
function settle(r, d, patch) {
  const r2 = { ...r, ...patch };
  if ((r2.pending || []).length) return patch;
  const v = verdict(r2.order, r2.outIds, withWild(r2, d), r2);
  return v ? { ...patch, ...endPatch(r2, d, v) } : patch;
}
function nextPatch(r, d) {
  const pend = (r.pending || []).slice();
  if (pend.length && aliveIds(r).length) { const p = pend.shift(); return { step: p.kind, actorUid: p.uid, pending: pend, seq: r.seq + 1, done: [] }; }
  const v = verdict(r.order, r.outIds, withWild(r, d), r);
  if (v) return endPatch(r, d, v);
  if (r.after === "day") return r.settings?.mayor && !r.mayor && aliveIds(r).length >= 3 ? { ...votePatch(r, "mayor"), pending: [] } : { ...dayPatch(r), pending: [] };
  return nightPatch(r);
}
// The last vote of each wolf for night n.
function packVotes(r, n) {
  const by = {};
  M.wolfVotes.filter(v => v.gameId === r.gameId && v.night === n).sort((a, b) => (a.at || 0) - (b.at || 0)).forEach(v => { by[v.uid] = v; });
  return by;
}
// The wolves' shared choice for night n: the one target every living wolf voted for, or nobody.
function packChoice(r, d, n) {
  const al = aliveIds(r), by = packVotes(r, n);
  const votes = al.filter(id => inPack(d, id)).map(id => by[id]?.target);
  const t = votes[0];
  return votes.length && votes.every(v => v === t) && al.includes(t) && !inPack(d, t) ? t : "";
}
// The wolves' victim, as the Witch will see it: the Little Girl caught spying dies in its place.
const nightVictim = (r, d, n) => d.girlCaught?.n === n && aliveIds(r).includes(d.girlCaught.uid) ? d.girlCaught.uid : packChoice(r, d, n);
// The Infect Father's one-time choice: the victim joins the pack instead of dying.
function infectNow(r, d, n) {
  const f = holders(r, d, "infect")[0];
  if (!f || d.infectUsed || !packVotes(r, n)[f]?.infect) return "";
  return nightVictim(r, d, n);
}
const nightAct = (r, kind, n) => M.acts.find(a => a.gameId === r.gameId && a.night === n && a.kind === kind) || null;
// The pack after a change, and the secret updates telling every wolf who the pack is now.
function packSecrets(r, d2, sw) {
  const pack = r.order.filter(id => inPack(d2, id));
  pack.forEach(id => sw.push([id, { wolves: pack }]));
  return pack;
}
function resolveNight(r, d) {
  const n = r.night, al = aliveIds(r), pot = { ...(d.potions || { life: true, death: true }) };
  const w = nightAct(r, "witch", n), t = nightVictim(r, d, n), inf = infectNow(r, d, n), guarded = d.guardNight === n ? d.guarded : "";
  let elder = d.elderLife ?? 1, saved = false;
  const deaths = [], dp = {}, sw = [];
  if (inf) {
    // The infected player survives and secretly joins the pack, keeping their own power.
    dp.infected = [...(d.infected || []), inf]; dp.infectUsed = true; dp.infection = { n, uid: inf };
    packSecrets(r, { ...d, ...dp }, sw);
    sw.push([inf, { infected: { n } }]);
    holders(r, d, "infect").forEach(id => sw.push([id, { infectUsed: true }]));
  } else {
    if (w && w.save && pot.life && t) { saved = true; pot.life = false; }
    if (t && t !== guarded && !saved) {
      if (d.roles[t] === "elder" && elder > 0) elder--;
      else deaths.push({ uid: t, cause: "night" });
    }
  }
  // The White Wolf's own victim, another wolf.
  const wa = nightAct(r, "white", n);
  if (wa && wa.target && al.includes(wa.target) && inPack(d, wa.target) && !deaths.some(x => x.uid === wa.target)) deaths.push({ uid: wa.target, cause: "night" });
  if (w && w.poison && !saved && pot.death && al.includes(w.poison) && !deaths.some(x => x.uid === w.poison)) { pot.death = false; deaths.push({ uid: w.poison, cause: "night" }); }
  const d2 = { ...d, ...dp }, k = killChain(r, d2, deaths, "N" + n);
  // The Raven's mark: two votes against that player at today's vote.
  const ra = nightAct(r, "raven", n), raven = ra && ra.target && !k.outIds.includes(ra.target) && r.order.includes(ra.target) ? { day: n, uid: ra.target } : null;
  return {
    deal: { potions: pot, elderLife: elder, wolfTarget: t, lastGuard: guarded, ...dp },
    secrets: sw,
    room: settle(r, d2, { outIds: k.outIds, out: k.out, pending: k.pending, step: "news", seq: r.seq + 1, day: n, after: "day", done: [], nstep: "", awake: false, raven, news: { kind: "night", n, dead: k.dead, raven: raven?.uid || "" } })
  };
}
async function hostDawn(r, d) {
  const res = resolveNight(r, d), b = F.writeBatch(DB);
  b.update(rDeal(M.code), res.deal);
  const wi = r.order.find(id => d.roles[id] === "witch"), gu = r.order.find(id => d.roles[id] === "guard");
  if (wi) b.update(rSecret(M.code, wi), { potions: res.deal.potions });
  if (gu) b.update(rSecret(M.code, gu), { lastGuard: res.deal.lastGuard });
  res.secrets.forEach(([id, p]) => b.update(rSecret(M.code, id), p));
  b.update(rRoom(M.code), res.room);
  await b.commit();
}
function hostShot(r, d, a) {
  const t = a && a.kind === "shot" && aliveIds(r).includes(a.target) ? a.target : "";
  const k = killChain(r, d, t ? [{ uid: t, cause: "shot" }] : [], "J" + r.day);
  return patchRoom(settle(r, d, { outIds: k.outIds, out: k.out, pending: k.pending, step: "news", seq: r.seq + 1, done: [], news: { kind: "shot", by: r.actorUid, dead: k.dead } }));
}
function hostHeir(r, d, a) {
  const t = a && a.kind === "heir" && aliveIds(r).includes(a.target) ? a.target : "";
  return patchRoom({ mayor: t, mayorLog: [...(r.mayorLog || []), { day: r.day, uid: t, how: "heir", by: r.actorUid }], step: "news", seq: r.seq + 1, done: [], news: { kind: "heir", by: r.actorUid, uid: t } });
}
// The Fox sniffs a player and the two living players seated on each side.
function foxTrio(r, t) {
  const al = (r.order || []).filter(id => aliveIds(r).includes(id)), i = al.indexOf(t);
  if (i < 0) return [t];
  return [...new Set([al[(i - 1 + al.length) % al.length], t, al[(i + 1) % al.length]])];
}
// What a role's choice changes, applied by the moderator's phone as soon as the role has played.
function stepEffect(r, d, s, acts) {
  const b = F.writeBatch(DB), dp = {};
  const sec = (id, p) => b.update(rSecret(M.code, id), p);
  // Each effect is applied once, even if the moderator's phone reloads in the middle of the night.
  if (s === "thief") {
    const t = d.thief, a = acts[t], extra = (d.extra || []).slice(), roles = { ...d.roles };
    if (!t || !a || d.thiefDone) return null;
    let i = a.kind === "thief" && (a.pick === 0 || a.pick === 1) ? a.pick : -1;
    if (i < 0 && extra.length === 2 && extra.every(x => WOLF_ROLES.includes(x))) i = 0;
    if (i >= 0 && extra[i]) {
      const role = extra[i];
      extra[i] = "thief"; roles[t] = role;
      const s2 = { gameId: r.gameId, role, stolen: true };
      if (WOLF_ROLES.includes(role)) { const sw = []; s2.wolves = packSecrets(r, { ...d, roles }, sw); sw.filter(([id]) => id !== t).forEach(([id, p]) => sec(id, p)); }
      if (role === "witch") s2.potions = { life: true, death: true };
      b.set(rSecret(M.code, t), s2);
    } else sec(t, { kept: true });
    Object.assign(dp, { roles, extra, thiefDone: true });
  } else if (s === "cupid") {
    const cu = holders(r, d, "cupid")[0], a = cu && acts[cu];
    const t = a?.kind === "cupid" ? [...new Set(a.targets || [])].filter(x => r.order.includes(x)) : [];
    if (t.length !== 2 || (d.lovers || []).length) return null;
    dp.lovers = t; sec(t[0], { lover: t[1] }); sec(t[1], { lover: t[0] });
  } else if (s === "wildchild") {
    const id = holders(r, d, "wildchild")[0], a = id && acts[id];
    if (!a || a.kind !== "model" || !r.order.includes(a.target) || d.model) return null;
    dp.model = a.target; sec(id, { model: a.target });
  } else if (s === "seer") {
    const id = holders(r, d, "seer")[0], a = id && acts[id];
    if (!a || a.kind !== "seer" || !r.order.includes(a.target) || d.seerKey === r.seq) return null;
    const seen = { ...(d.seen || {}), [a.target]: d.roles[a.target] };
    Object.assign(dp, { seen, seerKey: r.seq, seerLog: [...(d.seerLog || []), { n: r.night, uid: a.target, role: d.roles[a.target] }] });
    sec(id, { seen });
  } else if (s === "fox") {
    const id = holders(r, d, "fox")[0], a = id && acts[id];
    if (!a || a.kind !== "fox" || !r.order.includes(a.target) || d.foxKey === r.seq) return null;
    const trio = foxTrio(r, a.target), wolf = trio.some(x => inPack(d, x));
    const foxLog = [...(d.foxLog || []), { n: r.night, uid: a.target, trio, wolf }];
    Object.assign(dp, { foxLog, foxKey: r.seq, foxLost: !wolf });
    sec(id, { foxLog, foxLost: !wolf });
  } else if (s === "guard") {
    const id = holders(r, d, "guard")[0], a = id && acts[id];
    if (!a || a.kind !== "guard" || !aliveIds(r).includes(a.target) || a.target === d.lastGuard) return null;
    Object.assign(dp, { guarded: a.target, guardNight: r.night });
  } else if (s === "wolves") {
    // Caught spying (one time in three), the Little Girl will die in place of the wolves' victim.
    const gi = girlsAlive(r, d)[0], a = gi && acts[gi], pack = packAlive(r, d);
    if (!a || a.kind !== "girl" || !a.spy || !pack.length || (d.spied || []).some(x => x.n === r.night)) return null;
    dp.spied = [...(d.spied || []), { n: r.night, uid: pickOne(pack) }];
    sec(gi, { spied: dp.spied });
    if (Math.random() < 1 / 3) { dp.girlCaught = { n: r.night, uid: gi }; pack.forEach(id => sec(id, { caught: dp.girlCaught })); }
  } else if (s === "witch") {
    // The Witch is shown the wolves' victim as soon as she is called (nobody, if the victim is being infected).
    const t = infectNow(r, d, r.night) ? "" : nightVictim(r, d, r.night), wi = holders(r, d, "witch")[0], pot = d.potions || {};
    if (wi && (pot.life || pot.death)) sec(wi, { witch: { key: r.seq, victim: t, life: !!pot.life, death: !!pot.death } });
    dp.wolfTarget = t;
  } else return null;
  b.update(rDeal(M.code), dp);
  return b;
}
const STEP_ACTS = ["thief", "cupid", "wildchild", "seer", "fox", "guard", "wolves"];
let autoKey = "", fx = new Set(), timers = {};
// Run fn after ms, once per key; it re-checks that the game is still where it was.
function later(key, ms, still, fn) {
  if (timers[key]) return;
  timers[key] = setTimeout(() => { delete timers[key]; if (still()) fn(); }, ms);
}
// When the Wild Child's model dies, the moderator's phone turns him into a wolf.
function wildCheck(r, d) {
  const w = withWild(r, d);
  if (w === d) return;
  const child = w.infected[w.infected.length - 1], k = `${r.gameId}|wild`;
  if (fx.has(k)) return;
  fx.add(k);
  const b = F.writeBatch(DB), sw = [];
  packSecrets(r, w, sw);
  sw.forEach(([id, p]) => b.update(rSecret(M.code, id), p));
  b.update(rSecret(M.code, child), { wildTurned: { day: r.day || r.night } });
  b.update(rDeal(M.code), { infected: w.infected });
  b.commit().catch(() => fx.delete(k));
}
function hostAuto() {
  const r = M.room, d = M.deal;
  if (!isMod() || !r || !d || d.gameId !== r.gameId) return;
  // At the end, the moderator's phone publishes the story of the game and the group's statistics.
  if (r.phase === "end") { if (r.recapFor !== r.gameId && r.result?.roles) publishRecap(r); return; }
  if (r.phase !== "play" || r.paused) return;
  const acts = actMap(r), key = curKey(r);
  const fail = () => { autoKey = ""; M.err = "Ça n'a pas marché. Recharge la page."; render(); };
  const same = k => () => M.room && curKey(M.room) === k && !M.room.paused;
  wildCheck(r, d);
  if (r.step === "night") {
    const s = r.nstep;
    // Effects of the role that just played (the Witch's victim is prepared as soon as she is called).
    const fk = `${key}|${s}|${s === "wolves" ? Object.keys(acts).sort().join() : ""}`;
    if ((STEP_ACTS.includes(s) && stepActors(r, d, s).some(id => acts[id]) || s === "witch") && !fx.has(fk)) {
      const b = stepEffect(r, d, s, acts);
      if (b) { fx.add(fk); b.commit().catch(() => fx.delete(fk)); }
    }
    if (s === "dawn" && r.awake && autoKey !== key) { autoKey = key; hostDawn(r, d).catch(fail); return; }
    // Without a narrator, the app calls each role itself.
    if (!narrId()) {
      if (!r.awake) later(key + "w", 1500, same(key), () => patchRoom({ awake: true }).catch(() => {}));
      else if (s !== "dawn") {
        const who = stepActors(r, d, s);
        if (!who.length) later(key + "z", 3000 + Math.random() * 3000, same(key), () => patchRoom(sleepPatch(M.room)).catch(() => {}));
        else if (stepDone(r, d, s)) later(key + "s", 1800, () => same(key)() && stepDone(M.room, M.deal, s), () => patchRoom(sleepPatch(M.room)).catch(() => {}));
      }
    }
    return;
  }
  // Without a narrator, the votes show on their own once every voter has voted. A narrator reveals them himself.
  if (r.step === "vote" && r.revealed !== `${r.seq}.${r.voteN}`) {
    if (narrId()) return;
    const voters = aliveIds(r).filter(id => !(r.idiots || []).includes(id)), vm = votesMap(r, voters), vk = `${key}.${r.voteN}`;
    if (voters.length && voters.every(id => vm[id]))
      later(vk + "rv", 1500, () => { const r2 = M.room; return !!r2 && !r2.paused && `${curKey(r2)}.${r2.voteN}` === vk && !r2.revealed; }, () => patchRoom({ revealed: `${M.room.seq}.${M.room.voteN}` }).catch(() => {}));
    return;
  }
  if (autoKey === key) return;
  let job = null;
  if (r.step === "hunter" && acts[r.actorUid]) job = () => hostShot(r, d, acts[r.actorUid]);
  else if (r.step === "heir" && acts[r.actorUid]) job = () => hostHeir(r, d, acts[r.actorUid]);
  if (!job) return;
  autoKey = key;
  job().catch(fail);
}
// The moderator stops waiting for someone who fell asleep for real.
function forceStep() {
  const r = M.room, d = M.deal;
  if (!r || !d || d.gameId !== r.gameId) return Promise.reject(new Error("Rôles pas encore chargés"));
  if (r.step === "night") return patchRoom(r.nstep === "dawn" ? { awake: true } : sleepPatch(r));
  autoKey = curKey(r);
  if (r.step === "hunter") return hostShot(r, d, null);
  if (r.step === "heir") return hostHeir(r, d, null);
  return Promise.resolve();
}

/* ---------- shared pieces ---------- */
function av(p, cls = "") {
  const ini = (p.nick || "?").trim().charAt(0) || "?";
  return `<span class="av ${cls}" style="background:${safeColor(p.color)}" aria-hidden="true">${esc(ini)}</span>`;
}
function badges(id) {
  const r = M.room;
  if (!r) return "";
  return (r.mayor === id ? `<span class="medal" title="Capitaine">🎖️</span>` : "") + ((r.idiots || []).includes(id) ? `<span class="tag">idiot</span>` : "");
}
function chip(p, extra = "", cls = "") {
  const mod = M.mode === "room" && M.room && p.id === M.room.hostUid;
  return `<span class="chip ${cls}">${av(p)}<span class="nm">${esc(p.nick)}</span>${mod ? `<span class="tag">modo</span>` : ""}${p.id && p.id === narrId() ? `<span class="tag nar">meneur</span>` : ""}${badges(p.id)}${M.mode === "room" ? awayTag(p) : ""}${extra}</span>`;
}
const roleTag = role => `<button class="role r-${ROLES[role]?.camp || "village"}" data-act="card" data-id="${esc(role)}">${ROLES[role]?.icon || ""} ${roleName(role)}</button>`;
function header(big, badge = "") {
  return `<header class="top ${big ? "big" : ""}"><h1 class="logo">Loup-Garou</h1><span class="tops">${badge ? `<span class="badge">${esc(badge)}</span>` : ""}<button class="cardsbtn" data-act="cards" aria-label="Voir toutes les cartes">🃏 Cartes</button></span></header>`;
}
function errBox() {
  return (M.err ? `<div class="err" role="alert">${esc(M.err)}</div>` : "") + (M.flash ? `<div class="note" role="status">${esc(M.flash)}</div>` : "");
}
// Settings and restarts belong to the moderator; during the game, the narrator leads if there is one.
function waitMod(text, modo = false) {
  return `<section class="panel center wait"><div class="label">En attente ${modo ? "du modo" : leader()}</div><div class="big dots">${text}</div></section>`;
}
function cardFace(id, o = {}) {
  const c = ROLES[id] || EXTRA[id];
  if (!c) return "";
  return `<div class="card c-${c.camp || "extra"} ${o.size || ""}">
    <div class="art"><span>${c.icon}</span></div>
    <div class="cname">${c.name}</div>
    ${c.camp ? `<div class="camp">${CAMPS[c.camp] || ""}</div>` : ""}
    ${o.short ? `<p class="cshort">${c.short}</p>` : ""}
  </div>`;
}
const cardBack = () => `<div class="card back"><div class="moon"></div><div class="cname">Ta carte</div><div class="camp">Touche pour la voir</div></div>`;
function rulesBox() {
  return `<details class="panel rules"><summary>Comment on joue ?</summary>
    <p class="hint left">D'après la règle officielle des Loups-Garous de Thiercelieux (8 à 18 joueurs).</p>
    <ol>
      <li>Chacun reçoit une carte secrète sur son téléphone : <b>Loup-Garou</b> ou <b>villageois</b> (parfois avec un pouvoir). Un <b>meneur</b>, qui ne joue pas, peut raconter l'histoire ; sinon l'appli s'en charge.</li>
      <li><b>Première nuit, préparation</b> : le Voleur échange éventuellement sa carte, Cupidon désigne les deux Amoureux, qui se reconnaissent.</li>
      <li><b>Chaque nuit</b> : la Voyante sonde un joueur, les Loups-Garous se mettent d'accord sur une victime (la Petite Fille peut les espionner), puis la Sorcière peut utiliser ses potions. Les rôles se réveillent un par un, appelés par le meneur (ou par l'appli) : tous les autres gardent les yeux fermés.</li>
      <li><b>Le jour</b>, on découvre les morts et leur carte (le Chasseur tire, l'Amoureux meurt de chagrin, le Capitaine désigne son successeur). Puis on débat à voix haute.</li>
      <li>Le village <b>vote</b> : la majorité élimine, la voix du Capitaine compte double. En cas d'égalité, le Capitaine tranche ; sinon, on revote entre les ex-æquo.</li>
      <li>Le <b>village</b> gagne en éliminant le dernier Loup-Garou. Les <b>loups</b> gagnent en éliminant le dernier villageois. Un loup et un villageois amoureux gagnent ensemble en éliminant tous les autres.</li>
      <li>Les morts ne communiquent plus d'aucune manière !</li>
    </ol>
    <p class="hint left">Points : ${POINTS.village} par villageois gagnant, ${POINTS.wolves} par loup gagnant, ${POINTS.love} par amoureux gagnant, ${POINTS.angel} pour l'Ange. Touchez <b>🃏 Cartes</b> pour lire le pouvoir de chaque rôle.</p>
  </details>`;
}
function deckView(counts, opts = {}) {
  const ids = ROLE_ORDER.filter(id => counts[id]).concat(opts.mayor ? ["mayor"] : []);
  return `<div class="deck">${ids.map(id => { const c = ROLES[id] || EXTRA[id], n = counts[id] || 0;
    return `<button class="mini c-${c.camp || "extra"}" data-act="card" data-id="${id}"><span class="ic">${c.icon}</span><span class="mn">${c.name}</span>${n > 1 ? `<span class="cnt">×${n}</span>` : ""}</button>`; }).join("")}</div>`;
}
function scoresPanel(ids, scores) {
  const rows = ids.map(id => ({ p: pInfo(id), n: scores?.[id] || 0 })).sort((a, b) => b.n - a.n);
  if (!rows.some(r => r.n)) return "";
  return `<section class="panel"><div class="label">Classement</div>
    <ol class="rank">${rows.map((r, i) => `<li class="${i === 0 ? "first" : ""}"><span class="pos">${i + 1}</span>${av(r.p)}<span class="who"><b>${esc(r.p.nick)}</b></span><span class="pts">${plural(r.n, "pt")}</span></li>`).join("")}</ol>
  </section>`;
}
function sheetHtml() {
  const s = M.sheet;
  if (!s) return "";
  let body;
  if (s.type === "cards") {
    body = `<h2 class="sh-title">Les cartes</h2><p class="hint left">Touche une carte pour lire son pouvoir.</p>
      <div class="gallery">${ROLE_ORDER.concat(Object.keys(EXTRA)).map(id => `<button class="gcard" data-act="card" data-id="${id}">${cardFace(id, { size: "sm" })}</button>`).join("")}</div>`;
  } else {
    const c = ROLES[s.id] || EXTRA[s.id];
    if (!c) return "";
    body = `${cardFace(s.id, { size: "lg" })}
      <p class="cquote">${c.short}</p>
      <div class="sec"><div class="label">Son but</div><p>${c.goal}</p></div>
      <div class="sec"><div class="label">Son pouvoir</div><p>${c.power}</p></div>
      <div class="sec"><div class="label">Dans l'appli</div><p>${c.app}</p></div>
      <div class="sec"><div class="label">Conseils</div><ul>${c.tips.map(t => `<li>${t}</li>`).join("")}</ul></div>
      ${s.from === "cards" ? `<button class="btn" data-act="cards">← Toutes les cartes</button>` : ""}`;
  }
  return `<div class="sheet-bg" data-act="sheet-close"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${s.type === "cards" ? "Les cartes" : esc(roleName(s.id))}">
      <button class="sheet-x" data-act="sheet-close" aria-label="Fermer">×</button>${body}
    </section>`;
}

/* ---------- screens: home ---------- */
function renderSetup() {
  return header(true) + `<section class="panel"><p class="lead"><b>Le jeu en ligne n'est pas encore branché.</b></p>
    <p class="note">Colle la configuration de ton projet Firebase dans le fichier <b>config.js</b>, puis remets le site en ligne.</p></section>`;
}
function renderFatal() {
  return header(true) + `<section class="panel"><p class="lead">${esc(M.fatal)}</p><button class="btn primary big" data-act="reload">Réessayer</button></section>`;
}
function renderHome() {
  const invited = M.drafts.code && M.drafts.code.length === 4 && hashCode() === M.drafts.code;
  const nickField = `<input id="nick" data-draft="nick" type="text" maxlength="18" autocomplete="nickname" enterkeyhint="next" placeholder="Ton prénom ou surnom" aria-label="Ton prénom">`;
  const joinForm = `<form class="stack" data-form="join-code">
      <input id="code" class="codein" data-draft="code" type="text" maxlength="4" autocomplete="off" autocapitalize="characters" enterkeyhint="go" placeholder="CODE" aria-label="Code de la partie">
      <button class="btn ${invited ? "primary big" : ""}" type="submit">Rejoindre la partie</button>
    </form>`;
  const last = normCode(store.get("last"));
  return header(true) + errBox() + `<p class="tagline">La nuit tombe sur le village. Parmi vous se cachent des loups… Chacun joue sur son téléphone, l'appli fait le meneur.</p>
  <section class="panel"><div class="label">Ton prénom</div>${nickField}</section>
  ${last.length === 4 && !invited ? `<button class="btn big" data-act="rejoin" data-code="${esc(last)}">Revenir à la partie ${esc(last)}</button>` : ""}
  ${invited
    ? `<section class="panel"><div class="label">Tu es invité à la partie</div><div class="code">${esc(M.drafts.code)}</div>${joinForm}</section>
       <div class="or">ou</div><button class="btn big" data-act="create">Créer ma propre partie</button>`
    : `<button class="btn primary big" data-act="create">Créer une partie</button>
       <p class="hint">Tu seras le modo : tu choisis les cartes et tu fais avancer les jours.</p>
       <div class="or">ou</div>
       <section class="panel"><div class="label">Rejoindre avec un code</div>${joinForm}</section>`}
  <button class="btn big" data-act="cards">🃏 Découvrir les cartes</button>
  ${profilePanel()}
  ${installPanel()}
  ${rulesBox()}`;
}
const ROLE_PLURAL = id => (ROLES[id]?.plural || roleName(id)).toLowerCase();
function profilePanel() {
  const p = profile(), fan = topOf(p.votedFor), title = topOf(p.titles), played = Object.entries(p.roles).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  return `<section class="panel">
    <div class="label">Mon profil</div>
    <div class="swatches" role="group" aria-label="Ma couleur">${COLORS.map(c =>
      `<button class="swatch" data-act="pick-color" data-id="${c}" style="background:${c}" aria-pressed="${p.color === c}" aria-label="Couleur ${c}"></button>`).join("")}</div>
    ${p.games ? `<ul class="stats">
        <li><b>${p.games}</b> ${p.games > 1 ? "parties" : "partie"}</li>
        <li><b>${p.wins}</b> ${p.wins > 1 ? "victoires" : "victoire"}</li>
        <li><b>${Math.round(p.survived / p.games * 100)} %</b> de survie</li>
      </ul>
      <p class="hint left">Rôles joués : ${played.map(([id, n]) => `${ROLES[id]?.icon || ""} ${esc(roleName(id))} ×${n}`).join(" · ")}</p>
      ${p.wolfGames ? `<p class="hint left">Tu as été loup <b>${plural(p.wolfGames, "fois", "fois")}</b>.</p>` : ""}
      ${fan ? `<p class="hint left">Tu votes le plus souvent contre <b>${esc(fan[0])}</b> (${plural(fan[1], "fois", "fois")}).</p>` : ""}
      ${title ? `<p class="hint left">Ton titre fétiche : <b>${esc(title[0])}</b>.</p>` : ""}`
      : `<p class="hint left">Tes stats apparaîtront ici après ta première partie. Elles restent sur ce téléphone.</p>`}
  </section>`;
}
function installPanel() {
  if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) return "";
  if (M.installEvt) return `<button class="btn big" data-act="install">📲 Installer l'appli sur ce téléphone</button>`;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return `<p class="hint">Pour l'installer : bouton Partager de Safari, puis « Sur l'écran d'accueil ».</p>`;
  return "";
}

/* ---------- screens: room ---------- */
const baseUrl = () => location.origin + location.pathname;
const inviteLink = () => baseUrl() + "#" + M.code;
const tvLink = () => baseUrl() + "#" + M.code + "-tv";
function invitePanel() {
  return `<section class="panel center">
    <div class="label">Code de la partie</div><div class="code">${esc(M.code)}</div>
    ${M.showQR ? `<div class="qr" data-qr="${esc(inviteLink())}" aria-label="QR code pour rejoindre la partie"></div>` : ""}
    <div class="btns" style="width:100%">
      ${navigator.share ? `<button class="btn primary" data-act="share">Inviter</button>` : ""}
      <button class="btn" data-act="copy">Copier le lien</button>
      <button class="btn" data-act="toggle-qr">${M.showQR ? "Cacher le QR code" : "QR code"}</button>
    </div>
    <p class="hint">Les autres scannent le QR code, ouvrent le lien, ou tapent le code sur le site.</p>
    ${isMod() ? `<details class="tvbox"><summary>📺 Afficher la partie sur une TV ou un ordi</summary>
      <p class="hint left">Ouvre ce lien sur le grand écran : il montre le QR code, qui est réveillé la nuit, les morts, les votes et les cartes révélées, sans jouer et sans jamais montrer une carte secrète.</p>
      <div class="row"><input type="text" readonly value="${esc(tvLink())}" aria-label="Lien grand écran" onclick="this.select()"><button class="btn" data-act="copy-tv">Copier</button></div>
    </details>` : ""}
  </section>`;
}
// The moderator can hand the role over at any time, even in the middle of a game.
function handoverBlock() {
  const others = M.players.filter(p => p.id !== M.me);
  if (!isMod() || !others.length) return "";
  return M.handover
    ? `<div class="label">Donner le rôle de modo à</div>
       <div class="chips">${others.map(p => `<button class="btn" data-act="handover" data-id="${esc(p.id)}">${esc(p.nick)}</button>`).join("")}</div>
       <p class="hint left">Le nouveau modo règle les parties, distribue les cartes et fait tourner la nuit sur son téléphone.</p>
       <button class="link" data-act="handover-cancel" style="align-self:flex-start">Annuler</button>`
    : `<button class="link" data-act="handover-open" style="align-self:flex-start">Passer le rôle de modo à quelqu'un d'autre</button>`;
}
// House gages: each player writes their own, only the author and the moderator see them, the moderator accepts them.
function customPanel(mod) {
  const list = M.customs, k = M.drafts.gkind === "truth" ? "truth" : "dare";
  return `<section class="panel">
    <div class="label">Gages maison</div>
    <p class="hint left">Écrivez vos propres gages et vérités : blagues internes, souvenirs du groupe… ${mod
      ? "Tu vois toutes les propositions : valide celles qui entrent dans le thème « Ce groupe »."
      : "Seuls toi et le modo les voyez, et le modo les valide."}</p>
    <form class="stack" data-form="custom">
      <div class="toggles"><button type="button" class="tog" data-act="gkind" data-v="dare" aria-pressed="${k === "dare"}">Gage</button><button type="button" class="tog" data-act="gkind" data-v="truth" aria-pressed="${k === "truth"}">Vérité</button></div>
      <div class="row"><input id="gtext" data-draft="gtext" type="text" maxlength="140" autocomplete="off" enterkeyhint="done" placeholder="${k === "dare" ? "Ex. : Imite le modo pendant 30 secondes." : "Ex. : Qui ici t'énerve le plus ?"}" aria-label="Ton gage ou ta vérité"><button class="btn" type="submit">Ajouter</button></div>
    </form>
    ${list.length ? `<ul class="customs">${list.map(c => `<li class="${c.ok ? "" : "wait-ok"}">
        <span><b>${c.kind === "dare" ? "Gage" : "Vérité"}</b> · ${esc(c.text)}${mod && c.by !== M.me ? ` <small>· ${esc(pInfo(c.by).nick)}</small>` : ""}${c.ok ? "" : `<small class="pending">en attente de validation</small>`}</span>
        <span class="acts">${mod && !c.ok ? `<button class="link" data-act="approve-custom" data-id="${esc(c.id)}">Valider</button>` : ""}
          ${mod || c.by === M.me ? `<button class="link" data-act="del-custom" data-id="${esc(c.id)}">${mod && !c.ok ? "Refuser" : "Retirer"}</button>` : ""}</span>
      </li>`).join("")}</ul>` : ""}
  </section>`;
}
function playersPanel(players, editable) {
  return `<section class="panel">
    <div class="label">Au village · ${players.length}</div>
    ${players.length ? `<div class="chips">${players.map(p => chip(p,
      editable && p.id !== M.me ? `<button class="x" data-act="kick" data-id="${esc(p.id)}" aria-label="Retirer ${esc(p.nick)}">×</button>` : "",
      p.id === M.me ? "me" : "")).join("")}</div>` : `<p class="hint left">Personne pour l'instant.</p>`}
    ${editable ? handoverBlock() : ""}
    ${seated() ? (M.renaming
      ? `<form class="row" data-form="rename"><input id="rename" data-draft="rename" type="text" maxlength="18" autocomplete="off" enterkeyhint="done" placeholder="Nouveau pseudo" aria-label="Nouveau pseudo"><button class="btn primary" type="submit">OK</button></form>
         <button class="link" data-act="rename-cancel" style="align-self:flex-start">Annuler</button>`
      : `<button class="link" data-act="rename-open" style="align-self:flex-start">Changer de pseudo</button>`) : ""}
  </section>`;
}
function renderRoom() {
  if (!M.roomReady || !M.playersReady) return header(true, "Partie " + M.code) + `<section class="panel center loading">Connexion au village…</section>`;
  if (M.tv) return renderTv();
  const r = M.room, players = M.players, mod = isMod();
  const badge = (narrator() ? "Meneur · " : mod ? "Modo · " : "Partie ") + M.code;
  if (!inRoom()) {
    return header(true, badge) + errBox() + `<section class="panel">
      <p class="lead">${r.phase === "play" ? "Une partie est en cours. Entre ton prénom : tu joueras à la suivante." : "Entre ton prénom pour entrer au village."}</p>
      <form class="row" data-form="join-room"><input id="nick" data-draft="nick" type="text" maxlength="18" autocomplete="nickname" enterkeyhint="go" placeholder="Ton prénom ou surnom" aria-label="Ton prénom"><button class="btn primary" type="submit">Rejoindre</button></form>
    </section>${playersPanel(players, false)}
    <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
  }
  if (r.phase === "play") return header(false, badge) + errBox() + playScreen(r, mod);
  if (r.phase === "end") return header(true, badge) + errBox() + endScreen(r, players, mod);
  return header(true, badge) + errBox() + lobbyScreen(r, players, mod);
}
const gageThemes = s => { const t = (s?.gageThemes || [1]).map(Number).filter(x => GAGE_THEMES.some(g => g.id === x)); return t.length ? t : [1]; };
const thiefNote = c => c.extra ? `<p class="hint left">🦹 Avec le Voleur, on ajoute ${c.extra} Simples Villageois au paquet : les ${c.extra} cartes en trop restent au centre.</p>` : "";
function picksHtml(ids, c) {
  return `<div class="picks">${ids.map(id => { const on = c.specials.includes(id), R = ROLES[id];
    return `<div class="pick ${on ? "on" : ""}"><button class="pk" data-act="spec" data-id="${id}" aria-pressed="${on}"><span class="ic">${R.icon}</span><span class="mn">${R.name}</span></button><button class="info" data-act="card" data-id="${id}" aria-label="Pouvoir : ${R.name}">?</button></div>`; }).join("")}</div>`;
}
function lobbyScreen(r, players, mod) {
  const s = r.settings || {}, nid = narrId(), n = players.filter(p => p.id !== nid).length, c = compOf(s, n);
  const scores = scoresPanel(players.map(p => p.id), r.scores);
  const themes = gageThemes(s);
  const opts = `${s.mayor ? "Élection d'un Capitaine" : "Sans Capitaine"} · ${s.timer ? "débat de " + mmss(s.timer) : "débat sans chrono"} · ${s.gages ? `gages et vérités (${GAGE_THEMES.filter(t => themes.includes(t.id)).map(t => t.name).join(", ")})` : "sans gages"}`;
  const narrLine = nid ? (nid === M.me ? "C'est toi le meneur : tu ne reçois pas de carte, tu vois les coulisses et tu racontes l'histoire." : `Le meneur sera ${pInfo(nid).nick} : il ne joue pas.`) : "Pas de meneur : l'appli s'en charge, tout le monde joue.";
  if (!mod) {
    return `${invitePanel()}${playersPanel(players, false)}
    <section class="panel"><div class="label">Les cartes en jeu</div>${n >= MIN_PLAYERS && c.ok ? deckView(compCounts(c), { mayor: s.mayor }) + thiefNote(c) : `<p class="hint left">Il faut au moins ${MIN_PLAYERS} joueurs${nid ? " (sans compter le meneur)" : ""}.</p>`}
      <p class="hint left">${esc(opts)}. Touche une carte pour lire son pouvoir.</p></section>
    <section class="panel"><div class="label">Le meneur</div><p class="lead">${esc(narrLine)}</p><p class="hint left">Seul le modo choisit le meneur.</p></section>
    ${waitMod("Le modo prépare la partie", true)}
    ${customPanel(false)}
    ${statsPanel(r)}
    ${scores}${rulesBox()}
    <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button> · <button class="link" data-act="leave">Quitter la partie</button></p>`;
  }
  const canStart = n >= MIN_PLAYERS && c.ok;
  return `${invitePanel()}${playersPanel(players, true)}
  <section class="panel"><div class="label">Qui est le meneur ?</div>
    <div class="narr">
      <button class="opt" data-act="narrator" data-id="" aria-pressed="${!nid}"><span class="ic">📱</span><span>L'appli<small>tout le monde joue</small></span></button>
      ${players.map(p => `<button class="opt" data-act="narrator" data-id="${esc(p.id)}" aria-pressed="${nid === p.id}">${av(p)}<span>${esc(p.nick)}${p.id === M.me ? "<small>toi</small>" : ""}</span></button>`).join("")}
    </div>
    <p class="hint left">Le meneur ne reçoit pas de carte. Il a un panneau de contrôle : les phrases à dire s'affichent au fil de la nuit, il réveille chaque rôle un par un, voit ses choix (et garde la liste de ce que la Voyante a vu), le rendort avant d'appeler le suivant, et décide quand la nuit tombe et quand le jour se lève. Le jour, c'est lui qui lance le vote, voit les votes arriver, les révèle et prononce la sentence. Sans meneur, l'appli appelle les rôles toute seule et révèle les votes dès que tout le monde a voté. Toi seul peux le choisir.</p>
  </section>
  <section class="panel"><div class="label">Les cartes · ${plural(n, "joueur")}</div>
    <button class="switch" data-act="auto" aria-pressed="${s.auto !== false}"><span class="knob"></span><span><b>Composition conseillée</b><br><small>Calculée selon le nombre de joueurs. Touche une carte pour composer toi-même.</small></span></button>
    <div class="stepper"><span><b>🐺 Loups-Garous</b><small>Au plus ${c.max} pour ${c.n} joueurs${c.max < maxWolves(c.n) ? " avec Cupidon" : ""}</small></span>
      <span class="sp"><button class="sbtn" data-act="wolf-minus" ${c.wolves <= 1 ? "disabled" : ""} aria-label="Un loup de moins">−</button><output>${c.wolves}</output><button class="sbtn" data-act="wolf-plus" ${c.pack >= c.max ? "disabled" : ""} aria-label="Un loup de plus">+</button></span></div>
    <div class="label">Jeu de base</div>${picksHtml(BASE, c)}
    <div class="label">Extensions · hors règle de base</div>${picksHtml(EXPANSIONS, c)}
    <div class="summary">${c.villagers > 0 ? `<button class="sum" data-act="card" data-id="villager">+ ${plural(c.villagers, "Simple Villageois", "Simples Villageois")}</button>` : c.villagers === 0 ? `<span class="hint">Aucun Simple Villageois : que des pouvoirs !</span>` : ""}</div>
    ${thiefNote(c)}
    ${n >= MIN_PLAYERS && !c.ok ? `<p class="err">${c.tooManyWolves ? `Trop de loups${c.pack > c.wolves ? ` (${c.pack} avec le Loup Blanc et le Père des Loups)` : ""} : ${c.max} au plus pour ${c.n} joueurs${c.max < maxWolves(c.n) ? `. Avec Cupidon, un loup peut tomber amoureux d'un villageois : ce villageois joue alors contre le village, qui n'aurait plus la majorité. Retire un loup ou Cupidon` : ""}.` : `Trop de cartes spéciales pour ${n} joueurs : retire des rôles ou des loups.`}</p>` : ""}
  </section>
  <section class="panel"><div class="label">Options</div>
    <button class="switch" data-act="mayor" aria-pressed="${!!s.mayor}"><span class="knob"></span><span><b>🎖️ Élire un Capitaine</b><br><small>Au premier matin. Sa voix compte double et tranche les égalités.</small></span></button>
    <div class="label">Chrono du débat</div>
    <div class="toggles">${TIMERS.map(t => `<button class="tog" data-act="timer" data-v="${t}" aria-pressed="${(s.timer || 0) === t}">${t ? mmss(t) : "Sans"}</button>`).join("")}</div>
    <button class="switch" data-act="gages" aria-pressed="${!!s.gages}"><span class="knob"></span><span><b>🎲 Gages et vérités</b><br><small>À la fin de la partie, chaque perdant choisit entre un gage et une vérité.</small></span></button>
    ${s.gages ? `<div class="label">Thèmes des gages</div>
      <div class="chips">${GAGE_THEMES.map(t => { const n = t.id === GROUP_THEME ? okCustoms().length : GAGES.dare[t.id].length + GAGES.truth[t.id].length;
        return `<button class="pill" data-act="gage-theme" data-id="${t.id}" aria-pressed="${themes.includes(t.id)}">${t.name} <small>${n}</small></button>`; }).join("")}</div>
      <p class="hint left">Coche un ou plusieurs thèmes. « Ce groupe » contient les gages maison que tu as validés. Ce qui touche quelqu'un d'autre se fait avec son accord.</p>` : ""}
  </section>
  ${customPanel(true)}
  ${compsPanel()}
  ${statsPanel(r)}
  <button class="btn primary big" data-act="start" ${canStart ? "" : "disabled"}>Distribuer les cartes</button>
  ${n < MIN_PLAYERS ? `<p class="hint">Il faut au moins ${MIN_PLAYERS} joueurs${nid ? " (sans compter le meneur)" : ""}.</p>` : n < OFFICIAL_MIN ? `<p class="hint">La règle officielle se joue de ${OFFICIAL_MIN} à 18 joueurs : à moins, la partie est plus courte.</p>` : ""}
  ${scores}${rulesBox()}
  <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
}

// Private notes under one's own card.
// Am I in the pack? (A wolf card, or infected, or the Wild Child whose model died.)
const myPack = sec => !!sec && (WOLF_ROLES.includes(sec.role) || !!sec.infected || !!sec.wildTurned);
function privateInfo(sec, r) {
  const li = [], al = aliveIds(r);
  if (myPack(sec)) {
    const others = (sec.wolves || []).filter(id => id !== M.me);
    li.push(others.length ? `🐺 Ta meute : <b>${esc(names(others.map(pInfo)))}</b>` : "🐺 Tu es le seul loup. Bonne chasse !");
    if (sec.caught) li.push(`👧 La nuit ${sec.caught.n}, vous avez surpris la Petite Fille : c'était <b>${esc(pInfo(sec.caught.uid).nick)}</b>.`);
  }
  if (sec.role === "whitewolf") li.push("🐺 Tu es le Loup Blanc : la meute te croit des siens. Les nuits paires, tu peux dévorer un loup. Tu gagnes seul, si tu es le dernier en vie.");
  if (sec.infected) li.push(`🧛 Tu as été infecté la nuit ${sec.infected.n} : tu es désormais un loup. Tu gardes ton pouvoir, et tu te réveilles aussi avec la meute.`);
  if (sec.role === "infect") li.push(sec.infectUsed ? "🧛 Tu as déjà utilisé ton infection." : "🧛 Une fois dans la partie, tu peux infecter la victime de la meute au lieu de la dévorer.");
  if (sec.role === "wildchild") li.push(sec.wildTurned ? "🧒 Ton modèle est mort : tu es devenu un Loup-Garou !" : sec.model ? `🧒 Ton modèle : <b>${esc(pInfo(sec.model).nick)}</b>. S'il meurt, tu deviens un loup.` : "🧒 La première nuit, tu choisiras ton modèle.");
  if (sec.role === "fox") li.push(`🦊 ${(sec.foxLog || []).length ? sec.foxLog.map(x => `nuit ${x.n} : ${esc(names(x.trio.map(pInfo)))} → ${x.wolf ? "<b>au moins un loup</b>" : "aucun loup"}`).join(" · ") : "Pas encore de flair."}${sec.foxLost ? " Tu as perdu ton flair." : ""}`);
  if (sec.lover) li.push(`💞 Tu es amoureux de <b>${esc(pInfo(sec.lover).nick)}</b>. S'il meurt, tu meurs aussi. Tu ne dois jamais voter contre lui ni lui nuire.`);
  if (sec.role === "seer") {
    const seen = Object.entries(sec.seen || {});
    li.push(seen.length ? `🔮 Tes visions : ${seen.map(([id, ro]) => `<b>${esc(pInfo(id).nick)}</b> est ${ROLES[ro]?.icon || ""} ${roleName(ro)}`).join(" · ")}` : "🔮 Pas encore de vision.");
  }
  if (sec.role === "witch") { const p = sec.potions || {}; li.push(`🧪 Potion de vie : ${p.life ? "disponible" : "utilisée"} · Potion de mort : ${p.death ? "disponible" : "utilisée"}`); }
  if (sec.role === "girl" && (sec.spied || []).length) li.push(`👧 Tu as vu : ${sec.spied.map(s => `<b>${esc(pInfo(s.uid).nick)}</b> est un loup (nuit ${s.n})`).join(" · ")}`);
  if (sec.role === "guard" && sec.lastGuard) li.push(`🛡️ Protégé la nuit dernière : <b>${esc(pInfo(sec.lastGuard).nick)}</b>`);
  if (sec.stolen) li.push("🦹 Tu étais le Voleur : tu as pris cette carte au centre. Tu joues ce personnage jusqu'à la fin.");
  if (sec.role === "thief") li.push(sec.kept ? "🦹 Tu as gardé ta carte : tu joues comme un simple villageois." : "🦹 Au début de la première nuit, tu pourras prendre une des deux cartes du centre.");
  if (sec.role === "angel") li.push(angelOver(r) ? "👼 Raté, tu n'as pas été éliminé au premier vote : tu es maintenant un simple villageois." : "👼 Fais-toi éliminer au premier vote du village, et tu gagnes seul !");
  if (!al.includes(M.me) && r.order.includes(M.me)) li.push("☠️ Tu es mort. Tu peux regarder, mais plus un mot !");
  return li.length ? `<ul class="priv">${li.map(x => `<li>${x}</li>`).join("")}</ul>` : "";
}
function myCardPanel(r, sec) {
  if (!sec) return `<section class="panel center"><p class="lead">Distribution des cartes…</p></section>`;
  const shown = M.cardShown, dead = !aliveIds(r).includes(M.me);
  return `<section class="mycard ${shown ? "open" : ""} ${dead ? "dead" : ""}">
    <button class="flip" data-act="flip" aria-pressed="${shown}" aria-label="${shown ? "Cacher ma carte" : "Voir ma carte"}">${shown ? cardFace(sec.role, { short: true }) : cardBack()}</button>
    ${shown ? `${privateInfo(sec, r)}<button class="btn" data-act="card" data-id="${esc(sec.role)}">Lire le pouvoir de ma carte</button>` : `<p class="hint">À l'abri des regards ! Elle se recache toute seule.</p>`}
  </section>`;
}
// The will, written while alive, revealed to everyone at death.
function willPanel(r) {
  if (!aliveIds(r).includes(M.me)) return "";
  const mine = M.wills[M.me];
  return `<details class="panel will"><summary>📜 Mon testament${mine ? " · écrit" : ""}</summary>
    <p class="hint left">Quelques mots, révélés à tout le village à ta mort. Personne ne peut les lire avant.</p>
    ${mine ? `<p class="willtext">« ${esc(mine)} »</p>` : ""}
    <form class="row" data-form="will"><input id="will" data-draft="will" type="text" maxlength="200" autocomplete="off" enterkeyhint="done" placeholder="${mine ? "Le réécrire…" : "Ex. : J'ai toujours su que c'était Bruno."}" aria-label="Mon testament"><button class="btn" type="submit">${mine ? "Modifier" : "Écrire"}</button></form>
  </details>`;
}
const willLine = id => M.wills[id] ? `<p class="willtext">📜 « ${esc(M.wills[id])} »</p>` : "";
// The Angel's chance is gone once the village has voted on day 1 (or the second night has come).
const angelOver = r => r.night > 1 || r.day > 1 || (r.day === 1 && r.after === "night");
const who = () => narrId() ? "Le meneur" : "Le modo";
const STEP_NAME = { thief: "le Voleur", cupid: "Cupidon", lovers: "les Amoureux", wildchild: "l'Enfant sauvage", seer: "la Voyante", fox: "le Renard", guard: "le Salvateur", wolves: "les Loups-Garous", whitewolf: "le Loup Blanc", witch: "la Sorcière", raven: "le Corbeau", dawn: "le village" };
const STEP_ICON = { thief: "🦹", cupid: "💘", lovers: "💞", wildchild: "🧒", seer: "🔮", fox: "🦊", guard: "🛡️", wolves: "🐺", whitewolf: "🐺", witch: "🧪", raven: "🐦‍⬛", dawn: "☀️" };
const upper = s => s.charAt(0).toUpperCase() + s.slice(1);
const wakes = s => s === "lovers" || s === "wolves" ? "se réveillent" : "se réveille";
function banner(r) {
  const s = r.nstep, prep = r.night === 1 && FIRST_NIGHT_ONLY.includes(s);
  const S = {
    intro: ["🃏", "Les cartes sont distribuées", "Regarde la tienne en secret, puis attends la nuit."],
    night: s === "dawn" ? ["🌙", `Nuit ${r.night}`, "Tout le monde dort encore… le jour va se lever."]
      : [r.awake ? STEP_ICON[s] || "🌙" : "🌙", `Nuit ${r.night}${prep ? " · préparation" : ""}`, r.awake ? `${upper(STEP_NAME[s] || "")} ${wakes(s)}… Les autres, gardez les yeux fermés.` : "Tout le village dort. Garde les yeux fermés."],
    news: ["☀️", `Jour ${r.day}`, ""],
    hunter: ["🏹", "Le Chasseur", "Avant de rendre l'âme, il réplique…"],
    heir: ["🎖️", "Le Capitaine est mort", "Dans son dernier souffle, il désigne son successeur."],
    day: ["☀️", `Jour ${r.day}`, "Le village débat. Qui sont les loups ?"],
    vote: ["⚖️", r.vkind === "mayor" ? "Élection du Capitaine" : `Jour ${r.day} · le vote`, r.vkind === "mayor" ? "Qui portera la médaille ?" : "Le village désigne un suspect."]
  }[r.step] || ["🌙", "", ""];
  return `<div class="banner"><span class="bi" aria-hidden="true">${S[0]}</span><span><b>${S[1]}</b>${S[2] ? `<small>${S[2]}</small>` : ""}</span></div>`;
}
// A Lover must never vote against, devour, poison or shoot their beloved.
const loveOff = sec => id => sec?.lover && id === sec.lover ? "ton amour 💞" : "";
function pickGrid(ids, o) {
  return `<div class="grid">${ids.map(id => { const p = pInfo(id), off = o.off?.(id), on = o.on(id);
    return `<button class="tile ${on ? "sel" : ""}" data-act="${o.act}" data-id="${esc(id)}" aria-pressed="${on}" ${off ? "disabled" : ""}>${av(p)}<span class="nm">${esc(p.nick)}${id === M.me ? " <small>(toi)</small>" : ""}</span>${badges(id)}${o.extra ? o.extra(id) : ""}${off ? `<small class="off">${off}</small>` : ""}</button>`; }).join("")}</div>`;
}
function pickPanel(o) {
  const ready = o.multi ? M.multi.length === 2 : !!M.sel;
  return `<section class="stack"><div class="label">${o.title}</div>${o.sub ? `<p class="hint left">${o.sub}</p>` : ""}
    ${pickGrid(o.ids, { act: o.multi ? "pick-multi" : "pick", on: id => o.multi ? M.multi.includes(id) : M.sel === id, off: o.off })}
    <button class="btn primary big" data-act="send-act" data-kind="${o.kind}" ${ready ? "" : "disabled"}>${ready ? o.go(o.multi ? M.multi.map(pInfo) : [pInfo(M.sel)]) : o.wait}</button>
    ${o.none ? `<button class="btn big" data-act="send-none" data-kind="${o.kind}">${o.none}</button>` : ""}</section>`;
}
// Is it my turn? Only the role that is called, once the narrator has woken it, gets to play.
function myTurn(r, sec) {
  if (!sec || r.step !== "night" || !r.awake || !aliveIds(r).includes(M.me)) return false;
  const s = r.nstep, role = sec.role;
  if (s === "thief") return role === "thief" && (sec.kept || (sec.extra || []).length > 0) || !!sec.stolen;
  if (s === "lovers") return !!sec.lover;
  if (s === "wolves") return myPack(sec) || role === "girl";
  if (s === "witch") return role === "witch" && sec.witch?.key === r.seq;
  if (s === "fox") return role === "fox" && !sec.foxLost;
  return ROLE_OF_STEP[s] === role;
}
const sleepCard = (label, text) => `<section class="panel center wait"><div class="label">${label}</div><div class="big dots">${text}</div></section>`;
const backToSleep = () => sleepCard("C'est fait", narrId() ? "Rendors-toi quand le meneur te le dira" : "Rendors-toi");
function wolfScreen(r, sec) {
  const me = M.me, al = aliveIds(r), pack = (sec.wolves || []).filter(id => al.includes(id)), wv = wolfMap(r);
  const mineV = wv[me] || (M.localAct?.key === r.seq && M.localAct.gameId === r.gameId && M.localAct.kind === "wolf" ? M.localAct : null), my = mineV?.target || "";
  const prey = al.filter(id => !pack.includes(id));
  const votersOf = id => pack.filter(w => (w === me ? my : wv[w]?.target) === id);
  const all = pack.every(w => w === me ? my : wv[w]), agreed = all && pack.every(w => (w === me ? my : wv[w]?.target) === my);
  const infectOn = pack.some(w => (w === me ? mineV : wv[w])?.infect);
  const canInfect = sec.role === "infect" && !sec.infectUsed;
  return `${sec.caught?.n === r.night ? `<p class="note">👧 Vous surprenez la Petite Fille en train de vous espionner : c'est <b>${esc(pInfo(sec.caught.uid).nick)}</b> ! Elle sera dévorée à la place de votre victime.</p>` : ""}
    <section class="stack wolves"><div class="label">🐺 Loups-Garous, reconnaissez-vous et désignez votre victime</div>
    <p class="hint left">${pack.length > 1 ? `Ta meute : <b>${esc(names(pack.filter(id => id !== me).map(pInfo)))}</b>. Vous devez tous choisir la même victime : sinon, personne n'est dévoré.` : "Tu chasses seul cette nuit."}</p>
    ${pickGrid(prey, { act: "wolf", on: id => my === id, off: loveOff(sec), extra: id => { const v = votersOf(id); return v.length ? `<span class="paws">${v.map(w => av(pInfo(w), "xs")).join("")}</span>` : ""; } })}
    ${canInfect ? `<button class="switch" data-act="infect" aria-pressed="${!!mineV?.infect}" ${my ? "" : "disabled"}><span class="knob"></span><span><b>🧛 Infecter la victime</b><br><small>Une seule fois dans la partie : au lieu de mourir, elle rejoint la meute en gardant son pouvoir.${my ? "" : " Vote d'abord."}</small></span></button>` : infectOn ? `<p class="note">🧛 Le Père des Loups veut infecter la victime : elle rejoindra la meute.</p>` : ""}
    ${my ? `<p class="hint">Ton vote : <b>${esc(pInfo(my).nick)}</b>. ${agreed ? "La meute est d'accord : attendez que le meneur vous rendorme." : all ? "Vous n'êtes pas d'accord : changez de vote pour vous entendre !" : "On attend le reste de la meute…"}</p>` : ""}
  </section>`;
}
function nightScreen(r, sec) {
  const me = M.me, al = aliveIds(r), mine = myAct(r), role = sec.role, s = r.nstep, others = al.filter(id => id !== me);
  if (s === "thief") return thiefScreen(r, sec);
  if (s === "wolves" && myPack(sec)) return wolfScreen(r, sec);
  if (s === "wolves" && role === "girl") {
    if (!mine) return `<section class="panel"><div class="label">👧 Petite Fille, les loups sont réveillés…</div>
      <p class="lead">Entrouvres-tu les yeux pour les espionner ? Tu découvrirais le nom d'un loup. Mais une fois sur trois, ils te surprennent… et c'est toi qu'ils dévorent !</p>
      <div class="btns"><button class="btn primary" data-act="girl" data-v="1">J'espionne</button><button class="btn" data-act="girl" data-v="0">Je garde les yeux fermés</button></div></section>`;
    const seen = (sec.spied || []).find(x => x.n === r.night);
    if (!mine.spy) return `<p class="note">👧 Tu gardes sagement les yeux fermés.</p>${backToSleep()}`;
    return seen ? `<p class="note">👧 Tu as entrevu <b>${esc(pInfo(seen.uid).nick)}</b> : c'est un loup !</p>${backToSleep()}` : sleepCard("Tu entrouvres les yeux", "Tu distingues une silhouette");
  }
  if (s === "lovers") {
    if (mine) return backToSleep();
    return `<section class="panel center"><div class="label">💞 Amoureux, réveillez-vous et reconnaissez-vous</div>${av(pInfo(sec.lover), "xl")}
      <p class="lead">Tu es amoureux de <b>${esc(pInfo(sec.lover).nick)}</b>. Regardez-vous discrètement, sans vous montrer vos cartes.</p>
      <p class="hint">Si l'un meurt, l'autre meurt de chagrin. Tu ne dois jamais voter contre lui ni lui nuire.</p>
      <button class="btn primary big" data-act="lovers-ok">Je l'ai reconnu</button></section>`;
  }
  if (s === "witch") return witchScreen(r, sec);
  if (mine) {
    if (mine.kind === "seer") {
      const ro = sec.seen?.[mine.target], p = pInfo(mine.target);
      return ro ? `<section class="panel center vision"><div class="label">🔮 Ta vision</div>${av(p, "xl")}<div class="name">${esc(p.nick)}</div><p class="lead">est</p>${cardFace(ro, { size: "sm" })}</section>${backToSleep()}`
        : sleepCard("🔮", "La boule de cristal se trouble");
    }
    if (mine.kind === "fox") {
      const x = (sec.foxLog || []).find(f => f.n === r.night);
      return x ? `<section class="panel center vision"><div class="label">🦊 Ton flair</div><p class="lead">Parmi <b>${esc(names(x.trio.map(pInfo)))}</b>…</p><div class="name">${x.wolf ? "il y a au moins un loup !" : "aucun loup."}</div>${x.wolf ? "" : `<p class="hint">Tu perds ton flair pour le reste de la partie.</p>`}</section>${backToSleep()}`
        : sleepCard("🦊", "Tu renifles l'air de la nuit");
    }
    if (mine.kind === "cupid") return `<p class="note">💘 Ta flèche est partie : <b>${esc(names((mine.targets || []).map(pInfo)))}</b> sont amoureux.</p>${backToSleep()}`;
    if (mine.kind === "guard") return `<p class="note">🛡️ Tu protèges <b>${esc(pInfo(mine.target).nick)}</b> cette nuit.</p>${backToSleep()}`;
    if (mine.kind === "model") return `<p class="note">🧒 Ton modèle : <b>${esc(pInfo(mine.target).nick)}</b>. S'il meurt, tu deviens un loup.</p>${backToSleep()}`;
    if (mine.kind === "white") return `<p class="note">🐺 ${mine.target ? `Tu dévores <b>${esc(pInfo(mine.target).nick)}</b>.` : "Tu épargnes la meute cette nuit."}</p>${backToSleep()}`;
    if (mine.kind === "raven") return `<p class="note">🐦‍⬛ ${mine.target ? `<b>${esc(pInfo(mine.target).nick)}</b> commencera le vote avec 2 voix contre lui.` : "Tu ne désignes personne cette nuit."}</p>${backToSleep()}`;
    return backToSleep();
  }
  if (s === "seer") return pickPanel({ kind: "seer", title: "🔮 Voyante, désigne le joueur dont tu veux connaître la carte", ids: others, go: p => `Voir la carte de ${esc(p[0].nick)}`, wait: "Choisis un joueur", off: id => sec.seen?.[id] ? "déjà vu" : "" });
  if (s === "cupid") return pickPanel({ kind: "cupid", multi: true, title: "💘 Cupidon, désigne les deux amoureux", sub: "Tu peux te choisir toi-même. Si l'un meurt, l'autre meurt de chagrin.", ids: al, go: p => `Unir ${esc(names(p))}`, wait: `Choisis deux joueurs (${M.multi.length}/2)` });
  if (s === "guard") return pickPanel({ kind: "guard", title: "🛡️ Salvateur, qui protèges-tu cette nuit ?", ids: al, go: p => `Protéger ${esc(p[0].nick)}`, wait: "Choisis un joueur", off: id => id === sec.lastGuard ? "protégé hier" : "" });
  if (s === "wildchild") return pickPanel({ kind: "model", title: "🧒 Enfant sauvage, choisis ton modèle", sub: "S'il meurt, tu deviendras un Loup-Garou.", ids: others, go: p => `Prendre ${esc(p[0].nick)} pour modèle`, wait: "Choisis un joueur" });
  if (s === "fox") return pickPanel({ kind: "fox", title: "🦊 Renard, qui veux-tu flairer ?", sub: "Tu sauras s'il y a au moins un loup parmi ce joueur et ses deux voisins de table.", ids: others, go: p => `Flairer ${esc(p[0].nick)}`, wait: "Choisis un joueur" });
  if (s === "whitewolf") return pickPanel({ kind: "white", title: "🐺 Loup Blanc, veux-tu dévorer un loup cette nuit ?", ids: (sec.wolves || []).filter(id => al.includes(id) && id !== me), go: p => `Dévorer ${esc(p[0].nick)}`, wait: "Choisis un loup", none: "Ne dévorer personne", off: loveOff(sec) });
  if (s === "raven") return pickPanel({ kind: "raven", title: "🐦‍⬛ Corbeau, qui aura 2 voix contre lui demain ?", ids: others, go: p => `Désigner ${esc(p[0].nick)}`, wait: "Choisis un joueur", none: "Ne désigner personne" });
  return "";
}
function thiefScreen(r, sec) {
  const mine = myAct(r), ex = sec.extra || [], forced = ex.length === 2 && ex.every(x => WOLF_ROLES.includes(x));
  if (sec.stolen) return `<section class="panel center"><div class="label">🦹 Ta nouvelle carte</div>${cardFace(sec.role, { size: "sm", short: true })}<p class="hint">Tu joues ce personnage jusqu'à la fin, dès cette nuit.</p></section>${backToSleep()}`;
  if (sec.kept || mine) return `<p class="note">🦹 ${sec.kept || mine.pick < 0 ? "Tu gardes ta carte : tu joues comme un simple villageois." : "La carte arrive dans ta main…"}</p>${sec.kept ? backToSleep() : ""}`;
  return `<section class="panel center"><div class="label">🦹 Voleur, voici les deux cartes du centre</div>
      <p class="lead">Échange ta carte contre l'une d'elles : tu joueras ce personnage jusqu'à la fin, dès cette nuit.</p>
      <div class="duo">${ex.map((c, i) => `<div class="pickcard">${cardFace(c, { size: "sm" })}
        <button class="btn primary" data-act="thief" data-v="${i}">Prendre</button>
        <button class="link" data-act="card" data-id="${esc(c)}">Son pouvoir</button></div>`).join("")}</div>
      ${forced ? `<p class="hint">Deux loups : tu es obligé d'en prendre un !</p>` : `<button class="btn big" data-act="thief" data-v="-1">Garder ma carte</button><p class="hint">Si tu gardes ta carte, tu joues comme un simple villageois.</p>`}
    </section>`;
}
function witchScreen(r, sec) {
  const W = sec.witch, mine = myAct(r);
  if (mine) return `<p class="note">🧪 C'est fait.${mine.save ? " Tu as utilisé la potion de guérison." : ""}${mine.poison ? ` Tu as empoisonné <b>${esc(pInfo(mine.poison).nick)}</b>.` : ""}</p>${backToSleep()}`;
  const v = W.victim && aliveIds(r).includes(W.victim) ? pInfo(W.victim) : null, D = M.wdraft;
  return `<section class="panel center"><div class="label">🧪 Sorcière, réveille-toi</div>
      ${v ? `${av(v, "xl")}<p class="lead">Les loups ont attaqué <b>${esc(v.nick)}</b>${v.id === M.me ? " (toi !)" : ""}.</p>` : `<p class="lead">Les loups n'ont attaqué personne cette nuit.</p>`}
    </section>
    ${v && W.life ? `<button class="switch" data-act="w-save" aria-pressed="${D.save}"><span class="knob"></span><span><b>Potion de vie</b><br><small>Sauver ${esc(v.nick)}. Tu ne pourras plus le refaire.</small></span></button>` : ""}
    ${W.death ? `<section class="stack"><div class="label">Potion de mort : empoisonner quelqu'un ?</div>
      ${pickGrid(aliveIds(r).filter(id => id !== M.me), { act: "w-poison", on: id => D.poison === id, off: loveOff(sec) })}</section>` : ""}
    ${!W.life && !W.death ? `<p class="hint">Tes deux potions sont utilisées.</p>` : W.life && W.death && v ? `<p class="hint">Une seule potion par nuit : sauver ou empoisonner, pas les deux.</p>` : ""}
    <button class="btn primary big" data-act="send-witch">${D.save ? `Valider : sauver ${esc(v?.nick || "")}` : D.poison ? `Valider : empoisonner ${esc(pInfo(D.poison).nick)}` : "Ne rien faire cette nuit"}</button>`;
}
function newsPanel(r) {
  const n = r.news || {}, out = Object.fromEntries((r.out || []).map(e => [e.uid, e]));
  const deadCards = ids => ids.map(id => { const p = pInfo(id), e = out[id] || {};
    return `<div class="dead">${av(p, "xl")}<div class="name">${esc(p.nick)}</div>${e.cause === "love" ? `<p class="sub">💔 meurt de chagrin</p>` : ""}<p class="sub">était</p>${cardFace(e.role, { size: "sm" })}${willLine(id)}</div>`; }).join("");
  let title, body = "";
  if (n.kind === "night") {
    title = "Le jour se lève";
    body = n.dead?.length ? `<p class="lead">Cette nuit, le village a perdu :</p><div class="deads">${deadCards(n.dead)}</div>` : `<p class="lead">Miracle ! Personne n'est mort cette nuit.</p>`;
    if (n.raven && aliveIds(r).includes(n.raven)) body += `<p class="note">🐦‍⬛ Le Corbeau a désigné <b>${esc(pInfo(n.raven).nick)}</b> : il commencera le vote avec 2 voix contre lui.</p>`;
  } else if (n.kind === "vote") {
    title = "Le verdict du village";
    body = n.dead?.length ? `${n.goat ? `<p class="lead">Égalité : c'est le Bouc émissaire qui paie !</p>` : ""}<div class="deads">${deadCards(n.dead)}</div>` : `<p class="lead">Pas de majorité : personne n'est éliminé aujourd'hui.</p>`;
  } else if (n.kind === "idiot") {
    title = "On ne pend pas un idiot !";
    const p = pInfo(n.uid);
    body = `<div class="dead">${av(p, "xl")}<div class="name">${esc(p.nick)}</div>${cardFace("idiot", { size: "sm" })}</div><p class="lead">Le village l'épargne, mais il ne votera plus.</p>`;
  } else if (n.kind === "shot") {
    title = `${esc(pInfo(n.by).nick)} tire !`;
    body = n.dead?.length ? `<div class="deads">${deadCards(n.dead)}</div>` : `<p class="lead">La flèche se perd dans les bois : personne n'est touché.</p>`;
  } else if (n.kind === "heir") {
    title = "Un nouveau Capitaine";
    body = n.uid ? `<div class="dead">${av(pInfo(n.uid), "xl")}<div class="name">${esc(pInfo(n.uid).nick)}</div></div><p class="lead">${esc(pInfo(n.by).nick)} lui confie la médaille 🎖️</p>` : `<p class="lead">${esc(pInfo(n.by).nick)} emporte la médaille dans sa tombe. Le village élira un nouveau Capitaine.</p>`;
  } else return "";
  return `<section class="panel center news" aria-live="polite"><div class="label">${title}</div>${body}</section>`;
}
function votesMap(r, voters) {
  const ids = new Set(voters), vm = {}, k = `${r.seq}.${r.voteN}`;
  for (const v of M.votes) if (v.key === k && ids.has(v.voter)) vm[v.voter] = v.target;
  const pv = M.pending;
  if (pv && pv.k === `${r.gameId}_${k}` && ids.has(M.me)) vm[M.me] = pv.t;
  return vm;
}
// The Raven's two votes, on today's village vote only.
const ravenOn = r => r.vkind === "lynch" && r.raven && r.raven.day === r.day && aliveIds(r).includes(r.raven.uid) ? r.raven.uid : "";
function voteScreen(r, lead) {
  const mod = lead;
  const al = aliveIds(r), voters = al.filter(id => !(r.idiots || []).includes(id)), k = `${r.seq}.${r.voteN}`, revealed = r.revealed === k;
  const among = r.among?.length ? r.among.filter(id => al.includes(id)) : al;
  const vm = votesMap(r, voters), mine = vm[M.me], mayorVote = r.vkind === "lynch" && r.mayor && voters.includes(r.mayor);
  const weight = v => mayorVote && v === r.mayor ? 2 : 1, rv = ravenOn(r);
  let h = "";
  if (!revealed) {
    const title = r.among?.length ? `Égalité : revote entre ${names(among.map(pInfo))}` : r.vkind === "mayor" ? "Qui doit devenir Capitaine ?" : "Qui est un loup-garou ?";
    if (rv && among.includes(rv)) h += `<p class="note">🐦‍⬛ <b>${esc(pInfo(rv).nick)}</b> commence avec 2 voix contre lui (le Corbeau).</p>`;
    if (voters.includes(M.me)) {
      h += `<section class="stack"><div class="label">${esc(title)}</div>${pickGrid(among.filter(id => id !== M.me), { act: "vote", on: id => id === mine, off: r.vkind === "lynch" ? loveOff(mySecret()) : null })}
        <p class="hint">${mine ? "Tu peux changer d'avis jusqu'à la révélation." : r.vkind === "mayor" ? "Pas de vote pour soi-même : faites campagne à voix haute !" : "Débattez encore si besoin, puis votez."}${mayorVote && r.mayor === M.me ? " Ta voix de Capitaine compte double, et tranche en cas d'égalité." : ""}</p></section>`;
    } else h += `<section class="panel"><div class="label">${esc(title)}</div><p class="lead">${al.includes(M.me) ? "Tu ne votes plus, mais tu peux encore parler." : "Les vivants votent…"}</p></section>`;
    const waiting = voters.filter(id => !vm[id]);
    if (narrator() && Object.keys(vm).length) h += `<section class="panel mj"><div class="label">🎙️ Les votes en direct · toi seul les vois</div><ul class="live">${Object.entries(vm).map(([v, t]) => `<li><b>${esc(pInfo(v).nick)}</b> → <b>${esc(pInfo(t).nick)}</b>${weight(v) > 1 ? " <small>×2</small>" : ""}</li>`).join("")}</ul></section>`;
    h += `<section class="panel"><div class="label">${waiting.length ? `On attend · ${waiting.length}` : "Tout le monde a voté"}</div>
      ${waiting.length ? `<div class="chips">${waiting.map(id => chip(pInfo(id))).join("")}</div>` : ""}
      ${mod ? `<button class="btn ${waiting.length ? "" : "primary"} big" data-act="reveal" ${Object.keys(vm).length ? "" : "disabled"}>Révéler les votes</button>` : ""}</section>`;
    if (!mod && mine) h += waitMod(`${who()} va révéler les votes`);
    return h;
  }
  const t0 = tally(among, vm, weight);
  // The Raven's mark adds two votes against its target.
  if (rv) { const x = t0.rows.find(x => x.id === rv); if (x) { x.n += 2; x.raven = true; } t0.rows.sort((a, b) => b.n - a.n); }
  const rows = t0.rows, max = rows[0]?.n || 0, top = max ? rows.filter(x => x.n === max).map(x => x.id) : [];
  const total = rows.reduce((s, x) => s + x.n, 0), tp = top.map(pInfo);
  // On a tie, the Scapegoat dies in place of the tied players; otherwise the Captain's vote decides.
  const d = M.deal && M.deal.gameId === r.gameId ? M.deal : null;
  const goat = r.vkind === "lynch" && top.length > 1 && d ? al.find(id => d.roles[id] === "scapegoat") || "" : "";
  const capPick = !goat && r.vkind === "lynch" && top.length > 1 && mayorVote && top.includes(vm[r.mayor]) ? vm[r.mayor] : "";
  h += `<section class="panel verdict" aria-live="polite"><div class="label">${capPick ? "Égalité : le Capitaine tranche" : top.length > 1 ? "Égalité !" : top.length ? (r.vkind === "mayor" ? "Le village choisit" : "Le village désigne") : "Aucun vote"}</div>
      <div class="name">${capPick ? esc(pInfo(capPick).nick) : top.length ? esc(names(tp)) : "Personne"}</div>${max ? `<div class="sub">${plural(max, "voix", "voix")} sur ${total}${capPick ? ` · ex-æquo avec ${esc(names(top.filter(id => id !== capPick).map(pInfo)))}` : ""}</div>` : ""}</section>
    <section class="panel"><ul class="res">${rows.map(x => { const p = pInfo(x.id);
      return `<li class="${x.n === max && max ? "win" : ""}">${av(p)}<div class="main"><div class="line"><span class="nm">${esc(p.nick)}${x.raven ? " <small>+2 🐦‍⬛</small>" : ""}</span><span class="n">${x.n}</span></div>
        <div class="bar"><i style="width:${total ? Math.round(x.n / total * 100) : 0}%"></i></div>
        ${x.voters.length ? `<div class="chips">${x.voters.map(v => chip(pInfo(v), weight(v) > 1 ? `<span class="tag">×2</span>` : "")).join("")}</div>` : ""}</div></li>`; }).join("")}</ul></section>`;
  if (!mod) return h + waitMod(`${who()} ${r.vkind === "mayor" ? "proclame le résultat" : "annonce la sentence"}`);
  if (r.vkind === "mayor") {
    if (top.length === 1) return h + `<button class="btn primary big" data-act="elect" data-id="${esc(top[0])}">🎖️ ${esc(tp[0].nick)} devient Capitaine</button>`;
    return h + (top.length > 1 ? `<button class="btn primary big" data-act="revote" data-ids="${esc(top.join(","))}">Revoter entre ${esc(names(tp))}</button><button class="btn big" data-act="draw" data-ids="${esc(top.join(","))}">Tirer au sort</button>` : `<button class="btn big" data-act="revote" data-ids="">Revoter</button>`);
  }
  if (goat) return h + `<button class="btn primary big" data-act="eliminate" data-id="${esc(goat)}" data-goat="1">🐐 Égalité : le Bouc émissaire (${esc(pInfo(goat).nick)}) est éliminé</button>`;
  if (capPick) return h + `<button class="btn primary big" data-act="eliminate" data-id="${esc(capPick)}">Éliminer ${esc(pInfo(capPick).nick)}</button>`;
  if (top.length === 1) return h + `<button class="btn primary big" data-act="eliminate" data-id="${esc(top[0])}">Éliminer ${esc(tp[0].nick)}</button>`;
  return h + `${top.length > 1 ? `<button class="btn primary big" data-act="revote" data-ids="${esc(top.join(","))}">Revoter entre ${esc(names(tp))}</button>` : ""}<button class="btn big" data-act="nobody">Personne n'est éliminé · la nuit tombe</button>`;
}
function dayScreen(r, lead) {
  const mod = lead;
  let h = "";
  if (r.news?.kind === "mayor" && r.mayor) h += `<p class="note">🎖️ <b>${esc(pInfo(r.mayor).nick)}</b> est élu Capitaine ! Sa voix compte double et tranche les égalités.</p>`;
  const rv = r.raven && r.raven.day === r.day && aliveIds(r).includes(r.raven.uid) ? r.raven.uid : "";
  if (rv) h += `<p class="note">🐦‍⬛ <b>${esc(pInfo(rv).nick)}</b> commencera le vote avec 2 voix contre lui (le Corbeau).</p>`;
  const dead = (r.out || []).filter(e => e.when === "N" + r.day || e.when === "J" + r.day);
  if (dead.length) h += `<section class="panel"><div class="label">Morts depuis la nuit</div><div class="chips">${dead.map(e => chip(pInfo(e.uid), roleTag(e.role), "dim")).join("")}</div>${dead.map(e => M.wills[e.uid] ? `<p class="willtext"><b>${esc(pInfo(e.uid).nick)}</b> 📜 « ${esc(M.wills[e.uid])} »</p>` : "").join("")}</section>`;
  if (r.timerEnd) {
    const left = timerLeft(r);
    h += `<section class="panel center timer ${left ? "" : "over"}"><div class="label">${left ? "Temps de débat" : "Temps écoulé !"}</div><div class="clock">${mmss(left)}</div>
      ${mod ? `<button class="link" data-act="more-time">+1 minute</button>` : ""}</section>`;
  }
  h += `<section class="panel"><p class="lead">Débattez à voix haute : qui a l'air louche ? Les morts se taisent !</p>
    ${mod ? `<button class="btn primary big" data-act="to-vote">Passer au vote</button>` : ""}</section>`;
  if (!mod) h += waitMod(`${who()} lancera le vote`);
  return h;
}
// The debate clock stands still during a pause.
const timerLeft = r => Math.max(0, Math.round(((r.timerEnd || 0) - (r.paused ? r.pausedAt || Date.now() : Date.now())) / 1000));
// The players, with the private suspicion notes of this phone, and the absent ones.
function castPanel(r) {
  const al = aliveIds(r), out = r.out || [], canNote = seated() && (r.order || []).includes(M.me), marks = canNote ? notes(r.gameId) : {};
  const aliveChip = id => {
    const p = pInfo(id), mark = marks[id] ? noteTag(marks[id]) : "";
    return canNote && id !== M.me ? `<button class="chip notebtn ${marks[id] || ""}" data-act="note" data-id="${esc(id)}" aria-label="Noter ${esc(p.nick)}">${av(p)}<span class="nm">${esc(p.nick)}</span>${badges(id)}${awayTag(p)}${mark}</button>` : chip(p, mark, id === M.me ? "me" : "");
  };
  return `<section class="panel"><div class="label">En vie · ${al.length}</div>
    <div class="chips">${al.map(aliveChip).join("")}</div>
    ${canNote ? `<p class="hint left">Touche un joueur pour le marquer « suspect » ou « sûr ». Ce carnet n'est visible que sur ton téléphone.</p>` : ""}
    ${out.length ? `<div class="label">Au cimetière · ${out.length}</div><div class="chips">${out.map(o => chip(pInfo(o.uid), roleTag(o.role), "dim")).join("")}</div>` : ""}
  </section>`;
}
const middleLine = (extra, label) => (extra || []).length ? `<p class="hint left">${label} : ${extra.map(x => `<b>${ROLES[x]?.icon || ""} ${roleName(x)}</b>`).join(" · ")}</p>` : "";
// What the narrator says aloud, step by step: [when calling the role, when putting it back to sleep].
const SAY = {
  intro: "Chacun regarde sa carte en secret, sans la montrer. Quand tout le monde est prêt, fais tomber la nuit.",
  fall: "C'est la nuit, tout le village s'endort. Les joueurs ferment les yeux.",
  thief: ["Voleur, réveille-toi. Regarde les deux cartes du centre : tu peux échanger ta carte contre l'une d'elles.", "Voleur, rendors-toi."],
  cupid: ["Cupidon, réveille-toi. Désigne les deux joueurs qui seront amoureux jusqu'à la fin de la partie.", "Cupidon, rendors-toi."],
  lovers: ["Je vais toucher les deux Amoureux… Amoureux, réveillez-vous et reconnaissez-vous, sans vous montrer vos cartes.", "Amoureux, rendormez-vous."],
  wildchild: ["Enfant sauvage, réveille-toi. Désigne le joueur qui sera ton modèle.", "Enfant sauvage, rendors-toi."],
  seer: ["Voyante, réveille-toi. Désigne le joueur dont tu veux connaître la véritable identité.", "Voyante, rendors-toi."],
  fox: ["Renard, réveille-toi. Désigne un joueur : tu sauras s'il y a au moins un loup parmi lui et ses deux voisins.", "Renard, rendors-toi."],
  guard: ["Salvateur, réveille-toi. Désigne le joueur que tu veux protéger cette nuit.", "Salvateur, rendors-toi."],
  wolves: ["Loups-Garous, réveillez-vous. Reconnaissez-vous et désignez votre victime.", "Loups-Garous, rendormez-vous."],
  whitewolf: ["Loup Blanc, réveille-toi. Veux-tu dévorer un loup cette nuit ?", "Loup Blanc, rendors-toi."],
  witch: ["Sorcière, réveille-toi. Voici la victime des Loups-Garous. Veux-tu utiliser ta potion de guérison, ou ta potion d'empoisonnement ? Une seule par nuit.", "Sorcière, rendors-toi."],
  raven: ["Corbeau, réveille-toi. Désigne le joueur qui aura deux voix contre lui au vote de demain.", "Corbeau, rendors-toi."],
  dawn: "C'est le matin, le village se réveille. Tout le monde ouvre les yeux…"
};
const nick = id => esc(pInfo(id).nick);
const roleLabel = ro => `${ROLES[ro]?.icon || ""} ${roleName(ro)}`;
// The phrase for the step the game is at.
function sayNow(r, d) {
  const s = r.nstep, out = Object.fromEntries((r.out || []).map(e => [e.uid, e]));
  const deaths = ids => ids.map(id => `${nick(id)} ${out[id]?.cause === "love" ? "meurt de chagrin" : "est mort"}. Sa carte : ${roleLabel(out[id]?.role)}.${M.wills[id] ? ` Son testament : « ${esc(M.wills[id])} »` : ""}`).join(" ");
  if (r.paused) return "La partie est en pause.";
  if (r.step === "intro") return SAY.intro;
  if (r.step === "night") {
    if (!r.awake) return (r.ni === 0 && s !== "dawn" ? SAY.fall + " " : "") + (s === "dawn" ? SAY.dawn : SAY[s][0]);
    return s === "dawn" ? SAY.dawn : stepDone(r, d, s) || !stepActors(r, d, s).length ? SAY[s][1] : SAY[s][0];
  }
  const n = r.news || {};
  if (r.step === "news") {
    if (n.kind === "night") return `${SAY.dawn} ${n.dead?.length ? deaths(n.dead) : "Cette nuit, personne n'est mort !"}${n.raven ? ` Le Corbeau a désigné ${nick(n.raven)} : il aura deux voix contre lui au vote.` : ""}`;
    if (n.kind === "vote") return n.dead?.length ? `${n.goat ? "Égalité : c'est le Bouc émissaire qui est éliminé. " : `Le village a décidé d'éliminer ${nick(n.dead[0])}. `}${deaths(n.dead)}${r.after === "night" ? " Le village se rendort…" : ""}` : "Personne n'est éliminé aujourd'hui. Le village se rendort…";
    if (n.kind === "idiot") return `${nick(n.uid)} est l'Idiot du village : on ne l'élimine pas, mais il ne votera plus.`;
    if (n.kind === "shot") return n.dead?.length ? `Le Chasseur emporte ${nick(n.dead[0])} avec lui. ${deaths(n.dead)}` : "La flèche du Chasseur se perd dans les bois.";
    if (n.kind === "heir") return n.uid ? `${nick(n.by)} confie la médaille de Capitaine à ${nick(n.uid)}.` : "Le Capitaine emporte sa médaille dans la tombe.";
  }
  if (r.step === "hunter") return `${nick(r.actorUid)}, tu étais le Chasseur : avant de rendre l'âme, désigne quelqu'un à abattre.`;
  if (r.step === "heir") return `${nick(r.actorUid)}, dans ton dernier souffle, désigne ton successeur au poste de Capitaine.`;
  if (r.step === "day") return "Le village débat : qui sont les Loups-Garous ? Les morts ne parlent plus.";
  if (r.step === "vote") return r.vkind === "mayor" ? "Le village doit élire son Capitaine. Qui se présente ? Au signal, chacun vote sur son téléphone." : "Au signal, chacun désigne sur son téléphone la personne à éliminer.";
  return "";
}
// What the role called tonight is doing, live.
function stepInfo(r, d) {
  const s = r.nstep, acts = actMap(r), wv = wolfMap(r), who = stepActors(r, d, s), li = [];
  if (s === "dawn") return `<p class="hint left">Quand tout le monde a ouvert les yeux, appuie : l'appli annonce les morts.</p>`;
  if (!who.length) return `<p class="note">Personne ne joue ce rôle cette nuit (mort, carte au centre ou plus rien à faire). Appelle-le quand même et attends quelques secondes avant de le rendormir : personne ne doit deviner.</p>`;
  const one = (act, done) => { const a = acts[who[0]]; li.push(a ? done(a) : `⏳ ${nick(who[0])} ${act}…`); };
  if (s === "thief") {
    const a = acts[d.thief];
    if (!d.thiefDone) li.push(`${nick(d.thief)} regarde : ${(d.extra || []).map(roleLabel).join(" · ")}`, a ? "➜ a choisi…" : "⏳ réfléchit…");
    else li.push(d.roles[d.thief] !== "thief" ? `${nick(d.thief)} ➜ prend <b>${roleLabel(d.roles[d.thief])}</b>` : `${nick(d.thief)} ➜ garde sa carte`, `Reste au centre : ${(d.extra || []).map(roleLabel).join(" · ")}`);
  }
  if (s === "cupid") one("choisit les amoureux", a => `${nick(who[0])} unit 💞 <b>${esc(names((a.targets || []).map(pInfo)))}</b>`);
  if (s === "lovers") who.forEach(id => li.push(`${acts[id] ? "✅" : "⏳"} ${nick(id)} (${roleLabel(d.roles[id])})`));
  if (s === "wildchild") one("choisit son modèle", a => `${nick(who[0])} prend <b>${nick(a.target)}</b> pour modèle`);
  if (s === "seer") one("choisit", a => `${nick(who[0])} regarde la carte de <b>${nick(a.target)}</b> : ${roleLabel(d.roles[a.target])}`);
  if (s === "fox") one("choisit", a => { const t = foxTrio(r, a.target); return `${nick(who[0])} flaire <b>${esc(names(t.map(pInfo)))}</b> : ${t.some(x => inPack(d, x)) ? "au moins un loup" : "aucun loup (il perd son flair)"}`; });
  if (s === "guard") one("choisit", a => `${nick(who[0])} protège <b>${nick(a.target)}</b>`);
  if (s === "wolves") {
    packAlive(r, d).forEach(id => li.push(`${d.roles[id] === "whitewolf" ? "🐺⚪" : (d.infected || []).includes(id) ? "🧛" : "🐺"} ${nick(id)} ➜ ${wv[id] ? `<b>${nick(wv[id].target)}</b>${wv[id].infect ? " (infection)" : ""}` : "⏳"}`));
    const t = packChoice(r, d, r.night);
    li.push(t ? `✅ La meute est d'accord : <b>${nick(t)}</b>${infectNow(r, d, r.night) ? " — elle sera <b>infectée</b>" : ""}` : "⏳ La meute n'est pas encore d'accord (si tu la rendors ainsi, personne n'est dévoré).");
    girlsAlive(r, d).forEach(id => { const a = acts[id]; li.push(`👧 ${nick(id)} ${!a ? "hésite à espionner…" : a.spy ? "espionne les loups" : "garde les yeux fermés"}${d.girlCaught?.n === r.night ? " — <b>surprise !</b> Elle sera dévorée à la place de la victime." : ""}`); });
  }
  if (s === "whitewolf") one("réfléchit", a => a.target ? `${nick(who[0])} dévore <b>${nick(a.target)}</b>` : `${nick(who[0])} ne dévore personne`);
  if (s === "witch") {
    const a = acts[who[0]], p = d.potions || {}, inf = infectNow(r, d, r.night), v = inf ? "" : nightVictim(r, d, r.night);
    li.push(inf ? `La victime (<b>${nick(inf)}</b>) est infectée : la Sorcière ne voit personne.` : `Victime des loups : <b>${v ? nick(v) : "personne"}</b>`, `Potions : guérison ${p.life ? "✓" : "✗"} · empoisonnement ${p.death ? "✓" : "✗"}`);
    li.push(a ? `${nick(who[0])} ➜ ${[a.save ? "sauve la victime" : "", a.poison ? `empoisonne <b>${nick(a.poison)}</b>` : ""].filter(Boolean).join(" et ") || "ne fait rien"}` : `⏳ ${nick(who[0])} réfléchit…`);
  }
  if (s === "raven") one("choisit", a => a.target ? `${nick(who[0])} désigne <b>${nick(a.target)}</b> (2 voix demain)` : `${nick(who[0])} ne désigne personne`);
  return `<ul class="live">${li.map(x => `<li>${x}</li>`).join("")}</ul>`;
}
// Everything the narrator keeps track of over the game.
function notebook(r, d) {
  const li = [], c = r.comp || {};
  if ((d.extra || []).length) li.push(`🦹 Centre : ${d.extra.map(roleLabel).join(" · ")}${d.thief && d.roles[d.thief] !== "thief" ? ` — ${nick(d.thief)} a pris ${roleLabel(d.roles[d.thief])}` : ""}`);
  if (c.seer) li.push(`🔮 La Voyante a regardé : ${(d.seerLog || []).length ? d.seerLog.map(x => `nuit ${x.n}, <b>${nick(x.uid)}</b> (${roleLabel(x.role)})`).join(" · ") : "personne pour l'instant"}`);
  if (c.fox) li.push(`🦊 Le Renard : ${(d.foxLog || []).length ? d.foxLog.map(x => `nuit ${x.n}, ${esc(names(x.trio.map(pInfo)))} → ${x.wolf ? "loup" : "rien"}`).join(" · ") : "rien pour l'instant"}${d.foxLost ? " (flair perdu)" : ""}`);
  if ((d.lovers || []).length) li.push(`💞 Amoureux : <b>${esc(names(d.lovers.map(pInfo)))}</b>`);
  if (d.model) li.push(`🧒 Modèle de l'Enfant sauvage : <b>${nick(d.model)}</b>`);
  if ((d.infected || []).length) li.push(`🧛 Passés chez les loups : <b>${esc(names(d.infected.map(pInfo)))}</b>`);
  if (c.infect) li.push(`🧛 Infection ${d.infectUsed ? "utilisée" : "pas encore utilisée"}`);
  if (c.witch) li.push(`🧪 Potions : guérison ${d.potions?.life ? "✓" : "utilisée"} · empoisonnement ${d.potions?.death ? "✓" : "utilisée"}`);
  if (c.guard && d.lastGuard) li.push(`🛡️ Protégé la dernière nuit : <b>${nick(d.lastGuard)}</b>`);
  if ((d.spied || []).length) li.push(`👧 La Petite Fille a vu : ${d.spied.map(x => `nuit ${x.n}, <b>${nick(x.uid)}</b>`).join(" · ")}`);
  if (c.elder) li.push(`👴 L'Ancien ${(d.elderLife ?? 1) > 0 ? "n'a pas encore été attaqué" : "a déjà survécu à une attaque"}`);
  if (r.mayor) li.push(`🎖️ Capitaine : <b>${nick(r.mayor)}</b>`);
  const al = aliveIds(r);
  return `<details class="nb" open><summary>📒 Carnet du meneur</summary><ul class="live">${li.map(x => `<li>${x}</li>`).join("")}</ul></details>
    <details class="nb"><summary>🃏 Qui est qui</summary><ul class="cast">${r.order.map(id => { const p = pInfo(id);
      return `<li class="${al.includes(id) ? "" : "dim"}">${av(p)}<span class="who"><b>${esc(p.nick)}${(d.lovers || []).includes(id) ? " 💞" : ""}${r.mayor === id ? " 🎖️" : ""}${(d.infected || []).includes(id) ? " 🧛" : ""}</b><small>${al.includes(id) ? "en vie" : "☠️ mort"}</small></span>${roleTag(d.roles[id])}</li>`; }).join("")}</ul></details>`;
}
// The narrator's control panel: what to say, who is awake, what they do, and the button to move on.
function narratorPanel(r) {
  const d = M.deal;
  if (!d || d.gameId !== r.gameId) return `<section class="panel mj center"><p class="lead">Chargement des coulisses…</p></section>`;
  let h = `<section class="panel mj"><div class="mjtop"><span class="label">🎙️ Panneau du meneur</span>${r.step === "night" ? `<span class="badge-n">Nuit ${r.night}</span>` : ""}</div>`;
  if (r.step === "night") {
    const steps = [...(r.nsteps || []), "dawn"], s = r.nstep, cur = steps.indexOf(s);
    h += `<ol class="steps">${steps.map((x, i) => `<li class="${i < cur ? "past" : i === cur ? "cur" : ""}">${STEP_ICON[x]} ${x === "dawn" ? "Aube" : upper(STEP_NAME[x])}</li>`).join("")}</ol>`;
  }
  const line = sayNow(r, d);
  if (line) h += `<div class="say"><span class="label">📜 À dire</span><p>${line}</p></div>`;
  if (r.step === "night" && !r.paused) {
    const s = r.nstep, name = STEP_NAME[s];
    if (r.awake) h += stepInfo(r, d);
    if (!r.awake) h += `<button class="btn primary big" data-act="wake">${s === "dawn" ? "☀️ Le jour se lève" : `${STEP_ICON[s]} Réveiller ${name}`}</button>`;
    else if (s !== "dawn") {
      const done = stepDone(r, d, s) || !stepActors(r, d, s).length;
      h += `<button class="btn ${done ? "primary" : ""} big" data-act="sleep">😴 Rendormir ${name}${done ? "" : " sans attendre"}</button>`;
    } else h += `<p class="hint">L'appli annonce les morts…</p>`;
  }
  return h + notebook(r, d) + `</section>`;
}
// What this night taught you, for your eyes only.
function nightAlerts(r, sec, n) {
  if (!sec || !aliveIds(r).includes(M.me) && !(r.news?.dead || []).includes(M.me)) return "";
  const a = [], spied = (sec.spied || []).find(s => s.n === n);
  if (sec.role === "girl" && spied) a.push(`👧 Tu as entrevu <b>${esc(pInfo(spied.uid).nick)}</b> : c'est un loup !`);
  if (myPack(sec) && sec.caught?.n === n) a.push(`👧 Vous avez surpris la Petite Fille en train de vous espionner : c'est <b>${esc(pInfo(sec.caught.uid).nick)}</b>. Vous l'avez dévorée à la place de votre victime.`);
  if (sec.infected?.n === n) a.push(`🧛 Cette nuit, les loups t'ont <b>infecté</b> : tu es désormais l'un des leurs. Tu gardes ton pouvoir, et tu te réveilleras avec la meute (${esc(names((sec.wolves || []).filter(id => id !== M.me).map(pInfo)))}).`);
  return a.length ? `<section class="secret-note"><div class="label">Pour toi seul</div>${a.map(x => `<p>${x}</p>`).join("")}</section>` : "";
}
// Always visible to the Wild Child once his model has died.
const wildAlert = sec => sec?.wildTurned ? `<section class="secret-note"><div class="label">Pour toi seul</div><p>🧒 Ton modèle est mort : tu es devenu un <b>Loup-Garou</b>. Ta meute : ${esc(names((sec.wolves || []).filter(id => id !== M.me).map(pInfo)))}.</p></section>` : "";
// Pause: everything waits, the debate clock stops.
function pausePanel(lead) {
  return `<section class="panel center pause"><div class="big">⏸️ Partie en pause</div>
    <p class="lead">Tout est figé, le chrono aussi.</p>
    ${lead ? `<button class="btn primary big" data-act="resume">▶️ Reprendre</button>` : `<p class="hint">${who()} relancera la partie.</p>`}</section>`;
}
function playScreen(r, mod) {
  const order = r.order || [], inGame = order.includes(M.me), alive = aliveIds(r).includes(M.me), sec = mySecret(), lead = canLead();
  let h = banner(r) + takeoverPanel();
  if (inGame) h += myCardPanel(r, sec) + wildAlert(sec);
  else if (narrator()) h += narratorPanel(r);
  else h += `<section class="note">Une partie est en cours. Tu joueras à la prochaine : en attendant, regarde et devine qui ment.</section>`;
  if (r.paused) {
    h += pausePanel(canPause()) + castPanel(r);
    h += `<p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button>${mod ? ` · <button class="link" data-act="end">Arrêter la partie et révéler les cartes</button>` : ""}</p>`;
    return h;
  }
  if (r.step === "intro") {
    const ready = order.filter(id => pInfo(id).ready === r.gameId);
    if (inGame && pInfo(M.me).ready !== r.gameId) h += `<button class="btn primary big" data-act="ready">J'ai vu ma carte</button>`;
    h += `<section class="panel"><div class="label">Ont vu leur carte · ${ready.length}/${order.length}</div><div class="chips">${order.map(id => chip(pInfo(id), "", ready.includes(id) ? "" : "dim")).join("")}</div></section>`;
    h += lead ? `<button class="btn ${ready.length === order.length ? "primary" : ""} big" data-act="nightfall">🌙 La nuit tombe</button>` : waitMod("La nuit va tomber");
  } else if (r.step === "night") {
    // Only the role that is called, once woken, sees its choices; everyone else keeps their eyes shut.
    if (inGame && myTurn(r, sec)) h += nightScreen(r, sec);
    else if (!narrator()) h += sleepCard(inGame && !alive ? "Les morts ne se réveillent plus" : "Ferme les yeux", r.awake && r.nstep !== "dawn" ? `${upper(STEP_NAME[r.nstep] || "")} ${wakes(r.nstep)}` : r.nstep === "dawn" ? "Le jour va se lever" : "Le village dort");
  } else if (r.step === "news") {
    if (r.news?.kind === "night") h += nightAlerts(r, sec, r.news.n);
    h += newsPanel(r);
    h += lead ? `<button class="btn primary big" data-act="continue">${(r.pending || []).length ? "Continuer" : r.after === "day" ? "Continuer" : "🌙 La nuit tombe"}</button>` : waitMod(`${who()} va continuer`);
  } else if (r.step === "hunter" || r.step === "heir") {
    const a = pInfo(r.actorUid), hunter = r.step === "hunter";
    if (r.actorUid === M.me && !myAct(r)) {
      h += pickPanel({ kind: hunter ? "shot" : "heir", title: hunter ? "🏹 Tu es le Chasseur ! Avant de rendre l'âme, sur qui tires-tu ?" : "🎖️ Dans ton dernier souffle, à qui confies-tu la médaille de Capitaine ?", ids: aliveIds(r).filter(id => id !== M.me), off: hunter ? loveOff(sec) : null, go: p => hunter ? `Tirer sur ${esc(p[0].nick)}` : `Nommer ${esc(p[0].nick)}`, wait: "Choisis un joueur" });
    } else h += `<section class="panel center wait">${av(a, "xl")}<div class="label">${esc(a.nick)}</div><div class="big dots">${hunter ? "Le Chasseur vise" : "Le Capitaine choisit son successeur"}</div></section>`;
  } else if (r.step === "day") h += dayScreen(r, lead);
  else if (r.step === "vote") h += voteScreen(r, lead);

  if (inGame && r.step !== "night") h += willPanel(r);
  h += castPanel(r);
  // With a narrator, the night moves on with the narrator's buttons; without one, the moderator can stop waiting.
  if (mod && (r.step === "night" && !narrId() && r.awake || ["hunter", "heir"].includes(r.step))) h += `<p class="foot"><button class="link" data-act="force">Ne plus attendre ${r.step === "night" ? upper(STEP_NAME[r.nstep] || "") : "ce joueur"}</button></p>`;
  if (mod && M.handover) h += `<section class="panel">${handoverBlock()}</section>`;
  h += `<p class="foot">${canPause() ? `<button class="link" data-act="pause">⏸️ Pause</button> · ` : ""}<button class="link" data-act="exit">Retour à l'accueil</button>${mod ? ` · <button class="link" data-act="handover-open">Passer le rôle de modo</button> · <button class="link" data-act="end">Arrêter la partie et révéler les cartes</button>` : ""}</p>`;
  return h;
}
const WIN_TEXT = {
  village: ["Le village gagne !", "Tous les loups-garous ont été éliminés."],
  wolves: ["Les loups gagnent !", "La meute a dévoré le village."],
  love: ["L'amour triomphe !", "Les deux amoureux sont les derniers survivants."],
  angel: ["L'Ange gagne !", "Le village l'a éliminé au premier vote : il monte au ciel, seul vainqueur."],
  white: ["Le Loup Blanc gagne !", "Il a dévoré tout le monde, loups compris : il reste seul."],
  none: ["Village désert", "Plus personne n'est en vie… personne ne gagne."],
  "": ["Partie arrêtée", "Pas de gagnant cette fois."]
};
function roomTitles(r) {
  const res = r.result || {};
  return computeTitles({ ids: r.order || [], roles: res.roles || {}, infected: res.infected || [], out: r.out, winner: res.winner, votes: villageVotes(), nick: id => pInfo(id).nick });
}
// Gages and truths for the losers, each loser choosing on their own phone.
function gagesPanel(r, tv) {
  const res = r.result || {}, s = r.settings || {};
  if (!s.gages || !res.winner || res.winner === "none") return "";
  const losers = (r.order || []).filter(id => res.roles?.[id] && !isWinner(id, res)).map(pInfo);
  if (!losers.length) return "";
  const themes = gageThemes(s), house = r.house || [];
  return `<section class="panel"><div class="label">🎲 Gages des perdants · ${GAGE_THEMES.filter(t => themes.includes(t.id)).map(t => t.name).join(", ")}</div>${losers.map(p => {
    const kind = M.choices.find(c => c.uid === p.id)?.kind;
    if (kind) return `<div class="gage ${kind}"><div class="gk">${esc(p.nick)} · ${kind === "dare" ? "Gage" : "Vérité"}</div><p>${esc(gageText(kind, themes, r.gameId + p.id, house))}</p></div>`;
    if (!tv && p.id === M.me) return `<div class="gage"><div class="gk">À toi de choisir</div>
      <div class="btns"><button class="btn primary" data-act="choose" data-id="dare">Gage</button><button class="btn" data-act="choose" data-id="truth">Vérité</button></div></div>`;
    return `<div class="gage"><div class="gk">${esc(p.nick)}</div><p class="dots">choisit entre gage et vérité</p></div>`;
  }).join("")}</section>`;
}
function endPanels(r, players, tv) {
  const res = r.result || {}, order = r.order || [], [title, sub] = WIN_TEXT[res.winner || ""] || WIN_TEXT[""], titles = roomTitles(r);
  const outBy = Object.fromEntries((r.out || []).map(o => [o.uid, o]));
  const when = e => { const n = e.when.slice(1); return (e.when[0] === "N" ? "Mort la nuit " : "Mort le jour ") + n + (e.cause === "vote" ? " (vote)" : e.cause === "shot" ? " (flèche)" : e.cause === "love" ? " (chagrin)" : ""); };
  const ids = [...new Set(players.map(p => p.id).concat(order))];
  return `<section class="panel verdict win-${esc(res.winner || "none")}" aria-live="polite"><div class="label">Fin de la partie</div><div class="name">${title}</div><div class="sub">${sub}</div></section>
    ${r.news && r.news.kind !== "heir" ? newsPanel(r) : ""}
    <section class="panel"><div class="label">Les cartes</div>
      <ul class="cast">${order.map(id => { const p = pInfo(id), ro = res.roles?.[id], e = outBy[id], t = titles[id];
        return `<li class="${isWinner(id, res) ? "won" : ""}">${av(p)}<span class="who"><b>${esc(p.nick)}${(res.lovers || []).includes(id) ? " 💞" : ""}${r.mayor === id ? " 🎖️" : ""}</b>
          ${t ? `<span class="title">${esc(t.title)}</span>` : ""}
          <small>${e ? when(e) : "Survivant"}${res.thief === id && ro !== "thief" ? " · ex-Voleur 🦹" : ""}${isWinner(id, res) ? " · gagnant" : ""}${t ? " · " + esc(t.why) : ""}</small></span>${ro ? roleTag(ro) : ""}</li>`; }).join("")}</ul>
      ${middleLine(res.extra, "Cartes restées au centre")}
    </section>
    ${recapPanel(r)}
    ${gagesPanel(r, tv)}
    ${statsPanel(r)}
    ${scoresPanel(ids, r.scores)}`;
}
// The stats wait a moment, so that the last votes have reached this phone before the titles are counted.
let recordT = {};
function scheduleRecord(r) {
  const g = r.gameId;
  if (recordT[g]) return;
  recordT[g] = setTimeout(() => { const r2 = M.room; if (r2 && r2.gameId === g && r2.phase === "end") recordGame(r2, roomTitles(r2)); }, 3000);
}
function endScreen(r, players, mod) {
  scheduleRecord(r);
  const h = endPanels(r, players, false) + `<button class="btn big" data-act="share-img">📸 Partager le résultat en image</button>`;
  if (!mod) return h + waitMod("Le modo peut relancer une partie", true) + playersPanel(players, false) + `<p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button> · <button class="link" data-act="leave">Quitter la partie</button></p>`;
  return h + `<button class="btn primary big" data-act="newgame">Nouvelle partie</button>
    <p class="hint">Les joueurs restent au village et gardent leurs points. Tu pourras changer les cartes.</p>${playersPanel(players, true)}
    <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
}

/* ---------- big screen (TV / laptop): watches the game, never plays, never sees a secret card ---------- */
function renderTv() {
  const r = M.room, players = M.players, s = r.settings || {};
  let h = `<header class="top big"><h1 class="logo">Loup-Garou</h1><span class="tops"><span class="badge">Partie ${esc(M.code)}</span></span></header>`;
  if (r.phase === "lobby") {
    const nid = narrId(), n = players.filter(p => p.id !== nid).length, c = compOf(s, n);
    h += `<section class="panel center tvjoin">
      <div class="label">Pour jouer, scanne ou tape le code</div>
      <div class="tvrow"><div class="qr big" data-qr="${esc(inviteLink())}"></div><div><div class="code">${esc(M.code)}</div><p class="lead">${esc(location.host + location.pathname)}</p></div></div>
    </section>
    <section class="panel"><div class="label">Au village · ${players.length}</div><div class="chips">${players.map(p => chip(p)).join("")}</div></section>
    <section class="panel"><div class="label">Les cartes en jeu</div>${n >= MIN_PLAYERS && c.ok ? deckView(compCounts(c), { mayor: s.mayor }) : `<p class="hint left">Il faut au moins ${MIN_PLAYERS} joueurs.</p>`}</section>`;
  } else if (r.phase === "play") {
    h += banner(r);
    if (r.step === "intro") h += sleepCard("Chacun découvre sa carte", "La nuit va tomber");
    else if (r.step === "night") h += sleepCard("Le village dort", r.awake && r.nstep !== "dawn" ? `${STEP_ICON[r.nstep] || ""} ${upper(STEP_NAME[r.nstep] || "")} ${wakes(r.nstep)}` : r.nstep === "dawn" ? "Le jour va se lever" : "Chut…");
    else if (r.step === "news") h += newsPanel(r);
    else if (r.step === "hunter" || r.step === "heir") { const a = pInfo(r.actorUid); h += `<section class="panel center wait">${av(a, "xl")}<div class="label">${esc(a.nick)}</div><div class="big dots">${r.step === "hunter" ? "Le Chasseur vise" : "Le Capitaine choisit son successeur"}</div></section>`; }
    else if (r.step === "day") h += dayScreen(r, false);
    else if (r.step === "vote") h += voteScreen(r, false);
    h += castPanel(r);
  } else h += endPanels(r, players, true);
  return h;
}

/* ---------- share the result as an image ---------- */
async function shareImage(r) {
  const res = r.result || {}, titles = roomTitles(r);
  const ids = [...new Set(M.players.map(p => p.id).concat(r.order || []))];
  const rows = ids.map(id => ({ p: pInfo(id), pts: r.scores?.[id] || 0, role: res.roles?.[id], t: titles[id], won: res.roles?.[id] && isWinner(id, res) })).sort((a, b) => b.pts - a.pts);
  try { await Promise.all([document.fonts.load("60px 'Pirata One'"), document.fonts.load("800 30px 'Alegreya Sans'"), document.fonts.load("500 26px 'Alegreya Sans'")]); } catch {}
  const shown = rows.slice(0, 8), W = 1080, H = 520 + shown.length * 150;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const NIGHT = "#0E1424", CARD = "#18213A", CARD2 = "#222D4B", INK = "#ECE6D6", INK2 = "#A3A8BC", GOLD = "#E9C46A", LINE = "#3A4770";
  const box = (x, y, w, h, rad, fill, stroke) => { g.fillStyle = fill; g.strokeStyle = stroke; g.lineWidth = 4; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, rad) : g.rect(x, y, w, h); g.fill(); g.stroke(); };
  g.fillStyle = NIGHT; g.fillRect(0, 0, W, H);
  // The moon.
  g.fillStyle = GOLD; g.beginPath(); g.arc(W - 150, 130, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = NIGHT; g.beginPath(); g.arc(W - 182, 108, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = GOLD; g.font = "110px 'Pirata One', Georgia, serif"; g.fillText("Loup-Garou", 70, 160);
  const [title] = WIN_TEXT[res.winner || ""] || WIN_TEXT[""];
  g.fillStyle = INK; g.font = "62px 'Pirata One', Georgia, serif"; g.fillText(title, 72, 260);
  g.fillStyle = INK2; g.font = "800 28px 'Alegreya Sans', Arial, sans-serif";
  g.fillText(`${new Date().toLocaleDateString("fr-FR")} · ${plural((r.order || []).length, "joueur")} · ${plural(r.night || 0, "nuit")}`.toUpperCase(), 72, 320);
  shown.forEach((s, i) => {
    const y = 370 + i * 150, top = i === 0;
    box(60, y, W - 120, 128, 26, top ? GOLD : s.won ? CARD2 : CARD, top ? GOLD : LINE);
    const ink = top ? NIGHT : INK;
    g.fillStyle = ink; g.font = "58px 'Pirata One', Georgia, serif"; g.fillText(String(i + 1), 95, y + 84);
    g.fillStyle = safeColor(s.p.color); g.strokeStyle = top ? NIGHT : INK; g.lineWidth = 3; g.beginPath(); g.arc(215, y + 64, 40, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = "42px 'Pirata One', Georgia, serif"; g.textAlign = "center";
    g.fillText((s.p.nick || "?").charAt(0).toUpperCase(), 215, y + 79); g.textAlign = "left";
    g.fillStyle = ink; g.font = "800 40px 'Alegreya Sans', Arial, sans-serif"; g.fillText(s.p.nick, 285, y + 58);
    g.font = "500 28px 'Alegreya Sans', Arial, sans-serif";
    g.fillText(`${s.role ? `${ROLES[s.role]?.icon || ""} ${roleName(s.role)}` : ""}${s.t ? " · " + s.t.title : ""}`.slice(0, 46), 285, y + 100);
    g.textAlign = "right"; g.font = "50px 'Pirata One', Georgia, serif"; g.fillText(`${s.pts} pt${s.pts > 1 ? "s" : ""}`, W - 95, y + 82); g.textAlign = "left";
  });
  g.fillStyle = INK2; g.font = "500 26px 'Alegreya Sans', Arial, sans-serif"; g.fillText(location.host || "Loup-Garou", 72, H - 50);
  const blob = await new Promise(ok => c.toBlob(ok, "image/png"));
  const file = new File([blob], "loup-garou-resultat.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Loup-Garou · le résultat" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
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
function timeOfDay() {
  const r = M.room;
  if (M.mode !== "room" || !r) return "night";
  if (r.phase === "end") return "day";
  if (r.phase !== "play") return "night";
  return ["intro", "night"].includes(r.step) ? "night" : "day";
}
function render() {
  document.body.classList.toggle("tv", M.mode === "room" && M.tv);
  let html;
  if (M.mode === "room") html = renderRoom();
  else if (M.mode === "home") html = renderHome();
  else if (M.mode === "setup") html = renderSetup();
  else if (M.mode === "fatal") html = renderFatal();
  else html = header(true) + `<section class="panel center loading">La lune se lève…</section>`;
  html += sheetHtml();
  if (html !== lastHtml) {
    const a = document.activeElement, fid = a && a.id, ss = a && a.selectionStart, se = a && a.selectionEnd;
    const openDetails = [...app.querySelectorAll("details > summary")].map(s => [s.textContent, s.parentElement.open]);
    const sheetScroll = app.querySelector(".sheet")?.scrollTop || 0;
    app.innerHTML = html;
    lastHtml = html;
    app.querySelectorAll("details > summary").forEach(s => { const o = openDetails.find(x => x[0] === s.textContent); if (o) s.parentElement.open = o[1]; });
    app.querySelectorAll("[data-draft]").forEach(i => { i.value = M.drafts[i.dataset.draft] || ""; });
    if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(ss, se); } catch {} } }
    const sh = app.querySelector(".sheet"); if (sh) sh.scrollTop = sheetScroll;
    fillQR();
  }
  const t = timeOfDay(), root = document.documentElement;
  if (root.dataset.time !== t) { root.dataset.time = t; document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "night" ? "#0E1424" : "#EFE3C8"); }
  root.classList.toggle("locked", !!M.sheet);
  keepAwake(M.mode === "room" && M.room?.phase === "play" && (inRoom() || M.tv));
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
// Leaving the page hides the card; coming back re-announces this player at once.
document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") M.cardShown = false; else heartbeat(); render(); });
window.addEventListener("online", () => heartbeat());
// The debate clock ticks on its own, without redrawing the page.
setInterval(() => {
  const r = M.room, el = app.querySelector(".timer");
  if (M.mode !== "room" || r?.step !== "day" || !r.timerEnd || !el) return;
  const left = timerLeft(r);
  el.querySelector(".clock").textContent = mmss(left);
  if (!left && !el.classList.contains("over")) render();
}, 1000);
let flashT = null, cardT = null;
function flash(msg) { M.flash = msg; render(); clearTimeout(flashT); flashT = setTimeout(() => { M.flash = ""; render(); }, 2200); }
const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

/* ---------- actions ---------- */
async function write(fn) {
  if (M.busy) return;
  M.busy = true; M.err = "";
  try { await fn(); }
  catch (e) {
    const c = e && e.code;
    M.err = c === "permission-denied" ? "Action refusée." : c === "unavailable" ? "Pas de connexion. Vérifie ton réseau et réessaie." : "Ça n'a pas marché (" + (c || e?.message || "erreur") + "). Réessaie.";
  }
  M.busy = false; render();
}
const needNick = () => {
  const nick = cleanText(M.drafts.nick, 18);
  if (!nick) { M.err = "Entre d'abord ton prénom."; render(); document.getElementById("nick")?.focus(); return ""; }
  store.set("nick", nick);
  return nick;
};
const modOnly = fn => d => { if (isMod()) fn(d); };
const leadOnly = fn => d => { if (canLead()) fn(d); };
const canPauseOnly = fn => d => { if (canPause()) fn(d); };
// Players who get a card: everyone seated but the narrator.
const cardIds = () => M.players.map(p => p.id).filter(id => id !== narrId());
const needDeal = () => {
  const r = M.room, d = M.deal;
  if (d && r && d.gameId === r.gameId) return d;
  M.err = "Les cartes ne sont pas encore chargées. Réessaie dans une seconde."; render(); return null;
};
// Any change by hand turns the suggested line-up into a custom one.
const manual = () => { const r = M.room, c = compOf(r.settings, cardIds().length); return { ...r.settings, auto: false, wolves: c.wolves, specials: c.specials }; };
function sendAct(data) {
  const r = M.room;
  if (!r || r.phase !== "play") return;
  const g = r.gameId, key = r.seq, night = r.night || 0;
  M.localAct = { gameId: g, key, night, uid: M.me, ...data };
  render();
  write(() => F.setDoc(rAct(M.code, `${g}_${key}_${M.me}`), { gameId: g, key, night, uid: M.me, at: Date.now(), ...data }));
}
const ACT = {
  "create": () => {
    const nick = needNick(); if (!nick) return;
    write(async () => {
      let code = genCode();
      for (let i = 0; i < 6 && (await F.getDoc(rRoom(code))).exists(); i++) code = genCode();
      await F.setDoc(rRoom(code), { ...freshRoom(), hostUid: M.me, createdAt: Date.now(), touchedAt: F.serverTimestamp() });
      await F.setDoc(rPlayer(code, M.me), { nick, color: profile().color || COLORS[0], joinedAt: Date.now(), mod: true });
      rememberHosted(code);
      enterRoom(code);
    });
  },
  "exit": () => exitRoom(),
  "rejoin": d => { M.drafts.code = normCode(d.code); FORM["join-code"](); },
  "leave": () => { const code = M.code; write(async () => { await F.deleteDoc(rPlayer(code, M.me)); exitRoom(); }); },
  "share": () => { navigator.share({ title: "Loup-Garou", text: `Rejoins le village ${M.code} !`, url: inviteLink() }).catch(() => {}); },
  "copy": () => copy(inviteLink(), "Lien d'invitation copié."),
  "copy-tv": () => copy(tvLink(), "Lien grand écran copié."),
  "toggle-qr": () => { M.showQR = !M.showQR; render(); },
  "handover-open": () => { M.handover = true; render(); },
  "handover-cancel": () => { M.handover = false; render(); },
  "handover": modOnly(d => {
    const p = M.players.find(x => x.id === d.id); if (!p) return;
    M.handover = false;
    write(async () => { await patchRoom({ hostUid: d.id }); flash(`${p.nick} est le nouveau modo.`); });
  }),
  "gages": modOnly(() => write(() => patchRoom({ settings: { ...M.room.settings, gages: !M.room.settings?.gages } }))),
  "gage-theme": modOnly(d => {
    const s = M.room.settings || {}, id = +d.id, cur = gageThemes(s);
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id].sort((a, b) => a - b);
    if (next.length) write(() => patchRoom({ settings: { ...s, gageThemes: next } }));
  }),
  "gkind": d => { M.drafts.gkind = d.v === "truth" ? "truth" : "dare"; render(); },
  "approve-custom": modOnly(d => write(() => F.updateDoc(rCustom(M.code, d.id), { ok: true }))),
  "del-custom": d => write(() => F.deleteDoc(rCustom(M.code, d.id))),
  "choose": d => {
    const r = M.room; if (!r || r.phase !== "end" || !(r.order || []).includes(M.me)) return;
    write(() => F.setDoc(rChoice(M.code, `${r.gameId}_${M.me}`), { gameId: r.gameId, uid: M.me, kind: d.id === "truth" ? "truth" : "dare" }), "Ce choix n'est plus possible.");
  },
  "pick-color": d => { const p = profile(); p.color = COLORS.includes(d.id) ? d.id : null; saveProfile(p); render(); },
  "install": async () => { const e = M.installEvt; M.installEvt = null; render(); if (e) { e.prompt(); try { await e.userChoice; } catch {} } },
  "share-img": () => { const r = M.room; if (r) shareImage(r).catch(() => flash("Impossible de créer l'image.")); },
  "cards": () => { M.sheet = { type: "cards" }; render(); app.querySelector(".sheet")?.scrollTo(0, 0); },
  "card": d => { if (!ROLES[d.id] && !EXTRA[d.id]) return; M.sheet = { type: "card", id: d.id, from: M.sheet?.type === "cards" ? "cards" : "" }; render(); app.querySelector(".sheet")?.scrollTo(0, 0); },
  "sheet-close": () => { M.sheet = null; render(); },
  "flip": () => {
    M.cardShown = !M.cardShown; clearTimeout(cardT);
    if (M.cardShown) cardT = setTimeout(() => { M.cardShown = false; render(); }, CARD_SHOW_MS);
    render();
  },
  "narrator": modOnly(d => {
    const r = M.room;
    if (r.phase === "play") return;
    const id = d.id && M.players.some(p => p.id === d.id) && d.id !== narrId() ? d.id : "";
    write(() => patchRoom({ narrator: id }));
  }),
  "auto": modOnly(() => { const s = M.room.settings || {}; write(() => patchRoom({ settings: s.auto !== false ? manual() : { ...s, auto: true } })); }),
  "wolf-minus": modOnly(() => { const s = manual(); s.wolves = Math.max(1, s.wolves - 1); write(() => patchRoom({ settings: s })); }),
  "wolf-plus": modOnly(() => { const s = manual(); s.wolves = Math.min(maxWolves(Math.max(cardIds().length, MIN_PLAYERS)), s.wolves + 1); write(() => patchRoom({ settings: s })); }),
  "spec": modOnly(d => { const s = manual(); s.specials = s.specials.includes(d.id) ? s.specials.filter(x => x !== d.id) : SPECIALS.filter(x => s.specials.includes(x) || x === d.id); write(() => patchRoom({ settings: s })); }),
  "mayor": modOnly(() => write(() => patchRoom({ settings: { ...M.room.settings, mayor: !M.room.settings?.mayor } }))),
  "timer": modOnly(d => write(() => patchRoom({ settings: { ...M.room.settings, timer: +d.v || 0 } }))),
  "start": modOnly(() => {
    const r = M.room, ids = cardIds(), c = compOf(r.settings, ids.length);
    if (!c.ok) return;
    const { roles, extra } = dealCards(shuffle(ids), c);
    const thief = ids.find(id => roles[id] === "thief") || "";
    const pack = ids.filter(id => WOLF_ROLES.includes(roles[id])), gameId = rid();
    const cast = Object.fromEntries(M.players.map(p => [p.id, { nick: p.nick, color: safeColor(p.color) }]));
    M.pending = null; M.cardShown = false;
    write(async () => {
      const b = F.writeBatch(DB);
      b.set(rDeal(M.code), { gameId, roles, extra, thief, lovers: [], potions: { life: true, death: true }, elderLife: 1, seen: {}, seerLog: [], spied: [], girlCaught: null, thiefDone: false, lastGuard: "", guarded: "", guardNight: 0, wolfTarget: "" });
      for (const id of ids) {
        const s = { gameId, role: roles[id] };
        if (WOLF_ROLES.includes(roles[id])) s.wolves = pack;
        if (roles[id] === "witch") s.potions = { life: true, death: true };
        if (roles[id] === "thief") s.extra = extra;
        b.set(rSecret(M.code, id), s);
      }
      // The accepted house gages are copied into the game, so every phone draws the same gage at the end.
      const house = r.settings?.gages ? okCustoms().map(x => ({ kind: x.kind, text: x.text })) : [];
      b.update(rRoom(M.code), { ...freshGame(), gameId, phase: "play", narrator: narrId(), order: shuffle(ids), cast, comp: compCounts(c), step: "intro", seq: 1, house, touchedAt: F.serverTimestamp() });
      await b.commit();
      scrollTop();
    });
  }),
  "ready": () => { const r = M.room; if (r && seated()) write(() => F.updateDoc(rPlayer(M.code, M.me), { ready: r.gameId, mod: isMod() })); },
  // The first night opens with the preparation turn: the Thief, if he is in the game.
  "nightfall": leadOnly(() => { const r = M.room; write(async () => { await patchRoom(nightPatch(r)); scrollTop(); }); }),
  // The narrator wakes the role that is called, then puts it back to sleep before calling the next one.
  "wake": leadOnly(() => { const r = M.room; if (r?.step === "night" && !r.awake) write(() => patchRoom({ awake: true })); }),
  "sleep": leadOnly(() => { const r = M.room; if (r?.step === "night" && r.awake && r.nstep !== "dawn") write(() => patchRoom(sleepPatch(r))); }),
  "thief": d => sendAct({ kind: "thief", pick: +d.v }),
  "lovers-ok": () => sendAct({ kind: "lovers" }),
  "pick": d => { M.sel = M.sel === d.id ? "" : d.id; render(); },
  "pick-multi": d => { M.multi = M.multi.includes(d.id) ? M.multi.filter(x => x !== d.id) : M.multi.concat(d.id).slice(-2); render(); },
  "send-act": d => {
    if (d.kind === "cupid") { if (M.multi.length === 2) sendAct({ kind: "cupid", targets: M.multi.slice() }); }
    else if (M.sel) sendAct({ kind: d.kind, target: M.sel });
  },
  "send-none": d => sendAct({ kind: d.kind, target: "" }),
  "girl": d => sendAct({ kind: "girl", spy: d.v === "1" }),
  "wolf": d => sendWolf(d.id, null),
  // The Infect Father switches his vote between "devour" and "infect".
  "infect": () => { const r = M.room, cur = r && (wolfMap(r)[M.me] || (M.localAct?.kind === "wolf" && M.localAct.key === r.seq ? M.localAct : null)); if (cur?.target) sendWolf(cur.target, !cur.infect); },
  "w-save": () => { M.wdraft.save = !M.wdraft.save; if (M.wdraft.save) M.wdraft.poison = ""; render(); },
  "w-poison": d => { M.wdraft.poison = M.wdraft.poison === d.id ? "" : d.id; if (M.wdraft.poison) M.wdraft.save = false; render(); },
  "send-witch": () => { const w = M.wdraft; sendAct({ kind: "witch", save: !!w.save, poison: w.save ? "" : w.poison || "" }); },
  "force": modOnly(() => { if (confirm("Continuer sans attendre ? Ceux qui n'ont pas joué ne feront rien.")) write(forceStep); }),
  "continue": leadOnly(() => { const d = needDeal(); if (d) write(async () => { await patchRoom(nextPatch(M.room, d)); scrollTop(); }); }),
  "more-time": leadOnly(() => { const r = M.room; write(() => patchRoom({ timerEnd: Math.max(Date.now(), r.timerEnd || 0) + 60000 })); }),
  "to-vote": leadOnly(() => { M.pending = null; write(async () => { await patchRoom(votePatch(M.room, "lynch")); scrollTop(); }); }),
  "vote": d => {
    const r = M.room; if (!r || r.step !== "vote" || d.id === M.me) return;
    const k = `${r.seq}.${r.voteN}`; if (r.revealed === k) return;
    M.pending = { k: `${r.gameId}_${k}`, t: d.id }; render();
    write(() => F.setDoc(rVote(M.code, `${r.gameId}_${k}_${M.me}`), { gameId: r.gameId, key: k, vk: r.vkind || "lynch", day: r.day || 0, voter: M.me, target: d.id, at: Date.now() }), "Trop tard, les votes sont déjà révélés.");
  },
  "reveal": leadOnly(() => { const r = M.room; write(() => patchRoom({ revealed: `${r.seq}.${r.voteN}` })); }),
  "revote": leadOnly(d => { const r = M.room; M.pending = null; write(() => patchRoom({ voteN: r.voteN + 1, among: d.ids ? String(d.ids).split(",") : [], revealed: "" })); }),
  "elect": leadOnly(d => { const r = M.room; write(async () => { await patchRoom({ mayor: d.id, mayorLog: [...(r.mayorLog || []), { day: r.day, uid: d.id, how: d.how || "vote" }], ...dayPatch(r), news: { kind: "mayor", uid: d.id } }); scrollTop(); }); }),
  "draw": leadOnly(d => ACT.elect({ id: pickOne(String(d.ids).split(",")), how: "draw" })),
  "eliminate": leadOnly(dt => {
    const r = M.room, d = needDeal(), id = dt.id;
    if (!d || !aliveIds(r).includes(id)) return;
    let p;
    if (d.roles[id] === "idiot" && !(r.idiots || []).includes(id)) p = { idiots: [...(r.idiots || []), id], step: "news", seq: r.seq + 1, after: "night", news: { kind: "idiot", uid: id } };
    else {
      const k = killChain(r, d, [{ uid: id, cause: "vote" }], "J" + r.day);
      p = { outIds: k.outIds, out: k.out, pending: k.pending, step: "news", seq: r.seq + 1, after: "night", news: { kind: "vote", dead: k.dead, goat: dt.goat === "1" } };
      // The Angel wins alone if the very first vote sends him away.
      if (d.roles[id] === "angel" && r.day === 1 && !angelOver(r)) p = { ...p, ...endPatch({ ...r, ...p }, d, "angel") };
      else p = settle(r, d, p);
    }
    write(async () => { await patchRoom(p); scrollTop(); });
  }),
  "nobody": leadOnly(() => { const r = M.room; write(async () => { await patchRoom({ step: "news", seq: r.seq + 1, after: "night", news: { kind: "vote", dead: [] } }); scrollTop(); }); }),
  "end": modOnly(() => { if (confirm("Arrêter la partie et révéler les cartes de tout le monde ?")) { const d = M.deal; write(() => patchRoom({ ...endPatch(M.room, d && d.gameId === M.room.gameId ? d : null, ""), news: null })); } }),
  "newgame": modOnly(() => {
    const old = M.room?.gameId, code = M.code;
    M.pending = null;
    write(async () => {
      await patchRoom({ ...freshGame(), mayor: "" });
      if (!old) return;
      try {
        for (const col of [cActs, cWolves, cVotes, cChoices, cWills]) {
          const q = await F.getDocs(F.query(col(code), F.where("gameId", "==", old)));
          for (const d of q.docs) await F.deleteDoc(d.ref);
        }
      } catch {}
    });
  }),
  "kick": modOnly(d => {
    if (M.room?.phase === "play") return;
    write(async () => { await F.deleteDoc(rPlayer(M.code, d.id)); if (M.room?.narrator === d.id) await patchRoom({ narrator: "" }); });
  }),
  "rename-open": () => {
    M.renaming = true; M.drafts.rename = M.players.find(p => p.id === M.me)?.nick || "";
    render();
    const i = document.getElementById("rename"); if (i) { i.focus(); i.select(); }
  },
  "rename-cancel": () => { M.renaming = false; render(); },
  "reload": () => location.reload(),
  "note": d => { const r = M.room; if (r) { cycleNote(r.gameId, d.id); render(); } },
  // Pause: the automatic steps wait, and the debate clock stands still.
  "pause": canPauseOnly(() => write(() => patchRoom({ paused: true, pausedAt: Date.now() }))),
  "resume": canPauseOnly(() => {
    const r = M.room, lost = Date.now() - (r.pausedAt || Date.now());
    write(() => patchRoom({ paused: false, pausedAt: 0, ...(r.timerEnd ? { timerEnd: r.timerEnd + lost } : {}) }));
  }),
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
  "narrator-app": modOnly(() => write(() => patchRoom({ narrator: "" }))),
  "comp-load": modOnly(d => {
    const c = savedComps()[+d.id]; if (!c) return;
    const pick = Object.fromEntries(COMP_KEYS.filter(k => k in c.settings).map(k => [k, c.settings[k]]));
    write(async () => { await patchRoom({ settings: { ...M.room.settings, ...pick, auto: false } }); flash(`Composition « ${c.name} » chargée.`); });
  }),
  "comp-del": d => { const list = savedComps(); list.splice(+d.id, 1); store.set("comps", JSON.stringify(list)); render(); }
};
// The wolf vote, with the Infect Father's choice to infect rather than devour.
function sendWolf(target, infect) {
  const r = M.room; if (!r || r.step !== "night" || r.nstep !== "wolves" || !r.awake) return;
  const g = r.gameId, key = r.seq, night = r.night, sec = mySecret();
  const prev = wolfMap(r)[M.me] || (M.localAct?.kind === "wolf" && M.localAct.key === r.seq ? M.localAct : null);
  const inf = sec?.role === "infect" && !sec.infectUsed ? (infect == null ? !!prev?.infect : infect) : false;
  M.localAct = { gameId: g, key, night, uid: M.me, kind: "wolf", target, infect: inf }; render();
  write(() => F.setDoc(rWolf(M.code, `${g}_${key}_${M.me}`), { gameId: g, key, night, uid: M.me, target, infect: inf, at: Date.now() }));
}
const FORM = {
  "join-code": () => {
    const nick = needNick(); if (!nick) return;
    const code = normCode(M.drafts.code);
    if (code.length !== 4) { M.err = "Le code fait 4 caractères."; render(); return; }
    write(async () => {
      const s = await F.getDoc(rRoom(code));
      if (!s.exists()) { M.err = `Aucune partie avec le code ${code}.`; if (store.get("last") === code) store.set("last", null); return; }
      await joinRoom(code, nick);
      enterRoom(code);
    });
  },
  "join-room": () => { const nick = needNick(); if (nick) write(() => joinRoom(M.code, nick)); },
  "rename": () => {
    const nick = cleanText(M.drafts.rename, 18);
    if (!nick) return;
    M.renaming = false; store.set("nick", nick); M.drafts.nick = nick;
    write(() => F.updateDoc(rPlayer(M.code, M.me), { nick, mod: isMod() }));
  },
  "custom": () => {
    const text = cleanText(M.drafts.gtext, 140), kind = M.drafts.gkind === "truth" ? "truth" : "dare";
    if (text.length < 3) { M.err = "Écris ton gage ou ta vérité (au moins 3 caractères)."; render(); return; }
    M.drafts.gtext = "";
    write(() => F.addDoc(cCustom(M.code), { kind, text, by: M.me, at: Date.now(), ok: isMod() }), "Impossible d'ajouter ce gage.");
    setTimeout(() => document.getElementById("gtext")?.focus(), 0);
  },
  "will": () => {
    const r = M.room, text = cleanText(M.drafts.will, 200);
    if (!r || r.phase !== "play" || !aliveIds(r).includes(M.me)) return;
    const ref = rWill(M.code, `${r.gameId}_${M.me}`);
    M.drafts.will = "";
    write(() => text ? F.setDoc(ref, { gameId: r.gameId, uid: M.me, text, at: Date.now() }) : F.deleteDoc(ref), "Impossible d'enregistrer ton testament.");
  },
  "comp-save": () => {
    const name = cleanText(M.drafts.compname, 30);
    if (!name) { M.err = "Donne un nom à ta composition."; render(); return; }
    const s = manual(), settings = Object.fromEntries(COMP_KEYS.map(k => [k, s[k] ?? M.room.settings?.[k]]));
    const list = savedComps().filter(c => c.name !== name).concat({ name, settings }).slice(-12);
    store.set("comps", JSON.stringify(list)); M.drafts.compname = ""; flash(`Composition « ${name} » enregistrée.`);
  }
};
const copy = (text, msg) => navigator.clipboard?.writeText(text).then(() => flash(msg), () => flash(text)) ?? flash(text);
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled || !app.contains(b)) return;
  const fn = ACT[b.dataset.act];
  if (fn) { e.preventDefault(); fn(b.dataset); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && M.sheet) { M.sheet = null; render(); } });
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
if ("serviceWorker" in navigator && !window.LG_FB) navigator.serviceWorker.register("sw.js").catch(() => {});

/* ---------- boot ---------- */
const isPlaceholder = () => !firebaseConfig.apiKey || /COLLE/.test(firebaseConfig.apiKey);
async function boot() {
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
  setTimeout(() => cleanupOldRooms().catch(() => {}), 8000);
  const target = hashCode() || store.get("room");
  // A big-screen link opens straight on the game, without joining it.
  if (target && hashIsTv()) { enterRoom(target, true); return; }
  // Back to the village after a reload, or straight in when the link carries a code you already joined.
  if (target) {
    try {
      const r = await F.getDoc(rRoom(target)), p = await F.getDoc(rPlayer(target, M.me));
      if (r.exists() && (p.exists() || r.data().hostUid === M.me)) { enterRoom(target); return; }
      if (!r.exists()) { store.set("room", null); if (hashCode()) M.err = `Aucune partie avec le code ${target}.`; }
    } catch {}
  }
  M.mode = "home"; render();
}
boot();
