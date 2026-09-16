import { test, expect } from "@playwright/test";

/**
 * Undo on the Revisions & Comments board: dismiss, acknowledge and assign all
 * come back with an Undo in their confirmation, and the dismissed pile stays
 * findable (with a count) for a mistake noticed after the toast is gone.
 *
 * Requires the dev server running and the database seeded.
 * Run with: npm run test:e2e
 */

let seq = 0;

/** Each test makes its own note, so none of them depend on the others' state. */
async function createNote(page: import("@playwright/test").Page): Promise<string> {
  const note = `Zip tape is puckering #${Date.now()}-${seq++}`;
  await page.goto("/samples");
  const link = page.locator('tbody a[href^="/samples/"]:not([href*="tab=comments"])').first();
  await link.click();
  await page.waitForURL(/\/samples\/[^/?]+/);
  await page.getByRole("tab", { name: /Comments/ }).click();
  await page.getByPlaceholder(/comment/i).first().fill(note);
  await page.getByRole("button", { name: /Post|Add comment|Comment/ }).first().click();
  await expect(page.getByText(note).first()).toBeVisible();
  return note;
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Dev login (email only)").fill("admin@ourdomain.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

test("dismissing by mistake can be undone from the toast", async ({ page }) => {
  await login(page);
  const NOTE = await createNote(page);

  // Dismiss it by "mistake".
  await page.goto("/revisions");
  const row = page.locator("li", { hasText: NOTE }).first();
  await row.getByRole("button").last().click();

  // The confirmation carries an Undo.
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Dismissed" }).first();
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Undone" }).first()).toBeVisible();

  // ...and the note is back on the board without turning on Show dismissed.
  await page.goto("/revisions");
  await expect(page.locator("li", { hasText: NOTE }).first()).toBeVisible();
});

test("the dismissed pile is findable later, with its count", async ({ page }) => {
  await login(page);
  const NOTE = await createNote(page);
  await page.goto("/revisions");
  const row = page.locator("li", { hasText: NOTE }).first();
  await row.getByRole("button").last().click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Dismissed" }).first()).toBeVisible();

  await page.goto("/revisions");
  const toggle = page.getByRole("button", { name: /^Show dismissed/ });
  await expect(toggle).toHaveText(/Show dismissed \(\d+\)/);
  await toggle.click();
  const back = page.locator("li", { hasText: NOTE }).first();
  await expect(back).toBeVisible();
  await back.getByRole("button", { name: /Undo/ }).click();
  await page.goto("/revisions");
  await expect(page.locator("li", { hasText: NOTE }).first()).toBeVisible();
});

test("acknowledge and assign are undoable too", async ({ page }) => {
  await login(page);
  const NOTE = await createNote(page);
  await page.goto("/revisions");
  const row = page.locator("li", { hasText: NOTE }).first();

  await row.getByRole("button", { name: "Acknowledge" }).click();
  const ackToast = page.locator("[data-sonner-toast]").filter({ hasText: "Acknowledged" }).first();
  await ackToast.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Undone" }).first()).toBeVisible();
  await page.goto("/revisions?new=1");
  await expect(page.locator("li", { hasText: NOTE }).first()).toBeVisible();

  // Assign, then undo back to unassigned.
  const row2 = page.locator("li", { hasText: NOTE }).first();
  await row2.getByRole("combobox").click();
  await page.getByRole("option", { name: "Riley Sourcing" }).click();
  const asgToast = page.locator("[data-sonner-toast]").filter({ hasText: "Assigned to" }).first();
  await asgToast.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Undone" }).first()).toBeVisible();
  await page.goto("/revisions?assignee=me");
  await expect(page.locator("li", { hasText: NOTE })).toHaveCount(0);
});
