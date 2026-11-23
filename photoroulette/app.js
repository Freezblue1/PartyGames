import { firebaseConfig } from "./config.js";
import * as Soiree from "../soiree.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const C = "prRooms";
const COLORS = ["#D93A26","#2F62D0","#18825A","#7C47CC","#B86400","#C2307C","#0F7C8F","#5E5C17","#8C3B1F","#3D4A63"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const K = "pr";
const PER = [3, 5, 8, 10];
const TIMERS = [0, 10, 15, 20, 30];
const MIN_PLAYERS = 3;
const BASE = 100, BONUS = 50;
// Une photo réduite tient dans un seul document Firestore (limité à 1 Mo) : pas besoin de Firebase Storage.
// 1080 px suffisent sur un écran de téléphone, et chaque photo se charge plus vite pendant la partie.
const MAX_SIDE = 1080, MAX_DATA = 600000;
const TILTS = [-2, 1.5, -1, 2, -1.5];

const app = document.getElementById("app");
const picker = document.getElementById("picker");
const folder = document.getElementById("folder");
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const ANDROID = /Android/i.test(navigator.userAgent);
// Une photo de la roulette est soit un fichier déjà remis par le téléphone (File), soit une photo repérée dans
// un dossier autorisé ({ lazy, h, name }) : juste un nom, le fichier n'est ouvert que s'il est tiré au sort.
const fkey = f => f.lazy ? "dir:" + f.name : f.name + "|" + f.size + "|" + f.lastModified;
const asFile = it => it.lazy ? it.h.getFile() : Promise.resolve(it);
// Accès direct aux dossiers (Chrome Android 132+, Chrome et Edge sur ordinateur ; pas l'iPhone).
const FSA = typeof window.showDirectoryPicker === "function";
const IMG_NAME = /\.(jpe?g|png|heic|heif|webp|gif|avif)$/i;
// Parcourt un dossier et ses sous-dossiers en ne lisant que les noms, sans les dossiers cachés de miniatures.
async function scanDir(root, onFound, stopped) {
  const out = [];
  const walk = async (dir, depth) => {
    for await (const [name, h] of dir.entries()) {
      if (stopped()) return;
      if (name.startsWith(".")) continue;
      if (h.kind === "directory") { if (depth < 8 && !/thumb|cache/i.test(name)) await walk(h, depth + 1); }
      else if (IMG_NAME.test(name)) { out.push({ lazy: true, h, name }); if (out.length % 100 === 0) onFound(out.length); }
    }
  };
  await walk(root, 0);
  return out;
}
// Les dossiers autorisés sont retenus sur ce téléphone : à la prochaine partie, un toucher suffit pour les reprendre.
function idb(mode, fn) {
  return new Promise((ok, ko) => {
    const req = indexedDB.open("photoroulette", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("dirs");
    req.onerror = () => ko(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction("dirs", mode), q = fn(tx.objectStore("dirs"));
      tx.oncomplete = () => { ok(q && q.result); req.result.close(); };
      tx.onerror = () => ko(tx.error);
    };
  });
}
function saveDirs() {
  if (!FSA) return;
  M.savedDirs = M.sources.filter(s => s.handle).map(s => s.handle);
  idb("readwrite", st => st.put(M.savedDirs, "list")).catch(() => {});
}
const isImage = f => ((f.type || "").startsWith("image/") || /\.(jpe?g|png|heic|heif|webp|gif|avif)$/i.test(f.name))
  && !/(^|\/)\.|thumb/i.test(f.webkitRelativePath || "");
const extOf = f => (f.name.match(/\.([a-z0-9]+)$/i) || ["", "?"])[1].toLowerCase();
const lb = document.getElementById("lb");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rid = () => Math.random().toString(36).slice(2, 10);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const safeColor = c => COLORS.includes(c) ? c : COLORS[0];
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
const clampPer = n => PER.includes(+n) ? +n : 5;
const clampTimer = n => TIMERS.includes(+n) ? +n : 20;
const ms = t => t && t.toMillis ? t.toMillis() : null;
const genCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const normCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
const hashCode = () => { const c = normCode(location.hash.slice(1)); return c.length === 4 ? c : ""; };
const store = {
  get(k) { try { return localStorage.getItem(K + "-" + k); } catch { return null; } },
  set(k, v) { if (Soiree.replaying) return; try { v == null ? localStorage.removeItem(K + "-" + k) : localStorage.setItem(K + "-" + k, v); } catch {} }
};
const names = list => {
  const ns = list.map(p => p.nick);
  return ns.length <= 1 ? ns.join("") : ns.slice(0, -1).join(", ") + " et " + ns[ns.length - 1];
};
const points = (at, start, timer) => {
  const win = (timer || 30) * 1000, t = Math.max(0, at - start);
  return BASE + Math.round(BONUS * Math.max(0, 1 - t / win));
};

/* ---------- state ---------- */
const M = {
  mode: "boot", me: null, code: null,
  room: null, roomReady: false, players: [], playersReady: false, votes: [],
  // Mes photos dans la partie en cours (numéros). La roulette : toutes les photos choisies dans la galerie (pool),
  // celles pas encore tirées (spare), le fichier d'origine de chaque photo tirée (fileOf), celles déjà jouées (used).
  mine: [], mineGame: null, pool: [], sources: [], spare: [], spareGame: null, fileOf: {}, used: new Set(),
  scan: null, savedDirs: [],
  up: null, trim: false, syncing: false, picking: null,
  pending: null, renaming: false, showMine: false, showRules: false, seen: {},
  err: "", flash: "", busy: false, fatal: "",
  drafts: { nick: store.get("nick") || "", code: hashCode() }
};
const isMod = () => !!M.room && M.room.hostUid === M.me;
const inRoom = () => M.players.some(p => p.id === M.me);

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
const rRoom = code => F.doc(DB, C, code);
const rPlayer = (code, id) => F.doc(DB, C, code, "players", id);
const cPlayers = code => F.collection(DB, C, code, "players");
const rVote = (code, id) => F.doc(DB, C, code, "votes", id);
const cVotes = code => F.collection(DB, C, code, "votes");
const cPhotos = code => F.collection(DB, C, code, "photos");
const rPhoto = (code, id) => F.doc(DB, C, code, "photos", id);
const rPic = (code, id) => F.doc(DB, C, code, "pics", id);
const rOwner = (code, id) => F.doc(DB, C, code, "owners", id);
const cOwners = code => F.collection(DB, C, code, "owners");

let subs = [], unVotes = null;
function leaveSubs() { subs.forEach(u => u()); subs = []; if (unVotes) unVotes(); unVotes = null; }
function onErr(e) {
  M.err = e && e.code === "permission-denied" ? "Accès refusé à cette partie." : "Connexion à la partie perdue. Recharge la page.";
  render();
}
function subVotes() {
  if (unVotes) unVotes();
  M.votes = [];
  const g = M.room?.gameId;
  if (!g) { unVotes = null; return; }
  unVotes = F.onSnapshot(F.query(cVotes(M.code), F.where("gameId", "==", g)), q => {
    M.votes = q.docs.map(d => d.data({ serverTimestamps: "estimate" })); render();
  }, onErr);
}
function enterRoom(code) {
  Soiree.roomEntered(code);
  leaveSubs();
  resetPics();
  Object.assign(M, { mode: "room", code, room: null, roomReady: false, players: [], playersReady: false, votes: [], pending: null, renaming: false, mine: [], mineGame: null, showMine: false });
  store.set("room", code);
  try { history.replaceState(null, "", "#" + code); } catch {}
  subs.push(F.onSnapshot(rRoom(code), s => {
    if (!s.exists()) { M.err = "Cette partie n'existe plus."; exitRoom(); return; }
    const prev = M.room?.gameId;
    M.room = s.data({ serverTimestamps: "estimate" }); M.roomReady = true;
    if (M.room.gameId !== prev) {
      subVotes();
      if (prev) resetPics();
      // Les photos tirées à la partie précédente ne ressortent pas à la suivante.
      Object.values(M.fileOf).forEach(k => M.used.add(k));
      Object.assign(M, { mine: [], mineGame: null, showMine: false, fileOf: {} });
      loadMine();
    }
    if (M.pending && (M.pending.g !== M.room.gameId || M.pending.r !== M.room.round)) M.pending = null;
    render(); selfDuty();
  }, onErr));
  subs.push(F.onSnapshot(cPlayers(code), q => {
    const was = inRoom();
    M.players = q.docs.map(d => ({ id: d.id, ...d.data(), nick: String(d.data().nick || "?").slice(0, 18) })).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    M.playersReady = true;
    // Retiré par le modo avant le début : mes photos quittent la partie avec moi.
    if (was && !inRoom() && M.room?.phase === "lobby" && M.mineGame === M.room.gameId && M.mine.length) {
      const ids = M.mine; M.mine = []; M.spare = []; M.fileOf = {};
      dropPids(code, ids).catch(() => {});
    }
    render(); selfDuty();
  }, onErr));
  render();
}
function exitRoom() {
  if (M.scan) M.scan.stop = true;
  M.scan = null;
  leaveSubs();
  resetPics();
  Object.assign(M, { mode: "home", code: null, room: null, players: [], votes: [], pending: null, mine: [], mineGame: null, pool: [], sources: [], spare: [], spareGame: null, fileOf: {}, used: new Set() });
  store.set("room", null);
  try { history.replaceState(null, "", location.pathname + location.search); } catch {}
  render();
}
async function joinRoom(code, nick) {
  const ps = await F.getDocs(cPlayers(code));
  const mine = ps.docs.find(d => d.id === M.me);
  if (mine) { await F.updateDoc(rPlayer(code, M.me), { nick }); return; }
  const used = new Set(ps.docs.map(d => d.data().color));
  const fav = Soiree.color(), color = fav && !used.has(fav) ? fav : COLORS.find(c => !used.has(c)) || COLORS[ps.size % COLORS.length];
  await F.setDoc(rPlayer(code, M.me), { nick, color, joinedAt: Date.now() });
}
const freshGame = () => ({ gameId: rid(), phase: "lobby", round: 0, step: "guess", deck: [], order: [], cast: {}, shown: [], answers: {}, gains: {}, roundAt: null });
const freshRoom = () => ({ ...freshGame(), perPlayer: 5, timer: 20, totals: {}, games: 0, scoredGame: "" });
const patchRoom = p => F.updateDoc(rRoom(M.code), p);

/* ---------- photos ---------- */
// onload plutôt que decode() : decode() attend que la page soit visible, onload continue écran verrouillé.
const loadImg = url => new Promise((ok, ko) => {
  const img = new Image();
  img.alt = ""; img.draggable = false;
  img.onload = () => ok(img); img.onerror = () => ko(new Error("illisible"));
  img.src = url;
});
// Réduite, recompressée en JPEG : la position GPS et les autres métadonnées de la photo disparaissent au passage.
// D'abord dans un fil à part (l'écran reste fluide pendant le développement), sinon ici, à l'ancienne.
const SHRINK_SRC = `self.onmessage = async e => {
  const { id, file, side, max } = e.data;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const W = bmp.width, H = bmp.height;
    if (!W || !H) throw new Error("vide");
    let s = side, q = 0.8;
    for (let k = 0; k < 8; k++) {
      const r = Math.min(1, s / Math.max(W, H)), w = Math.max(1, Math.round(W * r)), h = Math.max(1, Math.round(H * r));
      const c = new OffscreenCanvas(w, h), x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h);
      const blob = await c.convertToBlob({ type: "image/jpeg", quality: q });
      if (Math.ceil(blob.size / 3) * 4 + 23 <= max) { bmp.close(); self.postMessage({ id, blob, data: new FileReaderSync().readAsDataURL(blob) }); return; }
      if (q > 0.56) q -= 0.12; else s = Math.round(s * 0.8);
    }
    bmp.close();
    throw new Error("trop lourde");
  } catch (err) { self.postMessage({ id, err: String((err && err.message) || err) }); }
};`;
let shrinker = null, shrinkOk = typeof Worker === "function" && typeof OffscreenCanvas === "function" && typeof createImageBitmap === "function", shrinkSeq = 0;
const shrinkWait = new Map();
function shrinkInWorker(file) {
  if (!shrinker) {
    shrinker = new Worker(URL.createObjectURL(new Blob([SHRINK_SRC], { type: "text/javascript" })));
    shrinker.onmessage = e => {
      const w = shrinkWait.get(e.data.id);
      if (!w) return;
      shrinkWait.delete(e.data.id);
      e.data.err ? w.ko(new Error(e.data.err)) : w.ok({ data: e.data.data, blob: e.data.blob });
    };
    shrinker.onerror = () => { shrinkOk = false; shrinkWait.forEach(w => w.ko(new Error("fil"))); shrinkWait.clear(); };
  }
  return new Promise((ok, ko) => {
    const id = ++shrinkSeq;
    shrinkWait.set(id, { ok, ko });
    shrinker.postMessage({ id, file, side: MAX_SIDE, max: MAX_DATA });
  });
}
async function compress(file) {
  if (shrinkOk) { try { return await shrinkInWorker(file); } catch {} }
  return compressHere(file);
}
async function compressHere(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) throw new Error("vide");
    let side = MAX_SIDE, q = 0.8;
    for (let k = 0; k < 8; k++) {
      const s = Math.min(1, side / Math.max(W, H)), w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
      const data = c.toDataURL("image/jpeg", q);
      c.width = c.height = 0;
      if (data.length <= MAX_DATA) return { data, blob: await (await fetch(data)).blob() };
      if (q > 0.56) q -= 0.12; else side = Math.round(side * 0.8);
    }
    throw new Error("trop lourde");
  } finally { URL.revokeObjectURL(url); }
}

