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

  // The dashboard is a cached route, so re-ask for it with a fresh URL until
  // the count catches up rather than reading whatever the router kept.
  await expect
    .poll(async () => {
      await page.goto(`/?t=${Date.now()}`);
      return tileCount();
    }, { timeout: 20_000 })
    .toBe(before - 1);
});

test("a revised sample received from the table leaves the chase list", async ({ page }) => {
  await login(page);

  // A sample of our own, sent back to the factory for revisions.
  const number = `CHASE-${Date.now()}`;
  await page.goto("/samples");
  await page.getByRole("button", { name: "New sample" }).click();
  await page.locator('input[name="sampleNumber"]').fill(number);
  await page.getByRole("button", { name: "Create sample" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  await page.getByRole("link", { name: number }).first().click();
  await page.waitForURL(/\/samples\/[^/?]+/);
  await page.getByRole("button", { name: /Request revisions/i }).first().click();
  await page.getByRole("textbox").last().fill("Handle is too short");
  await page.getByRole("button", { name: /Request revisions|Send|Confirm/i }).last().click();
  await expect(page.getByText(/Revisions Requested/i).first()).toBeVisible();

  // It's on the chase list, as it should be — the revised one is still owed.
  await page.goto("/samples?status=awaiting_sample");
  await expect(page.locator("tbody tr", { hasText: number })).toHaveCount(1);

  // The replacement arrives and is ticked off from the table itself.
  const row = page.locator("tbody tr", { hasText: number }).first();
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Mark received" }).click();
  await page.getByRole("button", { name: "Mark received" }).last().click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "marked received" }).first()).toBeVisible();

  // ...and it stops being chased: received is received, whichever screen did it.
  await page.goto("/samples?status=awaiting_sample");
  await expect(page.locator("tbody tr", { hasText: number })).toHaveCount(0);
  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  await expect(page.locator("tbody tr", { hasText: number }).first()).toContainText("Sample Received");
});
