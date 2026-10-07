import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Pricing samples from a factory price list: the dialog shows what would move
 * before anything is written, uses the sample's material to pick between a
 * style's several prices, and leaves alone the styles we don't carry.
 *
 * Requires the dev server running and the database seeded.
 * Run with: npm run test:e2e
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Dev login (email only)").fill("admin@ourdomain.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

test("a factory price list prices the samples it can, and says why it skipped the rest", async ({ page }) => {
  const stamp = Date.now();
  const denim = `PL-${stamp}-DENIM`;
  const plain = `PL-${stamp}-PLAIN`;
  const unknown = `PL-${stamp}-NOT-OURS`;

  await login(page);

  // Two samples of our own: one with a material to match on, one without.
  for (const [number, material] of [[denim, "Denim"], [plain, ""]] as const) {
    await page.goto("/samples");
    await page.getByRole("button", { name: "New sample" }).click();
    await page.locator('input[name="sampleNumber"]').fill(number);
    await page.getByLabel("Style name").fill("PRICE LIST TEST BAG");
    if (material) await page.getByLabel("Material").fill(material);
    await page.getByRole("button", { name: "Create sample" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  // The factory's sheet: both samples quoted per material, plus a style we
  // don't carry at all.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Samples");
  ws.addRow(["TP Style #", "Brand", "Style Name", "Composition", "FOB Cost"]);
  ws.addRow([denim, "test", "PRICE LIST TEST BAG", "CANVAS / LEATHER", 14.68]);
  ws.addRow([denim, "test", "PRICE LIST TEST BAG", "DENIM / LEATHER", 18.26]);
  ws.addRow([plain, "test", "PRICE LIST TEST BAG", "CANVAS", 17.53]);
  ws.addRow([plain, "test", "PRICE LIST TEST BAG", "NYLON", 34.36]);
  ws.addRow([unknown, "test", "GHOST BAG", "PU", 9.99]);
  const file = path.join(mkdtempSync(path.join(tmpdir(), "price-list-")), "prices.xlsx");
  await wb.xlsx.writeFile(file);

  await page.goto("/samples");
  await page.getByRole("button", { name: "Factory prices" }).click();
  await page.locator('input[type="file"]').setInputFiles(file);

  // The one price it can justify, and no other.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("5 priced rows across 3 style numbers")).toBeVisible();
  const changeRow = dialog.locator("tr", { hasText: denim });
  await expect(changeRow).toHaveCount(1);
  await expect(changeRow).toContainText("18.26");
  await expect(changeRow).toContainText("matches");
  await expect(dialog.locator("tr", { hasText: plain })).toHaveCount(0);

  // ...and it says, in so many words, why the other two were left alone.
  await dialog.getByText(/left alone — open to see why/).click();
  await expect(dialog.getByText(new RegExp(`${plain}.*no material to match`))).toBeVisible();
  await expect(dialog.getByText(new RegExp(`${unknown}.*no sample with that number`))).toBeVisible();

  // Nothing is written until it's applied.
  await page.goto(`/samples?q=${plain}`);
  await expect(page.getByText(plain).first()).toBeVisible();

  await page.goto("/samples");
  await page.getByRole("button", { name: "Factory prices" }).click();
  await page.locator('input[type="file"]').setInputFiles(file);
  await dialog.getByRole("button", { name: /Apply 1 price/ }).click();
  await expect(page.getByText("1 FOB price updated.")).toBeVisible();

  // The price is on the sample, and the sheet can be re-run without re-writing it.
  await page.goto(`/samples?q=${denim}`);
  await expect(page.getByRole("row", { name: new RegExp(denim) })).toContainText("18.26");

  await page.getByRole("button", { name: "Factory prices" }).click();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(dialog.getByText("1 already correct")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Apply 0 prices/ })).toBeDisabled();
});