// Les images déjà développées sur ce téléphone : numéro → { url (blob:), img (nœud réutilisé, sans clignotement) }.
const PIC = new Map();
async function picFromData(pid, data) {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(data)) throw new Error("format");
  const blob = await (await fetch(data)).blob();
  const url = URL.createObjectURL(blob);
  const img = await loadImg(url).catch(e => { URL.revokeObjectURL(url); throw e; });
  const e = PIC.get(pid) || {};
  Object.assign(e, { ok: true, fail: false, url, img });
  PIC.set(pid, e);
}
function putPic(pid, blob) {
  const url = URL.createObjectURL(blob);
  loadImg(url).then(img => {
    const e = PIC.get(pid) || {};
    Object.assign(e, { ok: true, fail: false, url, img });
    PIC.set(pid, e);
    render();
  }, () => URL.revokeObjectURL(url));
}
function loadPic(pid) {
  if (!pid || !F || !M.code || PIC.has(pid)) return;
  const e = {};
  PIC.set(pid, e);
  F.getDoc(rPic(M.code, pid))
    .then(s => { if (!s.exists()) throw new Error("absente"); return picFromData(pid, String(s.data().data || "")); })
    .catch(() => { if (PIC.get(pid) === e) e.fail = true; })
    .finally(() => render());
}
function dropPic(pid) { const e = PIC.get(pid); if (e?.url) URL.revokeObjectURL(e.url); PIC.delete(pid); }
function resetPics() { [...PIC.keys()].forEach(dropPic); }
function mountPhotos() {
  app.querySelectorAll("[data-load]").forEach(el => loadPic(el.dataset.load));
  app.querySelectorAll(".ph[data-pid]").forEach(el => {
    const pid = el.dataset.pid, e = PIC.get(pid);
    if (!e) { loadPic(pid); return; }
    if (e.ok) { if (e.img.parentNode !== el) el.replaceChildren(e.img); el.classList.add("ready"); }
    else if (e.fail) el.classList.add("fail");
  });
}

