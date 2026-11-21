import { firebaseConfig } from "./config.js";
import { GAGES } from "./gages.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const ROOT = "pkRooms";
const STACKS = [500, 1000, 2000, 5000];
const BLIND_UPS = [0, 5, 10];
const TIMERS = [0, 30, 45, 60];
const GAGE_LEVELS = ["Soft", "Épicé", "Hot", "Extrême"];
const MIN_PLAYERS = 2, MAX_PLAYERS = 10, SIPS = 2, NEXT_MS = 15000;
const COLORS = ["#D93A26","#2F62D0","#18825A","#7C47CC","#B86400","#C2307C","#0F7C8F","#5E5C17","#8C3B1F","#3D4A63"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const K = "pkr";
const ROOM_MAX_IDLE_MS = 24 * 3600 * 1000;

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
const pct = x => (x > 0 && x < .01 ? "moins de 1" : x < 1 && x > .99 ? "99" : Math.round(x * 100)) + " %";
const fmt = n => Math.round(+n || 0).toLocaleString("fr-FR");
const sum = o => Object.values(o || {}).reduce((s, x) => s + (+x || 0), 0);
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const clone = o => JSON.parse(JSON.stringify(o));

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
const newDeck = () => shuffle(Array.from({ length: 52 }, (_, i) => i));
const C = (r, s) => s * 13 + r;

/* Hand strength as one number: the category (high card … straight flush) times 13^5, then up to five ranks that break ties. */
const B5 = 13 ** 5;
const score = (cat, ks) => ks.slice(0, 5).reduce((s, k, i) => s + k * 13 ** (4 - i), cat * B5);
function topStraight(mask) {
  for (let t = 12; t >= 4; t--) if ((mask >> (t - 4) & 31) === 31) return t;
  // The wheel: A 2 3 4 5, five high.
  return (mask & 0x100F) === 0x100F ? 3 : -1;
}
/* The best five cards out of up to seven. */
function evalHand(cards) {
  const cnt = Array(13).fill(0), suits = [[], [], [], []];
  let mask = 0;
  for (const c of cards) { cnt[rk(c)]++; suits[st(c)].push(rk(c)); mask |= 1 << rk(c); }
  const fl = suits.find(s => s.length >= 5);
  if (fl) {
    const sf = topStraight(fl.reduce((m, r) => m | 1 << r, 0));
    if (sf >= 0) return score(8, [sf]);
  }
  const quads = [], trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) { if (cnt[r] === 4) quads.push(r); else if (cnt[r] === 3) trips.push(r); else if (cnt[r] === 2) pairs.push(r); }
  const kick = (skip, n) => { const ks = []; for (let r = 12; r >= 0 && ks.length < n; r--) if (cnt[r] && !skip.includes(r)) ks.push(r); return ks; };
  if (quads.length) return score(7, [quads[0], ...kick([quads[0]], 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) return score(6, [trips[0], Math.max(trips[1] ?? -1, pairs[0] ?? -1)]);
  if (fl) return score(5, fl.sort((a, b) => b - a));
  const s = topStraight(mask);
  if (s >= 0) return score(4, [s]);
  if (trips.length) return score(3, [trips[0], ...kick([trips[0]], 2)]);
  if (pairs.length >= 2) return score(2, [pairs[0], pairs[1], ...kick([pairs[0], pairs[1]], 1)]);
  if (pairs.length) return score(1, [pairs[0], ...kick([pairs[0]], 3)]);
  return score(0, kick([], 5));
}
const catOf = sc => Math.floor(sc / B5);
const digit = (sc, i) => Math.floor(sc / 13 ** (4 - i)) % 13;
const deR = r => (r === 12 ? "d'" : "de ") + R_PL[r];
function handName(sc) {
  const k = i => digit(sc, i);
  switch (catOf(sc)) {
    case 0: return "Hauteur " + R_ONE[k(0)];
    case 1: return "Paire " + deR(k(0));
    case 2: return `Double paire, ${R_PL[k(0)]} et ${R_PL[k(1)]}`;
    case 3: return "Brelan " + deR(k(0));
    case 4: return "Quinte hauteur " + R_ONE[k(0)];
    case 5: return "Couleur hauteur " + R_ONE[k(0)];
    case 6: return `Full aux ${R_PL[k(0)]} par les ${R_PL[k(1)]}`;
    case 7: return "Carré " + deR(k(0));
    default: return k(0) === 12 ? "Quinte flush royale" : "Quinte flush hauteur " + R_ONE[k(0)];
  }
}
/* "avec une paire de rois", "avec un full aux as par les 7" */
function withHand(sc) {
  const c = catOf(sc), n = handName(sc);
  if (!c) return "une simple " + n.toLowerCase();
  return ["", "une ", "une ", "un ", "une ", "une ", "un ", "un ", "une "][c] + n.charAt(0).toLowerCase() + n.slice(1);
}
function combos(arr, k) {
  const out = [];
  const rec = (s, cur) => { if (cur.length === k) { out.push(cur); return; } for (let i = s; i < arr.length; i++) rec(i + 1, [...cur, arr[i]]); };
  rec(0, []);
  return out;
}
/* The five cards that make the hand, to light them up at the showdown. */
function best5(cards) {
  if (cards.length <= 5) return cards;
  let best = -1, pickd = [];
  for (const f of combos(cards, 5)) { const s = evalHand(f); if (s > best) { best = s; pickd = f; } }
  return pickd;
}
/* Chances to win, by dealing the unknown cards many times over: the opponents' hands and the board still to come. */
const EQ = new Map();
function equity(hole, board, nOpp, iters = 1500) {
  if (nOpp < 1) return 1;
  const key = `${hole}|${board}|${nOpp}`;
  if (EQ.has(key)) return EQ.get(key);
  const used = new Set([...hole, ...board]), rest = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
  const need = 5 - board.length, take = need + nOpp * 2;
  let win = 0;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < take; i++) { const j = i + Math.floor(Math.random() * (rest.length - i)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const b = board.concat(rest.slice(0, need)), me = evalHand(hole.concat(b));
    let best = -1, ties = 0;
    for (let o = 0; o < nOpp; o++) {
      const s = evalHand([rest[need + o * 2], rest[need + o * 2 + 1], ...b]);
      if (s > best) { best = s; ties = 1; } else if (s === best) ties++;
    }
    if (me > best) win++; else if (me === best) win += 1 / (ties + 1);
  }
  const x = win / iters;
  if (EQ.size > 200) EQ.clear();
  EQ.set(key, x);
  return x;
}

/* ---------- the table: blinds, bets and pots ----------
   A hand lives in a plain object S (the room's fields online, the game itself on one phone):
   order (seats), stacks, button, inHand (dealt this hand), folded, bets (this street), contrib (this hand),
   betTo (the bet to match), lastRaise (the smallest raise allowed), acted (who spoke since the last raise),
   street (0 pre-flop, 1 flop, 2 turn, 3 river), board, turnUid, log.
   D is the deal, which only the dealer knows: { holes: { uid: [c, c] }, board: [the five cards to come] }. */
const STREET_CARDS = [0, 3, 4, 5];
const STREETS = ["Pré-flop", "Flop", "Turn", "River"];
/* Each level is a small and big blind, in hundredths of the starting stack. */
const LEVELS = [[1, 2], [2, 4], [3, 6], [5, 10], [8, 16], [10, 20], [15, 30], [20, 40], [30, 60], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400]];
function blindsFor(start, lvl) {
  const u = (start || 1000) / 100, l = LEVELS[Math.min(lvl, LEVELS.length - 1)];
  return { sb: l[0] * u, bb: l[1] * u, lvl };
}
const liveIds = S => (S.inHand || []).filter(id => !(S.folded || []).includes(id));
const actIds = S => liveIds(S).filter(id => (S.stacks[id] || 0) > 0);
function nextFrom(order, from, ok) {
  const n = order.length, i = order.indexOf(from);
  for (let k = 1; k <= n; k++) { const id = order[((i + k) % n + n) % n]; if (ok(id)) return id; }
  return "";
}
/* Seats from the first one after the button: odd chips of a split pot go there first. */
function fromButton(S) {
  const i = S.order.indexOf(S.button);
  return [...S.order.slice(i + 1), ...S.order.slice(0, i + 1)];
}
function put(S, id, x) {
  S.stacks[id] -= x;
  S.bets[id] = (S.bets[id] || 0) + x;
  S.contrib[id] = (S.contrib[id] || 0) + x;
}
/* The button moves on, the two seats after it post the blinds. Heads-up, the button is the small blind and speaks first before the flop. */
function beginHand(S, ids, blinds, D) {
  const inn = id => ids.includes(id);
  Object.assign(S, { inHand: ids, folded: [], bets: {}, contrib: {}, acted: [], street: 0, board: [], step: "bet", res: null, entry: null, bb: blinds.bb });
  S.button = nextFrom(S.order, S.button, inn);
  S.sbId = ids.length === 2 ? S.button : nextFrom(S.order, S.button, inn);
  S.bbId = nextFrom(S.order, S.sbId, inn);
  const sb = Math.min(blinds.sb, S.stacks[S.sbId]); put(S, S.sbId, sb);
  const bb = Math.min(blinds.bb, S.stacks[S.bbId]); put(S, S.bbId, bb);
  S.betTo = blinds.bb; S.lastRaise = blinds.bb;
  S.log = [{ u: S.sbId, k: "sb", a: sb }, { u: S.bbId, k: "bb", a: bb }];
  progress(S, D, S.bbId);
}
/* After each action: the next player who still owes something, or the next street, or the showdown. */
function progress(S, D, from) {
  const live = liveIds(S);
  if (live.length < 2) return finish(S, D);
  const A = actIds(S);
  const pending = A.filter(id => !S.acted.includes(id) || (S.bets[id] || 0) < S.betTo);
  const settled = !pending.length || (A.length === 1 && (S.bets[A[0]] || 0) >= S.betTo);
  if (!settled) { S.turnUid = nextFrom(S.order, from, id => pending.includes(id)); return; }
  S.bets = {}; S.betTo = 0; S.lastRaise = S.bb; S.acted = [];
  // Nobody left to bet against (everyone else is all-in): the board is dealt to the end.
  if (S.street >= 3 || A.length < 2) { S.street = 3; S.board = D.board.slice(0, 5); return finish(S, D); }
  S.street++;
  S.board = D.board.slice(0, STREET_CARDS[S.street]);
  S.log = [...S.log, { k: "street", s: S.street }];
  S.turnUid = nextFrom(S.order, S.button, id => A.includes(id));
}
/* fold, check, call, raise (to a total bet of `to` on this street) or allin. Returns false when the move doesn't hold. */
function act(S, D, uid, kind, to) {
  if (S.step !== "bet" || S.turnUid !== uid) return false;
  const bet = S.bets[uid] || 0, stack = S.stacks[uid] || 0, owe = S.betTo - bet;
  let k = kind, a = 0;
  if (kind === "fold") S.folded = [...S.folded, uid];
  else if (kind === "check") { if (owe > 0) return false; }
  else if (kind === "call") {
    if (owe <= 0) return false;
    const x = Math.min(owe, stack);
    put(S, uid, x);
    if (x === stack) k = "allin";
    a = S.bets[uid];
  } else if (kind === "raise" || kind === "allin") {
    const top = bet + stack, want = kind === "allin" ? top : Math.floor(+to);
    if (!(want > bet) || want > top) return false;
    if (want <= S.betTo) {
      // All-in for no more than a call.
      if (want < top) return false;
      put(S, uid, want - bet); k = "allin";
    } else {
      const size = want - S.betTo;
      if (size < S.lastRaise && want < top) return false;
      k = want === top ? "allin" : S.betTo ? "raise" : "bet";
      if (size >= S.lastRaise) S.lastRaise = size;
      S.betTo = want; S.acted = [];
      put(S, uid, want - bet);
    }
    a = S.bets[uid];
  } else return false;
  if (!S.acted.includes(uid)) S.acted = [...S.acted, uid];
  S.log = [...S.log, { u: uid, k, a }];
  progress(S, D, uid);
  return true;
}
/* The pots. Each all-in level makes a pot that only the players who put that much can win; folded chips stay in.
   A pot only one player can win is a bet nobody called: it goes back to them. */
function finish(S, D) {
  const live = liveIds(S), won = {}, pots = [], show = {}, sc = {}, total = sum(S.contrib);
  S.step = "done"; S.turnUid = "";
  if (live.length === 1) {
    won[live[0]] = total;
    pots.push({ amt: total, win: [live[0]], ret: false, sc: 0 });
  } else {
    for (const id of live) { show[id] = D.holes[id]; sc[id] = evalHand([...D.holes[id], ...S.board]); }
    const levels = [...new Set(live.map(id => S.contrib[id] || 0))].sort((a, b) => a - b);
    let prev = 0;
    for (const lv of levels) {
      const amt = Object.values(S.contrib).reduce((s, c) => s + Math.max(0, Math.min(c, lv) - prev), 0);
      const elig = live.filter(id => (S.contrib[id] || 0) >= lv);
      prev = lv;
      if (!amt) continue;
      const top = Math.max(...elig.map(id => sc[id]));
      const win = fromButton(S).filter(id => elig.includes(id) && sc[id] === top);
      const share = Math.floor(amt / win.length), odd = amt - share * win.length;
      win.forEach((id, i) => { won[id] = (won[id] || 0) + share + (i < odd ? 1 : 0); });
      pots.push({ amt, win, ret: elig.length === 1, sc: top });
    }
    const left = total - sum(won);
    if (left > 0 && pots.length) { const w = pots[pots.length - 1].win[0]; won[w] += left; pots[pots.length - 1].amt += left; }
  }
  for (const [id, x] of Object.entries(won)) S.stacks[id] = (S.stacks[id] || 0) + x;
  const delta = Object.fromEntries(S.inHand.map(id => [id, (won[id] || 0) - (S.contrib[id] || 0)]));
  // Out of chips: the one who started the hand with less goes out first.
  const busted = S.inHand.filter(id => !S.stacks[id]).sort((a, b) => (S.contrib[a] || 0) - (S.contrib[b] || 0));
  if (!S.rebuy) S.out = [...(S.out || []), ...busted.filter(id => !(S.out || []).includes(id))];
  const byFold = live.length === 1;
  S.res = { n: S.hand, byFold, pots, show, sc, won, delta, bust: busted, street: S.street };
  // What each player did this hand: [bets and raises, calls, folds, all-ins], for the titles at the end.
  const acts = {};
  for (const l of S.log) {
    if (!l.u || l.k === "sb" || l.k === "bb") continue;
    const x = acts[l.u] || (acts[l.u] = [0, 0, 0, 0]), i = { bet: 0, raise: 0, call: 1, fold: 2, allin: 3 }[l.k];
    if (i != null) x[i]++;
  }
  const w = [...new Set(pots.filter(p => !p.ret).flatMap(p => p.win))];
  S.entry = { n: S.hand, pot: total, bf: byFold, pf: byFold && S.street === 0, d: delta, w, sc, a: acts, rb: S.rb || [], bust: busted };
  if (Array.isArray(S.history)) S.history = [...S.history, S.entry];
}
/* Shuffles, deals two cards to each seat and five for the board, then posts the blinds. */
function prepHand(S, ids) {
  const deck = newDeck();
  const D = { holes: Object.fromEntries(ids.map((id, i) => [id, [deck[2 * i], deck[2 * i + 1]]])), board: deck.slice(2 * ids.length, 2 * ids.length + 5) };
  S.hand = (S.hand || 0) + 1;
  S.blinds = blindsFor(S.start, S.blindUp ? Math.floor((S.hand - 1) / S.blindUp) : 0);
  beginHand(S, ids, S.blinds, D);
  return D;
}
function raiseBounds(S, uid) {
  const bet = S.bets?.[uid] || 0, stack = S.stacks?.[uid] || 0, owe = Math.max(0, (S.betTo || 0) - bet);
  const top = bet + stack, full = S.betTo ? S.betTo + (S.lastRaise || S.bb) : S.bb;
  return { bet, stack, owe, top, full, minTo: Math.min(top, full), pot: sum(S.contrib), canRaise: stack > owe };
}
const clampTo = (S, uid, x) => { const b = raiseBounds(S, uid); return Math.max(b.minTo, Math.min(b.top, Math.round(x))); };
function quickTo(S, uid, kind) {
  const b = raiseBounds(S, uid), base = S.betTo || 0, potAfter = b.pot + b.owe;
  return clampTo(S, uid, kind === "min" ? b.minTo : kind === "max" ? b.top : kind === "half" ? base + potAfter / 2 : base + potAfter);
}
const autoKind = (S, uid) => (S.betTo || 0) > (S.bets?.[uid] || 0) ? "fold" : "check";
/* Net result, rebuys included: what ranks players when the game stops. */
const netOf = (S, id) => (S.stacks?.[id] || 0) - (S.start || 0) * (S.rebuys?.[id] || 0);
function ranking(S) {
  const out = S.out || [];
  const alive = (S.order || []).filter(id => !out.includes(id)).sort((a, b) => netOf(S, b) - netOf(S, a));
  return [...alive, ...[...out].reverse()];
}
/* The gage goes to the first one out; in a game stopped early, to whoever is the furthest down. */
function losersOf(S) {
  const order = S.order || [];
  if (order.length < 2) return [];
  if ((S.out || []).length) return [S.out[0]];
  const n = order.map(id => netOf(S, id)), min = Math.min(...n), max = Math.max(...n);
  return min < max ? order.filter(id => netOf(S, id) === min) : [];
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
  secret: null, move: null, deal: null, customs: [], choices: [], hands: [],
  rto: 0, rkey: "", peek: false, hide: store.get("hide") === "1", gkind: "dare",
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
const rMove = (c, id) => F.doc(DB, ROOT, c, "moves", id);
const cMoves = c => F.collection(DB, ROOT, c, "moves");
const rHand = (c, id) => F.doc(DB, ROOT, c, "hands", id);
const cHands = c => F.collection(DB, ROOT, c, "hands");
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
/* The hands already played (kept out of the room document so it stays small) and the end-of-game choices. */
function subGame() {
  off(gameSubs);
  M.choices = []; M.hands = [];
  const g = M.room?.gameId;
  if (!g) return;
  gameSubs.push(F.onSnapshot(F.query(cChoices(M.code), F.where("gameId", "==", g)), s => { M.choices = s.docs.map(d => d.data()); render(); }, () => {}));
  gameSubs.push(F.onSnapshot(F.query(cHands(M.code), F.where("gameId", "==", g)), s => { M.hands = s.docs.map(d => d.data()).sort((a, b) => a.n - b.n); render(); }, () => {}));
}
/* The move of the player whose turn it is: one document per turn, which only they can write. */
function subTurn() {
  const r = M.room, key = r && r.phase === "play" && r.step === "bet" ? `${r.gameId}_${r.seq}` : "";
  if (key === turnKey) return;
  off(turnSubs);
  turnKey = key; M.move = null;
  if (!key) return;
  turnSubs.push(F.onSnapshot(rMove(M.code, key), s => { M.move = s.exists() ? s.data() : null; render(); if (isMod()) hostSync(); }, () => {}));
}
/* Only the moderator reads the deck; the listener follows whoever is modo now. */
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
  leaveSubs();
  Object.assign(M, { mode: "room", tv, code, room: null, roomReady: false, players: [], playersReady: false,
    secret: null, move: null, deal: null, customs: [], choices: [], hands: [], renaming: false, handover: false, offline: false });
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
    customs: [], choices: [], hands: [], handover: false });
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
  gameId: rid(), phase: "lobby", hand: 0, seq: 0, step: "bet", order: [], cast: {}, stacks: {}, rebuys: {}, out: [],
  inHand: [], folded: [], bets: {}, contrib: {}, betTo: 0, lastRaise: 0, acted: [], street: 0, board: [], turnUid: "",
  button: "", sbId: "", bbId: "", bb: 0, blinds: null, log: [], res: null, house: [], paused: false
});
const freshRoom = () => ({
  ...freshGame(), start: 1000, blindUp: 10, timer: 0, help: false, rebuy: false,
  gages: false, gageLvl: 1, maison: true, approve: false, apero: false
});
/* Every change of the room also stamps it, which tells the cleanup when a room was last used. */
const patchRoom = p => F.updateDoc(rRoom(M.code), { ...p, touchedAt: F.serverTimestamp() });
/* House gages the moderator accepted (or all of them, when approval is off). */
const usableCustoms = (r = M.room) => M.customs.filter(c => !r?.approve || c.ok || c.by === r.hostUid);

