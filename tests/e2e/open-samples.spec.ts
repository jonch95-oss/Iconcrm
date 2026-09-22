import { test, expect } from "@playwright/test";

/**
 * "Open samples" on the dashboard means a physical sample is still owed, and
 * clicking the tile shows exactly the rows it counted.
 *
 * Requires the dev server running and the database seeded.
 * Run with: npm run test:e2e
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  // Wait for the form to hydrate: clicking before its JS attaches submits the
  // plain form and bounces back to /login.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Dev login (email only)").fill("admin@ourdomain.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

test("the tile counts what it links to, and excludes received samples", async ({ page }) => {
  await login(page);

  const tile = page.locator('a[href^="/samples?status=awaiting_sample"]').first();
  const counted = Number((await tile.textContent())!.replace(/[^0-9]/g, ""));
  expect(counted).toBeGreaterThan(0);

  // The list behind the tile holds exactly that many rows.
  await tile.click();
  await page.waitForURL(/status=awaiting_sample/);
  await expect(page.locator("tbody tr")).toHaveCount(counted);

  // None of them is a received sample: read the Status column itself, found by
  // its header rather than a counted index.
  const headers = (await page.locator("thead th").allTextContents()).map((h) => h.trim());
  const statusIdx = headers.findIndex((h) => /^Status/i.test(h));
  expect(statusIdx).toBeGreaterThan(-1);
  const rows = await page.locator("tbody tr").count();
  for (let i = 0; i < rows; i++) {
    const cell = (await page.locator("tbody tr").nth(i).locator("td").nth(statusIdx).textContent()) ?? "";
    expect(cell.trim()).toMatch(/^(Sample Requested|ETA Set|Revisions Requested|Partial · \d+ of \d+)/);
  }
});

test("a sample leaving the awaiting set drops out of the count", async ({ page }) => {
  await login(page);
  const tileCount = async () =>
    Number((await page.locator('a[href^="/samples?status=awaiting_sample"]').first().textContent())!.replace(/[^0-9]/g, ""));
  const before = await tileCount();

  // Receive one of them.
  await page.goto("/samples?status=awaiting_sample");
  const row = page.locator("tbody tr").first();
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Mark received" }).click();
  await page.getByRole("button", { name: "Mark received" }).last().click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "marked received" }).first()).toBeVisible();

  await page.goto("/");
  expect(await tileCount()).toBe(before - 1);
});