async function dropPids(code, pids) {
  for (let i = 0; i < pids.length; i += 150) {
    const b = F.writeBatch(DB);
    for (const pid of pids.slice(i, i + 150)) { b.delete(rPhoto(code, pid)); b.delete(rPic(code, pid)); b.delete(rOwner(code, pid)); }
    await b.commit();
  }
}
async function cleanup(code, g) {
  try {
    const q = await F.getDocs(F.query(cPhotos(code), F.where("gameId", "==", g)));
    await dropPids(code, q.docs.map(d => d.id));
  } catch {}
}
async function loadMine() {
  const code = M.code, g = M.room?.gameId;
  if (!g || !M.me) return;
  try {
    const q = await F.getDocs(F.query(cOwners(code), F.where("uid", "==", M.me)));
    if (M.code !== code || M.room?.gameId !== g) return;
    const cur = [], stale = [];
    q.docs.forEach(d => (d.data().gameId === g ? cur : stale).push(d.id));
    M.mine = cur; M.mineGame = g;
    // Restes d'une ancienne partie pas effacés à temps : je fais le ménage moi-même.
    if (stale.length) dropPids(code, stale).catch(() => {});
    render(); selfDuty();
  } catch { M.mineGame = g; render(); }
}
async function syncCount() {
  const r = M.room, me = M.players.find(p => p.id === M.me);
  if (!r || !me || r.phase !== "lobby" || M.mineGame !== r.gameId || M.syncing) return;
  if (me.pg === r.gameId && me.photos === M.mine.length) return;
  M.syncing = true;
  try { await F.updateDoc(rPlayer(M.code, M.me), { pg: r.gameId, photos: M.mine.length }); } catch {}
  M.syncing = false;
}
// Tire des photos au hasard parmi celles choisies dans la galerie, jusqu'au nombre demandé par le modo.
async function fill() {
  const r = M.room;
  if (!r || r.phase !== "lobby" || M.up || !inRoom() || M.mineGame !== r.gameId) return;
  const g = r.gameId, code = M.code, need = clampPer(r.perPlayer) - M.mine.length;
  if (need <= 0 || !M.spare.length) return;
  M.up = { done: 0, need, bad: 0 }; M.err = ""; render();
  // Un format que ce navigateur ne sait pas lire (souvent HEIC sur Android) : on saute les autres fichiers du même format.
  const badExt = new Set(), inflight = new Set();
  const live = () => M.room?.gameId === g && M.room?.phase === "lobby" && M.code === code;
  const send = async (file, c) => {
    const pid = F.doc(cPhotos(code)).id;
    const b = F.writeBatch(DB);
    b.set(rPhoto(code, pid), { gameId: g });
    b.set(rPic(code, pid), { gameId: g, data: c.data });
    b.set(rOwner(code, pid), { gameId: g, uid: M.me });
    await b.commit();
    M.mine.push(pid);
    M.fileOf[pid] = fkey(file);
    if (M.up) M.up.done++;
    putPic(pid, c.blob);
    render();
  };
  // La photo suivante se prépare pendant que la précédente part : au plus deux envois à la fois.
  try {
    while (M.spare.length && M.mine.length + inflight.size < clampPer(M.room?.perPlayer) && live()) {
      const file = M.spare.shift();
      if (badExt.has(extOf(file))) { M.up.bad++; continue; }
      let c;
      try { c = await compress(await asFile(file)); } catch { M.up.bad++; badExt.add(extOf(file)); continue; }
      if (!live()) break;
      const p = send(file, c);
      inflight.add(p);
      p.then(() => inflight.delete(p), () => inflight.delete(p));
      if (inflight.size >= 2) await Promise.race(inflight);
    }
    await Promise.all(inflight);
  } catch (e) {
    await Promise.allSettled(inflight);
    M.err = e && e.code === "permission-denied" ? "La partie a commencé : tes dernières photos n'ont pas été ajoutées."
      : "Envoi impossible. Vérifie ton réseau et réessaie.";
  }
  const bad = M.up.bad, short = M.mine.length < clampPer(M.room?.perPlayer);
  M.up = null;
  if (bad) flash(`${plural(bad, "fichier")} illisible${bad > 1 ? "s" : ""} sauté${bad > 1 ? "s" : ""}${short ? " : choisis d'autres photos pour compléter." : "."}`);
  await syncCount();
  render();
}
// Ajoute des fichiers à la roulette (sans doublon) et relance le tirage sur toute la sélection.
// Le téléphone ne laisse choisir qu'un dossier à la fois : chaque choix s'ajoute aux précédents, rangé dans M.sources.
const canAddPhotos = () => { const r = M.room; return !!r && r.phase === "lobby" && inRoom() && !M.up && !M.trim && !M.scan; };
function addToPool(list, fromFolder) {
  if (!canAddPhotos()) return;
  const files = list.filter(isImage);
  if (!files.length) { flash("Aucune photo dans ce choix."); return; }
  const label = fromFolder ? (files[0].webkitRelativePath || "").split("/")[0] || "Dossier" : "Choisies dans la galerie";
  if (!addItems(files, label, !!fromFolder, null)) { flash("Ces photos sont déjà dans ta roulette."); return; }
  spin();
}
// Range des photos dans la roulette sous une source (dossier ou sélection), sans doublon ; renvoie combien sont nouvelles.
function addItems(items, label, folder, handle) {
  const have = new Set(M.pool.map(fkey)), keys = new Set();
  for (const f of items) { const k = fkey(f); if (!have.has(k)) { have.add(k); keys.add(k); M.pool.push(f); } }
  if (!keys.size) return 0;
  const same = M.sources.find(s => s.label === label && s.folder === folder);
  if (same) { keys.forEach(k => same.keys.add(k)); if (handle) same.handle = handle; }
  else M.sources.push({ id: rid(), label, folder, keys, handle });
  return keys.size;
}
// Dossiers autorisés : on y repère les photos par leur nom, avec le compte qui monte, et on peut arrêter en route.
async function addDirs(handles) {
  if (!canAddPhotos()) return;
  const code = M.code;
  let added = 0;
  for (const h of handles) {
    const scan = M.scan = { label: h.name, found: 0, stop: false };
    render();
    let items = [];
    try {
      items = await scanDir(h, n => { scan.found = n; if (M.scan === scan) render(); }, () => scan.stop);
    } catch { flash(`Impossible de lire le dossier ${h.name}.`); }
    // Partie quittée pendant la recherche : ces photos ne vont pas dans une autre partie.
    if (M.code !== code || M.scan !== scan) return;
    const stopped = scan.stop;
    if (items.length) {
      const n = addItems(items, h.name, true, h);
      added += n;
      if (!n) flash(`Les photos de ${h.name} sont déjà dans ta roulette.`);
    } else if (!stopped) flash(`Aucune photo dans ${h.name}.`);
    if (stopped) break;
  }
  M.scan = null;
  saveDirs();
  render();
  if (added) spin();
}
async function pickDir() {
  if (!canAddPhotos()) return;
  let h;
  // showDirectoryPicker doit partir pendant le toucher : aucun await avant.
  try { h = await window.showDirectoryPicker({ id: "photoroulette", mode: "read", startIn: "pictures" }); }
  catch { return; }
  addDirs([h]);
}
async function reuseDirs() {
  if (!canAddPhotos()) return;
  const ok = [];
  for (const h of M.savedDirs) {
    try {
      let p = await h.queryPermission({ mode: "read" });
      if (p !== "granted") p = await h.requestPermission({ mode: "read" });
      if (p === "granted") ok.push(h);
    } catch {}
  }
  if (ok.length) addDirs(ok);
  else flash("Le téléphone n'a pas redonné l'accès : choisis à nouveau le dossier.");
}
// Remet les photos tirées dans la roulette et en tire de nouvelles parmi toute la sélection.
async function spin() {
  const r = M.room;
  if (!r || r.phase !== "lobby" || !inRoom() || M.up || M.trim || M.mineGame !== r.gameId) return;
  const g = r.gameId, code = M.code;
  if (M.mine.length) {
    const ids = M.mine;
    M.trim = true; render();
    try {
      await dropPids(code, ids);
      M.mine = M.mine.filter(x => !ids.includes(x));
      ids.forEach(id => { dropPic(id); delete M.fileOf[id]; });
    } catch { M.trim = false; flash("Nouveau tirage impossible. Vérifie ton réseau."); return; }
    M.trim = false;
  }
  const fresh = M.pool.filter(f => !M.used.has(fkey(f)));
  M.spare = shuffle(fresh.length >= clampPer(r.perPlayer) ? fresh : M.pool);
  M.spareGame = g;
  await fill();
}
// Ce que chaque téléphone fait seul : compter ses photos, en tirer d'autres, rendre celles en trop si le modo baisse le nombre.
function selfDuty() {
  const r = M.room;
  if (!r || r.phase !== "lobby" || !inRoom() || M.mineGame !== r.gameId || M.up || M.trim) return;
  const per = clampPer(r.perPlayer), code = M.code;
  if (M.mine.length > per) {
    const extra = M.mine.slice(per);
    M.trim = true;
    dropPids(code, extra)
      .then(() => { M.mine = M.mine.filter(x => !extra.includes(x)); extra.forEach(dropPic); })
      .catch(() => {})
      .finally(() => { M.trim = false; syncCount(); render(); });
    return;
  }
  if (M.mine.length < per && M.spare.length && M.spareGame === r.gameId) { fill(); return; }
  syncCount();
}

/* ---------- game logic ---------- */
function who(id) {
  const p = M.players.find(x => x.id === id);
  if (p) return p;
  const c = M.room?.cast?.[id];
  if (c) return { id, nick: String(c.nick || "?").slice(0, 18), color: c.color, gone: true };
  return { id, nick: "Joueur parti", color: "#3D4A63", gone: true };
}
function people(r) {
  const ids = [...new Set([...Object.keys(r.cast || {}), ...M.players.map(p => p.id)])];
  return ids.map(who);
}
function votesMap(round, withPending = true) {
  const g = M.room?.gameId, vm = {};
  for (const v of M.votes) if (v.gameId === g && v.round === round) vm[v.voter] = v.target;
  const pv = M.pending;
  if (withPending && pv && pv.g === g && pv.r === round) vm[M.me] = pv.t;
  return vm;
}
// Début de la manche : l'heure du serveur, sauf si l'horloge du téléphone est en retard sur elle.
function roundStart(r) {
  const k = r.gameId + "_" + r.round;
  if (!M.seen[k]) M.seen[k] = Date.now();
  const at = ms(r.roundAt);
  return at == null || at > Date.now() ? M.seen[k] : at;
}
const roundEnd = r => r.timer ? roundStart(r) + r.timer * 1000 : 0;
function gameScores(r) {
  const s = {};
  for (const [k, g] of Object.entries(r.gains || {})) {
    if (!r.answers?.[k]) continue;
    for (const [u, p] of Object.entries(g || {})) { s[u] = s[u] || { pts: 0, ok: 0 }; s[u].pts += +p || 0; s[u].ok++; }
  }
  return s;
}
const ranked = (list, key) => {
  const out = list.slice().sort((a, b) => b[key] - a[key]);
  out.forEach((x, i) => { x.pos = i && out[i - 1][key] === x[key] ? out[i - 1].pos : i + 1; });
  return out;
};

