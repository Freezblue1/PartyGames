// Two players, two separate browser sessions, the real site, the local emulators.
// Alice and Bob make accounts, form a group, Alice opens Qui de nous and Bob is pulled into her room,
// they play a game to the end, Bob saves it, then replays it and opens the saved result.
import { test, expect } from "@playwright/test";

const EMU = { auth: "http://127.0.0.1:9099", host: "127.0.0.1", firestorePort: 8181 };
const PASS = "motdepasse1";

async function player(browser, name, errors) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(e => { window.SOIREE_EMULATORS = e; }, EMU);
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`${name}: ${e.message}`));
  return { ctx, page, name };
}

async function signUp({ page, name }) {
  await page.goto("/");
  await page.locator("#acct").click();
  const dlg = page.locator("dialog.so-sheet");
  await dlg.locator('[data-so="mode"][data-m="inscription"]').click();
  await dlg.locator("#so-pseudo").fill(name);
  await dlg.locator("#so-pass").fill(PASS);
  await dlg.locator('button[type="submit"]').click();
  await expect(page.locator("#acct")).toHaveText("👤 " + name);
  await dlg.locator('[data-so="close"]').click();
}

const voteFor = (page, nick) => page.locator('[data-act="vote"]', { hasText: nick }).click();
// Players are not instant: half a second between actions, so each moment of the game gets its own replay frame
// (the recorder keeps at most one frame every 150 ms).
const beat = page => page.waitForTimeout(500);