/* ---------- the hand, as everyone sees it ---------- */
const myCards = r => M.secret && M.secret.gameId === r.gameId && M.secret.hand === r.hand && Array.isArray(M.secret.cards) ? M.secret.cards : null;
const moveNow = r => M.move && M.move.gameId === r.gameId && M.move.seq === r.seq ? M.move : null;
function timeLeft(r) {
  if (!r || !r.timer || r.phase !== "play" || r.step !== "bet" || !r.turnAt) return null;
  const now = r.paused ? tsMs(r.pausedAt) || serverNow() : serverNow();
  return Math.max(0, Math.ceil((tsMs(r.turnAt) + r.timer * 1000 - now) / 1000));
}
/* With a turn timer, the next hand also deals itself a little after the last one. */
function nextLeft(r) {
  if (!r || !r.timer || r.phase !== "play" || r.step !== "done" || !r.doneAt) return null;
  const now = r.paused ? tsMs(r.pausedAt) || serverNow() : serverNow();
  return Math.max(0, Math.ceil((tsMs(r.doneAt) + NEXT_MS - now) / 1000));
}

/* ---------- moderator's page: shuffling, dealing and running the bets ----------
   The deck lives in deal/current, which only the moderator can read. Each player's two cards are copied to secret/{uid}. */
