import { test, expect } from "@playwright/test";

/**
 * On hold stops the clock: the sample stops counting as overdue and the ETA it
 * was working to is cleared (and the clearing is on the record).
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

/** yyyy-mm-dd, n days from today. */
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test("an overdue sample put on hold loses the badge and its ETA", async ({ page }) => {
  await login(page);
  await page.goto("/samples");

  // Work with a sample that's still live — a shipped or matched one is never
  // overdue by design, so it couldn't show the behaviour being tested.
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Sample Requested", exact: true }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();

  // Cells are found by their column header, not a counted index, so this
  // survives a column being added or hidden.
  const headers = (await page.locator("thead th").allTextContents()).map((h) => h.trim());
  const etaIdx = headers.findIndex((h) => /^ETA/i.test(h));
  const receivedIdx = headers.findIndex((h) => /^Received/i.test(h));
  expect(etaIdx).toBeGreaterThan(-1);
  expect(receivedIdx).toBeGreaterThan(-1);

  // Set one sample up as genuinely overdue: no received date, ETA in the past.
  const row = page.locator("tbody tr").first();
  const sampleNumber = (await row.locator('a[href^="/samples/"]').first().textContent())!.trim();

  // The cells are buttons that swap themselves for an input on click.
  const received = row.locator("td").nth(receivedIdx);
  if ((await received.locator("button").count()) > 0) {
    await received.locator("button").first().click();
    const receivedInput = received.locator("input");
    if ((await receivedInput.count()) > 0 && (await receivedInput.inputValue())) {
      await receivedInput.fill("");
      await receivedInput.press("Enter");
      await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
    }
  }

  const eta = page.locator("tbody tr", { hasText: sampleNumber }).first().locator("td").nth(etaIdx);
  await eta.locator("button").first().click();
  await eta.locator("input").fill(day(-9));
  await eta.locator("input").press("Enter");
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Saved" }).first()).toBeVisible();

  // Setting an ETA moves the sample to "ETA Set", out of the status filter it
  // was found under — so follow it by number from here.
  await page.goto(`/samples?q=${encodeURIComponent(sampleNumber)}`);
  const overdueRow = page.locator("tbody tr", { hasText: sampleNumber }).first();
  await expect(overdueRow).toContainText("OVERDUE");

  // On hold.
  await overdueRow.getByRole("button", { name: /Sample Requested|ETA Set|Quoted/i }).first().click();
  await overdueRow.locator("select").selectOption("on_hold");
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Status updated" }).first()).toBeVisible();

  await page.goto(`/samples?q=${encodeURIComponent(sampleNumber)}`);
  const held = page.locator("tbody tr", { hasText: sampleNumber }).first();
  await expect(held).toContainText("On Hold");
  await expect(held).not.toContainText("OVERDUE");

  // The ETA is cleared, and why is on the record.
  await held.locator('a[href^="/samples/"]').first().click();
  await page.waitForURL(/\/samples\/[^/?]+/);
  await expect(page.locator("body")).not.toContainText("OVERDUE");
  await page.getByRole("tab", { name: /ETA history/ }).click();
  await expect(page.getByText(/On hold — ETA cleared/).first()).toBeVisible();

  // ...and it's gone from the overdue filter.
  await page.goto("/samples?overdue=1");
  await expect(page.locator("tbody tr", { hasText: sampleNumber })).toHaveCount(0);
});
