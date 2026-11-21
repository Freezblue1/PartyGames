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
const playerText = page => page.locator("#app").innerText();

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

  await test.step("the replay plays the game back, as Bob saw it", async () => {
    await bob.page.goto(replayUrl);
    const bar = bob.page.locator(".so-player .so-bar-txt");
    await expect(bar).toContainText("Revoir · Qui de nous");
    const total = Number((await bar.innerText()).match(/\/(\d+)/)[1]);
    expect(total).toBeGreaterThan(5);
    expect(await bob.page.locator("#app").evaluate(el => getComputedStyle(el).pointerEvents)).toBe("none");

    await bob.page.locator('[data-p="first"]').click();
    await expect(bob.page.locator("#app")).toContainText("En attente du modo");  // the lobby
    let sawVote = false;
    for (let i = 1; i < total && !sawVote; i++) {
      await bob.page.locator('[data-p="next"]').click();
      sawVote = (await playerText(bob.page)).includes("Tu as voté pour Alice");  // his own vote, step by step
    }
    expect(sawVote).toBe(true);
    await bob.page.locator('[data-p="last"]').click();
    await expect(bar).toContainText(`${total}/${total}`);
    await expect(bob.page.locator("#app")).toContainText("Palmarès · 2 questions");
  });

  await test.step("the saved result opens on the final screen", async () => {
    await bob.page.goto(resultUrl);
    await expect(bob.page.locator(".so-player .so-bar-txt")).toContainText("Résultat");
    await expect(bob.page.locator("#app")).toContainText("Palmarès · 2 questions");
    await expect(bob.page.locator('[data-p="next"]')).toHaveCount(0);
  });

  await test.step("the group is still there after the game", async () => {
    await bob.page.goto("/");
    await expect(bob.page.locator(".so-pcode")).toHaveText(group);
    await expect(bob.page.locator(".so-now")).toContainText(`Qui de nous… · partie ${room}`);
  });

  expect(errors, "no JavaScript errors on either page").toEqual([]);
  await alice.ctx.close();
  await bob.ctx.close();
});