const PLAY_KEYS = ["stacks", "out", "folded", "bets", "contrib", "betTo", "lastRaise", "acted", "street", "board", "step", "turnUid", "log", "res"];
const DEAL_KEYS = [...PLAY_KEYS, "order", "cast", "rebuys", "button", "sbId", "bbId", "bb", "blinds", "hand", "inHand"];
const handOf = r => clone({ stacks: {}, rebuys: {}, out: [], bets: {}, contrib: {}, folded: [], acted: [], log: [], board: [],
  ...pick(r, [...DEAL_KEYS, "start", "blindUp", "rebuy", "gameId", "seq"]) });
/* The room update, plus the record of the hand when it just ended. */
function commitHand(S, keys, extra) {
  const b = F.writeBatch(DB);
  b.update(rRoom(M.code), { ...pick(S, keys), ...extra, ...(S.step === "done" ? { doneAt: F.serverTimestamp() } : {}), touchedAt: F.serverTimestamp() });
  if (S.step === "done" && S.entry) b.set(rHand(M.code, `${S.gameId}_${S.entry.n}`), { gameId: S.gameId, ...S.entry });
  return b;
}
async function launchHand(S, ids, extra = {}) {
  const D = prepHand(S, ids);
  const b = commitHand(S, DEAL_KEYS, { ...extra, phase: "play", seq: (S.seq || 0) + 1, turnAt: F.serverTimestamp(), paused: false, pausedAt: null });
  b.set(rDeal(M.code), { gameId: S.gameId, hand: S.hand, ...D });
  for (const id of ids) b.set(rSecret(M.code, id), { gameId: S.gameId, hand: S.hand, cards: D.holes[id] });
  await b.commit();
}
function startGame(r) {
  const ids = M.players.map(p => p.id).slice(0, MAX_PLAYERS);
  const cast = Object.fromEntries(ids.map(id => { const p = pInfo(id); return [id, { nick: p.nick, color: p.color || COLORS[0] }]; }));
  // The accepted house gages are copied into the game, so every phone draws the same gage at the end.
  const house = r.gages && r.maison ? usableCustoms(r).map(c => ({ kind: c.kind, text: c.text })) : [];
  const S = { gameId: r.gameId, seq: r.seq || 0, start: r.start || 1000, blindUp: r.blindUp || 0, rebuy: !!r.rebuy, order: ids, cast,
    stacks: Object.fromEntries(ids.map(id => [id, r.start || 1000])), rebuys: {}, out: [], hand: 0, button: ids[rand(ids.length)], rb: [] };
  return launchHand(S, ids, { house });
}
/* A player who left the table is no longer dealt in. With rebuys, whoever is out of chips gets a new stack,
   and those who arrived during the game sit down. */
function nextHand(r) {
  const S = handOf(r), here = new Set(M.players.map(p => p.id)), rb = [];
  if (S.rebuy) {
    for (const p of M.players) if (!S.order.includes(p.id) && S.order.length < MAX_PLAYERS) {
      S.order.push(p.id); S.cast[p.id] = { nick: p.nick, color: p.color || COLORS[0] }; S.stacks[p.id] = S.start;
    }
    for (const id of S.order) if (here.has(id) && !(S.stacks[id] > 0)) { S.stacks[id] = S.start; S.rebuys[id] = (S.rebuys[id] || 0) + 1; rb.push(id); }
  }
  const ids = S.order.filter(id => here.has(id) && S.stacks[id] > 0);
  if (ids.length < 2) return patchRoom({ phase: "end", paused: false, ...pick(S, ["order", "cast", "stacks", "rebuys"]) });
  S.rb = rb;
  return launchHand(S, ids);
}
/* A move that doesn't hold just gives the same player another go. */
function applyMove(r, d, kind, to) {
  const S = handOf(r);
  if (!act(S, d, r.turnUid, kind, to)) return patchRoom({ seq: r.seq + 1 });
  return commitHand(S, PLAY_KEYS, { seq: r.seq + 1, turnAt: F.serverTimestamp() }).commit();
}
function hostJob(r, d) {
  if (r.step === "done") return nextLeft(r) === 0 ? { name: "next", run: () => nextHand(r) } : null;
  if (!d || d.gameId !== r.gameId || d.hand !== r.hand) return null;
  const mv = moveNow(r);
  if (mv && mv.uid === r.turnUid) return { name: "move", run: () => applyMove(r, d, mv.kind, mv.to) };
  // Out of time, or gone: check if free, else fold.
  if (timeLeft(r) === 0 || !idOnline(r.turnUid)) return { name: "auto", run: () => applyMove(r, d, autoKind(r, r.turnUid)) };
  return null;
}
let hostBusy = false, jobDone = "";
async function hostSync() {
  const r = M.room;
  if (!isMod() || hostBusy || M.busy || !r || r.phase !== "play" || r.paused) return;
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
  for (const name of ["moves", "hands", "custom", "choices"]) for (const d of (await F.getDocs(col(name))).docs) await F.deleteDoc(d.ref);
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
  const start = S.start || 1000;
  const X = Object.fromEntries((S.order || []).map(id => [id, { id, hands: 0, pots: 0, big: 0, raises: 0, calls: 0, folds: 0, allins: 0,
    steals: 0, shows: 0, best: -1, bad: -1, low: Infinity, stack: null, rebuys: S.rebuys?.[id] || 0 }]));
  for (const h of hist) {
    for (const [id, dl] of Object.entries(h.d || {})) {
      const x = X[id];
      if (!x) continue;
      x.hands++;
      if (x.stack == null || (h.rb || []).includes(id)) x.stack = start;
      x.stack += dl; x.low = Math.min(x.low, x.stack);
    }
    for (const id of h.w || []) { const x = X[id]; if (x) { x.pots++; x.big = Math.max(x.big, h.pot); if (h.pf) x.steals++; } }
    for (const [id, a] of Object.entries(h.a || {})) { const x = X[id]; if (x) { x.raises += a[0]; x.calls += a[1]; x.folds += a[2]; x.allins += a[3]; } }
    for (const [id, sc] of Object.entries(h.sc || {})) {
      const x = X[id];
      if (!x) continue;
      x.shows++; x.best = Math.max(x.best, sc);
      if (!(h.w || []).includes(id)) x.bad = Math.max(x.bad, sc);
    }
  }
  for (const x of Object.values(X)) {
    if (x.low === Infinity) x.low = start;
    x.phoenix = !x.rebuys && x.low <= start * .2 && (S.stacks?.[x.id] || 0) >= start;
  }
  return X;
}

/* ---------- profile, kept on this phone ---------- */
function profile() {
  return { color: null, games: 0, wins: 0, pots: 0, big: 0, best: -1, titles: {}, recorded: [], ...store.json("profile", {}) };
}
function saveProfile(p) { store.set("profile", JSON.stringify(p)); }
function recordGame(S, rank, hist, titles) {
  const p = profile();
  if (!S.gameId || p.recorded.includes(S.gameId) || !(S.order || []).includes(M.me) || !hist.length) return;
  const s = playerStats(S, hist)[M.me];
  p.games++;
  if (rank[0] === M.me) p.wins++;
  p.pots += s.pots; p.big = Math.max(p.big, s.big); p.best = Math.max(p.best, s.best);
  const t = titles[M.me];
  if (t) p.titles[t.title] = (p.titles[t.title] || 0) + 1;
  p.recorded = [...p.recorded, S.gameId].slice(-50);
  saveProfile(p);
}

