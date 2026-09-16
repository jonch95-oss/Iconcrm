import { test, expect } from "@playwright/test";

/**
 * Triage on the Revisions & Comments board — new notes arrive unacknowledged,
 * get assigned, acknowledged or dismissed — plus renaming a user (the name
 * every note is stamped with).
 *
 * Requires the dev server running and the database seeded.
 * Run with: npm run test:e2e
 */

async function login(page: import("@playwright/test").Page, email = "admin@ourdomain.com") {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Dev login (email only)").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

test("admin can rename a user", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await page.getByRole("tab", { name: /Users/ }).click();
  const newName = `Casey ${Date.now()}`;
  const row = page.locator("tr", { hasText: "casey@ourdomain.com" });
  await row.getByRole("button").first().click();
  const input = page.locator('input[placeholder="Full name"]');
  await input.fill(newName);
  await input.press("Enter");
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Name updated" }).first()).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Users/ }).click();
  await expect(page.getByRole("button", { name: newName })).toBeVisible();
});

// Shared with the last test, which signs in as the assignee to check their list.
const NOTE = `Stitching on the gusset is loose #${Date.now()}`;

test("notes can be acknowledged, assigned and dismissed", async ({ page }) => {
  await login(page);

  // Leave a comment so there's something new on the board.
  await page.goto("/samples");
  const link = page.locator('tbody a[href^="/samples/"]:not([href*="tab=comments"])').first();
  const sampleNumber = (await link.textContent())!.trim();
  await link.click();
  await page.waitForURL(/\/samples\/[^/?]+/);
  await page.getByRole("tab", { name: /Comments/ }).click();
  await page.getByPlaceholder(/comment/i).first().fill(NOTE);
  await page.getByRole("button", { name: /Post|Add comment|Comment/ }).first().click();
  await expect(page.getByText(NOTE).first()).toBeVisible();

  // It shows up as new (unacknowledged).
  await page.goto("/revisions?new=1");
  const row = page.locator("li", { hasText: NOTE }).first();
  await expect(row).toBeVisible();

  // Assign it.
  await row.getByRole("combobox").click();
  await page.getByRole("option", { name: "Riley Sourcing" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Assigned" }).first()).toBeVisible();

  // Acknowledge it — it leaves the "new" view and the tile drops.
  await page.goto("/revisions?new=1");
  const row2 = page.locator("li", { hasText: NOTE }).first();
  await row2.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Acknowledged" }).first()).toBeVisible();
  await page.goto("/revisions?new=1");
  await expect(page.locator("li", { hasText: NOTE })).toHaveCount(0);

  // Assigned-to-me filter finds Riley's item when Riley looks.
  await page.goto("/revisions?assignee=me");
  await expect(page.locator("li", { hasText: NOTE })).toHaveCount(0);

  // Dismiss it — gone from the board, back with Show dismissed.
  await page.goto("/revisions");
  const row3 = page.locator("li", { hasText: NOTE }).first();
  await row3.getByRole("button").last().click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Dismissed" }).first()).toBeVisible();
  await page.goto("/revisions");
  await expect(page.locator("li", { hasText: NOTE })).toHaveCount(0);
  await page.goto("/revisions?dismissed=1");
  const dismissedRow = page.locator("li", { hasText: NOTE }).first();
  await expect(dismissedRow).toBeVisible();
  // ...and undo puts it back on the board.
  await dismissedRow.getByRole("button", { name: /Undo/ }).click();
  await page.goto("/revisions");
  await expect(page.locator("li", { hasText: NOTE }).first()).toBeVisible();
});

test("assigned-to-me shows the assignee their own items", async ({ page }) => {
  await login(page, "riley@ourdomain.com");
  await page.goto("/revisions?assignee=me");
  await expect(page.locator("li", { hasText: NOTE }).first()).toBeVisible();
});
