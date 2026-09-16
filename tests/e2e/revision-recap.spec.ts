import { test, expect } from "@playwright/test";

/**
 * Revisions & Comments recap: what the dashboard collects, how the open-only
 * filter narrows it, and the two ways it leaves the building (Excel, email).
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

test("revision recap collects what was asked for, per factory", async ({ page }) => {
  await login(page);

  // Seed some activity: ask for revisions on one sample, comment on another.
  await page.goto("/samples");
  const links = page.locator('tbody a[href^="/samples/"]:not([href*="tab=comments"])');
  await links.nth(0).click();
  await page.waitForURL(/\/samples\/[^/?]+/);
  await page.getByRole("button", { name: /Request revisions/i }).first().click();
  await page.getByRole("textbox").last().fill("Hardware finish is too warm — match the spec sample");
  await page.getByRole("button", { name: /Request revisions|Send|Confirm/i }).last().click();
  await expect(page.getByText(/Revisions Requested/i).first()).toBeVisible();

  await page.goto("/samples");
  await links.nth(1).click();
  await page.waitForURL(/\/samples\/[^/?]+/);
  await page.getByRole("tab", { name: /Comments/ }).click();
  await page.getByPlaceholder(/comment/i).first().fill("Lining color reads pink in daylight");
  await page.getByRole("button", { name: /Post|Add comment|Comment/ }).first().click();
  await expect(page.getByText("Lining color reads pink in daylight").first()).toBeVisible();

  // The dashboard picks both up.
  await page.goto("/revisions");
  await expect(page.getByRole("heading", { name: "Revisions & Comments" })).toBeVisible();
  await expect(page.getByText("Hardware finish is too warm — match the spec sample").first()).toBeVisible();
  await expect(page.getByText("Lining color reads pink in daylight").first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Awaiting revised sample");

  // Open-only narrows to what the factory still owes us.
  await page.getByRole("button", { name: "Open revisions only" }).click();
  await page.waitForURL(/open=1/);
  await expect(page.getByText("Hardware finish is too warm — match the spec sample").first()).toBeVisible();
  await expect(page.getByText("Lining color reads pink in daylight")).toHaveCount(0);

  // Excel recap downloads.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Excel" }).first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^sample-revisions-.*\.xlsx$/);
});

test("a factory recap can be emailed to its contact", async ({ page }) => {
  await login(page);
  await page.goto("/revisions");
  const emailBtn = page.getByRole("button", { name: /Email factory/ }).first();
  await expect(emailBtn).toBeVisible();
  await emailBtn.click();
  // Preview first: recipient, subject and the exact text that goes out.
  await expect(page.getByRole("heading", { name: /Send recap to/ })).toBeVisible();
  await expect(page.getByText(/Subject:/)).toBeVisible();
  expect(await page.locator("textarea").first().inputValue()).toContain("Sample revisions & comments");
  await page.getByRole("button", { name: /Send recap/ }).click();
  await expect(page.getByText(/Recap sent to/)).toBeVisible();

});
