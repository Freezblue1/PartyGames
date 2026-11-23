// Each game's replay journal, fed a small sample game: the real game page, its own helpers, its own wording.
// (Qui de nous is also played for real in two-players.spec.mjs.)
import { test, expect } from "@playwright/test";

const EMU = { auth: "http://127.0.0.1:9099", host: "127.0.0.1", firestorePort: 8181 };
const P = (id, nick, color) => ({ id, nick, color });
const two = [P("a", "Ana", "#D93A26"), P("b", "Ben", "#2F62D0")];
const four = [...two, P("c", "Cléo", "#18825A"), P("d", "Dan", "#7C47CC")];

const SAMPLES = {
  perudo: {
    state: { me: "a", players: two, room: { gameId: "g", order: ["a", "b"], start: 2, dice: { a: 2, b: 0 }, out: ["b"], cast: {}, history: [
      { n: 1, pal: false, t: 4, bids: [{ u: "a", q: 2, f: 6 }, { u: "b", q: 3, f: 6 }], k: "dudo", u: "a", bid: { u: "b", q: 3, f: 6 }, count: 1, lose: "b", gain: "", out: "" },
      { n: 2, pal: true, t: 3, bids: [{ u: "b", q: 1, f: 1 }], k: "calza", u: "a", bid: { u: "b", q: 1, f: 1 }, count: 1, lose: "", gain: "a", out: "" },
      { n: 3, pal: false, t: 3, bids: [{ u: "a", q: 2, f: 4 }], k: "dudo", u: "b", bid: { u: "a", q: 2, f: 4 }, count: 3, lose: "b", gain: "", out: "b" }] } },
    expect: ["@a annonce 2 dés de 6.", "@a dit « Dudo ! » : il n'y a pas 3 dés de 6.", "On soulève les gobelets : 1 dé de 6. @b perd un dé.",
      "Manche 2 · palifico", "@a dit « Calza ! » : il y a pile 1 paco.", "@b perd un dé et quitte la partie."],
    board: "éliminé", rows: 2
  },
  quidenous: {
    state: { me: "a", players: two, pending: null, votes: [{ round: 1, voter: "a", target: "b" }, { round: 1, voter: "b", target: "b" }, { round: 2, voter: "a", target: "a" }, { round: 2, voter: "b", target: "a" }],
      room: { gameId: "g", deck: [{ t: "Qui de nous ronfle le plus ?" }, { t: "Qui de nous arrive en retard ?" }, { t: "Pas jouée" }], round: 3, revealed: 0, skipped: [3] } },
    expect: ["« Qui de nous ronfle le plus ? »", "@a vote pour @b.", "Verdict : @b (2 votes).", "Verdict : @a (2 votes).", "Question passée."],
    notExpect: ["@b vote pour"], board: "1 verdict", rows: 2
  },
  undercover: {
    state: { me: "a", players: [...two, P("c", "Cléo", "#18825A")],
      clues: [{ round: 1, uid: "a", text: "sable", at: 1 }, { round: 1, uid: "b", text: "soleil", at: 2 }, { round: 1, uid: "c", text: "chlore", at: 3 }],
      votes: [{ round: 1, v: 1, voter: "a", target: "c" }, { round: 1, v: 1, voter: "b", target: "c" }, { round: 1, v: 1, voter: "c", target: "a" }],
      room: { gameId: "g", order: ["a", "b", "c"], round: 1, oral: false, news: null, out: [{ uid: "c", role: "uc", round: 1 }],
        result: { winner: "civ", civ: "plage", uc: "piscine", roles: { a: "civ", b: "civ", c: "uc" } } } },
    expect: ["@a : « sable »", "Vote : @c (2), @a (1).", "@c est éliminé : c'était l'Undercover.", "Civils : « plage » · Undercover : « piscine »", "Les civils gagnent."],
    board: "éliminé · Undercover", rows: 3
  },
  "loup-garou": {
    state: { me: "a", players: [...two, P("c", "Cléo", "#18825A")],
      room: { gameId: "g", order: ["a", "b", "c"], recapFor: "g", out: [{ uid: "b" }, { uid: "c" }], result: { winner: "village", roles: { a: "seer", b: "villager", c: "wolf" } },
        recap: [{ t: "Nuit 1", l: [["🔮 La Voyante regarde ", "@c", " : ", "%wolf"], ["🐺 Les loups choisissent ", "@b"]] }, { t: "Jour 1", l: [["@c", " est éliminé par le village"]] }] } },
    expect: ["Nuit 1", "🔮 La Voyante regarde @c : ", "🐺 Les loups choisissent @b", "@c est éliminé par le village", "Le village gagne !"],
    rows: 3
  },
  photoroulette: {
    state: { me: "a", players: two, pending: null, votes: [{ gameId: "g", round: 1, voter: "b", target: "a" }, { gameId: "g", round: 2, voter: "a", target: "b" }],
      room: { gameId: "g", order: ["a", "b"], cast: { a: { nick: "Ana", color: "#D93A26" }, b: { nick: "Ben", color: "#2F62D0" } }, deck: ["p1", "p2"],
        answers: { r1: "a", r2: "?" }, gains: { r1: { b: 80 } } } },
    expect: ["@b pense que c'est @a.", "C'était la photo de @a. Bien vu : @b (+80).", "La photo d'un joueur parti."],
    board: "80 points", rows: 2
  },
  "blanc-manger-coco": {
    state: { me: "a", players: [...two, P("c", "Cléo", "#18825A")],
      room: { gameId: "g", order: ["a", "b", "c"], scores: { a: 1, b: 0, c: 0 }, history: [
        { q: { t: "Ma plus grande honte : ___." }, j: "", w: ["a"], subs: [{ u: "a", c: ["le karaoké"], n: 2 }, { u: "b", c: ["les chaussettes"], n: 0 }], m: ["c"] }] } },
    expect: ["le karaoké", "· 2 voix", "@c n'a pas joué.", "Point pour @a."],
    board: "1 point", rows: 3
  },
  quisuisje: {
    state: { me: "a", players: two, cards: { a: { name: "Napoléon" }, b: { name: "Cléopâtre" } },
      room: { gameId: "g", order: ["a", "b"], found: ["a"], history: [
        { u: "a", k: "q", t: "Suis-je un homme ?", r: "yes", y: 1, n: 0, i: 0, x: [] },
        { u: "b", k: "q", t: "Suis-je vivant ?", r: "no", y: 0, n: 1, i: 0, x: [] },
        { u: "a", k: "g", t: "Napoléon", r: "ok", y: 1, n: 0, i: 0, x: [] }] } },
    expect: ["@a demande « Suis-je un homme ? » → Oui (1 oui, 0 non).", "@b demande « Suis-je vivant ? » → Non", "@a propose « Napoléon » : trouvé ! C'était Napoléon."],
    board: "✓ Napoléon", rows: 2, rowText: "Cléopâtre"
  },
  poker: {
    state: { me: "a", players: two,
      hands: [{ n: 1, pot: 200, bf: false, d: { a: 100, b: -100 }, w: ["a"], sc: {}, bust: [], board: [0, 13, 26, 1, 2],
        log: [{ u: "a", k: "sb", a: 10 }, { u: "b", k: "bb", a: 20 }, { u: "a", k: "call", a: 20 }, { k: "street", s: 1 }, { u: "b", k: "bet", a: 80 }, { u: "a", k: "call", a: 80 }] }],
      room: { gameId: "g", order: ["a", "b"], start: 1000, stacks: { a: 1100, b: 900 }, rebuys: {}, out: [] } },
    expect: ["Main 1", "@a petite blinde 10.", "@a suit (20).", "Flop : 2♠︎ 2♥︎ 2♦︎", "@b mise 80.", "@a remporte le pot de 200."],
    board: "+100", rows: 2
  },
  kems: {
    state: { me: "a", players: four,
      rounds: [{ n: 1, kind: "kems", by: "a", target: "b", ok: true, win: 0, drop: -1 }, { n: 2, kind: "contre", by: "c", target: "a", ok: false, win: 0, drop: -1 }],
      room: { gameId: "g", order: ["a", "b", "c", "d"], teamOf: { a: 0, b: 0, c: 1, d: 1 }, pts: [2, 0], solo: false } },
    expect: ["Équipes : @a et @b contre @c et @d.", "@a crie « Kems ! » pour @b : bien vu, il y avait un carré !", "@a et @b écrivent la lettre K.",
      "@c crie « Contre ! » sur @a : raté, pas de carré.", "écrivent la lettre E."],
    board: "KE", rows: 4
  }
};