async function doReveal(r) {
  if (r.phase !== "play" || r.step !== "guess") return;
  const pid = (r.deck || [])[r.round - 1], shown = r.shown || [];
  await patchRoom(shown.includes(pid) ? { step: "reveal" } : { step: "reveal", shown: [...shown, pid] });
}
// Une fois la photo dévoilée, les règles laissent lire son propriétaire : le modo l'inscrit et compte les points.
async function finishReveal(r) {
  const code = M.code, g = r.gameId, round = r.round, pid = (r.deck || [])[round - 1];
  let owner = "?";
  try { const s = await F.getDoc(rOwner(code, pid)); if (s.exists() && s.data().uid) owner = s.data().uid; } catch {}
  const q = await F.getDocs(F.query(cVotes(code), F.where("gameId", "==", g), F.where("round", "==", round)));
  const gains = {}, start = ms(r.roundAt) || Date.now();
  if (owner !== "?") for (const d of q.docs) {
    const v = d.data({ serverTimestamps: "estimate" });
    if (v.voter !== owner && v.target === owner) gains[v.voter] = points(ms(v.at) || start, start, r.timer);
  }
  await patchRoom({ ["answers.r" + round]: owner, ["gains.r" + round]: gains });
}
async function endGame() {
  const code = M.code, s = await F.getDoc(rRoom(code));
  if (!s.exists()) return;
  const r = s.data(), g = r.gameId, p = { phase: "end" };
  if (r.scoredGame !== g) {
    const t = { ...(r.totals || {}) };
    for (const [u, sc] of Object.entries(gameScores(r))) t[u] = (t[u] || 0) + sc.pts;
    Object.assign(p, { totals: t, scoredGame: g, games: (r.games || 0) + 1 });
  }
  await patchRoom(p);
  // Les photos ne restent pas sur le serveur : chaque téléphone garde seulement celles qu'il a vues.
  cleanup(code, g);
}
let duty = false, dutyWait = 0, allKey = "", allSince = 0;
async function hostDuty() {
  if (Soiree.replaying) return;  // a replay never writes
  const r = M.room;
  if (!isMod() || duty || !r || r.phase !== "play" || Date.now() < dutyWait) return;
  const key = "r" + r.round;
  let job = null;
  if (r.step === "guess") {
    const vm = votesMap(r.round, false), k = r.gameId + key;
    const all = M.players.length > 0 && M.players.every(p => vm[p.id]);
    if (allKey !== k) { allKey = k; allSince = 0; }
    allSince = all ? allSince || Date.now() : 0;
    const end = roundEnd(r);
    if ((all && Date.now() - allSince > 900) || (end && Date.now() >= end)) job = () => doReveal(r);
  } else if (r.step === "reveal" && !r.answers?.[key]) job = () => finishReveal(r);
  if (!job) return;
  duty = true;
  try { await job(); } catch { dutyWait = Date.now() + 2500; }
  duty = false;
}

