// Firestore rules tests, run against the local emulator (npm run test:rules).
// Loading the rules is itself the syntax check: a typo makes the very first step fail with Firebase's error message.
import { describe, it, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, writeBatch, setLogLevel, serverTimestamp, Timestamp } from "firebase/firestore";

setLogLevel("silent");  // refused writes are expected here; keep the output to the test results

const PROJECT = "qui-de-nous-7244f";
let env;
// Accounts carry their pseudo in the token (set by the account server); the admin also carries admin: true.
const alice = () => env.authenticatedContext("acct_alice", { pseudo: "Alice" }).firestore();
const bob = () => env.authenticatedContext("acct_bob", { pseudo: "Bob" }).firestore();
const carol = () => env.authenticatedContext("acct_carol", { pseudo: "Carol" }).firestore();
const guest = () => env.authenticatedContext("anon_1", { firebase: { sign_in_provider: "anonymous" } }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();
const admin = () => env.authenticatedContext("acct_boss", { pseudo: "Boss", admin: true }).firestore();
const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8181 }
  });
});
after(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

describe("the rules file", () => {
  it("loads in the emulator (no syntax error)", () => { if (!env) throw new Error("rules did not load"); });
});

describe("profiles", () => {
  const mine = { pseudo: "Alice", color: "#2F62D0", party: null, createdAt: 1 };
  it("an account creates its own profile under its own pseudo", () => assertSucceeds(setDoc(doc(alice(), "profiles/acct_alice"), mine)));
  it("cannot take another pseudo", () => assertFails(setDoc(doc(alice(), "profiles/acct_alice"), { ...mine, pseudo: "Bob" })));
  it("cannot write someone else's profile", () => assertFails(setDoc(doc(bob(), "profiles/acct_alice"), { ...mine, pseudo: "Bob" })));
  it("colour must be a #RRGGBB colour", () => assertFails(setDoc(doc(alice(), "profiles/acct_alice"), { ...mine, color: "red;background:url(x)" })));
  it("cannot add unknown fields", () => assertFails(setDoc(doc(alice(), "profiles/acct_alice"), { ...mine, admin: true })));
  it("a guest (anonymous) has no profile", () => assertFails(setDoc(doc(guest(), "profiles/anon_1"), { ...mine, pseudo: "Alice" })));
  it("signed-in players can read profiles, strangers cannot", async () => {
    await seed(db => setDoc(doc(db, "profiles/acct_alice"), mine));
    await assertSucceeds(getDoc(doc(bob(), "profiles/acct_alice")));
    await assertFails(getDoc(doc(nobody(), "profiles/acct_alice")));
  });
});

describe("saved games", () => {
  const save = { kind: "replay", game: "quidenous", at: 1, code: "ABCD", enc: "gzip", chunks: 1, frames: 3, players: ["Alice", "Bob"] };
  const seedSave = () => seed(async db => {
    await setDoc(doc(db, "profiles/acct_alice/saves/s1"), save);
    await setDoc(doc(db, "profiles/acct_alice/saves/s1/chunks/000"), { d: "H4sI" });
  });
  it("an account saves a game (save + chunks in one batch)", () => {
    const db = alice(), b = writeBatch(db);
    b.set(doc(db, "profiles/acct_alice/saves/s1"), save);
    b.set(doc(db, "profiles/acct_alice/saves/s1/chunks/000"), { d: "H4sI" });
    return assertSucceeds(b.commit());
  });
  it("the owner reads their saves", async () => {
    await seedSave();
    await assertSucceeds(getDocs(collection(alice(), "profiles/acct_alice/saves")));
    await assertSucceeds(getDoc(doc(alice(), "profiles/acct_alice/saves/s1/chunks/000")));
  });
  it("nobody else can list, read or download them", async () => {
    await seedSave();
    for (const db of [bob(), guest(), nobody()]) {
      await assertFails(getDocs(collection(db, "profiles/acct_alice/saves")));
      await assertFails(getDoc(doc(db, "profiles/acct_alice/saves/s1")));
      await assertFails(getDoc(doc(db, "profiles/acct_alice/saves/s1/chunks/000")));
    }
  });
  it("nobody else can delete or add to them", async () => {
    await seedSave();
    await assertFails(deleteDoc(doc(bob(), "profiles/acct_alice/saves/s1")));
    await assertFails(setDoc(doc(bob(), "profiles/acct_alice/saves/s2"), save));
    await assertFails(setDoc(doc(guest(), "profiles/anon_1/saves/s2"), save));
  });
  it("rejects malformed saves", async () => {
    await assertFails(setDoc(doc(alice(), "profiles/acct_alice/saves/s3"), { ...save, kind: "hack" }));
    await assertFails(setDoc(doc(alice(), "profiles/acct_alice/saves/s3"), { ...save, chunks: 50 }));
    await assertFails(setDoc(doc(alice(), "profiles/acct_alice/saves/s3/chunks/000"), { d: "x".repeat(900001) }));
  });
});

describe("groups", () => {
  const group = { hostUid: "acct_alice", hostPseudo: "Alice", createdAt: 1, current: null };
  const member = (pseudo, color = "#18825A") => ({ pseudo, color, joinedAt: 1 });
  const seedGroup = () => seed(async db => {
    await setDoc(doc(db, "parties/ABCD"), group);
    await setDoc(doc(db, "parties/ABCD/members/acct_alice"), member("Alice"));
    await setDoc(doc(db, "parties/ABCD/members/acct_bob"), member("Bob"));
  });
  it("an account creates a group it leads", () => assertSucceeds(setDoc(doc(alice(), "parties/ABCD"), group)));
  it("cannot create a group in someone else's name", () => assertFails(setDoc(doc(bob(), "parties/ABCD"), group)));
  it("a guest cannot create a group", () => assertFails(setDoc(doc(guest(), "parties/ABCD"), { ...group, hostUid: "anon_1" })));
  it("cannot take over an existing group by re-creating it", async () => {
    await seedGroup();
    await assertFails(setDoc(doc(bob(), "parties/ABCD"), { ...group, hostUid: "acct_bob", hostPseudo: "Bob" }));
  });
  it("the leader steers the group into a room", async () => {
    await seedGroup();
    await assertSucceeds(updateDoc(doc(alice(), "parties/ABCD"), { current: { game: "quidenous", room: "WXYZ", at: 2 } }));
  });
  it("a member cannot steer someone else's group", async () => {
    await seedGroup();
    await assertFails(updateDoc(doc(bob(), "parties/ABCD"), { current: { game: "poker", room: "EVIL", at: 3 } }));
  });
  it("nobody can make themselves leader", async () => {
    await seedGroup();
    await assertFails(updateDoc(doc(bob(), "parties/ABCD"), { hostUid: "acct_bob" }));
    await assertFails(updateDoc(doc(alice(), "parties/ABCD"), { hostUid: "acct_bob" }));
  });
  it("only the leader dissolves the group", async () => {
    await seedGroup();
    await assertFails(deleteDoc(doc(bob(), "parties/ABCD")));
    await assertSucceeds(deleteDoc(doc(alice(), "parties/ABCD")));
  });
  it("an account joins under its own pseudo", async () => {
    await seedGroup();
    await assertSucceeds(setDoc(doc(carol(), "parties/ABCD/members/acct_carol"), member("Carol")));
    await assertFails(setDoc(doc(carol(), "parties/ABCD/members/acct_carol"), member("Alice")));
  });
  it("cannot add someone else, or join a group that does not exist", async () => {
    await seedGroup();
    await assertFails(setDoc(doc(bob(), "parties/ABCD/members/acct_carol"), member("Carol")));
    await assertFails(setDoc(doc(carol(), "parties/NONE/members/acct_carol"), member("Carol")));
  });
  it("a guest cannot join", async () => {
    await seedGroup();
    await assertFails(setDoc(doc(guest(), "parties/ABCD/members/anon_1"), member("Alice")));
  });
  it("a member leaves; the leader removes members; others cannot", async () => {
    await seedGroup();
    await assertFails(deleteDoc(doc(carol(), "parties/ABCD/members/acct_bob")));
    await assertSucceeds(deleteDoc(doc(bob(), "parties/ABCD/members/acct_bob")));
    await seed(db => setDoc(doc(db, "parties/ABCD/members/acct_bob"), member("Bob")));
    await assertSucceeds(deleteDoc(doc(alice(), "parties/ABCD/members/acct_bob")));
  });
  it("the leader dissolves in one batch (members, then the group)", async () => {
    await seedGroup();
    const db = alice(), b = writeBatch(db);
    b.delete(doc(db, "parties/ABCD/members/acct_alice"));
    b.delete(doc(db, "parties/ABCD/members/acct_bob"));
    b.delete(doc(db, "parties/ABCD"));
    await assertSucceeds(b.commit());
  });
});

describe("stats in the account", () => {
  const stats = { data: JSON.stringify({ games: 3, wins: 1 }), games: 3, wins: 1, at: 1 };
  it("an account saves its stats for a game", () => assertSucceeds(setDoc(doc(alice(), "profiles/acct_alice/stats/perudo"), stats)));
  it("not for a game that does not exist, not with extra fields", async () => {
    await assertFails(setDoc(doc(alice(), "profiles/acct_alice/stats/chess"), stats));
    await assertFails(setDoc(doc(alice(), "profiles/acct_alice/stats/perudo"), { ...stats, admin: true }));
  });
  it("nobody writes someone else's stats; signed-in players read them (group ranking)", async () => {
    await assertFails(setDoc(doc(bob(), "profiles/acct_alice/stats/perudo"), stats));
    await seed(db => setDoc(doc(db, "profiles/acct_alice/stats/perudo"), stats));
    await assertSucceeds(getDoc(doc(bob(), "profiles/acct_alice/stats/perudo")));
    await assertFails(getDoc(doc(nobody(), "profiles/acct_alice/stats/perudo")));
  });
});

describe("sharing a saved game", () => {
  const save = { kind: "replay", game: "perudo", at: 1, code: "ABCD", enc: "gzip", chunks: 1, events: 9, players: ["Alice"] };
  const seedSave = (pub = false) => seed(async db => {
    await setDoc(doc(db, "profiles/acct_alice/saves/s1"), { ...save, public: pub });
    await setDoc(doc(db, "profiles/acct_alice/saves/s1/chunks/000"), { d: "H4sI" });
  });
  it("a save starts private", () => assertFails(setDoc(doc(alice(), "profiles/acct_alice/saves/s2"), { ...save, public: true })));
  it("the owner shares it, then anyone with the link can watch it, even without an account", async () => {
    await seedSave();
    await assertFails(getDoc(doc(nobody(), "profiles/acct_alice/saves/s1")));
    await assertSucceeds(updateDoc(doc(alice(), "profiles/acct_alice/saves/s1"), { public: true }));
    for (const db of [nobody(), guest(), bob()]) {
      await assertSucceeds(getDoc(doc(db, "profiles/acct_alice/saves/s1")));
      await assertSucceeds(getDoc(doc(db, "profiles/acct_alice/saves/s1/chunks/000")));
    }
  });
  it("sharing one save does not open the others, nor the list", async () => {
    await seedSave(true);
    await seed(db => setDoc(doc(db, "profiles/acct_alice/saves/s9"), save));
    await assertFails(getDoc(doc(bob(), "profiles/acct_alice/saves/s9")));
    await assertFails(getDocs(collection(bob(), "profiles/acct_alice/saves")));
  });
  it("only the owner shares or unshares, and can change nothing else", async () => {
    await seedSave();
    await assertFails(updateDoc(doc(bob(), "profiles/acct_alice/saves/s1"), { public: true }));
    await assertFails(updateDoc(doc(alice(), "profiles/acct_alice/saves/s1"), { public: true, game: "poker" }));
    await assertFails(updateDoc(doc(alice(), "profiles/acct_alice/saves/s1"), { public: "yes" }));
  });
});

describe("group leader and presence", () => {
  const ago = min => Timestamp.fromMillis(Date.now() - min * 60000);
  const seedGroup = (hostSeenMinAgo = 0, hostHere = true) => seed(async db => {
    await setDoc(doc(db, "parties/ABCD"), { hostUid: "acct_alice", hostPseudo: "Alice", createdAt: 1, current: null });
    if (hostHere) await setDoc(doc(db, "parties/ABCD/members/acct_alice"), { pseudo: "Alice", color: "#18825A", joinedAt: 1, seen: ago(hostSeenMinAgo) });
    await setDoc(doc(db, "parties/ABCD/members/acct_bob"), { pseudo: "Bob", color: "#2F62D0", joinedAt: 2, seen: ago(0) });
  });
  it("the leader hands the role to a member", async () => {
    await seedGroup();
    await assertSucceeds(updateDoc(doc(alice(), "parties/ABCD"), { hostUid: "acct_bob", hostPseudo: "Bob" }));
  });
  it("…not to someone outside the group, nor under a wrong name", async () => {
    await seedGroup();
    await assertFails(updateDoc(doc(alice(), "parties/ABCD"), { hostUid: "acct_carol", hostPseudo: "Carol" }));
    await assertFails(updateDoc(doc(alice(), "parties/ABCD"), { hostUid: "acct_bob", hostPseudo: "Boss" }));
  });
  it("a member cannot take over while the leader is around", async () => {
    await seedGroup(2);
    await assertFails(updateDoc(doc(bob(), "parties/ABCD"), { hostUid: "acct_bob", hostPseudo: "Bob" }));
  });
  it("a member takes over when the leader has been away 10 minutes", async () => {
    await seedGroup(11);
    await assertSucceeds(updateDoc(doc(bob(), "parties/ABCD"), { hostUid: "acct_bob", hostPseudo: "Bob" }));
  });
  it("a member takes over when the leader left the group", async () => {
    await seedGroup(0, false);
    await assertSucceeds(updateDoc(doc(bob(), "parties/ABCD"), { hostUid: "acct_bob", hostPseudo: "Bob" }));
  });
  it("taking over: only for yourself, and nothing else changes", async () => {
    await seedGroup(11);
    await assertFails(updateDoc(doc(bob(), "parties/ABCD"), { hostUid: "acct_carol", hostPseudo: "Carol" }));
    await assertFails(updateDoc(doc(bob(), "parties/ABCD"), { hostUid: "acct_bob", hostPseudo: "Bob", current: { game: "poker", room: "EVIL", at: 1 } }));
    await assertFails(updateDoc(doc(carol(), "parties/ABCD"), { hostUid: "acct_carol", hostPseudo: "Carol" }));  // not a member
  });
  it("a member says they are here (server time) and where", async () => {
    await seedGroup();
    await assertSucceeds(updateDoc(doc(bob(), "parties/ABCD/members/acct_bob"), { seen: serverTimestamp(), where: "perudo" }));
  });
  it("nobody can fake their presence or someone else's", async () => {
    await seedGroup();
    await assertFails(updateDoc(doc(bob(), "parties/ABCD/members/acct_bob"), { seen: Timestamp.fromMillis(Date.now() + 86400000) }));
    await assertFails(updateDoc(doc(bob(), "parties/ABCD/members/acct_alice"), { seen: serverTimestamp() }));
    await assertFails(updateDoc(doc(bob(), "parties/ABCD/members/acct_bob"), { where: "x".repeat(40) }));
  });
});

describe("account server data", () => {
  const paths = ["accounts/x", "accountDevices/x", "accountIps/x", "accountsArchive/x", "loginIps/x"];
  it("no phone can read or write it", async () => {
    await seed(async db => { for (const p of paths) await setDoc(doc(db, p), { pseudo: "Alice", hash: "secret" }); });
    for (const p of paths) for (const db of [alice(), guest(), nobody()]) {
      await assertFails(getDoc(doc(db, p)));
      await assertFails(setDoc(doc(db, p), { pseudo: "Hacker" }));
    }
  });
});

describe("admin", () => {
  it("reads every account and every save", async () => {
    await seed(async db => {
      await setDoc(doc(db, "accounts/x"), { pseudo: "Alice" });
      await setDoc(doc(db, "profiles/acct_alice/saves/s1"), { kind: "result" });
    });
    await assertSucceeds(getDoc(doc(admin(), "accounts/x")));
    await assertSucceeds(getDocs(collection(admin(), "profiles/acct_alice/saves")));
  });
  it("can change anything, anywhere", async () => {
    await seed(db => setDoc(doc(db, "parties/ABCD"), { hostUid: "acct_alice", hostPseudo: "Alice", createdAt: 1, current: null }));
    await assertSucceeds(updateDoc(doc(admin(), "parties/ABCD"), { hostUid: "acct_boss" }));
    await assertSucceeds(setDoc(doc(admin(), "rooms/TEST"), { anything: true }));
    await assertSucceeds(deleteDoc(doc(admin(), "rooms/TEST")));
  });
  it("a normal account has no admin power", async () => {
    await seed(db => setDoc(doc(db, "accounts/x"), { pseudo: "Alice" }));
    await assertFails(getDoc(doc(alice(), "accounts/x")));
  });
});
