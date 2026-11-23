// Real games, played to the end by separate browser sessions: Perudo, Undercover (3 players) and Poker.
// Each one is then saved and replayed, so the game flow, the end screen, the save bar and the journal are all exercised.
import { test, expect } from "@playwright/test";
import { player, signUp, openRoom, firstWith, atEnd, beat, saveAndReplay } from "./helpers.mjs";

test("Perudo: reactions in the lobby, a full game, its replay", async ({ browser }) => {
  const errors = [];
  const dina = await player(browser, "Dina", errors), dario = await player(browser, "Dario", errors);
  await signUp(dina); await signUp(dario);
  await openRoom("perudo", dina, [dario]);

  await test.step("a reaction in the lobby pops up on the other phone", async () => {
    await expect(dario.page.locator(".so-react")).toBeVisible();
    await dario.page.locator('.so-react [data-e="🔥"]').click();
    await expect(dina.page.locator(".so-pop", { hasText: "Dario" })).toContainText("🔥");
  });

  await test.step("3 dice each, then bid and « Dudo ! » until someone is out", async () => {
    await dina.page.locator('[data-act="start-dice"][data-id="3"]').click();
    await beat(dina);
    await dina.page.locator('[data-act="start"]').click();
    await expect(dina.page.locator(".so-react")).toBeHidden();   // reactions are for the waiting room only
    for (let round = 0; round < 12 && !(await atEnd(dina)); round++) {
      const bidder = await firstWith([dina, dario], '[data-act="bid"]:not([disabled])');
      if (!bidder) break;
      const caller = bidder === dina ? dario : dina;
      await beat(bidder);
      await bidder.page.locator('[data-act="bid"]').click();
      if (!(await firstWith([caller], '[data-act="dudo"]', 3000))) {          // the opening bid needed a higher quantity
        await bidder.page.locator('[data-act="more"]').click();
        await bidder.page.locator('[data-act="bid"]').click();
      }
      await beat(caller);
      await caller.page.locator('[data-act="dudo"]').click();
      const next = await firstWith([dina], '[data-act="next"]', 15_000);
      if (next) { await beat(dina); await dina.page.locator('[data-act="next"]').click(); }
    }
    await expect.poll(() => atEnd(dina), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => atEnd(dario), { timeout: 20_000 }).toBe(true);
  });

  await test.step("the replay tells every bid and every dudo", async () => {
    const log = await saveAndReplay(dario);
    expect(log).toContain("Manche 1");
    expect(log).toMatch(/(Dina|Dario) annonce \d+ d/);
    expect(log).toMatch(/dit « Dudo ! »/);
    expect(log).toMatch(/On soulève les gobelets/);
    expect(log).toMatch(/perd un dé et quitte la partie/);
    await expect(dario.page.locator(".so-final")).toContainText("Classement");
  });

  expect(errors).toEqual([]);
  await dina.ctx.close(); await dario.ctx.close();
});

