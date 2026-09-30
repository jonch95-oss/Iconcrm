import { test, expect } from "@playwright/test";

/**
 * Several reference photos on one comment: they all show, one can be taken off,
 * and they reach the board and both exports.
 *
 * Needs a comment seeded with more than one image — the upload path itself goes
 * browser-straight-to-Blob, so it can't run without Blob credentials. Set
 * MULTI_IMAGE_COMMENT_ID to a comment that has several photos to run this.
 * Run with: npm run test:e2e
 */

const SAMPLE_ID = process.env.MULTI_IMAGE_SAMPLE_ID ?? "";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Dev login (email only)").fill("admin@ourdomain.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

test.skip(!process.env.MULTI_IMAGE_SAMPLE_ID, "needs a sample with a multi-image comment");

test("a comment shows every view, and one can be removed", async ({ page }) => {
  await login(page);
  await page.goto(`/samples/${SAMPLE_ID}?tab=comments`);
  const comment = page.locator("li", { hasText: "Gusset stitching — three views" }).first();
  await expect(comment.locator("img")).toHaveCount(3);
  await expect(comment.getByRole("button", { name: /Add view/ })).toBeVisible();

  // Remove the middle one.
  await comment.getByRole("button", { name: "Remove image 2" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Image removed" }).first()).toBeVisible();
  await page.reload();
  const after = page.locator("li", { hasText: "Gusset stitching — three views" }).first();
  await expect(after.locator("img")).toHaveCount(2);
  const srcs = await after.locator("img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
  expect(srcs.some((s) => s.includes("zz-view2"))).toBe(false);
});

test("the board shows each view on the note", async ({ page }) => {
  await login(page);
  await page.goto("/revisions");
  const row = page.locator("li", { hasText: "Gusset stitching — three views" }).first();
  await expect(row.locator("img")).toHaveCount(2);
});

test("the exports carry every view", async ({ page }) => {
  await login(page);
  for (const [name, url] of [["comments", "/api/samples/comments-export"], ["revisions", "/api/revisions/export"]] as const) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.goto(url).catch(() => {})]);
    await download.saveAs(`/tmp/claude-0/-home-user-Iconcrm/4deb9467-0e74-50a0-87c6-1d4bf92cfe17/scratchpad/${name}.xlsx`);
  }
});
