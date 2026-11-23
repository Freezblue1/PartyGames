// Shared by the end-to-end tests: a player is a separate browser session on the emulators.
import { expect } from "@playwright/test";

export const EMU = { auth: "http://127.0.0.1:9099", host: "127.0.0.1", firestorePort: 8181 };
export const PASS = "motdepasse1";

export async function player(browser, name, errors) {
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript(e => { window.SOIREE_EMULATORS = e; }, EMU);
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`${name}: ${e.message}`));
  page.on("dialog", d => d.accept());
  return { ctx, page, name };
}

export async function signUp({ page, name }) {
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

// The host creates a room in a game; the others open the invite link and join under their account name.
export async function openRoom(game, host, others) {
  await host.page.goto(`/${game}/`);
  await host.page.locator('[data-act="create"]').click();
  await expect(host.page).toHaveURL(/#[A-Z0-9]{4}$/);
  const room = new URL(host.page.url()).hash.slice(1);
  for (const p of others) {
    await p.page.goto(`/${game}/#${room}`);
    await p.page.locator('[data-form="join-code"] button[type="submit"]').click();
    await expect(p.page.locator(".hub-back .so-acct")).toBeHidden();   // inside the room
  }
  for (const p of others) await expect(host.page.locator("#app")).toContainText(p.name);
  return room;
}

// The first of these pages on which the selector shows up.
export async function firstWith(pages, selector, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const p of pages) if (await p.page.locator(selector).first().isVisible().catch(() => false)) return p;
    await pages[0].page.waitForTimeout(150);
  }
  return null;
}
export const atEnd = p => p.page.locator(".so-bar:not([hidden])").filter({ hasText: "Garder cette partie" }).isVisible().catch(() => false);
export const beat = p => p.page.waitForTimeout(400);

// Save the whole game from the end-of-game bar, then open it from the account and return the replay text.
export async function saveAndReplay(p) {
  const bar = p.page.locator(".so-bar");
  await bar.locator('[data-so="bar-save"][data-k="replay"]').click();
  await expect(bar.locator('[data-so="bar-save"][data-k="replay"]')).toHaveText("✓ Gardé");
  await p.page.goto("/");
  await p.page.locator("#acct").click();
  await p.page.locator('[data-so="tab"][data-t="saves"]').click();
  const link = await p.page.locator(".so-save", { hasText: "Partie entière" }).first().locator("a").getAttribute("href");
  await p.page.goto(link);
  await expect(p.page.locator(".so-player .so-bar-txt")).toContainText("Revoir");
  await p.page.locator('[data-p="last"]').click();
  // the text of each line as written (innerText would apply the CSS capitals of the round titles)
  return p.page.evaluate(() => [...document.querySelectorAll(".so-log li")].map(li => [...li.children].map(c => c.textContent).join(" | ")).join("\n"));
}