/* ---------- end-of-game titles ---------- */
const TITLE_RULES = [
  { label: "Main en or", w: 5, score: s => s.best >= 6 * B5 ? catOf(s.best) : 0, why: s => `${handName(s.best)} à l'abattage` },
  { label: "Phénix", w: 12, score: s => s.phoenix ? 1 : 0, why: s => `revenu de ${fmt(s.low)} jetons` },
  { label: "Bad beat", w: 3.2, score: s => s.bad >= 4 * B5 ? catOf(s.bad) : 0, why: s => `${handName(s.bad)}… et perdu quand même` },
  { label: "Requin", w: 3, score: s => s.pots >= 4 ? s.pots : 0, why: s => `${s.pots} pots raflés` },
  { label: "Kamikaze", w: 3, score: s => s.allins >= 3 ? s.allins : 0, why: s => `${s.allins} fois à tapis` },
  { label: "Voleur de blindes", w: 2.6, score: s => s.steals >= 3 ? s.steals : 0, why: s => `${s.steals} pots ramassés avant le flop` },
  { label: "Agresseur", w: 2, score: s => s.raises >= 5 ? s.raises : 0, why: s => `${s.raises} mises et relances` },
  { label: "Le Roc", w: 8, score: s => s.hands >= 8 && s.folds / s.hands >= .6 ? s.folds / s.hands : 0, why: s => `couché ${s.folds} fois sur ${s.hands} mains` },
  { label: "Calling station", w: 1.5, score: s => s.calls >= 6 ? s.calls : 0, why: s => `${s.calls} fois « je suis »` },
  { label: "Accro aux recaves", w: 2.5, score: s => s.rebuys >= 2 ? s.rebuys : 0, why: s => `${s.rebuys} recaves` }
];
function computeTitles(S, hist) {
  const X = playerStats(S, hist), cands = [];
  for (const s of Object.values(X)) for (const rule of TITLE_RULES) {
    const sc = rule.score(s);
    if (sc > 0) cands.push({ uid: s.id, title: rule.label, why: rule.why(s), score: sc * rule.w });
  }
  cands.sort((a, b) => b.score - a.score);
  const out = {}, used = new Set();
  for (const c of cands) if (!out[c.uid] && !used.has(c.title)) { out[c.uid] = c; used.add(c.title); }
  for (const id of S.order || []) if (!out[id]) out[id] = { title: "Joueur de l'ombre", why: "discret comme une carte retournée" };
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
  return `<header class="top ${big ? "big" : ""}"><h1 class="logo">Poker</h1>${badge ? `<span class="badge">${esc(badge)}</span>` : ""}</header>`;
}
function errBox() {
  return (M.err ? `<div class="err" role="alert">${esc(M.err)}</div>` : "") + (M.flash ? `<div class="note" role="status">${esc(M.flash)}</div>` : "");
}
/* A card, always cream so it reads the same in both themes; a missing card is shown face down. */
function card(c, cls = "", i = 0) {
  if (c == null || c < 0) return `<span class="card back ${cls}" style="--i:${i}" role="img" aria-label="carte cachée"></span>`;
  return `<span class="card ${isRed(c) ? "red" : ""} ${cls}" style="--i:${i}" role="img" aria-label="${cardName(c)}"><b>${RANKS[rk(c)]}</b><i>${SUITS[st(c)]}</i></span>`;
}
const amt = (n, cls = "") => `<span class="amt ${cls}"><i class="tok" aria-hidden="true"></i>${fmt(n)}</span>`;
function sw(on, act, title, sub) {
  return `<button class="switch" data-act="${act}" aria-pressed="${!!on}"><span class="knob"></span><span><b>${title}</b><br><small>${sub}</small></span></button>`;
}
const togs = (list, cur, act, label) => `<div class="toggles">${list.map(v => `<button class="tog" data-act="${act}" data-id="${v}" aria-pressed="${cur === v}">${label(v)}</button>`).join("")}</div>`;
const blindsText = b => `${fmt(b.sb)} / ${fmt(b.bb)}`;
/* o: { start, blindUp, timer, help, rebuy, gages, gageLvl, maison, approve, apero, acts } — a missing act hides its setting. */
function settingsPanel(o) {
  const a = o.acts;
  return `<section class="panel">
    <div class="label">Jetons au départ</div>
    ${togs(STACKS, o.start || 1000, a.start, v => fmt(v))}
    <p class="hint left">Blindes de départ : <b>${blindsText(blindsFor(o.start, 0))}</b>.</p>
    <div class="label">Les blindes montent</div>
    ${togs(BLIND_UPS, o.blindUp || 0, a.blindUp, v => v ? `Toutes les ${v} mains` : "Jamais")}
    ${a.timer ? `<div class="label">Chrono par tour</div>
      ${togs(TIMERS, o.timer || 0, a.timer, v => v ? v + " s" : "Aucun")}
      <p class="hint left">Au bout du chrono, le joueur passe parole s'il le peut, sinon il se couche. La main suivante est alors distribuée toute seule.</p>` : ""}
  </section>
  <section class="panel">
    <div class="label">Règles</div>
    ${sw(o.rebuy, a.rebuy, "Recaves", "Qui n'a plus de jetons repart avec un tapis neuf à la main suivante, et les retardataires s'assoient en cours de partie. Le classement en tient compte.")}
    ${sw(o.help, a.help, "Aide au jeu", "Chacun voit le nom de sa combinaison et ses chances de gagner la main.")}
  </section>
  <section class="panel">
    <div class="label">Options</div>
    ${sw(o.gages, a.gages, "Gages et vérités", "À la fin, le premier éliminé choisit entre un gage et une vérité.")}
    ${o.gages ? `${togs([1, 2, 3, 4], o.gageLvl || 1, a.gageLvl, v => GAGE_LEVELS[v - 1])}
      <p class="hint left">Chaque niveau pioche aussi dans les plus doux. Ce qui touche quelqu'un d'autre se fait avec son accord.</p>
      ${sw(o.maison, a.maison, "Gages maison", "Vos propres gages et vérités : ils ont une chance sur deux de sortir.")}
      ${a.approve && o.maison ? sw(o.approve, a.approve, "Valider les gages des joueurs", "Les gages proposés par les autres attendent ton accord.") : ""}` : ""}
    ${sw(o.apero, a.apero, "Mode apéro", `Qui perd à l'abattage boit ${SIPS} gorgées. Qui est éliminé finit son verre.`)}
  </section>`;
}
function settingsSummary(r) {
  const tags = [fmt(r.start || 1000) + " jetons", "Blindes " + blindsText(blindsFor(r.start, 0)), r.blindUp ? `+ toutes les ${r.blindUp} mains` : "Blindes fixes",
    ...(r.timer ? [`Chrono ${r.timer} s`] : []), ...(r.rebuy ? ["Recaves"] : []), ...(r.help ? ["Aide au jeu"] : []),
    ...(r.gages ? [`Gages ${GAGE_LEVELS[(r.gageLvl || 1) - 1]}`] : []), ...(r.gages && r.maison ? ["Gages maison"] : []), ...(r.apero ? ["Mode apéro"] : [])];
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
/* The board, the pot and the blinds. */
function boardPanel(S, o = {}) {
  const board = S.board || [], pot = sum(S.contrib);
  const lvl = S.blinds || blindsFor(S.start, 0);
  const upIn = S.blindUp ? S.blindUp - ((S.hand - 1) % S.blindUp) : 0;
  return `<section class="panel center felt">
    <div class="potline"><span class="label">Pot</span>${amt(pot, "big")}</div>
    <div class="board" data-key="${esc(`${o.key}`)}" data-n="${board.length}">${[0, 1, 2, 3, 4].map(i => board[i] != null ? card(board[i], o.hit && o.hit.includes(board[i]) ? "hit" : o.hit ? "miss" : "", i) : `<span class="card slot"></span>`).join("")}</div>
    <div class="vsub">Main ${S.hand || 1} · ${STREETS[S.street || 0]} · Blindes ${blindsText(lvl)}${upIn && S.step === "bet" ? ` · ${upIn > 1 ? `montent dans ${upIn} mains` : "montent à la prochaine main"}` : ""}</div>
  </section>`;
}
function turnLine(S, info, o = {}) {
  if (S.step !== "bet" || !S.turnUid) return "";
  const me = !o.noMe && S.turnUid === M.me, p = info(S.turnUid);
  return `<div class="turnwrap"><div class="turn ${me ? "me" : ""}">${me ? "À toi de jouer !" : `${av(p)}<span>${esc(p.nick)} réfléchit<span class="dots"></span></span>`}</div></div>`;
}
/* My two cards. With the hiding option on, they only show while the button is held down. */
function myCardsPanel(S, cards, o = {}) {
  const show = !M.hide || M.peek, folded = (S.folded || []).includes(o.uid);
  let help = "";
  if (o.help && show && !folded && S.step === "bet") {
    const board = S.board || [], sc = evalHand([...cards, ...board]), nOpp = liveIds(S).length - 1;
    help = `<div class="help"><p>Tu as : <b>${esc(handName(sc))}</b>${board.length ? "" : (rk(cards[0]) === rk(cards[1]) ? "" : st(cards[0]) === st(cards[1]) ? " (assorties)" : "")}.</p>
      <p>Tes chances de gagner contre ${plural(nOpp, "adversaire")} : <b>${pct(equity(cards, board, nOpp))}</b>.</p></div>`;
  }
  return `<section class="panel mycards ${folded ? "folded" : ""}" data-key="${esc(o.key)}">
    <div class="label">${esc(o.label || "Tes cartes")}${folded ? " · couché" : ""}</div>
    ${show ? `<div class="hole">${cards.map((c, i) => card(c, "", i)).join("")}</div>`
      : `<button class="btn cupbtn" data-hold="1" aria-label="Maintenir pour voir tes cartes">Maintiens pour regarder tes cartes</button>`}
    ${help}
    <button class="link" data-act="hide" style="align-self:flex-start">${M.hide ? "Toujours montrer mes cartes" : "Cacher mes cartes (appui long pour les voir)"}</button>
  </section>`;
}
/* The bet builder. o: { key, pfx } */
function composer(S, uid, o) {
  const b = raiseBounds(S, uid);
  if (M.rkey !== o.key) { M.rkey = o.key; M.rto = b.minTo; }
  M.rto = clampTo(S, uid, M.rto);
  const pfx = o.pfx, allIn = M.rto >= b.top, verb = S.betTo ? "Relancer à" : "Miser";
  let raise = "";
  if (b.canRaise && b.top > b.full) {
    const q = [["min", "Min"], ["half", "½ pot"], ["pot", "Pot"], ["max", "Tapis"]];
    raise = `<div class="label">${S.betTo ? "Relance" : "Mise"}</div>
      <div class="qty">
        <button class="btn step" data-act="${pfx}less" ${M.rto <= b.minTo ? "disabled" : ""} aria-label="Moins">−</button>
        <span class="raiseamt">${amt(M.rto, "big")}</span>
        <button class="btn step" data-act="${pfx}more" ${allIn ? "disabled" : ""} aria-label="Plus">+</button>
      </div>
      <div class="quick">${q.map(([k, n]) => `<button class="tog" data-act="${pfx}quick" data-id="${k}" aria-pressed="${quickTo(S, uid, k) === M.rto}">${n}</button>`).join("")}</div>
      <button class="btn raise big" data-act="${pfx}raise">${allIn ? `Tapis ! ${fmt(b.top)}` : `${verb} ${fmt(M.rto)}`}</button>`;
  } else if (b.canRaise) {
    raise = `<button class="btn raise big" data-act="${pfx}allin">Tapis ! ${fmt(b.top)}</button>`;
  }
  return `<section class="panel betbox">
    <div class="label">Ton action · ${amt(b.stack)} devant toi</div>
    <p class="hint left">${b.owe ? `Pour suivre : <b>${fmt(Math.min(b.owe, b.stack))}</b> · ` : "Personne n'a misé · "}pot de <b>${fmt(b.pot)}</b></p>
    <div class="btns calls">
      <button class="btn fold" data-act="${pfx}fold">Se coucher</button>
      ${b.owe ? `<button class="btn primary" data-act="${pfx}call">${b.owe >= b.stack ? `Tapis ${fmt(b.stack)}` : `Suivre ${fmt(b.owe)}`}</button>`
        : `<button class="btn primary" data-act="${pfx}check">Parole</button>`}
    </div>
    ${raise}
  </section>`;
}
/* Everyone at the table: chips, bet on this street, the dealer button and the blinds. */
function seatsPanel(S, info, o = {}) {
  const order = S.order || [], playing = S.phase !== "end" && (S.inHand || []).length;
  return `<section class="panel">
    <div class="label">La table · ${plural(order.length, "joueur")}</div>
    <ol class="seats">${order.map(id => {
      const p = info(id), stack = S.stacks?.[id] || 0, bet = S.bets?.[id] || 0;
      const dealt = playing && S.inHand.includes(id), folded = dealt && (S.folded || []).includes(id);
      const turn = S.step === "bet" && id === S.turnUid, out = (S.out || []).includes(id);
      const away = o.online && id !== M.me && !idOnline(id);
      const tags = [
        id === S.button && dealt ? `<span class="puck" title="Donneur">D</span>` : "",
        o.online && id === M.room?.hostUid ? `<span class="tag">modo</span>` : "",
        dealt && id === S.sbId && S.street === 0 && S.step === "bet" ? `<span class="tag off">PB</span>` : "",
        dealt && id === S.bbId && S.street === 0 && S.step === "bet" ? `<span class="tag off">GB</span>` : "",
        away && !out ? `<span class="tag off">absent</span>` : "",
        turn ? `<span class="tag win">son tour</span>` : "",
        folded ? `<span class="tag off">couché</span>` : "",
        dealt && !folded && !stack && S.step === "bet" ? `<span class="tag allin">tapis</span>` : "",
        out ? `<span class="tag off">éliminé</span>` : "",
        o.rebuy && S.rebuys?.[id] ? `<span class="tag off">${plural(S.rebuys[id], "recave")}</span>` : ""
      ].join(" ");
      return `<li class="${turn ? "turn" : ""} ${out || folded || (playing && !dealt) ? "out" : ""}">${av(p)}<span class="nm">${esc(p.nick)} ${tags}</span>
        ${dealt && !folded && S.step === "bet" ? `<span class="minis" aria-hidden="true"><i></i><i></i></span>` : ""}
        <span class="stk">${amt(stack)}${bet ? `<small>mise ${fmt(bet)}</small>` : ""}</span></li>`;
    }).join("")}</ol>
  </section>`;
}
const LOG_TEXT = { sb: a => `petite blinde ${fmt(a)}`, bb: a => `grosse blinde ${fmt(a)}`, fold: () => "se couche", check: () => "parole",
  call: a => `suit (${fmt(a)})`, bet: a => `mise ${fmt(a)}`, raise: a => `relance à ${fmt(a)}`, allin: a => `tapis ! (${fmt(a)})` };
function logPanel(log, info) {
  if (!log || log.length < 3) return "";
  const items = [...log].reverse().slice(0, 14);
  return `<section class="panel"><div class="label">Actions de la main</div>
    <ol class="log">${items.map((l, i) => l.k === "street" ? `<li class="st">${STREETS[l.s]}</li>`
      : `<li class="${i ? "" : "last"} k-${l.k}">${av(info(l.u))}<span class="nm">${esc(info(l.u).nick)}</span><span class="what">${LOG_TEXT[l.k] ? LOG_TEXT[l.k](l.a) : ""}</span></li>`).join("")}</ol></section>`;
}
/* The end of a hand: who takes the pot, and with what. */
function resultPanel(S, res, info, o = {}) {
  const real = res.pots.filter(p => !p.ret), main = real[0] || res.pots[0];
  const winners = main.win.map(info), split = main.win.length > 1;
  const shown = Object.keys(res.show || {});
  const hitCards = !res.byFold && main.win[0] ? best5([...res.show[main.win[0]], ...(S.board || [])]) : null;
  const net = id => res.delta?.[id] || 0, winSet = new Set(real.flatMap(p => p.win));
  // Whoever is out of chips finishes their glass instead.
  const losers = shown.filter(id => !winSet.has(id) && !(res.bust || []).includes(id));
  let sips = "";
  if (o.apero) {
    const s = [losers.length ? `${esc(names(losers.map(info)))} ${losers.length > 1 ? "boivent" : "boit"} ${SIPS} gorgées` : "",
      (res.bust || []).length ? `${esc(names(res.bust.map(info)))} ${res.bust.length > 1 ? "finissent leur verre" : "finit son verre"}` : ""].filter(Boolean);
    sips = s.length ? `<div class="sips">${s.join(" · ")}</div>` : "";
  }
  return `<section class="panel center verdict reveal" data-key="${esc("r" + o.key)}" aria-live="polite">
    <div class="label">${res.byFold ? "Tout le monde s'est couché" : split ? "Pot partagé" : "Abattage"}</div>
    ${winners.length === 1 ? av(winners[0], "huge") : `<div class="avs">${winners.map(p => av(p)).join("")}</div>`}
    <div class="name">${esc(names(winners))}</div>
    <div class="count">${split ? "se partagent" : "remporte"} ${amt(main.amt, "big")}</div>
    ${!res.byFold ? `<div class="vsub">${esc(handName(main.sc))}</div>` : `<div class="vsub">sans montrer ses cartes</div>`}
    ${real.slice(1).map((p, i) => `<div class="vsub side">Pot annexe${real.length > 2 ? " " + (i + 1) : ""} (${fmt(p.amt)}) : ${esc(names(p.win.map(info)))} · ${esc(handName(p.sc))}</div>`).join("")}
    ${(res.bust || []).length ? `<div class="vsub">${esc(names(res.bust.map(info)))} ${o.rebuy ? (res.bust.length > 1 ? "n'ont plus de jetons (recave à la prochaine main)" : "n'a plus de jetons (recave à la prochaine main)") : (res.bust.length > 1 ? "sont éliminés" : "est éliminé")}</div>` : ""}
    ${sips}
  </section>
  ${shown.length ? boardPanel(S, { key: o.key, hit: hitCards }) + `<section class="panel"><div class="label">Les cartes</div>
    <ul class="hands">${shown.sort((a, b) => res.sc[b] - res.sc[a]).map(id => {
      const p = info(id), h = res.show[id], hit = hitCards || [];
      return `<li>${chip(p)}<span class="hole sm">${h.map((c, i) => card(c, hit.includes(c) && main.win.includes(id) ? "hit" : "", i)).join("")}</span>
        <span class="hn">${esc(handName(res.sc[id]))}</span><b class="n ${net(id) > 0 ? "plus" : ""}">${net(id) > 0 ? "+" : net(id) < 0 ? "−" : "±"}${fmt(Math.abs(net(id)))}</b></li>`;
    }).join("")}</ul></section>` : ""}`;
}
function palmares(S, rank, hist, titles, info, shareAct) {
  if (!hist.length) return `<section class="panel"><p class="lead">Aucune main jouée pour l'instant.</p></section>`;
  const X = playerStats(S, hist), start = S.start || 1000;
  return `<section class="panel">
    <div class="label">Classement · ${plural(hist.length, "main")}</div>
    <ol class="rank">${rank.map((id, i) => {
      const p = info(id), t = titles[id], s = X[id], stack = S.stacks?.[id] || 0, net = netOf(S, id), out = (S.out || []).includes(id);
      const where = out ? "éliminé" : `${fmt(stack)} jetons · ${net - start >= 0 ? "+" : "−"}${fmt(Math.abs(net - start))}`;
      const facts = [s.hands && `${plural(s.hands, "main")} ${s.hands > 1 ? "jouées" : "jouée"}`, s.pots && `${plural(s.pots, "pot")} ${s.pots > 1 ? "gagnés" : "gagné"}`,
        s.big && `plus gros pot : ${fmt(s.big)}`, s.best >= 0 && `meilleure main montrée : ${handName(s.best).toLowerCase()}`,
        s.allins && `${s.allins} fois à tapis`, s.folds && `couché ${s.folds} fois`, s.rebuys && plural(s.rebuys, "recave")].filter(Boolean);
      return `<li><details>
      <summary><span class="pos">${i + 1}</span>${av(p)}<span class="who"><b>${esc(p.nick)}</b>
        ${t ? `<span class="title">${esc(t.title)}</span>` : ""}
        <small>${esc(where)}${t ? " · " + esc(t.why) : ""}</small></span></summary>
      <ul>${facts.length ? facts.map(f => `<li>${esc(f)}</li>`).join("") : "<li>Pas une main. Très mystérieux.</li>"}</ul>
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
const EXAMPLES = [
  ["Quinte flush", "5 cartes qui se suivent, de la même couleur", [C(7, 1), C(8, 1), C(9, 1), C(10, 1), C(11, 1)]],
  ["Carré", "4 cartes de même valeur", [C(5, 0), C(5, 1), C(5, 2), C(5, 3), C(11, 0)]],
  ["Full", "un brelan et une paire", [C(11, 0), C(11, 1), C(11, 3), C(2, 2), C(2, 0)]],
  ["Couleur", "5 cartes de la même couleur", [C(0, 3), C(4, 3), C(7, 3), C(9, 3), C(12, 3)]],
  ["Quinte", "5 cartes qui se suivent", [C(3, 1), C(4, 0), C(5, 2), C(6, 3), C(7, 0)]],
  ["Brelan", "3 cartes de même valeur", [C(10, 0), C(10, 2), C(10, 3), C(5, 1), C(1, 0)]],
  ["Double paire", "deux paires", [C(9, 1), C(9, 3), C(1, 0), C(1, 2), C(12, 0)]],
  ["Paire", "2 cartes de même valeur", [C(12, 0), C(12, 1), C(8, 2), C(4, 3), C(0, 1)]],
  ["Hauteur", "rien de tout ça : la plus haute carte compte", [C(12, 2), C(9, 0), C(6, 1), C(3, 3), C(1, 0)]]
];
function rulesBox() {
  return `<details class="panel rules"><summary class="label">Comment on joue</summary>
    <ol>
      <li>Chacun reçoit <b>2 cartes</b>, visibles seulement sur son téléphone.</li>
      <li>Au milieu, <b>5 cartes communes</b> arrivent en trois fois : le <b>flop</b> (3 cartes), le <b>turn</b> (1) et la <b>river</b> (1).</li>
      <li>Avant chaque arrivée, un tour d'enchères. Les deux joueurs après le donneur (<b>D</b>) misent d'office la petite et la grosse blinde.</li>
      <li>À ton tour : <b>se coucher</b>, <b>parole</b> (si personne n'a misé), <b>suivre</b>, <b>miser</b> ou <b>relancer</b> (au moins autant que la dernière relance), ou <b>tapis</b> !</li>
      <li>À la fin, la meilleure combinaison de 5 cartes, parmi tes 2 et les 5 du milieu, gagne le pot. Si tout le monde se couche, le dernier ramasse sans rien montrer.</li>
      <li>Un joueur à tapis ne gagne que ce qu'il a pu suivre : le reste forme un <b>pot annexe</b>.</li>
      <li>Le dernier à avoir des jetons gagne. Si on arrête avant, c'est le plus gros tapis.</li>
    </ol></details>
  <details class="panel rules"><summary class="label">Les combinaisons</summary>
    <ol class="combos">${EXAMPLES.map(([n, d, cs]) => `<li><div><b>${n}</b><small>${d}</small></div><span class="hole xs">${cs.map(c => card(c)).join("")}</span></li>`).join("")}</ol>
    <p class="hint left">De la plus forte à la plus faible. À égalité, la plus haute carte départage, et sinon on partage.</p>
  </details>`;
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
        <li><b>${p.pots}</b> ${p.pots > 1 ? "pots gagnés" : "pot gagné"}</li>
      </ul>
      ${p.big ? `<p class="hint left">Ton plus gros pot : <b>${fmt(p.big)}</b> jetons.</p>` : ""}
      ${p.best >= 0 ? `<p class="hint left">Ta plus belle main : <b>${esc(handName(p.best))}</b>.</p>` : ""}
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
  return header(true) + `<p class="tagline">Texas Hold'em entre amis. Tes cartes restent dans ta main, les jetons sont pour de faux, le bluff pour de vrai.</p>
  <div class="hero-cards" aria-hidden="true">${[C(12, 0), C(12, 1), C(11, 2), C(10, 3)].map((c, i) => card(c, "", i)).join("")}</div>` + errBox() + `<section class="panel">
    <div class="label">Ton prénom</div>${nickField}
  </section>
  ${invited
    ? `<section class="panel"><div class="label">Tu es invité à la partie</div><div class="code">${esc(M.drafts.code)}</div>${joinForm}</section>
       <div class="or">ou</div>
       <button class="btn big" data-act="create">Créer ma propre partie</button>`
    : `<button class="btn primary big" data-act="create">Créer une partie</button>
       <p class="hint on-ground">Tu seras le modo : tu règles la partie, et ton téléphone fait le croupier.</p>
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
    ${isMod() ? `<details class="tvbox"><summary>Afficher la table sur une TV ou un ordi</summary>
      <p class="hint left">Ouvre ce lien sur le grand écran : il montre le tapis, les mises et l'abattage, jamais les cartes cachées.</p>
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
      <p class="lead">${r.phase === "play" ? `Une partie est en cours. Entre ton prénom : tu la regardes${r.rebuy ? ", et tu t'assois à la prochaine main" : ", et tu joues à la suivante"}.` : "Entre ton prénom pour t'asseoir à la table."}</p>
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
  ${settingsPanel({ start: r.start, blindUp: r.blindUp, timer: r.timer, help: r.help, rebuy: r.rebuy, gages: r.gages, gageLvl: r.gageLvl, maison: r.maison, approve: r.approve, apero: r.apero,
    acts: { start: "stack", blindUp: "blind-up", timer: "timer", help: "help", rebuy: "rebuy", gages: "gages", gageLvl: "gage-lvl", maison: "maison", approve: "approve", apero: "apero" } })}
  ${custom}
  <button class="btn primary big" data-act="start" ${why ? "disabled" : ""}>Distribuer les cartes</button>
  ${why ? `<p class="hint on-ground">${esc(why)}</p>` : players.length > MAX_PLAYERS ? `<p class="hint on-ground">Seuls les ${MAX_PLAYERS} premiers arrivés jouent cette partie.</p>` : ""}
  <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
}
function playScreen(r, mod) {
  const dealt = (r.inHand || []).includes(M.me), seated = (r.order || []).includes(M.me);
  const key = `${r.gameId}.${r.hand}`;
  let h = "";
  if (r.paused && !mod) return boardPanel(r, { key }) + pauseScreen() + seatsPanel(r, pInfo, { online: true, rebuy: r.rebuy });
  if (r.paused) h += `<div class="note"><b>Partie en pause.</b> Les joueurs voient un écran de pause. <button class="link" data-act="pause">Reprendre</button></div>`;
  if (r.step === "bet") {
    const cards = myCards(r), myTurn = r.turnUid === M.me, sent = moveNow(r);
    h += boardPanel(r, { key }) + turnLine(r, pInfo);
    h += timerBar(timeLeft(r), r.timer, myTurn ? "Ton temps" : "Temps de " + pInfo(r.turnUid).nick);
    if (!dealt) h += `<section class="panel"><p class="lead">${seated && (r.out || []).includes(M.me) ? "Tu es éliminé. Reste pour voir qui va gagner !" : seated ? "Tu ne joues pas cette main." : r.rebuy ? "Tu regardes cette main. Tu t'assois à la prochaine." : "Tu regardes cette partie. Tu joueras à la prochaine."}</p></section>`;
    else if (!cards) h += `<section class="panel center loading">On distribue…</section>`;
    else {
      h += myCardsPanel(r, cards, { key, uid: M.me, help: r.help });
      if (myTurn && !sent) h += composer(r, M.me, { key: `${r.gameId}.${r.seq}`, pfx: "" });
      else if (myTurn) h += `<p class="note">C'est envoyé…</p>`;
    }
    h += seatsPanel(r, pInfo, { online: true, rebuy: r.rebuy }) + logPanel(r.log, pInfo);
  } else {
    const over = r.res && (r.order || []).filter(id => (r.stacks?.[id] || 0) > 0).length < 2 && !r.rebuy;
    h += r.res ? resultPanel(r, r.res, pInfo, { apero: r.apero, rebuy: r.rebuy, key }) : "";
    h += timerBar(nextLeft(r), NEXT_MS / 1000, over ? "Classement final dans" : "Main suivante dans");
    h += mod ? `<button class="btn primary big" data-act="next">${over ? "Voir le classement final" : "Main suivante"}</button>`
      : waitMod(over ? "Le classement final arrive" : "Main suivante bientôt");
    h += seatsPanel(r, pInfo, { online: true, rebuy: r.rebuy });
  }
  if (mod) {
    const turnAway = r.step === "bet" && r.turnUid && r.turnUid !== M.me;
    h += `<p class="foot">${turnAway ? `<button class="link" data-act="skip-turn">Jouer à la place de ${esc(pInfo(r.turnUid).nick)} (${autoKind(r, r.turnUid) === "check" ? "parole" : "se couche"})</button> · ` : ""}<button class="link" data-act="pause">${r.paused ? "Reprendre la partie" : "Mettre en pause"}</button> · <button class="link" data-act="end">Terminer la partie</button></p>`;
    if (r.step === "bet" && r.turnUid && !idOnline(r.turnUid)) h += `<p class="hint on-ground">${esc(pInfo(r.turnUid).nick)} ne répond plus : l'appli joue pour lui (parole ou se couche).</p>`;
  }
  return h;
}
function endScreen(r, players, mod) {
  const hist = M.hands, rank = ranking(r), titles = computeTitles(r, hist);
  recordGame(r, rank, hist, titles);
  const h = winnerPanel(r, rank, pInfo, hist.length) + palmares(r, rank, hist, titles, pInfo, "share-img")
    + gagesPanel({ on: r.gages, losers: losersOf(r).map(pInfo), lvl: r.gageLvl, seed: r.gameId, house: r.house || [], act: "choose",
      choiceOf: uid => M.choices.find(c => c.uid === uid)?.kind, canChoose: uid => uid === M.me });
  if (!mod) return h + playersPanel(players, false) + waitMod("Le modo peut lancer une nouvelle partie");
  return h + playersPanel(players, true) + `<button class="btn primary big" data-act="newgame">Nouvelle partie</button>
    <p class="hint on-ground">Les joueurs restent à table. Tu pourras changer les réglages avant de relancer.</p>`;
}
function winnerPanel(S, rank, info, hands) {
  const w = rank[0];
  if (!w || !hands) return "";
  const alone = !S.rebuy && (S.order || []).filter(id => (S.stacks?.[id] || 0) > 0).length === 1;
  return `<section class="panel center verdict"><div class="label">${alone ? "Dernier joueur avec des jetons" : "Le plus gros tapis"}</div>
    ${av(info(w), "huge")}<div class="name">${esc(info(w).nick)}</div><div class="vsub">${fmt(S.stacks?.[w] || 0)} jetons · ${plural(hands, "main")}</div></section>`;
}

