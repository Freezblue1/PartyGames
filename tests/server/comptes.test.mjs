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
const docs = new Map(); let oauthCalls = 0, tick = 0, beforeCommit = null;
const ok = (status, body) => new Response(JSON.stringify(body), { status });
const pathOf = u => decodeURIComponent(new URL(u).pathname.split("/documents/")[1] || "");
async function fetch(url, init = {}) {
  if (url === "https://oauth2.googleapis.com/token") {
    oauthCalls++; verify(new URLSearchParams(init.body.toString()).get("assertion"));
    return ok(200, { access_token: "tok", expires_in: 3600 });
  }
  if (url.startsWith("https://www.googleapis.com/service_accounts/v1/jwk/")) return new Response(JSON.stringify({ keys: [googleJwk] }), { status: 200, headers: { "cache-control": "max-age=600" } });
  assert.equal(init.headers.authorization, "Bearer tok");
  if (url.endsWith("/documents:runQuery")) {
    const f = JSON.parse(init.body).structuredQuery, col = f.from[0].collectionId, w = f.where.fieldFilter;
    return ok(200, [...docs].filter(([k, d]) => k.startsWith(col + "/") && d.fields[w.field.fieldPath]?.stringValue === w.value.stringValue).map(([k]) => ({ document: { name: "projects/p/databases/(default)/documents/" + k } })));
  }
  { const rel = decodeURIComponent(new URL(url).pathname.split("/documents/")[1] || "");
    if (!init.method && rel && !rel.includes("/")) return ok(200, { documents: [...docs].filter(([k]) => k.startsWith(rel + "/") && k.split("/").length === 2).map(([k, d]) => ({ name: "x/documents/" + k, fields: d.fields })) }); }
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

assert.equal(oauthCalls, 1, "access token should be cached");
console.log("\nALL PASSED —", docs.size, "docs in fake Firestore");
