import { test, expect, type Page } from "@playwright/test";

/**
 * Moving the date a sample was asked for. Only the owner and Moshe get the
 * button, and using it re-dates the sample to six weeks from the new date.
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

const day = (from: string, plus: number) => {
  const d = new Date(`${from}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10);
};

const sampleNumber = `REQDATE-${Date.now().toString().slice(-6)}`;

test("the owner and Moshe move the requested date, and the ETA follows it", async ({ page }) => {
  // A sample with a date already on it, so the re-dating has something to move.
  await loginAs(page, OWNER);
  await page.goto("/samples");
  await page.getByRole("button", { name: "New sample" }).click();
  await page.locator('input[name="sampleNumber"]').fill(sampleNumber);
  await page.getByLabel("Style name").fill("REQUESTED DATE TEST BAG");
  await page.getByLabel("Sample ETA").fill(day(new Date().toISOString().slice(0, 10), 10));
  await page.getByRole("button", { name: "Create sample" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
  // Creating it may land straight on the new sample; if it doesn't, go find it.
  await page.waitForURL(/\/samples\/[^/?]+/, { timeout: 15_000 }).catch(() => {});
  if (!/\/samples\/[^/?]+/.test(page.url())) {
    await page.goto(`/samples?q=${encodeURIComponent(sampleNumber)}`);
    await page.getByRole("link", { name: sampleNumber }).first().click();
    await page.waitForURL(/\/samples\/[^/?]+/);
  }
  const url = page.url();

  // A designer sees the date and no way to move it.
  await loginAs(page, DESIGNER);
  await page.goto(url);
  await expect(page.getByText("Requested at")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change the requested date" })).toHaveCount(0);

  // Moshe moves it, and the dialog says what the ETA becomes before he saves.
  const requested = "2026-03-02";
  const expectedEta = day(requested, 42);
  await loginAs(page, MOSHE);
  await page.goto(url);
  await page.getByRole("button", { name: "Change the requested date" }).click();
  await page.getByLabel("Requested on").fill(requested);
  await expect(page.getByRole("dialog")).toContainText(`New ETA: ${expectedEta}`);
  await page.getByRole("button", { name: "Save and re-date" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });

  // Both dates on the sample now read off the request date.
  await page.goto(url);
  const requestedRow = page.locator("div", { hasText: /^Requested at/ }).last();
  await expect(requestedRow).toContainText("Mar 2, 2026");
  const etaRow = page.locator("div", { hasText: /^Sample ETA/ }).last();
  await expect(etaRow).toContainText("Apr 13, 2026");

  // And the move is on the record, not just on the sample.
  await page.goto(`${url}?tab=eta`);
  await page.getByRole("tab", { name: /ETA history/ }).click();
  await expect(page.getByText(`Requested date moved to ${requested}`).first()).toBeVisible();
});