/* ---------- big screen (TV / laptop): watches the game, never sees a hidden card ---------- */
function renderTv() {
  const r = M.room, players = M.players;
  let h = header(true, "Partie " + M.code) + alerts();
  const key = `${r.gameId}.${r.hand}`;
  if (r.phase === "lobby") {
    h += `<section class="panel center tvjoin">
      <div class="label">Pour jouer, scanne ou tape le code</div>
      <div class="tvrow"><div class="qr big" data-qr="${esc(inviteLink())}"></div><div><div class="code">${esc(M.code)}</div><p class="lead">${esc(location.host + location.pathname)}</p></div></div>
    </section>
    <section class="panel"><div class="label">À table · ${players.length}</div><div class="chips">${players.map(p => chip(p)).join("")}</div></section>
    <section class="panel">${settingsSummary(r)}</section>`;
  } else if (r.phase === "play") {
    if (r.paused) return h + boardPanel(r, { key }) + pauseScreen();
    const main = r.step === "bet"
      ? boardPanel(r, { key }) + turnLine(r, pInfo, { noMe: true }) + timerBar(timeLeft(r), r.timer, "Temps de " + pInfo(r.turnUid).nick) + logPanel(r.log, pInfo)
      : (r.res ? resultPanel(r, r.res, pInfo, { apero: r.apero, rebuy: r.rebuy, key }) : "") + timerBar(nextLeft(r), NEXT_MS / 1000, "Main suivante dans");
    h += `<div class="tvgrid"><div class="stack">${main}</div><div class="stack">${seatsPanel(r, pInfo, { online: true, rebuy: r.rebuy })}</div></div>`;
  } else {
    const hist = M.hands, rank = ranking(r);
    h += winnerPanel(r, rank, pInfo, hist.length) + palmares(r, rank, hist, computeTitles(r, hist), pInfo, "");
  }
  return h;
}