for (const [game, s] of Object.entries(SAMPLES)) {
  test(`${game}: the journal tells the game`, async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(e => { window.SOIREE_EMULATORS = e; }, EMU);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`/${game}/`);
    await expect.poll(() => page.evaluate(() => !!window.soireeDev?.state())).toBe(true);
    const j = await page.evaluate(sample => { Object.assign(window.soireeDev.state(), sample); return window.soireeDev.journal(); }, s.state);
    const lines = j.events.map(e => [e.head, e.text].filter(Boolean).join(" | ")).join("\n");
    for (const t of s.expect) expect(lines, `${game} journal`).toContain(t);
    for (const t of s.notExpect || []) expect(lines).not.toContain(t);
    if (s.board) expect(JSON.stringify(j.events.filter(e => e.board).map(e => e.board))).toContain(s.board);
    expect(j.final.rows).toHaveLength(s.rows);
    if (s.rowText) expect(JSON.stringify(j.final.rows)).toContain(s.rowText);
    for (const id of Object.keys(j.players)) expect(j.players[id].nick).not.toBe("?");
    if (game === "photoroulette") {
      // the end screen records the game in Photo Roulette's new stats, and the home page shows them
      const prof = await page.evaluate(() => {
        const M = window.soireeDev.state();
        Object.assign(M, { mode: "room", code: "ABCD", roomReady: true, playersReady: true, me: "b" });
        M.room.phase = "end";
        window.soireeDev.render();
        M.mode = "home"; window.soireeDev.render();
        return JSON.parse(localStorage.getItem("pr-profile") || "null");
      });
      expect(prof).toMatchObject({ games: 1, wins: 1, points: 80, found: 1, best: 80 });
      await expect(page.locator("#app")).toContainText("Mon profil");
      await expect(page.locator("#app .stats")).toContainText("1 partie");
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