/* ---------- shared pieces ---------- */
function av(p, cls = "") {
  const ini = (p.nick || "?").trim().charAt(0) || "?";
  return `<span class="av ${cls}" style="background:${safeColor(p.color)}" aria-hidden="true">${esc(ini)}</span>`;
}
function chip(p, extra = "", cls = "") {
  return `<span class="chip ${cls}">${av(p)}<span class="nm">${esc(p.nick)}</span>${p.mod ? `<span class="tag">modo</span>` : ""}${extra}</span>`;
}
function header(big, badge = "") {
  return `<header class="top ${big ? "big" : ""}"><h1 class="logo">Photo<span class="tape">Roulette</span></h1>${badge ? `<span class="badge">${esc(badge)}</span>` : ""}</header>`;
}
function errBox() {
  return (M.err ? `<div class="err" role="alert">${esc(M.err)}</div>` : "") + (M.flash ? `<div class="note" role="status">${esc(M.flash)}</div>` : "");
}
function waitMod(text) {
  return `<section class="panel center wait"><div class="label">En attente du modo</div><div class="big dots">${text}</div></section>`;
}
function rulesBlock() {
  return `<section class="panel rules"><details ${M.showRules ? "open" : ""}><summary data-act="rules">Comment on joue ?</summary>
    <ol>
      <li>Chacun met le plus de photos possible dans la roulette : des centaines, voire toute sa pellicule. Le jeu en tire quelques-unes au hasard.</li>
      <li>Une photo s'affiche sur tous les téléphones. À qui est-elle ?</li>
      <li>Bonne réponse : ${BASE} points, plus un bonus de rapidité jusqu'à ${BONUS}.</li>
      <li>Si c'est la tienne, garde ton sérieux et vote pour quelqu'un d'autre : ton vote ne compte pas.</li>
    </ol>
    <p class="hint left">Les photos sont réduites, perdent leur position GPS et sont effacées du serveur à la fin de la partie.</p>
  </details></section>`;
}
function settingsPanel(r) {
  const per = clampPer(r.perPlayer), timer = clampTimer(r.timer);
  return `<section class="panel">
    <div class="label">Photos par joueur</div>
    <div class="toggles">${PER.map(n => `<button class="tog" data-act="per" data-n="${n}" aria-pressed="${n === per}">${n}</button>`).join("")}</div>
    <div class="label">Chrono pour deviner</div>
    <div class="toggles">${TIMERS.map(t => `<button class="tog" data-act="timer" data-n="${t}" aria-pressed="${t === timer}">${t ? t + " s" : "Sans"}</button>`).join("")}</div>
    <p class="hint left">Plus on répond vite, plus on gagne de points.</p>
  </section>`;
}
function settingsSummary(r) {
  const per = clampPer(r.perPlayer), timer = clampTimer(r.timer);
  return `<div class="summary"><span>${plural(per, "photo")} par joueur</span><span>${timer ? "Chrono " + timer + " s" : "Sans chrono"}</span></div>`;
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
function renderHome() {
  const invited = M.drafts.code && M.drafts.code.length === 4 && hashCode() === M.drafts.code;
  const nickField = `<input id="nick" data-draft="nick" type="text" maxlength="18" autocomplete="nickname" enterkeyhint="next" placeholder="Ton prénom ou surnom" aria-label="Ton prénom">`;
  const joinForm = `<form class="stack" data-form="join-code">
      <input id="code" class="codein" data-draft="code" type="text" maxlength="4" autocomplete="off" autocapitalize="characters" enterkeyhint="go" placeholder="CODE" aria-label="Code de la partie">
      <button class="btn ${invited ? "primary big" : ""}" type="submit">Rejoindre la partie</button>
    </form>`;
  return header(true) + `<p class="tagline">Une photo sortie de vos galeries. À qui est-elle&nbsp;?</p>` + errBox() + `<section class="panel">
    <div class="label">Ton prénom</div>${nickField}
  </section>
  ${invited
    ? `<section class="panel"><div class="label">Tu es invité à la partie</div><div class="code">${esc(M.drafts.code)}</div>${joinForm}</section>
       <div class="or">ou</div>
       <button class="btn big" data-act="create">Créer ma propre partie</button>`
    : `<button class="btn primary big" data-act="create">Créer une partie</button>
       <p class="hint">Tu seras le modo : tu règles la partie et tu passes d'une photo à l'autre.</p>
       <div class="or">ou</div>
       <section class="panel"><div class="label">Rejoindre avec un code</div>${joinForm}</section>`}
  ${rulesBlock()}`;
}

/* ---------- screens: room ---------- */
function inviteLink() { return location.origin + location.pathname + "#" + M.code; }
function invitePanel() {
  return `<section class="panel center">
    <div class="label">Code de la partie</div>
    <div class="code">${esc(M.code)}</div>
    <div class="btns" style="width:100%">
      ${navigator.share ? `<button class="btn primary" data-act="share">Inviter</button>` : ""}
      <button class="btn" data-act="copy">Copier le lien</button>
    </div>
    <p class="hint">Les autres ouvrent le lien, ou vont sur le site et tapent le code.</p>
  </section>`;
}
function playersPanel(r, editable, counts) {
  const per = clampPer(r.perPlayer), players = M.players;
  return `<section class="panel">
    <div class="label">Dans la partie · ${players.length}</div>
    ${players.length ? `<div class="chips">${players.map(p => {
      const n = p.pg === r.gameId ? Math.min(+p.photos || 0, per) : 0;
      const cnt = counts ? `<span class="cnt ${n >= per ? "ok" : ""}" aria-label="${n} photos sur ${per}">${n >= per ? "✓" : n + "/" + per}</span>` : "";
      const x = editable && p.id !== M.me ? `<button class="x" data-act="kick" data-id="${esc(p.id)}" aria-label="Retirer ${esc(p.nick)}">×</button>` : "";
      return chip(p, cnt + x, p.id === M.me ? "me" : "");
    }).join("")}</div>`
      : `<p class="hint left">Personne pour l'instant.</p>`}
    ${inRoom() ? (M.renaming
      ? `<form class="row" data-form="rename"><input id="rename" data-draft="rename" type="text" maxlength="18" autocomplete="off" enterkeyhint="done" placeholder="Nouveau pseudo" aria-label="Nouveau pseudo"><button class="btn primary" type="submit">OK</button></form>
         <button class="link" data-act="rename-cancel" style="align-self:flex-start">Annuler</button>`
      : `<button class="link" data-act="rename-open" style="align-self:flex-start">Changer de pseudo</button>`) : ""}
  </section>`;
}
function minePanel(r) {
  const per = clampPer(r.perPlayer), n = M.mine.length, g = r.gameId;
  if (M.mineGame !== g) return `<section class="panel"><div class="label">Tes photos</div><p class="hint left dots">Chargement</p></section>`;
  // Entre le choix et l'arrivée des fichiers, c'est le téléphone qui travaille (liste du dossier, conversion, iCloud) :
  // la page ne peut pas l'accélérer, mais elle montre que ça avance.
  if (M.scan) {
    const f = M.scan.found;
    return `<section class="panel mine"><div class="label">Tes photos</div>
      <p class="lead dots">On cherche tes photos dans « ${esc(M.scan.label)} »</p>
      <div class="found"><b>${f.toLocaleString("fr-FR")}</b> photo${f > 1 ? "s" : ""} trouvée${f > 1 ? "s" : ""}</div>
      <div class="prog indet" aria-hidden="true"><i></i></div>
      <p class="hint left">Seuls les noms des fichiers sont lus : rien n'est envoyé. Tu peux arrêter quand tu veux, le tirage se fera parmi celles déjà trouvées.</p>
      <button class="btn" data-act="scan-stop" ${f ? "" : "disabled"}>Arrêter et tirer parmi ${f > 1 ? "les " + f.toLocaleString("fr-FR") : "celles-là"}</button></section>`;
  }
  if (M.picking) {
    return `<section class="panel mine"><div class="label">Tes photos</div>
      <p class="lead dots">Ton téléphone rassemble tes photos</p>
      <div class="prog indet" aria-hidden="true"><i></i></div>
      <p class="hint left">Avec beaucoup de photos, ça peut prendre une minute ou plus. C'est le téléphone qui fait la liste${IOS ? ", convertit et récupère sur iCloud ce qu'il faut" : ""} : rien n'est encore envoyé. <b data-since="${M.picking.at}"></b></p>
      <button class="link" data-act="pick-cancel" style="align-self:flex-start">J'ai annulé</button></section>`;
  }
  if (M.up || M.trim) {
    const pct = M.up ? Math.round(M.up.done / Math.max(1, M.up.need) * 100) : 0;
    return `<section class="panel mine"><div class="label">Tes photos · ${n}/${per}</div>
      <p class="lead dots">${M.up ? `La roulette tourne parmi tes ${plural(M.pool.length, "photo")}` : "Nouveau tirage"}</p>
      <div class="prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <p class="hint left">${M.up ? `Photo ${Math.min(M.up.done + 1, M.up.need)} sur ${M.up.need}. ` : ""}Garde l'écran allumé le temps de l'envoi.</p></section>`;
  }
  const done = n >= per, inPool = M.pool.length, hasFolder = M.sources.some(s => s.folder);
  const pickBtns = (main, other) => IOS
    ? `<button class="btn ${main}" data-act="pick">${inPool ? "Ajouter d'autres photos" : "Choisir dans ma galerie"}</button>`
    : `<button class="btn ${main}" data-act="pick-folder">${hasFolder ? "Ajouter un autre dossier" : "Prendre un dossier entier"}</button>
       <button class="btn ${other}" data-act="pick">${inPool ? "Ajouter des photos à la main" : "Choisir dans ma galerie"}</button>`;
  const sources = M.sources.length ? `<div class="stack"><div class="label">Dans ta roulette · ${plural(inPool, "photo")}</div>
    <ul class="srcs">${M.sources.map(s => `<li><span class="ic" aria-hidden="true">${s.folder ? "▤" : "▦"}</span><span class="nm">${esc(s.label)}</span><span class="n">${s.keys.size}</span><button class="x" data-act="drop-source" data-id="${esc(s.id)}" aria-label="Retirer ${esc(s.label)} de la roulette">×</button></li>`).join("")}</ul>
    ${!IOS && hasFolder ? `<p class="hint left">Un seul dossier à la fois : ajoute-les l'un après l'autre (${FSA ? "DCIM" : "DCIM › Camera"}, Pictures…). Un dossier compte avec tous ses sous-dossiers.</p>` : ""}
  </div>` : "";
  const reuse = FSA && !inPool && M.savedDirs.length
    ? `<button class="btn primary big" data-act="reuse-dirs">Reprendre mes dossiers : ${esc(M.savedDirs.map(d => d.name).join(", "))}</button>` : "";
  let h = `<section class="panel mine ${done ? "ok" : ""}"><div class="label">Tes photos · ${n}/${per}</div>`;
  if (done) {
    h += `<p class="lead"><b>Prêt !</b> ${inPool > per ? `Tirées au hasard parmi tes ${inPool} photos.` : `Tes ${plural(per, "photo")} sont dans la partie.`}</p>
      ${sources}
      ${inPool < 30 ? `<p class="hint left">Plus il y a de photos dans la roulette, plus c'est drôle. Tu peux en rajouter : le tirage sera relancé.</p>` : ""}
      <div class="btns">${pickBtns("", "")}</div>
      ${inPool > per ? `<button class="link" data-act="respin" style="align-self:flex-start">Relancer la roulette</button>` : ""}`;
  } else {
    h += `<p class="lead">${n ? `Encore ${plural(per - n, "photo")} à trouver : ajoute d'autres photos à la roulette.` : "Mets le plus de photos possible dans la roulette."}</p>
      ${sources}
      ${reuse}
      ${pickBtns(reuse ? "" : "primary big", "")}
      ${inPool && !n && M.spareGame !== g ? `<button class="btn" data-act="respin">Relancer la roulette sur tes ${inPool} photos</button>` : ""}
      ${pickHelp(per - n)}`;
  }
  if (n) {
    h += `<details class="peek" ${M.showMine ? "open" : ""}><summary data-act="peek">Voir mes photos (ça gâche la surprise)</summary>
      <div class="thumbs">${M.mine.map(pid => {
        const e = PIC.get(pid);
        const img = e?.ok ? `<img src="${esc(e.url)}" alt="">` : `<span class="tload ${e?.fail ? "fail" : ""}" ${M.showMine && !e ? `data-load="${esc(pid)}"` : ""}></span>`;
        return `<div class="th">${img}<button class="link" data-act="drop" data-id="${esc(pid)}">Retirer</button></div>`;
      }).join("")}</div>
      ${M.spare.length && M.spareGame === g ? `<p class="hint left">Une photo retirée sort de la roulette et elle est remplacée par une autre.</p>` : ""}
      <button class="link" data-act="drop-all" style="align-self:flex-start">Vider la roulette et recommencer</button>
    </details>`;
  }
  return h + `</section>`;
}
// Le site ne peut pas ouvrir la galerie tout seul : on explique comment y prendre un maximum de photos d'un coup.
function pickHelp(need) {
  const end = `Le jeu en tire ${need} au hasard : même toi, tu ne sauras pas lesquelles. Seules celles-là sont envoyées.`;
  if (IOS) return `<div class="howto"><b>Pour en prendre des centaines d'un coup</b><ol>
      <li>Touche <b>Choisir dans ma galerie</b>, puis <b>Photothèque</b>.</li>
      <li>Pose le doigt sur une photo et, sans le lever, glisse-le vers le bas : toutes les photos survolées se cochent, et la grille défile toute seule.</li>
      <li>Touche <b>Ajouter</b>.</li>
    </ol><p><b>Pour que ça aille vite :</b> 200 à 300 photos font déjà une vraie roulette. L'iPhone convertit chaque photo choisie et télécharge d'abord celles qui ne sont que sur iCloud : avec des milliers, ça peut prendre plusieurs minutes.</p>
    <p>${end}</p></div>`;
  if (ANDROID && FSA) return `<div class="howto"><b>Le plus rapide : des dossiers entiers</b><ol>
      <li>Touche <b>Prendre un dossier entier</b>, ouvre <b>DCIM</b> et touche <b>Utiliser ce dossier</b>.</li>
      <li>Autorise l'accès : le jeu lit seulement les noms des fichiers, et n'ouvre que les photos tirées au sort.</li>
      <li>Recommence pour chaque dossier à ajouter, par exemple <b>Pictures</b>. Ils s'ajoutent tous à la roulette.</li>
    </ol><p>Les dossiers cachés de miniatures sont sautés, et tu vois le compte monter : tu peux arrêter quand tu veux. La prochaine fois, un seul toucher suffit pour reprendre les mêmes dossiers.</p>
    <p>${end}</p></div>`;
  if (ANDROID) return `<div class="howto"><b>Le plus rapide : des dossiers entiers</b><ol>
      <li>Touche <b>Prendre un dossier entier</b>, ouvre <b>DCIM</b> puis <b>Camera</b>, et touche <b>Utiliser ce dossier</b>.</li>
      <li>Le téléphone demande de confirmer : accepte.</li>
      <li>Recommence pour chaque dossier à ajouter, par exemple <b>Pictures</b>. Ils s'ajoutent tous à la roulette.</li>
    </ol><p><b>Pour que ça aille vite :</b> prends <b>Camera</b> plutôt que DCIM en entier. DCIM cache souvent des milliers de miniatures que le téléphone doit toutes passer en revue. Plus le dossier est gros (vidéos comprises), plus le téléphone met de temps à rendre la main.</p>
    <p>Si le dossier entier ne marche pas sur ton téléphone : <b>Choisir dans ma galerie</b>, appuie longuement sur une photo puis glisse le doigt pour en cocher plein. ${end}</p></div>`;
  return `<div class="howto"><p>Prends des dossiers entiers, l'un après l'autre (ta pellicule, tes albums…), ou sélectionne plein de photos d'un coup (Ctrl+A). ${end}</p></div>`;
}
function renderRoom() {
  if (!M.roomReady || !M.playersReady) return header(true, "Partie " + M.code) + `<section class="panel center loading">Connexion à la partie…</section>`;
  const r = M.room, mod = isMod();
  const badge = (mod ? "Modo · " : "Partie ") + M.code;
  if (!inRoom()) {
    return header(true, badge) + errBox() + `<section class="panel">
      <p class="lead">${r.phase === "play" ? "Une partie est en cours. Entre ton prénom pour deviner avec les autres." : "Entre ton prénom pour rejoindre la partie."}</p>
      <form class="row" data-form="join-room"><input id="nick" data-draft="nick" type="text" maxlength="18" autocomplete="nickname" enterkeyhint="go" placeholder="Ton prénom ou surnom" aria-label="Ton prénom"><button class="btn primary" type="submit">Rejoindre</button></form>
    </section>${playersPanel(r, false, r.phase === "lobby")}
    <p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
  }
  if (r.phase === "play") return header(false, badge) + errBox() + playScreen(r, mod);
  if (r.phase === "end") return header(true, badge) + errBox() + endScreen(r, mod);
  return header(true, badge) + errBox() + lobbyScreen(r, mod);
}
function lobbyScreen(r, mod) {
  const g = r.gameId, per = clampPer(r.perPlayer);
  const ready = M.players.filter(p => p.pg === g && p.photos > 0);
  const total = ready.reduce((s, p) => s + Math.min(+p.photos || 0, per), 0);
  const missing = M.players.filter(p => !(p.pg === g && p.photos >= per));
  const can = ready.length >= MIN_PLAYERS;
  let h = invitePanel() + playersPanel(r, mod, true) + minePanel(r);
  if (mod) {
    h += settingsPanel(r) + `<button class="btn primary big" data-act="start" ${can ? "" : "disabled"}>Lancer la partie · ${plural(total, "photo")}</button>`;
    if (!can) h += `<p class="hint">Il faut au moins ${MIN_PLAYERS} joueurs avec des photos.</p>`;
    else if (missing.length) h += `<p class="hint">Photos pas encore prêtes : ${esc(names(missing))}. Sans photos, on peut deviner, mais on n'est pas dans le jeu des réponses.</p>`;
    h += `<p class="foot"><button class="link" data-act="exit">Retour à l'accueil</button></p>`;
  } else {
    h += `<section class="panel"><div class="label">Réglages de la partie</div>${settingsSummary(r)}</section>
      ${waitMod("Le modo lance quand tout le monde est prêt")}
      <p class="foot"><button class="link" data-act="leave">Quitter la partie</button></p>`;
  }
  return h + rulesBlock();
}
function voteGrid(players, selected, disabled) {
  return `<div class="grid">${players.map(p =>
    `<button class="tile ${p.id === selected ? "sel" : ""}" data-act="vote" data-id="${esc(p.id)}" aria-pressed="${p.id === selected}" ${disabled ? "disabled" : ""}>${av(p)}<span class="nm">${esc(p.nick)}</span></button>`).join("")}</div>`;
}
function playScreen(r, mod) {
  const deck = r.deck || [], round = Math.min(Math.max(1, r.round || 1), Math.max(1, deck.length));
  const pid = deck[round - 1] || "", key = "r" + round, guess = r.step !== "reveal";
  const vm = votesMap(round), ans = r.answers?.[key];
  const voted = M.players.filter(p => vm[p.id]), waiting = M.players.filter(p => !vm[p.id]);
  const end = roundEnd(r), expired = guess && end > 0 && Date.now() >= end;
  let cap;
  if (guess) cap = expired ? "Temps écoulé !" : "À qui est-elle ?";
  else if (!ans) cap = `<span class="dots">Révélation</span>`;
  else if (ans === "?") cap = "Mystère…";
  else cap = `<span class="whose">${esc(who(ans).nick)}</span>`;
  let h = `<div class="status"><span class="round">Photo ${round}<small> / ${deck.length}</small></span><span>${guess ? `${voted.length}/${M.players.length} ont voté` : "Révélation"}</span></div>`;
  if (guess && end) h += `<div class="timer" data-end="${end}" data-dur="${r.timer * 1000}"><span class="bar"><i></i></span><b></b></div>`;
  h += `<figure class="pola ${guess ? "" : "shown"}" data-key="${esc(r.gameId + "_" + round)}" style="--tilt:${TILTS[round % TILTS.length]}deg">
    <div class="ph" data-pid="${esc(pid)}" data-act="zoom" data-id="${esc(pid)}" data-cap="${guess || !ans || ans === "?" ? "" : esc(who(ans).nick)}" role="img" aria-label="La photo à deviner"></div>
    <figcaption>${cap}</figcaption>
  </figure>`;
  if (guess) {
    const mine = vm[M.me], targets = (r.order || []).filter(id => id !== M.me).map(who);
    h += `<section class="stack"><div class="label">${expired ? "Le vote est fermé" : mine ? "Ton vote · tu peux changer d'avis" : "Vote vite"}</div>${voteGrid(targets, mine, expired)}</section>`;
    if (M.mine.includes(pid)) h += `<p class="psst">Psst… c'est la tienne. Vote pour quelqu'un d'autre pour brouiller les pistes : ton vote ne compte pas.</p>`;
    if (mod) {
      h += `<section class="panel">
        <div class="label">${waiting.length ? `On attend · ${waiting.length}` : "Tout le monde a voté"}</div>
        ${waiting.length ? `<div class="chips">${waiting.map(p => chip(p)).join("")}</div>` : ""}
        <button class="btn big" data-act="reveal">Révéler maintenant</button>
        <p class="hint">La photo se révèle toute seule quand tout le monde a voté${r.timer ? " ou à la fin du chrono" : ""}.</p>
      </section>`;
    }
  } else {
    h += revealPanel(r, round, ans);
    if (ans) h += board(r, key);
    h += mod
      ? `<button class="btn primary big" data-act="next" data-r="${round}" ${ans ? "" : "disabled"}>${round >= deck.length ? "Voir le classement" : "Photo suivante"}</button>`
      : waitMod(round >= deck.length ? "Le classement arrive" : "Photo suivante bientôt");
  }
  if (mod) h += `<p class="foot"><button class="link" data-act="end">Terminer la partie</button></p>`;
  return h;
}
function revealPanel(r, round, ans) {
  if (!ans) return "";
  const vm = votesMap(round), gains = r.gains?.["r" + round] || {};
  const others = M.players.filter(p => p.id !== ans);
  const found = others.filter(p => gains[p.id]);
  const missed = others.filter(p => vm[p.id] && !gains[p.id]);
  const none = others.filter(p => !vm[p.id]);
  let top;
  if (ans === "?") top = `<div class="label">Propriétaire inconnu</div><div class="sub">Cette photo a perdu son propriétaire. Personne ne marque.</div>`;
  else {
    const o = who(ans);
    const sub = !found.length ? "Personne ne l'a trouvée !"
      : found.length === others.length ? "Tout le monde l'a trouvée !"
      : `${plural(found.length, "personne")} l'${found.length > 1 ? "ont" : "a"} trouvée`;
    top = `<div class="label">C'était la photo de</div>${av(o, "xl")}<div class="name">${esc(o.nick)}</div><div class="sub">${sub}</div>
      ${ans === M.me ? `<div class="sub">${found.length ? "Repéré, tu n'as pas su garder ton sérieux." : "Joli, tu as bien caché ton jeu."}</div>` : ""}`;
  }
  const row = (label, list, extra) => list.length
    ? `<div class="label">${label} · ${list.length}</div><div class="chips">${list.map(p => chip(p, extra(p))).join("")}</div>` : "";
  const lists = row("Bien vu", found, p => `<span class="gain">+${gains[p.id]}</span>`)
    + row("Raté", missed, p => `<span class="said">→ ${esc(who(vm[p.id]).nick)}</span>`)
    + row("Pas de vote", none, () => "");
  return `<section class="panel verdict" aria-live="polite">${top}</section>${lists ? `<section class="panel">${lists}</section>` : ""}`;
}
function board(r, key) {
  const sc = gameScores(r), gains = r.gains?.[key] || {};
  const list = ranked(people(r).map(p => ({ p, pts: sc[p.id]?.pts || 0, g: gains[p.id] || 0 })), "pts");
  return `<section class="panel"><div class="label">Classement</div><ol class="rank">${list.map(s =>
    `<li class="${s.pos === 1 && s.pts ? "first" : ""}"><span class="pos">${s.pos}</span>${av(s.p)}<span class="who"><b>${esc(s.p.nick)}</b></span>${s.g ? `<span class="gain">+${s.g}</span>` : ""}<span class="pts">${s.pts}</span></li>`).join("")}</ol></section>`;
}
function awards(r) {
  const keys = Object.keys(r.answers || {}).filter(k => r.answers[k] && r.answers[k] !== "?");
  if (keys.length < 3) return "";
  const sc = gameScores(r), out = [];
  const fast = Object.entries(sc).filter(([, s]) => s.ok >= 2).map(([u, s]) => ({ u, v: s.pts / s.ok })).sort((a, b) => b.v - a.v)[0];
  if (fast) out.push({ t: "Éclair", d: "Les bonnes réponses les plus rapides", u: fast.u });
  const own = {};
  for (const k of keys) {
    const a = r.answers[k], vm = votesMap(+k.slice(1), false);
    const voters = Object.keys(vm).filter(v => v !== a).length;
    if (!voters) continue;
    own[a] = own[a] || { f: 0, v: 0 };
    own[a].f += Object.keys(r.gains?.[k] || {}).length; own[a].v += voters;
  }
  const ratios = Object.entries(own).map(([u, o]) => ({ u, v: o.f / o.v })).sort((a, b) => b.v - a.v);
  const pct = v => Math.round(v * 100) + " ";
  if (ratios.length >= 2) {
    const first = ratios[0], last = ratios[ratios.length - 1];
    if (first.v > last.v) {
      out.push({ t: "Livre ouvert", d: `Ses photos ont été reconnues à ${pct(first.v)}%`, u: first.u });
      out.push({ t: "Agent secret", d: last.v ? `Ses photos n'ont été reconnues qu'à ${pct(last.v)}%` : "Personne n'a reconnu ses photos", u: last.u });
    }
  }
  if (!out.length) return "";
  return `<section class="panel"><div class="label">Les trophées</div><ul class="awards">${out.map(a => {
    const p = who(a.u);
    return `<li>${av(p)}<span class="who"><b>${esc(a.t)} · ${esc(p.nick)}</b><small>${esc(a.d)}</small></span></li>`;
  }).join("")}</ul></section>`;
}
function gallery(r) {
  const items = (r.deck || []).map((pid, i) => ({ pid, a: r.answers?.["r" + (i + 1)] })).filter(x => x.a && PIC.get(x.pid)?.ok);
  if (!items.length) return "";
  return `<section class="panel"><div class="label">Les photos de la partie</div>
    <div class="gal">${items.map(x => {
      const nick = x.a === "?" ? "?" : who(x.a).nick;
      return `<button class="mini" data-act="zoom" data-id="${esc(x.pid)}" data-cap="${esc(nick)}"><img src="${esc(PIC.get(x.pid).url)}" alt="Photo de ${esc(nick)}"><span>${esc(nick)}</span></button>`;
    }).join("")}</div>
    <p class="hint left">Gardées seulement sur ce téléphone jusqu'à la prochaine partie : elles sont déjà effacées du serveur.</p>
  </section>`;
}
function endScreen(r, mod) {
  const played = Object.keys(r.answers || {}).length;
  let h;
  if (!played) h = `<section class="panel"><p class="lead">Aucune photo jouée pour l'instant.</p></section>`;
  else {
    const sc = gameScores(r);
    const list = ranked(people(r).map(p => ({ p, pts: sc[p.id]?.pts || 0, ok: sc[p.id]?.ok || 0 })), "pts");
    const win = list.filter(s => s.pos === 1 && s.pts);
    h = `<section class="panel verdict"><div class="label">${win.length > 1 ? "Égalité au sommet" : "Victoire"}</div>
        <div class="name">${win.length ? esc(names(win.map(s => s.p))) : "Personne"}</div>
        <div class="sub">${win.length ? `${win[0].pts} points · ${plural(played, "photo")}` : "Aucune bonne réponse. Vous vous connaissez vraiment ?"}</div></section>
      <section class="panel"><div class="label">Classement</div><ol class="rank">${list.map(s =>
        `<li class="${s.pos === 1 && s.pts ? "first" : ""}"><span class="pos">${s.pos}</span>${av(s.p)}<span class="who"><b>${esc(s.p.nick)}</b><small>${s.ok} bonne${s.ok > 1 ? "s" : ""} réponse${s.ok > 1 ? "s" : ""}</small></span><span class="pts">${s.pts}</span></li>`).join("")}</ol></section>
      ${awards(r)}`;
    if ((r.games || 0) >= 2) {
      const tot = ranked(Object.entries(r.totals || {}).map(([u, pts]) => ({ p: who(u), pts })), "pts");
      h += `<section class="panel"><div class="label">Depuis le début · ${plural(r.games, "partie")}</div><ol class="rank">${tot.map(s =>
        `<li><span class="pos">${s.pos}</span>${av(s.p)}<span class="who"><b>${esc(s.p.nick)}</b></span><span class="pts">${s.pts}</span></li>`).join("")}</ol></section>`;
    }
    h += gallery(r);
  }
  return h + (mod
    ? `${playersPanel(r, true, false)}<button class="btn primary big" data-act="newgame">Nouvelle partie</button>
       <p class="hint">Les joueurs restent dans la partie. Chacun choisit de nouvelles photos.</p>`
    : playersPanel(r, false, false) + waitMod("Le modo peut lancer une nouvelle partie"));
}

/* ---------- render ---------- */
let lastHtml = "", lastKey = "";
function render() {
  let html;
  if (M.mode === "room") html = renderRoom();
  else if (M.mode === "home") html = renderHome();
  else if (M.mode === "setup") html = renderSetup();
  else if (M.mode === "fatal") html = renderFatal();
  else html = header(true) + `<section class="panel center loading">Développement en cours…</section>`;
  if (html !== lastHtml) {
    const a = document.activeElement, fid = a && a.id, ss = a && a.selectionStart, se = a && a.selectionEnd;
    app.innerHTML = html;
    lastHtml = html;
    app.querySelectorAll("[data-draft]").forEach(i => { i.value = M.drafts[i.dataset.draft] || ""; });
    if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(ss, se); } catch {} } }
    const card = app.querySelector(".pola[data-key]");
    const key = card ? card.dataset.key : "";
    if (card && key !== lastKey) { card.classList.add("enter"); window.scrollTo({ top: 0, behavior: "smooth" }); }
    lastKey = key;
    ticks();
  }
  mountPhotos();
  // La photo suivante se télécharge pendant qu'on regarde celle-ci.
  const r = M.room;
  // Deux photos d'avance, l'une après l'autre pour ne pas ralentir celle qu'on regarde.
  if (M.mode === "room" && r?.phase === "play") {
    const d = r.deck || [], i = r.round - 1;
    if (PIC.get(d[i])?.ok) { loadPic(d[i + 1]); if (PIC.get(d[i + 1])?.ok) loadPic(d[i + 2]); }
  }
  keepAwake((M.mode === "room" && r?.phase === "play" && inRoom()) || !!M.up || !!M.picking);
}
function ticks() {
  if (Soiree.replaying) return;  // a replay never writes
  const now = Date.now();
  app.querySelectorAll(".timer[data-end]").forEach(t => {
    const left = Math.max(0, +t.dataset.end - now), dur = +t.dataset.dur || 1;
    t.querySelector("i").style.width = Math.min(100, left / dur * 100) + "%";
    t.querySelector("b").textContent = Math.ceil(left / 1000) + " s";
    t.classList.toggle("low", left <= 5000);
  });
}
setInterval(() => {
  if (M.picking) app.querySelectorAll("[data-since]").forEach(el => {
    const s = Math.floor((Date.now() - +el.dataset.since) / 1000);
    el.textContent = s >= 5 ? `Ça fait ${s >= 60 ? Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") : s} s.` : "";
  });
  if (M.mode !== "room" || M.room?.phase !== "play") return;
  render(); ticks(); hostDuty();
}, 250);
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
document.addEventListener("visibilitychange", () => render());
let flashT = null;
function flash(msg) { M.flash = msg; render(); clearTimeout(flashT); flashT = setTimeout(() => { M.flash = ""; render(); }, 2600); }
function openLb(url, cap) {
  lb.querySelector("img").src = url;
  lb.querySelector("p").textContent = cap || "";
  lb.hidden = false;
}

