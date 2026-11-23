// Own account (password, deletion) and the admin's tools, in real browser sessions on the emulators.
import { test, expect } from "@playwright/test";

const EMU = { auth: "http://127.0.0.1:9099", host: "127.0.0.1", firestorePort: 8181 };

async function player(browser, name, errors) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(e => { window.SOIREE_EMULATORS = e; }, EMU);
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`${name}: ${e.message}`));
  page.on("dialog", d => d.accept());   // the confirm() boxes before deleting or suspending
  return { ctx, page, name };
}
const dlg = page => page.locator("dialog.so-sheet");
async function openAccount(page) { await page.goto("/"); await page.locator("#acct").click(); await expect(dlg(page)).toBeVisible(); }
async function signUp({ page, name }, pass) {
  await openAccount(page);
  await dlg(page).locator('[data-so="mode"][data-m="inscription"]').click();
  await dlg(page).locator("#so-pseudo").fill(name);
  await dlg(page).locator("#so-pass").fill(pass);
  await dlg(page).locator('button[type="submit"]').click();
  await expect(page.locator("#acct")).toHaveText("👤 " + name);
}
async function logIn(page, name, pass) {
  await dlg(page).locator('[data-so="mode"][data-m="connexion"]').click();
  await dlg(page).locator("#so-pseudo").fill(name);
  await dlg(page).locator("#so-pass").fill(pass);
  await dlg(page).locator('button[type="submit"]').click();
}
const logOut = page => dlg(page).locator('[data-so="logout"]').click();

test("own account and admin tools", async ({ browser, request }) => {
  const errors = [];
  const carol = await player(browser, "Carol", errors);
  const boss = await player(browser, "Boss", errors);

  await test.step("Carol changes her password herself", async () => {
    await signUp(carol, "ancien123");
    const d = dlg(carol.page);
    await d.locator("summary", { hasText: "Changer mon mot de passe" }).click();
    await d.locator("#so-cur").fill("mauvais");
    await d.locator("#so-new").fill("nouveau123");
    await d.locator('[data-so-form="password"] button').click();
    await expect(d.locator(".so-err")).toContainText("Mot de passe actuel incorrect");
    await d.locator("#so-cur").fill("ancien123");
    await d.locator("#so-new").fill("nouveau123");
    await d.locator('[data-so-form="password"] button').click();
    await expect(d.locator(".so-ok")).toContainText("Mot de passe changé");
    await logOut(carol.page);
    await logIn(carol.page, "Carol", "ancien123");
    await expect(d.locator(".so-err")).toContainText("Pseudo ou mot de passe incorrect");
    await logIn(carol.page, "Carol", "nouveau123");
    await expect(carol.page.locator("#acct")).toHaveText("👤 Carol");
  });

  await test.step("an account listed in ADMIN_PSEUDO gets the Admin tab at its next login", async () => {
    await signUp(boss, "patron123");
    await expect(dlg(boss.page).locator('[data-so="tab"][data-t="admin"]')).toHaveCount(0);
    await request.get("/__test/admin?pseudo=Boss");          // like adding ADMIN_PSEUDO on Netlify
    await logOut(boss.page);
    await logIn(boss.page, "Boss", "patron123");
    await expect(dlg(boss.page).locator('[data-so="tab"][data-t="admin"]')).toBeVisible();
  });

  await test.step("the admin sees every account and suspends one", async () => {
    const d = dlg(boss.page);
    await d.locator('[data-so="tab"][data-t="admin"]').click();
    const row = d.locator(".so-accts li", { hasText: "Carol" });
    await expect(row).toBeVisible();
    await row.locator('[data-so="adm-ban"]').click();
    await expect(d.locator(".so-ok")).toContainText("Carol est suspendu");
    await expect(row).toContainText("Suspendu");
    // Carol cannot log in any more
    await openAccount(carol.page);
    if (await dlg(carol.page).locator('[data-so="logout"]').isVisible()) await logOut(carol.page);  // her session may already be cut
    await logIn(carol.page, "Carol", "nouveau123");
    await expect(dlg(carol.page).locator(".so-err")).toContainText("suspendu");
    // reactivated: she can again
    await row.locator('[data-so="adm-unban"]').click();
    await expect(d.locator(".so-ok")).toContainText("Carol est réactivé");
    await logIn(carol.page, "Carol", "nouveau123");
    await expect(carol.page.locator("#acct")).toHaveText("👤 Carol");
  });

  await test.step("the admin sees live games and groups, and the Firebase panel", async () => {
    const d = dlg(boss.page);
    await d.locator('[data-so="adm-tab"][data-t="live"]').click();
    await expect(d).toContainText("Parties (");
    await expect(d).toContainText("Groupes (");
    await d.locator('[data-so="adm-tab"][data-t="firebase"]').click();
    await expect(d.locator(".so-err")).toContainText("Pas de statistiques Firebase avec les émulateurs");
    await expect(d.locator(".so-total")).toContainText("comptes");
  });

  await test.step("Carol deletes her own account", async () => {
    const d = dlg(carol.page);
    await d.locator("summary", { hasText: "Supprimer mon compte" }).click();
    await d.locator("#so-del-pass").fill("nouveau123");
    await d.locator('[data-so-form="delete-me"] button').click();
    await expect(carol.page.locator("#acct")).toHaveText("Se connecter");
    await expect(d.locator(".so-ok")).toContainText("Ton compte a été supprimé");
    await logIn(carol.page, "Carol", "nouveau123");
    await expect(d.locator(".so-err")).toContainText("Pseudo ou mot de passe incorrect");
    // still in the admin's list, marked as deleted by herself
    const a = dlg(boss.page);
    await a.locator('[data-so="adm-tab"][data-t="comptes"]').click();
    await expect(a.locator(".so-accts li", { hasText: "Carol" })).toContainText("par lui-même");
  });

  expect(errors).toEqual([]);
  await carol.ctx.close();
  await boss.ctx.close();
});