test("Undercover: three players find the impostor", async ({ browser }) => {
  const errors = [];
  const ps = [await player(browser, "Uma", errors), await player(browser, "Ugo", errors), await player(browser, "Ulla", errors)];
  for (const p of ps) await signUp(p);
  const [uma] = ps;
  await openRoom("undercover", uma, ps.slice(1));

  let impostor, civils;
  await test.step("the host starts; everyone gets a word, one of them different", async () => {
    await uma.page.locator('[data-act="start"]').click();
    const words = [];
    for (const p of ps) {
      await expect.poll(() => p.page.evaluate(() => window.soireeDev.state().secret?.word || ""), { timeout: 15_000 }).not.toBe("");
      words.push(await p.page.evaluate(() => ({ word: window.soireeDev.state().secret.word, me: window.soireeDev.state().me })));
    }
    const odd = words.findIndex(w => words.filter(x => x.word === w.word).length === 1);
    expect(odd).toBeGreaterThanOrEqual(0);
    impostor = { p: ps[odd], uid: words[odd].me };
    civils = ps.filter((_, i) => i !== odd).map((p, k) => ({ p, uid: words.filter((_, i) => i !== odd)[k].me }));
  });

  await test.step("each one gives a clue in turn", async () => {
    for (let k = 0; k < 3; k++) {
      const turn = await firstWith(ps, "#clue");
      expect(turn, "someone has to give a clue").not.toBeNull();
      await beat(turn);
      await turn.page.locator("#clue").fill(`indice${k + 1}`);
      await turn.page.locator("#clue").press("Enter");
      await expect(turn.page.locator("#clue")).toHaveCount(0);
    }
    // the game moves on to the vote by itself once everyone has spoken; the host's button is only there before
    if (await firstWith([uma], '[data-act="to-vote"]', 2000)) await uma.page.locator('[data-act="to-vote"]').first().click({ timeout: 3000 }).catch(() => {});
  });

  await test.step("the two civilians vote for the impostor, who is eliminated", async () => {
    for (const c of civils) { await beat(c.p); await c.p.page.locator(`[data-act="vote"][data-id="${impostor.uid}"]`).click({ timeout: 10_000 }); }
    await impostor.p.page.locator(`[data-act="vote"][data-id="${civils[0].uid}"]`).click({ timeout: 10_000 });
    const rev = await firstWith([uma], `[data-act="eliminate"][data-id="${impostor.uid}"], [data-act="reveal"]:not([disabled])`, 15_000);
   
    // the votes reveal themselves once everyone has voted; the host's button may vanish just before the click
    if (rev && await uma.page.locator('[data-act="reveal"]:not([disabled])').isVisible()) await uma.page.locator('[data-act="reveal"]').click({ timeout: 2000 }).catch(() => {});
    await beat(uma);
    await uma.page.locator(`[data-act="eliminate"][data-id="${impostor.uid}"]`).click({ timeout: 10_000 });
    for (const p of ps) await expect.poll(() => atEnd(p), { timeout: 20_000 }).toBe(true);
  });

  await test.step("the replay has the clues, the vote and the reveal", async () => {
    const log = await saveAndReplay(civils[0].p);
    for (let k = 1; k <= 3; k++) expect(log).toContain(`« indice${k} »`);
    expect(log).toMatch(/Vote : .+ \(2\)/);
    expect(log).toContain(`${impostor.p.name} est éliminé : c'était l'Undercover.`);
    expect(log).toContain("Les civils gagnent.");
  });

  expect(errors).toEqual([]);
  for (const p of ps) await p.ctx.close();
});

test("Poker: heads-up until one player has no chips left", async ({ browser }) => {
  const errors = [];
  const kim = await player(browser, "Kim", errors), kat = await player(browser, "Kat", errors);
  await signUp(kim); await signUp(kat);
  await openRoom("poker", kim, [kat]);

  await test.step("all-in, call, next hand… until the game ends", async () => {
    await kim.page.locator('[data-act="start"]').click();
    for (let hand = 0; hand < 15 && !(await atEnd(kim)); hand++) {
      const actor = await firstWith([kim, kat], '[data-act="raise"], [data-act="allin"]');
      if (!actor) break;
      await beat(actor);
      if (await actor.page.locator('[data-act="quick"][data-id="max"]').isVisible()) await actor.page.locator('[data-act="quick"][data-id="max"]').click();
      await actor.page.locator('[data-act="raise"], [data-act="allin"]').first().click();
      const other = actor === kim ? kat : kim;
      const caller = await firstWith([other], '[data-act="call"]', 8000);
      if (caller) { await beat(other); await other.page.locator('[data-act="call"]').click(); }
      const next = await firstWith([kim], '[data-act="next"]', 20_000);
      if (next) { await beat(kim); await kim.page.locator('[data-act="next"]').click(); }
    }
    for (const p of [kim, kat]) await expect.poll(() => atEnd(p), { timeout: 20_000 }).toBe(true);
  });

  await test.step("the replay tells the hands action by action", async () => {
    const log = await saveAndReplay(kat);
    expect(log).toContain("Main 1");
    expect(log).toMatch(/petite blinde/);
    expect(log).toMatch(/tapis !/);
    expect(log).toMatch(/remporte le pot de|se partagent le pot de/);
    expect(log).toMatch(/n'a plus de jetons/);
  });

  expect(errors).toEqual([]);
  await kim.ctx.close(); await kat.ctx.close();
});