test("two players: group, full game, saves, replay", async ({ browser }) => {
  const errors = [];
  const alice = await player(browser, "Alice", errors);
  const bob = await player(browser, "Bob", errors);

  await test.step("both create an account", async () => {
    await signUp(alice);
    await signUp(bob);
  });

  let group;
  await test.step("Alice creates a group, Bob joins it with the code", async () => {
    await alice.page.locator('[data-so="party-create"]').click();
    group = (await alice.page.locator(".so-pcode").textContent()).trim();
    expect(group).toMatch(/^[A-Z0-9]{4}$/);
    await bob.page.locator("#so-party-code").fill(group);
    await bob.page.locator('#party button[type="submit"]').click();
    for (const p of [alice, bob]) await expect(p.page.locator(".so-members li")).toHaveCount(2);
    await expect(alice.page.locator(".so-members")).toContainText("Bob");
  });

  let room;
  await test.step("Alice opens a game: Bob's phone follows her into the same room", async () => {
    await alice.page.goto("/quidenous/");
    await expect(alice.page.locator(".so-playas")).toContainText("Tu joues en tant que Alice");
    await expect(alice.page.locator(".hub-back .so-acct")).toBeVisible();
    await expect(alice.page.locator("#nick")).toBeHidden();
    await alice.page.locator('[data-act="create"]').click();
    await expect(alice.page).toHaveURL(/#[A-Z0-9]{4}$/);
    room = new URL(alice.page.url()).hash.slice(1);
    await expect(alice.page.locator(".hub-back .so-acct")).toBeHidden();  // account button only on the join page

    // Bob never touched anything: still on the home page, he lands in Alice's room under his account name.
    await expect(bob.page).toHaveURL(new RegExp(`/quidenous/#${room}$`), { timeout: 30_000 });
    await expect(bob.page.locator("#app")).toContainText("En attente du modo");
    await expect(alice.page.locator("#app")).toContainText("Bob");
  });

  await test.step("they play two questions, then Alice ends the game", async () => {
    await beat(alice.page);
    await alice.page.locator('[data-act="start"]').click();
    for (let round = 1; round <= 2; round++) {
      for (const p of [alice, bob]) await expect(p.page.locator('[data-act="vote"]')).toHaveCount(2);
      await beat(alice.page);
      await voteFor(bob.page, "Alice");   // Bob first: his screen shows "Tu as voté pour Alice" while he waits
      await beat(alice.page);
      await voteFor(alice.page, "Bob");
      // results show on their own once everyone voted
      await expect(alice.page.locator('[data-act="next"]')).toBeVisible();
      await beat(alice.page);
      if (round === 1) await alice.page.locator('[data-act="next"]').click();
    }
    await alice.page.locator('[data-act="end"]').click();
    for (const p of [alice, bob]) await expect(p.page.locator("#app")).toContainText("Palmarès · 2 questions");
  });

  await test.step("the end-of-game bar saves the whole game and the result", async () => {
    for (const p of [alice, bob]) await expect(p.page.locator(".so-bar:not([hidden])")).toContainText("Garder cette partie dans ton compte");
    const bar = bob.page.locator(".so-bar");
    await bar.locator('[data-so="bar-save"][data-k="replay"]').click();
    await expect(bar.locator('[data-so="bar-save"][data-k="replay"]')).toHaveText("✓ Gardé");
    await bar.locator('[data-so="bar-save"][data-k="result"]').click();
    await expect(bar.locator('[data-so="bar-save"][data-k="result"]')).toHaveText("✓ Gardé");
    await expect(bar.locator(".so-err")).toHaveCount(0);
  });

  let replayUrl, resultUrl;
  await test.step("both saves are listed in Bob's account", async () => {
    await bob.page.goto("/");
    await bob.page.locator("#acct").click();
    await bob.page.locator('[data-so="tab"][data-t="saves"]').click();
    const saves = bob.page.locator(".so-save");
    await expect(saves).toHaveCount(2);
    await expect(saves.first()).toContainText("Qui de nous");
    replayUrl = await saves.filter({ hasText: "Partie entière" }).locator("a").getAttribute("href");
    resultUrl = await saves.filter({ hasText: "Résultat" }).locator("a").getAttribute("href");
  });

  await test.step("the replay rebuilds the game move by move, from the game's own journal", async () => {
    await bob.page.goto(replayUrl);
    const bar = bob.page.locator(".so-player .so-bar-txt");
    await expect(bar).toContainText("Revoir · Qui de nous");
    const total = Number((await bar.innerText()).match(/\/(\d+)/)[1]);
    expect(total).toBeGreaterThan(5);
    const shown = bob.page.locator(".so-log li:not([hidden])");
    await bob.page.locator('[data-p="first"]').click();
    await expect(shown).toHaveCount(1);
    await expect(shown.first()).toContainText("2 joueurs autour de la table");
    await expect(bob.page.locator(".so-board")).toContainText("0 verdict");
    for (let i = 1; i < total; i++) await bob.page.locator('[data-p="next"]').click();
    await expect(bar).toContainText(`${total}/${total}`);
    const log = bob.page.locator(".so-log");
    await expect(log).toContainText("Question 1");
    await expect(log).toContainText("Bob vote pour Alice");          // his own vote, never Alice's secret one
    await expect(log).not.toContainText("Alice vote pour");
    await expect(log).toContainText("Verdict : Alice et Bob (1 vote)");
    await expect(bob.page.locator(".so-board")).toContainText("2 verdicts");
    await expect(bob.page.locator(".so-final")).toContainText("Palmarès");
    // names are drawn in the players' colours
    await expect(log.locator(".so-name").first()).toBeVisible();
  });

  await test.step("the saved result opens on the final ranking", async () => {
    await bob.page.goto(resultUrl);
    await expect(bob.page.locator(".so-player .so-bar-txt")).toContainText("Résultat");
    await expect(bob.page.locator(".so-final")).toContainText("Palmarès");
    await expect(bob.page.locator(".so-final li")).toHaveCount(2);
    await expect(bob.page.locator('[data-p="next"]')).toHaveCount(0);
  });

  await test.step("Bob shares the replay: someone without an account can watch it, a private one stays closed", async () => {
    await bob.page.goto("/");
    await bob.page.locator("#acct").click();
    await bob.page.locator('[data-so="tab"][data-t="saves"]').click();
    const row = bob.page.locator(".so-save", { hasText: "Partie entière" });
    await row.locator('[data-so="share"]').click();
    await expect(row).toContainText("Partagée");
    const stranger = await player(browser, "Inconnu", errors);
    await stranger.page.goto(replayUrl);
    await expect(stranger.page.locator(".so-player .so-bar-txt")).toContainText("Revoir · Qui de nous");
    await stranger.page.goto(resultUrl);
    await expect(stranger.page.locator("#app")).toContainText("n'est pas partagée");
    await stranger.ctx.close();
    await bob.page.locator('[data-so="close"]').click();
  });

  await test.step("the stats of the game are in Bob's account", async () => {
    await bob.page.locator("#acct").click();
    await bob.page.locator('[data-so="tab"][data-t="stats"]').click();
    await expect(bob.page.locator(".so-statlist li", { hasText: "Qui de nous" })).toContainText("1 partie");
    await bob.page.locator('[data-so="close"]').click();
  });

  await test.step("the group is still there, with who is online and where, and a ranking", async () => {
    await expect(bob.page.locator(".so-pcode")).toHaveText(group);
    await expect(bob.page.locator(".so-now").first()).toContainText(`Qui de nous… · partie ${room}`);
    await expect(bob.page.locator(".so-members li.so-on")).toHaveCount(2);
    await expect(bob.page.locator(".so-members li", { hasText: "Alice" })).toContainText("dans Qui de nous");
    await expect(bob.page.locator(".so-members li", { hasText: "Bob" })).toContainText("sur l'accueil");
    await bob.page.locator("[data-so-rank] summary").click();
    await expect(bob.page.locator("[data-so-rank] .so-rank li")).toHaveCount(2);
  });

  await test.step("Alice hands the leader role to Bob", async () => {
    await alice.page.goto("/");
    alice.page.once("dialog", d => d.accept());
    await alice.page.locator('.so-members li', { hasText: "Bob" }).locator('[data-so="party-host"]').click();
    await expect(bob.page.locator(".so-members li", { hasText: "Bob" })).toContainText("Chef");
    await expect(bob.page.locator("#party")).toContainText("Choisis un jeu ci-dessous");
    await expect(alice.page.locator("#party")).toContainText("Quand Bob lance un jeu");
  });

  await test.step("when the leader leaves, the role passes on and the group lives on", async () => {
    bob.page.once("dialog", d => d.accept());
    await bob.page.locator('[data-so="party-leave"]').click();
    await expect(bob.page.locator('[data-so="party-create"]')).toBeVisible();
    await expect(alice.page.locator(".so-members li")).toHaveCount(1);
    await expect(alice.page.locator(".so-members li", { hasText: "Alice" })).toContainText("Chef");
    // Bob comes back with the same code: same group
    await bob.page.locator("#so-party-code").fill(group);
    await bob.page.locator('#party button[type="submit"]').click();
    await expect(bob.page.locator(".so-members li")).toHaveCount(2);
  });

  expect(errors, "no JavaScript errors on either page").toEqual([]);
  await alice.ctx.close();
  await bob.ctx.close();
});