/* ---------- actions ---------- */
async function write(fn) {
  if (M.busy) return;
  M.busy = true; M.err = "";
  try { await fn(); }
  catch (e) {
    const c = e && e.code;
    M.err = c === "permission-denied" ? "Action refusée : seul le modo peut faire ça."
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
const ACT = {
  "create": () => {
    const nick = needNick(); if (!nick) return;
    write(async () => {
      let code = genCode();
      try {
        for (let i = 0; i < 6 && (await F.getDoc(rRoom(code))).exists(); i++) code = genCode();
        await F.setDoc(rRoom(code), { ...freshRoom(), hostUid: M.me, createdAt: Date.now() });
      } catch (e) {
        if (e && e.code === "permission-denied") throw new Error("les règles Firebase de Photo Roulette ne sont pas encore publiées, voir LISEZMOI");
        throw e;
      }
      await F.setDoc(rPlayer(code, M.me), { nick, color: Soiree.color() || COLORS[0], joinedAt: Date.now(), mod: true });
      enterRoom(code);
    });
  },
  "exit": () => exitRoom(),
  "leave": () => {
    const code = M.code;
    write(async () => {
      if (M.room?.phase === "lobby" && M.mine.length) { const ids = M.mine; M.mine = []; await dropPids(code, ids); }
      M.spare = [];
      await F.deleteDoc(rPlayer(code, M.me));
      exitRoom();
    });
  },
  "share": () => { navigator.share({ title: "Photo Roulette", text: `Rejoins la partie ${M.code} !`, url: inviteLink() }).catch(() => {}); },
  "copy": () => {
    const link = inviteLink();
    navigator.clipboard?.writeText(link).then(() => flash("Lien copié : " + link), () => flash(link));
  },
  "rules": () => { M.showRules = !M.showRules; render(); },
  "peek": () => { M.showMine = !M.showMine; render(); },
  // Le sélecteur doit s'ouvrir pendant le toucher lui-même, sinon le téléphone le bloque.
  "pick": () => openPicker(picker),
  "pick-folder": () => FSA ? pickDir() : openPicker(folder),
  "reuse-dirs": () => reuseDirs(),
  "scan-stop": () => { if (M.scan) M.scan.stop = true; },
  "pick-cancel": () => { M.picking = null; render(); },
  "respin": () => spin(),
  // Un dossier sort de la roulette : ses photos déjà tirées aussi, on retire au sort parmi ce qui reste.
  "drop-source": d => {
    if (M.room?.phase !== "lobby" || M.up || M.trim) return;
    const s = M.sources.find(x => x.id === d.id);
    if (!s) return;
    M.sources = M.sources.filter(x => x !== s);
    M.pool = M.pool.filter(f => !s.keys.has(fkey(f)));
    saveDirs();
    if (M.pool.length) { spin(); return; }
    const ids = M.mine, code = M.code;
    M.spare = [];
    write(async () => {
      await dropPids(code, ids);
      M.mine = M.mine.filter(x => !ids.includes(x)); ids.forEach(id => { dropPic(id); delete M.fileOf[id]; });
      await syncCount();
    });
  },
  "drop": d => {
    if (M.room?.phase !== "lobby" || M.up || M.trim) return;
    const pid = d.id, code = M.code;
    write(async () => {
      await dropPids(code, [pid]);
      const k = M.fileOf[pid];
      if (k) {
        M.pool = M.pool.filter(f => fkey(f) !== k);
        M.sources.forEach(s => s.keys.delete(k));
        M.sources = M.sources.filter(s => s.keys.size);
      }
      delete M.fileOf[pid];
      M.mine = M.mine.filter(x => x !== pid); dropPic(pid);
      await syncCount();
      setTimeout(selfDuty, 0);
    });
  },
  "drop-all": () => {
    if (M.room?.phase !== "lobby" || M.up || M.trim) return;
    const ids = M.mine, code = M.code;
    M.spare = []; M.pool = []; M.sources = [];
    saveDirs();
    write(async () => {
      await dropPids(code, ids);
      M.mine = M.mine.filter(x => !ids.includes(x)); ids.forEach(id => { dropPic(id); delete M.fileOf[id]; });
      M.showMine = false;
      await syncCount();
    });
  },
  "zoom": d => {
    const e = PIC.get(d.id);
    if (e?.fail) { PIC.delete(d.id); render(); return; }
    if (e?.ok) openLb(e.url, d.cap);
  },
  "vote": d => {
    const r = M.room;
    if (!r || r.phase !== "play" || r.step !== "guess" || d.id === M.me) return;
    if (r.timer && Date.now() >= roundEnd(r)) return;
    const g = r.gameId, round = r.round;
    M.pending = { g, r: round, t: d.id }; render();
    F.setDoc(rVote(M.code, `${g}_${round}_${M.me}`), { gameId: g, round, voter: M.me, target: d.id, at: F.serverTimestamp() })
      .catch(e => {
        if (M.pending?.t === d.id) M.pending = null;
        flash(e && e.code === "permission-denied" ? "Trop tard, le vote est fermé." : "Vote pas envoyé. Vérifie ton réseau.");
      });
  },
  "reveal": modOnly(() => write(() => doReveal(M.room))),
  "next": modOnly(d => {
    const r = M.room, round = +d.r;
    if (!r || r.round !== round || r.step !== "reveal" || !r.answers?.["r" + round]) return;
    M.pending = null;
    write(() => round >= (r.deck || []).length ? endGame() : patchRoom({ round: round + 1, step: "guess", roundAt: F.serverTimestamp() }));
  }),
  "end": modOnly(() => write(async () => {
    const r = M.room;
    if (r.phase === "play" && r.step === "reveal" && !r.answers?.["r" + r.round]) await finishReveal(r);
    await endGame();
  })),
  "newgame": modOnly(() => {
    const old = M.room?.gameId, code = M.code;
    M.pending = null;
    write(async () => {
      await patchRoom(freshGame());
      if (!old) return;
      cleanup(code, old);
      try {
        const q = await F.getDocs(F.query(cVotes(code), F.where("gameId", "==", old)));
        for (let i = 0; i < q.docs.length; i += 400) { const b = F.writeBatch(DB); q.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); }
      } catch {}
    });
  }),
  "per": modOnly(d => write(() => patchRoom({ perPlayer: clampPer(d.n) }))),
  "timer": modOnly(d => write(() => patchRoom({ timer: clampTimer(d.n) }))),
  "start": modOnly(() => write(async () => {
    const r = M.room, g = r.gameId;
    const q = await F.getDocs(F.query(cPhotos(M.code), F.where("gameId", "==", g)));
    const deck = shuffle(q.docs.map(d => d.id));
    const order = M.players.filter(p => p.pg === g && p.photos > 0).map(p => p.id);
    if (order.length < MIN_PLAYERS || !deck.length) { M.err = `Il faut au moins ${MIN_PLAYERS} joueurs avec des photos.`; return; }
    const cast = Object.fromEntries(M.players.map(p => [p.id, { nick: p.nick, color: safeColor(p.color) }]));
    await patchRoom({ phase: "play", deck, order, cast, round: 1, step: "guess", roundAt: F.serverTimestamp(), answers: {}, gains: {} });
  })),
  "kick": modOnly(d => write(() => F.deleteDoc(rPlayer(M.code, d.id)))),
  "rename-open": () => {
    M.renaming = true; M.drafts.rename = M.players.find(p => p.id === M.me)?.nick || "";
    render();
    const i = document.getElementById("rename"); if (i) { i.focus(); i.select(); }
  },
  "rename-cancel": () => { M.renaming = false; render(); },
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
// Le sélecteur doit s'ouvrir pendant le toucher lui-même, sinon le téléphone le bloque.
function openPicker(inp) {
  if (M.up || M.trim) return;
  inp.value = "";
  inp.click();
  M.picking = { at: Date.now() };
  render();
}
for (const inp of [picker, folder]) {
  inp.addEventListener("change", () => {
    const files = [...(inp.files || [])];
    inp.value = "";
    M.picking = null;
    if (files.length) addToPool(files, inp === folder);
    render();
  });
  inp.addEventListener("cancel", () => { M.picking = null; render(); });
}
lb.addEventListener("click", () => { lb.hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape") lb.hidden = true; });
window.addEventListener("hashchange", () => {
  const c = hashCode();
  if (c && c !== M.code) { M.drafts.code = c; if (M.code) exitRoom(); else render(); }
});

/* ---------- boot ---------- */
const isPlaceholder = () => !firebaseConfig.apiKey || /COLLE/.test(firebaseConfig.apiKey);
async function boot() {
  if (await Soiree.replayBoot(M, render)) return;
  if (FSA) idb("readonly", st => st.get("list")).then(l => { if (Array.isArray(l)) { M.savedDirs = l; render(); } }, () => {});
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
  // Retour dans la partie après un rechargement, ou directement quand le lien porte un code déjà rejoint.
  // Sent here by the group: join the host's room straight away, under the account name.
  const auto = Soiree.autoJoinCode();
  if (auto && auto === hashCode()) {
    try {
      const r = await F.getDoc(rRoom(auto));
      if (r.exists()) { await joinRoom(auto, Soiree.pseudo(), r.data().hostUid); enterRoom(auto); return; }
    } catch {}
  }
  const target = hashCode() || store.get("room");
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
  const ord = i => `${i + 1}${i ? "e" : "er"}`;
  const r = M.room;
  if (!r?.gameId || !(r.order || []).length) return null;
  const ids = [...new Set([...(r.order || []), ...Object.keys(r.cast || {})])];
  const players = Object.fromEntries(ids.map(id => { const p = who(id); return [id, { nick: p.nick, color: p.color }]; }));
  const pts = Object.fromEntries(ids.map(id => [id, 0]));
  const board = () => Object.fromEntries(ids.map(id => [id, plural(pts[id], "point")]));
  const events = [{ text: `${plural(ids.length, "joueur")}, ${plural((r.deck || []).length, "photo")} au programme.`, board: board() }];
  const rounds = Object.keys(r.answers || {}).map(k => +k.slice(1)).filter(n => n > 0).sort((a, b) => a - b);
  for (const n of rounds) {
    const owner = r.answers["r" + n], gains = r.gains?.["r" + n] || {}, vm = votesMap(n, false);
    events.push({ head: `Photo ${n}`, text: "À qui est cette photo ?" });
    for (const [v, t] of Object.entries(vm)) if (v !== owner) events.push({ text: `@${v} pense que c'est @${t}.` });
    for (const [u, p] of Object.entries(gains)) pts[u] = (pts[u] || 0) + (+p || 0);
    const found = Object.entries(gains).map(([u, p]) => `@${u} (+${p})`);
    events.push({ text: owner && owner !== "?" ? `C'était la photo de @${owner}. ${found.length ? "Bien vu : " + found.join(", ") + "." : "Personne n'a trouvé."}` : "La photo d'un joueur parti.", tone: "win", board: board() });
  }
  const sorted = ids.slice().sort((a, b) => pts[b] - pts[a]);
  return { players, events, final: { title: "Classement", rows: sorted.map((id, i) => ({ who: id, text: `${ord(i)} · ${plural(pts[id], "point")}` })) } };
});

// Shared layer (account button, own name, group, end-of-game save bar): after every render.
{ const draw = render; render = () => { draw(); Soiree.frame(M); }; }
boot();
