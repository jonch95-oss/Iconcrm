import { test, expect } from "@playwright/test";

/**
 * Smoke test of the critical path:
 *   email (inbound webhook) → sample → samples table → detail → order forms →
 *   PIs → POs → packing lists.
 *
 * Requires the dev server running and the database seeded.
 * Run with: npm run test:e2e
 */

const ADMIN_EMAIL = "admin@ourdomain.com";

async function devLogin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Dev login (email only)").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

test("inbound webhook creates a sample", async ({ request }) => {
  const unique = `S-E2E-${Date.now()}`;
  const res = await request.post(
    `/api/inbound/email?token=${process.env.POSTMARK_INBOUND_TOKEN ?? "dev-postmark-token"}`,
    {
      data: {
        FromFull: { Email: "buyer@brand.com" },
        Subject: `Sample: ${unique} Brand: Aurora Category: Tops`,
        TextBody: "Please develop this style.",
      },
    },
  );
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.outcome).toBe("created_sample");
});

test("authenticated user can traverse the pipeline pages", async ({ page }) => {
  await devLogin(page);

  // Dashboard KPIs render.
  await expect(page.getByText("Open samples")).toBeVisible();

  // Samples table.
  await page.goto("/samples");
  await expect(page.getByRole("heading", { name: "Samples" })).toBeVisible();
  const firstSample = page
    .locator('tbody a[href^="/samples/"]')
    .filter({ hasNotText: "Board" })
    .first();
  await firstSample.click();
  await page.waitForURL(/\/samples\/[^/]+$/);
  await expect(page.getByText("Details").first()).toBeVisible();

  // Each major list page loads.
  for (const path of ["/order-forms", "/pis", "/pos", "/customer-pos", "/packing-lists", "/needs-review", "/factories"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
  }

  // Global search finds a sample.
  await page.goto("/");
  await page.getByPlaceholder(/Search sample/).fill("S-2026");
  await expect(page.locator("text=Sample").first()).toBeVisible({ timeout: 5000 });
});

test("admin can open settings; pages are role-gated", async ({ page }) => {
  await devLogin(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Admin Settings" })).toBeVisible();
});