/* ---------- screens: one phone passed around ---------- */
function newLocal(prev) {
  const saved = store.json("local-names", []);
  return {
    phase: "setup", players: prev?.players || (Array.isArray(saved) ? saved : []),
    start: prev?.start || 1000, blindUp: prev ? prev.blindUp || 0 : 10, help: !!prev?.help, rebuy: !!prev?.rebuy,
    gages: !!prev?.gages, gageLvl: prev?.gageLvl || 1, maison: prev ? !!prev.maison : true, apero: !!prev?.apero, customs: prev?.customs || [],
    gameId: rid(), order: [], cast: {}, stacks: {}, rebuys: {}, out: [], hand: 0, seq: 0, step: "bet", history: [], deal: null, handoff: true, choices: {}
  };
}
function saveLocal() {
  store.set("local", JSON.stringify(M.local));
  if (M.local) store.set("local-names", JSON.stringify(M.local.players));
}
const lp = id => M.local.players.find(p => p.id === id) || { id, nick: "?", color: COLORS[0] };
function lDeal(L) {
  const rb = [];
  if (L.rebuy) for (const id of L.order) if (!(L.stacks[id] > 0)) { L.stacks[id] = L.start; L.rebuys[id] = (L.rebuys[id] || 0) + 1; rb.push(id); }
  const ids = L.order.filter(id => L.stacks[id] > 0);
  if (ids.length < 2) { L.phase = "end"; return; }
  L.rb = rb;
  L.deal = prepHand(L, ids);
  L.seq++; L.handoff = true;
}
function lAct(kind, to) {
  const L = M.local;
  if (!act(L, L.deal, L.turnUid, kind, to)) return;
  L.seq++; L.handoff = true; M.peek = false;
  saveLocal(); render();
  window.scrollTo({ top: 0 });
}
function handoff(p, label, act, hint) {
  return `<section class="panel center hand-off">
    <div class="label">${label}</div>
    ${av(p)}<div class="who">${esc(p.nick)}</div>
    <button class="btn primary big" data-act="${act}">C'est moi</button>
    <p class="hint">${hint}</p>
  </section>`;
}
const lWhy = L => L.players.length < MIN_PLAYERS ? `Ajoute au moins ${MIN_PLAYERS} joueurs.` : L.players.length > MAX_PLAYERS ? `${MAX_PLAYERS} joueurs au plus.` : "";
function renderLocal() {
  const L = M.local, n = L.players.length;
  const back = `<button class="link" data-act="go-online">Jouer chacun sur son téléphone</button>`;
  if (L.phase === "setup") {
    return header(true, "1 téléphone") + errBox() + `<section class="panel">
      <p class="lead">Un seul téléphone qui passe de main en main. À ton tour, tu regardes tes cartes en secret, tu joues, et tu passes au suivant.</p>
      <form class="row" data-form="l-name"><input id="l-name" data-draft="l-name" type="text" maxlength="18" autocomplete="off" enterkeyhint="done" placeholder="Prénom d'un joueur" aria-label="Prénom d'un joueur"><button class="btn" type="submit">Ajouter</button></form>
      ${n ? `<div class="chips">${L.players.map(p => chip(p, `<button class="x" data-act="l-del" data-id="${esc(p.id)}" aria-label="Retirer ${esc(p.nick)}">×</button>`)).join("")}</div>` : ""}
      <p class="hint left">Ajoutez-vous dans l'ordre où vous êtes assis : on joue chacun son tour, dans ce sens.</p>
    </section>
    ${settingsPanel({ start: L.start, blindUp: L.blindUp, help: L.help, rebuy: L.rebuy, gages: L.gages, gageLvl: L.gageLvl, maison: L.maison, apero: L.apero,
      acts: { start: "l-stack", blindUp: "l-blind-up", help: "l-help", rebuy: "l-rebuy", gages: "l-gages", gageLvl: "l-gage-lvl", maison: "l-maison", apero: "l-apero" } })}
    ${L.gages && L.maison ? customBlock(L.customs, { form: "l-custom", delAct: "l-del-custom", canDel: () => true, empty: "Ajoutez vos propres gages et vérités, rien que pour ce groupe." }) : ""}
    <button class="btn primary big" data-act="l-start" ${lWhy(L) ? "disabled" : ""}>Distribuer les cartes</button>
    ${lWhy(L) ? `<p class="hint on-ground">${esc(lWhy(L))}</p>` : ""}
    ${rulesBox()}
    <p class="foot">${back}</p>`;
  }
  if (L.phase === "end") {
    const rank = ranking(L), titles = computeTitles(L, L.history);
    const house = L.gages && L.maison ? L.customs : [];
    return header(true, "1 téléphone") + winnerPanel(L, rank, lp, L.history.length) + palmares(L, rank, L.history, titles, lp, "l-share")
      + gagesPanel({ on: L.gages, losers: losersOf(L).map(lp), lvl: L.gageLvl, seed: L.gameId, house, act: "l-choose", choiceOf: uid => L.choices[uid], canChoose: () => true })
      + `<button class="btn primary big" data-act="l-reset">Nouvelle partie</button><p class="foot">${back}</p>`;
  }
  const key = `l${L.gameId}.${L.hand}`;
  let h = header(false, "1 téléphone");
  if (L.step === "bet") {
    const p = lp(L.turnUid);
    h += boardPanel(L, { key }) + turnLine(L, lp, { noMe: true });
    if (L.handoff) h += handoff(p, "Passe le téléphone à", "l-me", "Les autres, regardez ailleurs.");
    else h += myCardsPanel(L, L.deal.holes[p.id], { key: `${key}.${p.id}`, uid: p.id, help: L.help, label: `Les cartes de ${p.nick}` })
      + composer(L, p.id, { key: `${key}.${L.seq}`, pfx: "l-" });
    h += seatsPanel(L, lp, { rebuy: L.rebuy }) + logPanel(L.log, lp);
  } else {
    const over = !L.rebuy && L.order.filter(id => L.stacks[id] > 0).length < 2;
    h += resultPanel(L, L.res, lp, { apero: L.apero, rebuy: L.rebuy, key });
    h += `<button class="btn primary big" data-act="l-next">${over ? "Voir le classement final" : "Main suivante"}</button>`;
    h += seatsPanel(L, lp, { rebuy: L.rebuy });
  }
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
/* The hand of the night: the biggest pot won at a showdown, else the biggest one taken without showing. */
function bestMove(hist, info) {
  const sd = hist.filter(h => !h.bf && (h.w || []).length).sort((a, b) => b.pot - a.pot)[0];
  if (sd) { const id = sd.w[0]; return `${info(id).nick} a raflé ${fmt(sd.pot)} jetons avec ${withHand(sd.sc[id])}.`; }
  const bf = hist.filter(h => (h.w || []).length).sort((a, b) => b.pot - a.pot)[0];
  return bf ? `${info(bf.w[0]).nick} a raflé ${fmt(bf.pot)} jetons sans montrer ses cartes.` : "";
}
async function shareImage(S, hist, info) {
  const rank = ranking(S), titles = computeTitles(S, hist);
  const rows = rank.slice(0, 8).map(id => ({ p: info(id), n: S.stacks?.[id] || 0, out: (S.out || []).includes(id) }));
  const move = bestMove(hist, info);
  try { await Promise.all([document.fonts.load("60px 'Alfa Slab One'"), document.fonts.load("800 30px Onest"), document.fonts.load("500 26px Onest")]); } catch {}
  const W = 1080, cv = document.createElement("canvas"), g = cv.getContext("2d");
  g.font = "800 40px Onest, Arial, sans-serif";
  const moveLines = move ? wrapLines(g, move, W - 200).slice(0, 5) : [];
  const moveH = move ? 120 + moveLines.length * 52 : 0;
  const H = 300 + moveH + rows.length * 150 + 60;
  cv.width = W; cv.height = H;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  g.fillStyle = "#17603F"; g.fillRect(0, 0, W, H);
  // The edge of a casino chip.
  for (let x = 0; x < W; x += 48) { g.fillStyle = "#C8102E"; g.fillRect(x, 0, 32, 22); g.fillStyle = "#F6EEDC"; g.fillRect(x + 32, 0, 16, 22); }
  g.fillStyle = "#F6EEDC"; g.font = "96px 'Alfa Slab One', 'Arial Black', sans-serif"; g.fillText("Poker", 70, 160);
  g.fillStyle = "#BFD9C9"; g.font = "800 30px Onest, Arial, sans-serif";
  g.fillText(`CLASSEMENT · ${plural(hist.length, "MAIN")} · ${new Date().toLocaleDateString("fr-FR")}`, 72, 220);
  let y = 260;
  if (move) {
    g.fillStyle = "#0B1511"; rr(60, y, W - 120, moveH - 30, 26); g.fill();
    g.fillStyle = "#E8B931"; g.font = "800 26px Onest, Arial, sans-serif"; g.fillText("LE COUP DE LA SOIRÉE", 100, y + 56);
    g.fillStyle = "#F6EEDC"; g.font = "800 40px Onest, Arial, sans-serif";
    moveLines.forEach((l, i) => g.fillText(l, 100, y + 112 + i * 52));
    y += moveH;
  }
  rows.forEach((s, i) => {
    const t = titles[s.p.id];
    g.fillStyle = i === 0 ? "#E8B931" : "#F6EEDC"; g.strokeStyle = "#0B1511"; g.lineWidth = 5;
    rr(60, y, W - 120, 128, 26); g.fill(); g.stroke();
    const ink = "#0B1511";
    g.fillStyle = ink; g.font = "52px 'Alfa Slab One', 'Arial Black', sans-serif"; g.fillText(String(i + 1), 95, y + 84);
    g.fillStyle = safeColor(s.p.color); g.beginPath(); g.arc(215, y + 64, 40, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = "38px 'Alfa Slab One', 'Arial Black', sans-serif"; g.textAlign = "center";
    g.fillText((s.p.nick || "?").charAt(0).toUpperCase(), 215, y + 78); g.textAlign = "left";
    g.fillStyle = ink; g.font = "800 40px Onest, Arial, sans-serif"; g.fillText(s.p.nick, 285, y + 58);
    g.font = "500 28px Onest, Arial, sans-serif";
    g.fillText(`${t ? t.title + " · " : ""}${s.out ? "éliminé" : fmt(s.n) + " jetons"}`.slice(0, 60), 285, y + 100);
    y += 150;
  });
  g.fillStyle = "#BFD9C9"; g.font = "500 26px Onest, Arial, sans-serif"; g.fillText(location.host, 72, H - 40);
  const blob = await new Promise(res => cv.toBlob(res, "image/png"));
  const file = new File([blob], "poker-classement.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Poker, le classement" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
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
let lastHtml = "", lastKeys = {}, lastTurn = "", lastBoard = { key: "", n: 0 };
function render() {
  document.body.classList.toggle("tv", M.mode === "room" && M.tv);
  let html;
  if (M.mode === "local" && M.local) html = renderLocal();
  else if (M.mode === "room") html = renderRoom();
  else if (M.mode === "home") html = renderHome();
  else if (M.mode === "setup") html = renderSetup();
  else if (M.mode === "fatal") html = renderFatal();
  else html = header(true) + `<section class="panel center loading">On mélange les cartes…</section>`;
  // French spacing: « Tapis ! » never breaks before its exclamation mark.
  html = html.replace(/ ([!?:;»])(?=[\s<"]|$)/g, " $1").replace(/« /g, "« ");
  if (html !== lastHtml) {
    const a = document.activeElement, fid = a && a.id, ss = a && a.selectionStart, se = a && a.selectionEnd;
    const openDetails = [...app.querySelectorAll("details[open] summary")].map(s => s.textContent);
    app.innerHTML = html;
    lastHtml = html;
    app.querySelectorAll("details summary").forEach(s => { if (openDetails.includes(s.textContent)) s.parentElement.open = true; });
    app.querySelectorAll("[data-draft]").forEach(i => { i.value = M.drafts[i.dataset.draft] || ""; });
    if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(ss, se); } catch {} } }
    // New cards in hand, the pot taken: each gets its little animation once.
    const keys = {};
    for (const [sel, cls] of [[".mycards", "deal"], [".reveal", "lift"]]) {
      const el = app.querySelector(sel), k = el ? el.dataset.key : "";
      if (el && k !== lastKeys[sel]) el.classList.add(cls);
      keys[sel] = k;
    }
    if (keys[".reveal"] && keys[".reveal"] !== lastKeys[".reveal"]) window.scrollTo({ top: 0, behavior: "smooth" });
    lastKeys = keys;
    // Board cards slide in as they are turned over.
    const bd = app.querySelector(".board[data-key]");
    if (bd) {
      const k = bd.dataset.key, n = +bd.dataset.n, from = k === lastBoard.key ? lastBoard.n : 0;
      if (n > from) [...bd.children].slice(from, n).forEach(c => c.classList.add("new"));
      lastBoard = { key: k, n };
    }
    fillQR();
  }
  // A short buzz when it becomes your turn.
  const r = M.room, turn = M.mode === "room" && !M.tv && r?.phase === "play" && r.step === "bet" && !r.paused && r.turnUid === M.me ? r.gameId + r.seq : "";
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
  const nick = (M.drafts.nick || "").trim().slice(0, 18);
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
/* The bet builder, shared by both modes: plus and minus move by one big blind. */
const draftStep = (S, uid, d) => { M.rto = clampTo(S, uid, M.rto + d * (S.bb || 1)); render(); };
const draftQuick = (S, uid, k) => { M.rto = quickTo(S, uid, k); render(); };
function sendMove(kind) {
  const r = M.room;
  if (!r || r.phase !== "play" || r.step !== "bet" || r.turnUid !== M.me || r.paused || moveNow(r)) return;
  const mv = { gameId: r.gameId, seq: r.seq, uid: M.me, kind, at: Date.now() };
  if (kind === "raise") {
    const to = clampTo(r, M.me, M.rto);
    if (to >= raiseBounds(r, M.me).top) mv.kind = "allin"; else mv.to = to;
  }
  write(() => F.setDoc(rMove(M.code, `${r.gameId}_${r.seq}`), mv), "Trop tard, ce n'est plus ton tour.");
}
function localRaise() {
  const L = M.local, uid = L.turnUid, to = clampTo(L, uid, M.rto);
  lAct(to >= raiseBounds(L, uid).top ? "allin" : "raise", to);
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
  "share": () => { navigator.share({ title: "Poker", text: `Rejoins la table ${M.code} !`, url: inviteLink() }).catch(() => {}); },
  "copy": () => copy(inviteLink(), "Lien d'invitation copié."),
  "copy-tv": () => copy(tvLink(), "Lien grand écran copié."),
  "toggle-qr": () => { M.showQR = !M.showQR; render(); },
  "gkind": d => { M.gkind = d.id === "truth" ? "truth" : "dare"; render(); document.getElementById(M.mode === "local" ? "l-custom" : "custom")?.focus(); },
  "hide": () => { M.hide = !M.hide; M.peek = false; store.set("hide", M.hide ? "1" : null); render(); },

  /* playing a turn */
  "fold": () => sendMove("fold"),
  "check": () => sendMove("check"),
  "call": () => sendMove("call"),
  "raise": () => sendMove("raise"),
  "allin": () => sendMove("allin"),
  "less": () => { if (M.room) draftStep(M.room, M.me, -1); },
  "more": () => { if (M.room) draftStep(M.room, M.me, 1); },
  "quick": d => { if (M.room) draftQuick(M.room, M.me, d.id); },
  "choose": d => {
    const r = M.room; if (!r || d.uid !== M.me) return;
    write(() => F.setDoc(rChoice(M.code, `${r.gameId}_${M.me}`), { gameId: r.gameId, uid: M.me, kind: d.id }), "Ce choix n'est plus possible.");
  },
  "skip-turn": modOnly(() => {
    const r = M.room, d = M.deal;
    if (!r || r.step !== "bet" || !d || d.hand !== r.hand) return;
    write(() => applyMove(r, d, autoKind(r, r.turnUid)));
  }),
  "next": modOnly(() => {
    const r = M.room;
    if (!r || r.step !== "done") return;
    write(() => nextHand(r));
  }),
  "pause": modOnly(() => {
    const r = M.room;
    if (!r.paused) { write(() => patchRoom({ paused: true, pausedAt: F.serverTimestamp() })); return; }
    // Resuming moves the timers forward by the length of the pause.
    const gap = Math.max(0, serverNow() - tsMs(r.pausedAt));
    write(() => patchRoom({ paused: false, pausedAt: null, ...(r.turnAt ? { turnAt: F.Timestamp.fromMillis(tsMs(r.turnAt) + gap) } : {}),
      ...(r.doneAt ? { doneAt: F.Timestamp.fromMillis(tsMs(r.doneAt) + gap) } : {}) }));
  }),
  "end": modOnly(() => write(() => patchRoom({ phase: "end", paused: false }))),
  "newgame": modOnly(() => {
    const old = M.room?.gameId, code = M.code;
    write(async () => {
      await patchRoom(freshGame());
      if (!old) return;
      try {
        for (const col of [cMoves(code), cChoices(code), cHands(code)]) {
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
  "stack": roomSetting("start", d => STACKS.includes(+d.id) ? +d.id : 1000),
  "blind-up": roomSetting("blindUp", d => BLIND_UPS.includes(+d.id) ? +d.id : 0),
  "timer": roomSetting("timer", d => TIMERS.includes(+d.id) ? +d.id : 0),
  "help": roomSetting("help", (d, r) => !r.help),
  "rebuy": roomSetting("rebuy", (d, r) => !r.rebuy),
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
  "share-img": () => { const r = M.room; if (r) shareImage(r, M.hands, pInfo).catch(() => flash("Impossible de créer l'image.")); },
  "go-local": () => { M.mode = "local"; if (!M.local || M.local.phase === "end") M.local = newLocal(M.local); M.err = ""; saveLocal(); render(); },
  "go-online": () => { M.err = ""; if (M.code) M.mode = "room"; else M.mode = F && M.me ? "home" : (isPlaceholder() ? "setup" : "fatal"); render(); },
  "reload": () => location.reload(),

  /* one phone */
  "l-del": d => { M.local.players = M.local.players.filter(p => p.id !== d.id); saveLocal(); render(); },
  "l-stack": d => { M.local.start = STACKS.includes(+d.id) ? +d.id : 1000; saveLocal(); render(); },
  "l-blind-up": d => { M.local.blindUp = BLIND_UPS.includes(+d.id) ? +d.id : 0; saveLocal(); render(); },
  "l-help": () => { M.local.help = !M.local.help; saveLocal(); render(); },
  "l-rebuy": () => { M.local.rebuy = !M.local.rebuy; saveLocal(); render(); },
  "l-gages": () => { M.local.gages = !M.local.gages; saveLocal(); render(); },
  "l-gage-lvl": d => { M.local.gageLvl = Math.min(4, Math.max(1, +d.id || 1)); saveLocal(); render(); },
  "l-maison": () => { M.local.maison = !M.local.maison; saveLocal(); render(); },
  "l-apero": () => { M.local.apero = !M.local.apero; saveLocal(); render(); },
  "l-del-custom": d => { M.local.customs = M.local.customs.filter(c => c.id !== d.id); saveLocal(); render(); },
  "l-start": () => {
    const L = M.local;
    if (lWhy(L)) return;
    const order = L.players.map(p => p.id);
    Object.assign(L, { phase: "play", gameId: rid(), order, cast: {}, stacks: Object.fromEntries(order.map(id => [id, L.start])), rebuys: {}, out: [],
      hand: 0, seq: 0, history: [], choices: {}, button: order[rand(order.length)] });
    lDeal(L);
    saveLocal(); render();
  },
  "l-me": () => { M.local.handoff = false; M.peek = false; saveLocal(); render(); },
  "l-fold": () => lAct("fold"),
  "l-check": () => lAct("check"),
  "l-call": () => lAct("call"),
  "l-raise": () => localRaise(),
  "l-allin": () => lAct("allin"),
  "l-less": () => draftStep(M.local, M.local.turnUid, -1),
  "l-more": () => draftStep(M.local, M.local.turnUid, 1),
  "l-quick": d => draftQuick(M.local, M.local.turnUid, d.id),
  "l-next": () => { const L = M.local; lDeal(L); saveLocal(); render(); window.scrollTo({ top: 0 }); },
  "l-end": () => { M.local.phase = "end"; saveLocal(); render(); },
  "l-choose": d => { M.local.choices[d.uid] = d.id; saveLocal(); render(); },
  "l-share": () => { const L = M.local; shareImage(L, L.history, lp).catch(() => flash("Impossible de créer l'image.")); },
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
/* Holding the button shows the cards; letting go, or sliding off, hides them again. */
document.addEventListener("pointerdown", e => { if (e.target.closest("[data-hold]")) { e.preventDefault(); M.peek = true; render(); } });
const unpeek = () => { if (M.peek) { M.peek = false; render(); } };
for (const ev of ["pointerup", "pointercancel", "blur"]) window.addEventListener(ev, unpeek);
document.addEventListener("contextmenu", e => { if (e.target.closest(".mycards")) e.preventDefault(); });
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
