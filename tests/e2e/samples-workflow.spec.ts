import { test, expect } from "@playwright/test";
import { nextSampleVersionNumber } from "../../src/lib/sample-receipt";

/**
 * Samples workflow: filter persistence, receiving into a sample room, the
 * comment marker, and the revision version bump.
 *
 * Requires the dev server running and the database seeded (see
 * critical-path.spec.ts). Run with: npm run test:e2e
 */

const ADMIN_EMAIL = "admin@ourdomain.com";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  // Wait for the form to hydrate: clicking before its JS attaches submits the
  // plain form and bounces back to /login.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Dev login (email only)").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

/** Sample-number links only — the comment marker also links into /samples/<id>. */
const SAMPLE_LINK = 'tbody a[href^="/samples/"]:not([href*="tab=comments"])';

test("filters survive going into a sample and back, and Clear resets them", async ({ page }) => {
  await login(page);
  await page.goto("/samples");
  const unfiltered = await page.locator("tbody tr").count();

  // Filter by brand (the third combobox in the toolbar).
  await page.getByRole("combobox").nth(2).click();
  await page.getByRole("option").nth(1).click();
  const filtered = await page.locator("tbody tr").count();
  expect(filtered).toBeLessThan(unfiltered);

  // Into a sample and back: the list comes back filtered, not reset.
  await page.locator(SAMPLE_LINK).first().click();
  await page.waitForURL(/\/samples\/[^/?]+/);
  await page.goBack();
  await expect(page.locator("tbody tr")).toHaveCount(filtered);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(unfiltered);
});

test("receiving asks which sample room the samples came from", async ({ page }) => {
  await login(page);
  await page.goto("/samples");
  const rows = page.locator("tbody tr");
  await rows.nth(0).getByRole("checkbox").check();
  await rows.nth(1).getByRole("checkbox").check();

  await page.getByRole("button", { name: "Mark received" }).click();
  await expect(page.getByRole("heading", { name: /Receive 2 samples/ })).toBeVisible();
  // One field per sample, plus the one that fills them all.
  await expect(page.getByPlaceholder("Sample room", { exact: true })).toHaveCount(2);
  await page.getByPlaceholder("Which sample room did these come from?").fill("Room 3B");
  await page.getByRole("button", { name: "Mark received" }).last().click();
  await expect(page.getByRole("heading", { name: /Receive 2 samples/ })).toBeHidden();

  await page.reload();
  expect(await page.locator("tbody tr", { hasText: "Room 3B" }).count()).toBeGreaterThanOrEqual(2);
});

test("a style with comments is marked in the list", async ({ page }) => {
  const note = `Strap length needs work #${Date.now()}`;
  await login(page);
  await page.goto("/samples");
  const link = page.locator(SAMPLE_LINK).first();
  const sampleNumber = (await link.textContent())!.trim();
  await link.click();
  await page.waitForURL(/\/samples\/[^/?]+/);

  await page.getByRole("tab", { name: /Comments/ }).click();
  await page.getByPlaceholder(/comment/i).first().fill(note);
  await page.getByRole("button", { name: /Post|Add comment|Comment/ }).first().click();
  await expect(page.getByText(note).first()).toBeVisible();

  await page.goto("/samples");
  const marker = page.locator("tbody tr", { hasText: sampleNumber }).first().locator('a[href*="tab=comments"]');
  await expect(marker).toBeVisible();
  // ...and it opens straight on the comments.
  await marker.click();
  await expect(page.getByText(note).first()).toBeVisible();
});

test("a revised sample is renamed to - v2 when it comes back in", async ({ page }) => {
  await login(page);
  await page.goto("/samples");
  const link = page.locator(SAMPLE_LINK).nth(3);
  const original = (await link.textContent())!.trim();
  await link.click();
  await page.waitForURL(/\/samples\/[^/?]+/);
  const sampleUrl = page.url();

  await page.getByRole("button", { name: /Request revisions/i }).first().click();
  await page.getByRole("textbox").last().fill("Handle is too short");
  await page.getByRole("button", { name: /Request revisions|Send|Confirm/i }).last().click();
  await expect(page.getByText(/Revisions Requested/i).first()).toBeVisible();

  // The replacement arrives and is scanned in.
  await page.goto("/receive");
  await page.getByPlaceholder("Sample number…").fill(original);
  await page.getByRole("button").filter({ has: page.locator("svg") }).first().click();
  await expect(page.getByText(original, { exact: true }).first()).toBeVisible();
  await page.getByPlaceholder("Sample room it came from").fill("Room 7");
  await page.getByRole("button", { name: /Mark received today/i }).click();
  await expect(page.getByRole("link", { name: /Open sample/i })).toBeVisible();

  await page.goto(sampleUrl);
  // A sample already carrying a round (a re-run) moves to the next one, so the
  // expectation follows the same rule the app does.
  expect((await page.locator("h1").first().textContent())?.trim()).toBe(nextSampleVersionNumber(original));
  await page.getByRole("tab", { name: /Comments/ }).click();
  await expect(page.getByText(/renamed .* → .* - v\d+/i).first()).toBeVisible();
});
