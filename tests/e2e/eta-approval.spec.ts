import { test, expect, type Page } from "@playwright/test";

/**
 * Moving a date someone is working to. A designer asks and says why; the owner
 * or Moshe decides; nothing on the sample moves in between.
 *
 * Requires the dev server running and the database seeded.
 * Run with: npm run test:e2e
 */

const OWNER = "admin@ourdomain.com"; // ADMIN_EMAIL in the test environment
const MOSHE = "jordan@ourdomain.com"; // seeded as "Moshe Nahum"
const DESIGNER = "morgan@ourdomain.com";

async function loginAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Dev login (email only)").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A sample of our own with a date already on it, created by the owner. */
async function sampleWithEta(page: Page, number: string, eta: string): Promise<string> {
  await page.goto("/samples");
  await page.getByRole("button", { name: "New sample" }).click();
  await page.locator('input[name="sampleNumber"]').fill(number);
  await page.getByLabel("Style name").fill("ETA APPROVAL TEST BAG");
  await page.getByLabel("Sample ETA").fill(eta);
  await page.getByRole("button", { name: "Create sample" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  await page.getByRole("link", { name: number }).first().click();
  await page.waitForURL(/\/samples\/[^/?]+/);
  return page.url();
}

async function askForChange(page: Page, sampleUrl: string, eta: string, reason: string) {
  await page.goto(sampleUrl);
  await page.getByRole("button", { name: /Ask to change|Change$/ }).click();
  await page.getByLabel("New ETA").fill(eta);
  await page.getByLabel("Why is it moving?").fill(reason);
  await page.getByRole("button", { name: /Send for approval|Save ETA/ }).click();
}

test("a designer's ETA change waits for the owner, and lands when approved", async ({ page }) => {
  const number = `ETA-${Date.now()}`;
  const first = inDays(30);
  const wanted = inDays(60);

  await loginAs(page, OWNER);
  const sampleUrl = await sampleWithEta(page, number, first);
  // A first date is not a change: it went straight on, with nothing to approve.
  await expect(page.getByText(/waiting on approval/i)).toHaveCount(0);
  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  await expect(page.locator("tbody tr", { hasText: number }).first()).toContainText(first);

  // The designer asks, and has to say why.
  await loginAs(page, DESIGNER);
  await askForChange(page, sampleUrl, wanted, "Factory says the leather is two weeks late");
  await expect(page.getByText(/waiting on approval/i)).toBeVisible();

  // The sample keeps the date the factory was given.
  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  const row = page.locator("tbody tr", { hasText: number }).first();
  await expect(row).toContainText(first);
  await expect(row).toContainText(/change pending/i);

  // The owner sees who asked and why, and says yes.
  await loginAs(page, OWNER);
  await page.goto("/eta-changes");
  const request = page.getByRole("listitem").filter({ hasText: number });
  await expect(request).toContainText("leather is two weeks late");
  await expect(request).toContainText("Morgan Merchandiser");
  await request.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved — the new date is live.")).toBeVisible();

  // ...and only now does the sample move.
  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  const moved = page.locator("tbody tr", { hasText: number }).first();
  await expect(moved).toContainText(wanted);
  await expect(moved).not.toContainText(/change pending/i);
});

test("a rejected change leaves the date alone, and Moshe can decide too", async ({ page }) => {
  const number = `ETB-${Date.now()}`;
  const first = inDays(21);
  const wanted = inDays(99);

  await loginAs(page, OWNER);
  const sampleUrl = await sampleWithEta(page, number, first);

  await loginAs(page, DESIGNER);
  await askForChange(page, sampleUrl, wanted, "Customer asked to push the delivery");
  await expect(page.getByText(/waiting on approval/i)).toBeVisible();

  // Moshe decides these as well as the owner.
  await loginAs(page, MOSHE);
  await page.goto("/eta-changes");
  const request = page.getByRole("listitem").filter({ hasText: number });
  await expect(request).toContainText("Customer asked to push the delivery");
  await request.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Rejected — the date stays as it was.")).toBeVisible();

  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  const row = page.locator("tbody tr", { hasText: number }).first();
  await expect(row).toContainText(first);
  await expect(row).not.toContainText(/change pending/i);
});

test("an approver's own change goes live as they save it", async ({ page }) => {
  const number = `ETC-${Date.now()}`;
  const first = inDays(14);
  const next = inDays(45);

  await loginAs(page, MOSHE);
  const sampleUrl = await sampleWithEta(page, number, first);
  await askForChange(page, sampleUrl, next, "Confirmed with the factory on the call");
  await expect(page.getByText("ETA updated.")).toBeVisible();

  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  const row = page.locator("tbody tr", { hasText: number }).first();
  await expect(row).toContainText(next);
  await expect(row).not.toContainText(/change pending/i);

  // Nothing was left waiting for anyone.
  await page.goto("/eta-changes");
  await expect(page.getByRole("listitem").filter({ hasText: number })).toHaveCount(0);
});
