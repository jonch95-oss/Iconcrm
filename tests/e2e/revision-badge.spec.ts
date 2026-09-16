import { test, expect } from "@playwright/test";

/**
 * The outstanding-revisions badge in the nav: who sees it, what it counts, and
 * that acknowledging clears it.
 *
 * Requires the dev server running and the database seeded. The "by default"
 * test relies on jordan@ourdomain.com never having the per-user toggle touched
 * (the toggle test uses casey@ourdomain.com for exactly that reason).
 * Run with: npm run test:e2e
 */

const SIDEBAR_LINK = 'aside a[href="/revisions"]';

/** Ask for revisions on a sample — that's one outstanding revision. */
async function requestRevision(page: import("@playwright/test").Page, index = 0): Promise<string> {
  const note = `Lining puckers at the seam #${Date.now()}`;
  await page.goto("/samples");
  await page.locator('tbody a[href^="/samples/"]:not([href*="tab=comments"])').nth(index).click();
  await page.waitForURL(/\/samples\/[^/?]+/);
  await page.getByRole("button", { name: /Request revisions/i }).first().click();
  await page.getByRole("textbox").last().fill(note);
  await page.getByRole("button", { name: /Request revisions|Send|Confirm/i }).last().click();
  await expect(page.getByText(/Revisions Requested/i).first()).toBeVisible();
  return note;
}

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Dev login (email only)").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

test("the owner sees an outstanding-revisions count that clears on acknowledge", async ({ page }) => {
  await login(page, "admin@ourdomain.com");

  const note = await requestRevision(page, 0);

  await page.goto("/revisions");
  const badge = page.locator(SIDEBAR_LINK).locator("span").last();
  await expect(badge).toBeVisible();
  const before = Number((await badge.textContent())!.trim());
  expect(before).toBeGreaterThan(0);

  // Acknowledging the request takes it off the count.
  const row = page.locator("li", { hasText: note }).first();
  await row.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Acknowledged" }).first()).toBeVisible();
  await page.goto("/revisions");
  // The badge disappears entirely at zero, so count the elements rather than
  // waiting on one that isn't there.
  const spans = page.locator(SIDEBAR_LINK).locator("span");
  const after = (await spans.count()) === 0 ? 0 : Number((await spans.last().textContent())!.trim());
  expect(after).toBe(before - 1);
});

test("everyone else sees no badge", async ({ page }) => {
  await login(page, "morgan@ourdomain.com");
  await page.goto("/revisions");
  await expect(page.locator(SIDEBAR_LINK)).toHaveText("Revisions & Comments");
});

test("a user named Moshe Nahum gets the badge by default", async ({ browser }) => {
  const asAdmin = await browser.newContext();
  const page = await asAdmin.newPage();
  await login(page, "admin@ourdomain.com");

  // Something has to be outstanding for a badge to exist at all.
  await requestRevision(page, 1);

  await page.goto("/settings");
  await page.getByRole("tab", { name: /Users/ }).click();
  const nameButton = page.locator("tr", { hasText: "jordan@ourdomain.com" }).getByRole("button").first();
  if ((await nameButton.textContent())?.trim() !== "Moshe Nahum") {
    await nameButton.click();
    const input = page.locator('input[placeholder="Full name"]');
    await input.fill("Moshe Nahum");
    await input.press("Enter");
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Name updated" }).first()).toBeVisible();
  }

  // No explicit preference is ever set on this account, so what's being checked
  // here is the default that comes with the name.
  const asMoshe = await browser.newContext();
  const moshe = await asMoshe.newPage();
  await login(moshe, "jordan@ourdomain.com");
  await moshe.goto("/revisions");
  await expect(moshe.locator(SIDEBAR_LINK).locator("span").last()).toBeVisible();

  await asAdmin.close();
  await asMoshe.close();
});

test("the per-user toggle decides it either way", async ({ browser }) => {
  const asAdmin = await browser.newContext();
  const page = await asAdmin.newPage();
  await login(page, "admin@ourdomain.com");
  await requestRevision(page, 2);

  await page.goto("/settings");
  await page.getByRole("tab", { name: /Users/ }).click();
  await page.locator("tr", { hasText: "casey@ourdomain.com" }).getByRole("checkbox").click();
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: /Badge (on|off)/ }).first();
  await expect(toast).toBeVisible();
  // Direction-agnostic: the run flips whatever the last one left behind.
  const turnedOn = ((await toast.textContent()) ?? "").includes("Badge on");

  const asCasey = await browser.newContext();
  const casey = await asCasey.newPage();
  await login(casey, "casey@ourdomain.com");
  await casey.goto("/revisions");
  if (turnedOn) await expect(casey.locator(SIDEBAR_LINK).locator("span").last()).toBeVisible();
  else await expect(casey.locator(SIDEBAR_LINK)).toHaveText("Revisions & Comments");

  await asAdmin.close();
  await asCasey.close();
});
