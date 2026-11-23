// Account server tests (npm run test:server): netlify/lib/comptes.mjs against an in-memory fake of the Google endpoints it calls.
// No emulator needed. Run: node tests/server/comptes.test.mjs
import { generateKeyPairSync, createVerify, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const lib = await import(new URL("../../netlify/lib/comptes.mjs", import.meta.url).href);

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const env = { FIREBASE_CLIENT_EMAIL: "sa@test.iam.gserviceaccount.com", FIREBASE_PRIVATE_KEY: pem.replace(/\n/g, "\\n"), ADMIN_PSEUDO: "Boss, Chef2" };
// stands in for Google's securetoken signing key
const google = generateKeyPairSync("rsa", { modulusLength: 2048 });
const googleJwk = { ...google.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };

// fake Firestore: documents carry an updateTime, commits honour exists:false / updateTime preconditions
const docs = new Map(); let oauthCalls = 0, tick = 0, beforeCommit = null, monitoringDenied = false;
const authCalls = [];
const ok = (status, body) => new Response(JSON.stringify(body), { status });
const pathOf = u => decodeURIComponent(new URL(u).pathname.split("/documents/")[1] || "");
async function fetch(url, init = {}) {
  if (url === "https://oauth2.googleapis.com/token") {
    oauthCalls++; verify(new URLSearchParams(init.body.toString()).get("assertion"));
    return ok(200, { access_token: "tok", expires_in: 3600 });
  }
  if (url.startsWith("https://www.googleapis.com/service_accounts/v1/jwk/")) return new Response(JSON.stringify({ keys: [googleJwk] }), { status: 200, headers: { "cache-control": "max-age=600" } });
  if (url.startsWith("https://identitytoolkit.googleapis.com/")) { authCalls.push([url.split("accounts:")[1], JSON.parse(init.body)]); return ok(200, {}); }
  if (url.startsWith("https://monitoring.googleapis.com/")) {
    const m = new URL(url).searchParams.get("filter").match(/document\/(\w+)/)[1];
    return monitoringDenied ? ok(403, {}) : ok(200, { timeSeries: [{ points: [{ value: { int64Value: { read_count: "1234", write_count: "56", delete_count: "7" }[m] } }] }] });
  }
  assert.equal(init.headers.authorization, "Bearer tok");
  if (url.endsWith(":listCollectionIds")) {
    const base = decodeURIComponent(new URL(url).pathname.split("/documents/")[1]).replace(/:listCollectionIds$/, ""), depth = base.split("/").length;
    return ok(200, { collectionIds: [...new Set([...docs.keys()].filter(k => k.startsWith(base + "/") && k.split("/").length >= depth + 2).map(k => k.split("/")[depth]))] });
  }
  if (url.endsWith("/documents:runQuery")) {
    const f = JSON.parse(init.body).structuredQuery, col = f.from[0].collectionId, w = f.where.fieldFilter;
    return ok(200, [...docs].filter(([k, d]) => k.startsWith(col + "/") && d.fields[w.field.fieldPath]?.stringValue === w.value.stringValue).map(([k]) => ({ document: { name: "projects/p/databases/(default)/documents/" + k } })));
  }
  { const rel = decodeURIComponent(new URL(url).pathname.split("/documents/")[1] || "");
    const depth = rel.split("/").length;  // an odd number of segments is a collection: list its documents
    if (!init.method && rel && depth % 2 === 1) return ok(200, { documents: [...docs].filter(([k]) => k.startsWith(rel + "/") && k.split("/").length === depth + 1).map(([k, d]) => ({ name: "x/documents/" + k, fields: d.fields })) }); }
  if (url.endsWith("/documents:commit")) {
    if (beforeCommit) { const f = beforeCommit; beforeCommit = null; f(); }
    let { writes } = JSON.parse(init.body);
    for (const w of writes.filter(w => w.delete)) docs.delete(w.delete.split("/documents/")[1]);
    writes = writes.filter(w => w.update);
    for (const w of writes) {
      const d = docs.get(w.update.name.split("/documents/")[1]), c = w.currentDocument;
      if (c?.exists === false && d) return ok(409, { error: { status: "ALREADY_EXISTS" } });
      if (c?.updateTime && (!d || d.updateTime !== c.updateTime)) return ok(400, { error: { status: "FAILED_PRECONDITION" } });
    }
    for (const w of writes) docs.set(w.update.name.split("/documents/")[1], { fields: w.update.fields, updateTime: "t" + (++tick) });
    return ok(200, {});
  }
  const p = pathOf(url), d = docs.get(p);
  if (!init.method) return d ? ok(200, { fields: d.fields, updateTime: d.updateTime }) : ok(404, {});
  if (init.method === "PATCH") {
    if (!d) return ok(404, {});
    docs.set(p, { fields: { ...d.fields, ...JSON.parse(init.body).fields }, updateTime: "t" + (++tick) });
    return ok(200, {});
  }
  throw new Error("unexpected " + url);
}
function verify(jwt) {
  const [h, b, s] = jwt.split(".");
  assert.ok(createVerify("RSA-SHA256").update(`${h}.${b}`).verify(publicKey, Buffer.from(s, "base64url")), "bad signature");
  return JSON.parse(Buffer.from(b, "base64url"));
}
let clock = Date.parse("2026-11-21T20:00:00Z");
const call = async (action, body, ip = "203.0.113.7") => {
  const res = await lib.handle(new Request("https://x.netlify.app/api/compte/" + action, { method: "POST", body: JSON.stringify(body) }), { ip }, { env, fetch, now: clock });
  return { status: res.status, ...(await res.json()) };
};
const phoneA = randomUUID(), phoneB = randomUUID();

// one account per phone
let r = await call("inscription", { pseudo: "Léa_92", password: "secret1", device: phoneA });
assert.equal(r.status, 200, JSON.stringify(r));
const t = verify(r.token);
assert.match(t.uid, /^acct_[0-9a-f]{24}$/); assert.equal(t.claims.pseudo, "Léa_92");
console.log("signup ok, uid", t.uid);
r = await call("inscription", { pseudo: "Autre", password: "secret1", device: phoneA });
assert.equal(r.status, 403); assert.match(r.error, /Léa_92/); console.log("same phone blocked:", r.error);
r = await call("inscription", { pseudo: "Autre", password: "secret1", device: phoneA }, "198.51.100.9");
assert.equal(r.status, 403); console.log("same phone on another network still blocked");

// several phones on the same Wi-Fi
r = await call("inscription", { pseudo: "Bob", password: "secret1", device: phoneB });
assert.equal(r.status, 200, JSON.stringify(r)); console.log("second phone, same Wi-Fi: ok");

const dump = JSON.stringify([...docs]);
assert.ok(!dump.includes("secret1") && !dump.includes("203.0.113.7") && !dump.includes(phoneA), "raw secret leaked into Firestore");

// input checks
r = await call("inscription", { pseudo: "Sans", password: "secret1" });
assert.equal(r.status, 400); console.log("no phone id:", r.error);
r = await call("inscription", { pseudo: "Court", password: "secret1", device: "abc" });
assert.equal(r.status, 400);
r = await call("inscription", { pseudo: "léa_92", password: "secret1", device: randomUUID() });
assert.equal(r.status, 409); console.log("pseudo is case-insensitive:", r.error);
r = await call("inscription", { pseudo: "ab", password: "secret1", device: randomUUID() });
assert.equal(r.status, 400);
r = await call("inscription", { pseudo: "Bobby", password: "12345", device: randomUUID() });
assert.equal(r.status, 400);

// anti-robot cap: 20 accounts per connection per 24 h (2 already made on this IP)
for (let i = 3; i <= 20; i++) { r = await call("inscription", { pseudo: "Joueur" + i, password: "secret1", device: randomUUID() }); assert.equal(r.status, 200, "account " + i); }
r = await call("inscription", { pseudo: "Joueur21", password: "secret1", device: randomUUID() });
assert.equal(r.status, 429); console.log("21st account on one connection in 24 h:", r.error);
r = await call("inscription", { pseudo: "Joueur21", password: "secret1", device: randomUUID() }, "2001:db8:1:2::abcd");
assert.equal(r.status, 200); console.log("other connection unaffected");
clock += 24 * 3600 * 1000;
r = await call("inscription", { pseudo: "Joueur22", password: "secret1", device: randomUUID() });
assert.equal(r.status, 200); console.log("cap resets after 24 h");

// race: another signup lands between our read and our write
beforeCommit = () => { const k = [...docs.keys()].find(k => k.startsWith("accountIps/")); docs.set(k, { ...docs.get(k), updateTime: "raced" }); };
r = await call("inscription", { pseudo: "Course", password: "secret1", device: randomUUID() });
assert.equal(r.status, 409); console.log("concurrent signup detected:", r.error);
r = await call("connexion", { pseudo: "Course", password: "secret1" });
assert.equal(r.status, 401, "lost race must not leave a half-made account");

// login still works the same
r = await call("connexion", { pseudo: "LÉA_92", password: "secret1" });
assert.equal(r.status, 200); assert.equal(verify(r.token).uid, t.uid); console.log("login ok, same uid");
r = await call("connexion", { pseudo: "Léa_92", password: "nope" });
assert.equal(r.status, 401);
for (let i = 0; i < 9; i++) await call("connexion", { pseudo: "Léa_92", password: "nope" });
r = await call("connexion", { pseudo: "Léa_92", password: "secret1" });
assert.equal(r.status, 429); console.log("locked after 10 failures");
r = await call("connexion", { pseudo: "Bob", password: "secret1" });
assert.equal(r.status, 200);

// IP record written by the earlier per-IP version counts as one signup instead of crashing
const legacyIp = "192.0.2.77";
const before = new Set(docs.keys());
await call("inscription", { pseudo: "Legacy", password: "secret1", device: randomUUID() }, legacyIp);
const k = [...docs.keys()].find(k => k.startsWith("accountIps/") && !before.has(k));
docs.set(k, { fields: { account: { stringValue: "Legacy" }, createdAt: { integerValue: String(clock) } }, updateTime: "old" });
r = await call("inscription", { pseudo: "Legacy2", password: "secret1", device: randomUUID() }, legacyIp);
assert.equal(r.status, 200, JSON.stringify(r));
assert.equal(docs.get(k).fields.count.integerValue, "2"); console.log("old-format IP record migrated");

// ---------- admin ----------
const { createSign } = await import("node:crypto");
const idToken = (claims, { key = google.privateKey, kid = "k1", exp = 3600 } = {}) => {
  const iat = Math.floor(clock / 1000);
  const h = Buffer.from(JSON.stringify({ alg: "RS256", kid })).toString("base64url");
  const b = Buffer.from(JSON.stringify({ iss: "https://securetoken.google.com/" + lib.PROJECT, aud: lib.PROJECT, sub: "u1", iat, exp: iat + exp, ...claims })).toString("base64url");
  return h + "." + b + "." + createSign("RSA-SHA256").update(h + "." + b).sign(key).toString("base64url");
};
r = await call("inscription", { pseudo: "boss", password: "secret1", device: randomUUID() }, "198.18.0.1");
assert.equal(r.status, 409); console.log("admin pseudo cannot be registered:", r.error);
// the admin account is made the way the user will: created before ADMIN_PSEUDO lists it
const res2 = await lib.handle(new Request("https://x/api/compte/inscription", { method: "POST", body: JSON.stringify({ pseudo: "Boss", password: "secret1", device: randomUUID() }) }), { ip: "198.18.0.2" }, { env: { ...env, ADMIN_PSEUDO: "" }, fetch, now: clock });
assert.equal(res2.status, 200);
r = await call("connexion", { pseudo: "boss", password: "secret1" });
assert.equal(r.status, 200); assert.equal(r.admin, true); assert.equal(verify(r.token).claims.admin, true); console.log("admin login gets admin claim");
r = await call("connexion", { pseudo: "Bob", password: "secret1" });
assert.equal(r.admin, false); assert.equal(verify(r.token).claims.admin, undefined);

const adm = body => call("admin", body);
const good = idToken({ pseudo: "Boss", admin: true });
r = await adm({ idToken: good, action: "list" });
assert.equal(r.status, 200, JSON.stringify(r));
assert.ok(r.accounts.some(a => a.pseudo === "Bob") && r.accounts.every(a => !("hash" in a) && !("salt" in a)));
console.log("admin list:", r.accounts.length, "accounts, no hashes");
r = await adm({ idToken: idToken({ pseudo: "Bob" }), action: "list" });
assert.equal(r.status, 403); console.log("non-admin refused:", r.error);
r = await adm({ idToken: idToken({ pseudo: "Mallory", admin: true }), action: "list" });
assert.equal(r.status, 403); console.log("admin claim without ADMIN_PSEUDO refused");
r = await adm({ idToken: idToken({ pseudo: "Boss", admin: true }, { key: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey }), action: "list" });
assert.equal(r.status, 401); console.log("forged token refused:", r.error);
r = await adm({ idToken: idToken({ pseudo: "Boss", admin: true }, { exp: -10 }), action: "list" });
assert.equal(r.status, 401); console.log("expired token refused");
r = await adm({ idToken: "nope", action: "list" });
assert.equal(r.status, 401);
{ // an unsigned ("alg: none") session, like the Auth emulator's: refused unless FIREBASE_AUTH_EMULATOR_HOST is set (never on Netlify)
  const iat = Math.floor(clock / 1000), b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = b64({ alg: "none", typ: "JWT" }) + "." + b64({ iss: "https://securetoken.google.com/" + lib.PROJECT, aud: lib.PROJECT, sub: "u1", iat, exp: iat + 3600, pseudo: "Boss", admin: true }) + ".";
  r = await adm({ idToken: unsigned, action: "list" });
  assert.equal(r.status, 401); console.log("unsigned session refused in production");
  const res = await lib.handle(new Request("https://x/api/compte/admin", { method: "POST", body: JSON.stringify({ idToken: unsigned, action: "list" }) }), {}, { env: { ...env, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }, fetch, now: clock });
  assert.equal(res.status, 200); console.log("…and accepted only with the emulator variable (tests)");
}

r = await adm({ idToken: good, action: "reset", pseudo: "bob", password: "nouveau1" });
assert.equal(r.status, 200);
r = await call("connexion", { pseudo: "Bob", password: "secret1" }); assert.equal(r.status, 401);
r = await call("connexion", { pseudo: "Bob", password: "nouveau1" }); assert.equal(r.status, 200); console.log("admin password reset works");

r = await adm({ idToken: good, action: "delete", pseudo: "Boss" });
assert.equal(r.status, 400);
r = await adm({ idToken: good, action: "delete", pseudo: "Bob" });
assert.equal(r.status, 200);
r = await call("connexion", { pseudo: "Bob", password: "nouveau1" }); assert.equal(r.status, 401);
r = await adm({ idToken: good, action: "list" });
const bob = r.accounts.find(a => a.pseudo === "Bob");
assert.ok(bob && bob.deletedAt > 0); console.log("deleted account still listed (archived)");
r = await call("inscription", { pseudo: "Bob", password: "secret1", device: phoneB }, "198.18.0.9");
assert.equal(r.status, 200); console.log("pseudo and phone freed after delete");

// ---------- per-connection login limit ----------
{
  const ip = "198.51.100.200";
  for (let i = 0; i < 30; i++) { const x = await call("connexion", { pseudo: "Personne" + i, password: "nope" }, ip); assert.equal(x.status, 401); }
  r = await call("connexion", { pseudo: "Bob", password: "secret1" }, ip);
  assert.equal(r.status, 429); console.log("30 misses from one connection, any accounts:", r.error);
  r = await call("connexion", { pseudo: "Bob", password: "secret1" }, "198.51.100.201");
  assert.equal(r.status, 200); console.log("other connections unaffected");
  clock += 16 * 60 * 1000;
  r = await call("connexion", { pseudo: "Bob", password: "secret1" }, ip);
  assert.equal(r.status, 200); console.log("connection unblocked after 15 min");
}

// ---------- suspend (ban) ----------
r = await adm({ idToken: idToken({ pseudo: "Boss", admin: true }), action: "ban", pseudo: "Bob" });
assert.equal(r.status, 200, JSON.stringify(r));
assert.deepEqual(authCalls.at(-1)[0], "update"); assert.equal(authCalls.at(-1)[1].disableUser, true);
r = await call("connexion", { pseudo: "Bob", password: "secret1" }, "198.51.100.202");
assert.equal(r.status, 403); console.log("banned:", r.error, "+ Firebase session disabled");
r = await adm({ idToken: idToken({ pseudo: "Boss", admin: true }), action: "list" });
assert.equal(r.accounts.find(a => a.pseudo === "Bob" && !a.deletedAt).banned, true);
r = await adm({ idToken: idToken({ pseudo: "Boss", admin: true }), action: "ban", pseudo: "Boss" });
assert.equal(r.status, 400);
r = await adm({ idToken: idToken({ pseudo: "Boss", admin: true }), action: "unban", pseudo: "Bob" });
assert.equal(authCalls.at(-1)[1].disableUser, false);
r = await call("connexion", { pseudo: "Bob", password: "secret1" }, "198.51.100.202");
assert.equal(r.status, 200); console.log("unbanned: can log in again");

// ---------- the player's own account ----------
const bobUid = verify(r.token).uid;
const bobTok = idToken({ pseudo: "Bob", sub: bobUid });
r = await call("moi", { idToken: bobTok, action: "password", password: "wrong", newPassword: "nouveau2" });
assert.equal(r.status, 401); console.log("password change needs the current password:", r.error);
r = await call("moi", { idToken: idToken({ pseudo: "Bob", sub: "acct_someoneelse" }), action: "password", password: "secret1", newPassword: "nouveau2" });
assert.equal(r.status, 404); console.log("a session for another uid cannot touch Bob's account");
r = await call("moi", { idToken: bobTok, action: "password", password: "secret1", newPassword: "nouveau2" });
assert.equal(r.status, 200);
r = await call("connexion", { pseudo: "Bob", password: "nouveau2" }, "198.51.100.203"); assert.equal(r.status, 200); console.log("own password changed");
// Bob owns a profile, stats, a save in two pieces and a group membership
const put = (path, fields) => docs.set(path, { fields, updateTime: "t" + (++tick) });
put(`profiles/${bobUid}`, { pseudo: { stringValue: "Bob" }, party: { stringValue: "GRP1" } });
put(`profiles/${bobUid}/stats/perudo`, { data: { stringValue: "{}" } });
put(`profiles/${bobUid}/saves/s1`, { kind: { stringValue: "replay" } });
put(`profiles/${bobUid}/saves/s1/chunks/000`, { d: { stringValue: "x" } });
put(`profiles/${bobUid}/saves/s1/chunks/001`, { d: { stringValue: "y" } });
put("parties/GRP1/members/" + bobUid, { pseudo: { stringValue: "Bob" } });
r = await call("moi", { idToken: bobTok, action: "delete", password: "nouveau2" });
assert.equal(r.status, 200, JSON.stringify(r));
assert.ok(![...docs.keys()].some(k => k.includes(bobUid) && !k.startsWith("accountsArchive/")), "everything Bob owned is gone");
assert.equal(authCalls.at(-1)[0], "delete");
r = await call("connexion", { pseudo: "Bob", password: "nouveau2" }, "198.51.100.204"); assert.equal(r.status, 401);
r = await adm({ idToken: idToken({ pseudo: "Boss", admin: true }), action: "list" });
assert.equal(r.accounts.filter(a => a.pseudo === "Bob" && a.deletedBy === "self").length, 1);
console.log("self-delete: profile, stats, saves, group spot and session removed; still listed for the admin");
r = await call("moi", { idToken: idToken({ pseudo: "Boss", sub: (await call("connexion", { pseudo: "Boss", password: "secret1" }, "198.51.100.205").then(x => verify(x.token).uid)) }), action: "delete", password: "secret1" });
assert.equal(r.status, 400); console.log("an admin cannot delete itself");

// ---------- usage ----------
r = await adm({ idToken: idToken({ pseudo: "Boss", admin: true }), action: "usage" });
assert.equal(r.status, 200, JSON.stringify(r));
assert.deepEqual([r.usage.reads, r.usage.writes, r.usage.deletes], [1234, 56, 7]);
assert.equal(r.usage.limits.reads, 50000); console.log("usage today:", r.usage.reads, "reads /", r.usage.limits.reads);
monitoringDenied = true;
r = await adm({ idToken: idToken({ pseudo: "Boss", admin: true }), action: "usage" });
assert.equal(r.status, 403); console.log("without the Monitoring role:", r.error.slice(0, 60) + "…");
assert.equal(new Date(lib.pacificMidnight(Date.parse("2026-11-21T20:00:00Z"))).toISOString(), "2026-11-21T08:00:00.000Z");

// ---------- idle groups ----------
{
  const ts = ms => ({ timestampValue: new Date(ms).toISOString() });
  put("parties/OLD1", { createdAt: { integerValue: String(clock - 10 * 86400000) } });
  put("parties/OLD1/members/u1", { seen: ts(clock - 4 * 86400000) });
  put("parties/NEW1", { createdAt: { integerValue: String(clock - 10 * 86400000) } });
  put("parties/NEW1/members/u1", { seen: ts(clock - 4 * 86400000) });
  put("parties/NEW1/members/u2", { seen: ts(clock - 3600000) });
  const out = await lib.closeIdleGroups({ env, fetch, now: clock });
  assert.ok(out.closed.includes("OLD1") && !out.closed.includes("NEW1"));
  assert.ok(!docs.has("parties/OLD1") && !docs.has("parties/OLD1/members/u1") && docs.has("parties/NEW1"));
  console.log("idle group closed after 3 days, active one kept");
}

// ---------- crash reports ----------
r = await call("erreur", { message: "TypeError: x is undefined", game: "perudo", screen: "room · play", stack: "at a (app.js:1)\nat b", pseudo: "Ana" }, "198.51.100.77");
assert.equal(r.status, 200);
const reports = [...docs.keys()].filter(k => k.startsWith("errors/"));
assert.equal(reports.length, 1);
assert.equal(docs.get(reports[0]).fields.game.stringValue, "perudo");
r = await call("erreur", { message: "" }, "198.51.100.77"); assert.equal(r.status, 400);
for (let i = 0; i < 40; i++) await call("erreur", { message: "boom " + i }, "198.51.100.78");
assert.equal([...docs.keys()].filter(k => k.startsWith("errors/")).length, 31, "30 per connection and hour (+ the first one)");
console.log("crash reports stored, at most 30 per connection and hour");

// ---------- nightly cleanup of games ----------
{
  const ts = ms => ({ timestampValue: new Date(ms).toISOString() });
  const put2 = (path, fields) => docs.set(path, { fields, updateTime: "t" + (++tick) });
  put2("pdRooms/OLD1", { phase: { stringValue: "play" }, touchedAt: ts(clock - 30 * 3600000) });
  put2("pdRooms/OLD1/players/u1", { nick: { stringValue: "Ana" } });
  put2("pdRooms/OLD1/moves/m1", { kind: { stringValue: "bid" } });
  put2("prRooms/OLD2", { phase: { stringValue: "lobby" } });                           // no stamp at all: old
  put2("prRooms/OLD2/photos/p1", { d: { stringValue: "data" } });
  put2("prRooms/OLD2/photos/p1/bits/b1", { d: { stringValue: "deeper" } });
  put2("pdRooms/LIVE", { phase: { stringValue: "play" }, touchedAt: ts(clock - 3600000) });
  put2("pdRooms/LIVE/players/u1", { nick: { stringValue: "Ben" } });
  put2("errors/old", { at: { integerValue: String(clock - 40 * 86400000) }, message: { stringValue: "old" } });
  const out = await lib.closeOldRooms({ env, fetch, now: clock });
  assert.deepEqual(out.deleted.sort(), ["pdRooms/OLD1", "prRooms/OLD2"]);
  assert.ok(![...docs.keys()].some(k => k.startsWith("pdRooms/OLD1") || k.startsWith("prRooms/OLD2")), "everything under old games is gone");
  assert.ok(docs.has("pdRooms/LIVE") && docs.has("pdRooms/LIVE/players/u1"), "a game played an hour ago is kept");
  assert.ok(!docs.has("errors/old") && docs.has(reports[0]), "reports older than 30 days are purged");
  console.log("nightly cleanup: old games deleted with everything under them, live game kept, old reports purged");
}

assert.equal(oauthCalls, 1, "access token should be cached");
console.log("\nALL PASSED —", docs.size, "docs in fake Firestore");
