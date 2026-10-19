import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The factory's status sheet, read in: ship dates land on the colour the row
 * names, and a style we don't carry is reported rather than created.
 *
 * Requires the dev server running and the database seeded.
 * Run with: npm run test:e2e
 */

async function login(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Dev login (email only)").fill("admin@ourdomain.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

async function newSample(page: Page, number: string) {
  await page.goto("/samples");
  await page.getByRole("button", { name: "New sample" }).click();
  await page.locator('input[name="sampleNumber"]').fill(number);
  await page.getByLabel("Style name").fill("SHIP SHEET TEST BAG");
  await page.getByRole("button", { name: "Create sample" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  await page.getByRole("link", { name: number }).first().click();
  await page.waitForURL(/\/samples\/[^/?]+/);
}

async function addColor(page: Page, color: string) {
  await page.locator("#new-sku-size").fill("OS");
  await page.locator("#new-sku-color").fill(color);
  await page.getByRole("button", { name: "Add SKU", exact: true }).click();
  await expect(page.getByRole("cell", { name: color, exact: true })).toBeVisible();
}

test("ship dates from the factory sheet land on the right colour", async ({ page }) => {
  const number = `SHIP-${Date.now()}`;
  await login(page);
  await newSample(page, number);
  await addColor(page, "ARMY");
  await addColor(page, "TAN");

  // A sheet shaped like the factory's: a repeated header, "Receive" where no
  // courier number was kept, and a style we don't carry.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sample Status");
  ws.addRow(["UPDATED 10/01/26"]);
  ws.addRow(["Style #", "MATERIAL", "Color", "Pcs", "", "Shipped", "FedEx", "Year"]);
  ws.addRow(["Style #", "MATERIAL", "Color", "Pcs", "", "Shipped", "SAMPLES", "Year"]);
  ws.addRow([number, "CANVAS ", "Army", 1, 419, new Date(Date.UTC(2026, 9, 12)), 878499244331]);
  ws.addRow([number, "SUEDE", "Tan", 1, 419, new Date(Date.UTC(2026, 9, 14)), "Receive"]);
  ws.addRow([`${number}-NOPE`, "PU", "Gray", 1, 263, new Date(Date.UTC(2026, 5, 15)), "Receive"]);
  const file = path.join(mkdtempSync(path.join(tmpdir(), "ship-sheet-")), "status.xlsx");
  await wb.xlsx.writeFile(file);

  await page.goto("/samples");
  await page.getByRole("button", { name: "Shipping sheet" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles(file);

  // Two of the three rows are ours, and it says which colour each one is.
  await expect(dialog.getByText("2 to record")).toBeVisible();
  const army = dialog.locator("tr", { hasText: "ARMY" });
  await expect(army).toContainText("2026-10-12");
  await expect(army).toContainText("878499244331");
  const tan = dialog.locator("tr", { hasText: "TAN" });
  await expect(tan).toContainText("2026-10-14");
  await expect(tan).toContainText("—", { useInnerText: true });

  // The style we don't carry is reported, not invented.
  await dialog.getByText(/not matched — open to see why/).click();
  await expect(dialog.getByText(new RegExp(`${number}-NOPE.*no sample with that number`))).toBeVisible();

  // The rows it couldn't place come out as a spreadsheet to work through.
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Download them as Excel/ }).click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toMatch(/ship-sheet-not-matched-\d{4}-\d{2}-\d{2}\.xlsx/);
  const saved = await downloaded.path();
  const back = new ExcelJS.Workbook();
  await back.xlsx.readFile(saved);
  const sheet = back.worksheets[0];
  expect(sheet.getRow(1).values).toEqual([undefined, "Style #", "Colour", "Why it didn't match", "Detail"]);
  expect(sheet.rowCount).toBe(2); // the header, and the style we don't carry
  expect(String(sheet.getRow(2).getCell(1).value)).toContain(number);

  await dialog.getByRole("button", { name: /Record 2 ship dates/ }).click();
  await expect(page.getByText("2 ship dates recorded.")).toBeVisible();

  // The list shows the earliest of its colours; the sample page shows both.
  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  await expect(page.locator("tbody tr", { hasText: number }).first()).toContainText("2026-10-12");
  await page.getByRole("link", { name: number }).first().click();
  await expect(page.getByRole("row", { name: /ARMY/ })).toContainText("2026-10-12");
  await expect(page.getByRole("row", { name: /TAN/ })).toContainText("2026-10-14");

  // Reading the same sheet again has nothing left to do.
  await page.goto("/samples");
  await page.getByRole("button", { name: "Shipping sheet" }).click();
  await dialog.locator('input[type="file"]').setInputFiles(file);
  await expect(dialog.getByText("2 already right")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Record 0 ship dates/ })).toBeDisabled();
});
