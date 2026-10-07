import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * What a color carries of its own: a TP style #, a material and an FOB. The
 * factory quotes suede and denim apart, so each color keeps its own, falls back
 * to the sample's where it hasn't got one, and can be filled straight from the
 * factory's price list.
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

async function newSample(page: import("@playwright/test").Page, number: string, fob?: string) {
  await page.goto("/samples");
  await page.getByRole("button", { name: "New sample" }).click();
  await page.locator('input[name="sampleNumber"]').fill(number);
  await page.getByLabel("Style name").fill("TWO TONE HOBO");
  if (fob) await page.getByLabel("FOB cost").fill(fob);
  await page.getByRole("button", { name: "Create sample" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  await page.getByRole("link", { name: number }).first().click();
  await page.waitForURL(/\/samples\/[^/]+$/);
}

async function addColor(page: import("@playwright/test").Page, color: string) {
  await page.locator("#new-sku-size").fill("OS");
  await page.locator("#new-sku-color").fill(color);
  await page.getByRole("button", { name: "Add SKU", exact: true }).click();
  await expect(page.getByRole("cell", { name: color, exact: true })).toBeVisible();
}

/** Columns of the SKU grid, by position: the cells are edited in place. */
const COLUMN = { tpStyle: 6, material: 7, fob: 8 } as const;

async function setCell(row: import("@playwright/test").Locator, column: keyof typeof COLUMN, value: string) {
  const cell = row.locator("td").nth(COLUMN[column]);
  await cell.getByRole("button").click();
  const input = cell.locator("input");
  await input.fill(value);
  await input.press("Enter");
  await expect(row.page().getByText("Saved")).toBeVisible();
}

test("a color keeps its own price, and inherits the sample's when it hasn't one", async ({ page }) => {
  const number = `VF-${Date.now()}`;
  await login(page);
  await newSample(page, number, "30");
  await addColor(page, "DENIM BLUE");
  await addColor(page, "SUEDE TAUPE");

  // Both colors start on the sample's price, shown greyed out rather than blank.
  const denim = page.getByRole("row", { name: /DENIM BLUE/ });
  await expect(denim.getByTitle(/From the sample/)).toHaveText("30");

  // Pricing one color leaves the other inheriting.
  await setCell(denim, "fob", "24.61");
  await page.reload();
  await expect(page.getByRole("row", { name: /DENIM BLUE/ })).toContainText("24.61");
  await expect(page.getByRole("row", { name: /SUEDE TAUPE/ }).getByTitle(/From the sample/)).toHaveText("30");

  // The headline FOB stops pretending there's one price.
  await expect(page.getByText("$24.61–$30.00 by color")).toBeVisible();
});

test("a price list that quotes per material prices the colors themselves", async ({ page }) => {
  const number = `VFL-${Date.now()}`;
  await login(page);
  await newSample(page, number, "30");
  await addColor(page, "DENIM BLUE");
  await addColor(page, "SUEDE TAUPE");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Samples");
  ws.addRow(["TP Style #", "Style Name", "Composition", "FOB Cost"]);
  ws.addRow([number, "TWO TONE HOBO", "DENIM / LEATHER", 24.61]);
  ws.addRow([number, "TWO TONE HOBO", "SUEDE / LEATHER", 42.69]);
  const file = path.join(mkdtempSync(path.join(tmpdir(), "variant-fob-")), "prices.xlsx");
  await wb.xlsx.writeFile(file);

  await page.goto("/samples");
  await page.getByRole("button", { name: "Factory prices" }).click();
  await page.locator('input[type="file"]').setInputFiles(file);
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("tr", { hasText: "DENIM BLUE" })).toContainText("24.61");
  await expect(dialog.locator("tr", { hasText: "SUEDE TAUPE" })).toContainText("42.69");
  await dialog.getByRole("button", { name: /Apply 2 prices/ }).click();
  await expect(page.getByText("2 FOB prices updated.")).toBeVisible();

  // ...onto the colors, leaving the sample's own price alone.
  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  await page.getByRole("link", { name: number }).first().click();
  await expect(page.getByRole("row", { name: /DENIM BLUE/ })).toContainText("24.61");
  await expect(page.getByRole("row", { name: /SUEDE TAUPE/ })).toContainText("42.69");
  await expect(page.getByText("$24.61–$42.69 by color")).toBeVisible();
});

test("a color's price survives the round trip through Excel", async ({ page }) => {
  const number = `VFX-${Date.now()}`;
  await login(page);
  await newSample(page, number, "30");
  await addColor(page, "DENIM BLUE");
  const sampleId = new URL(page.url()).pathname.split("/").pop()!;

  const denim = page.getByRole("row", { name: /DENIM BLUE/ });
  await setCell(denim, "fob", "24.61");

  // The SKU sheet carries it out...
  const skuSheet = new ExcelJS.Workbook();
  await skuSheet.xlsx.load(new Uint8Array(await (await page.request.get(`/api/samples/${sampleId}/skus`)).body()) as unknown as ArrayBuffer);
  const skuWs = skuSheet.worksheets[0];
  const fobCol = skuWs.getRow(1).values as string[];
  expect(fobCol).toContain("FOB");
  expect(skuWs.getRow(2).getCell(fobCol.indexOf("FOB")).text).toBe("24.61");

  // ...and the whole-catalog sheet keeps it in its own column, apart from the
  // sample's price.
  const all = new ExcelJS.Workbook();
  await all.xlsx.load(new Uint8Array(await (await page.request.get("/api/samples/export?photos=0")).body()) as unknown as ArrayBuffer);
  const allWs = all.worksheets[0];
  const headers = allWs.getRow(1).values as string[];
  expect(headers).toContain("Color FOB");
  let found = "";
  allWs.eachRow((row, n) => {
    if (n > 1 && row.getCell(headers.indexOf("Sample #")).text === number) found = row.getCell(headers.indexOf("Color FOB")).text;
  });
  expect(found).toBe("24.61");
});

test("a color with the factory's own style number takes the price quoted for it", async ({ page }) => {
  const number = `VFS-${Date.now()}`;
  const suedeStyle = `${number}-SUEDE`;
  const denimStyle = `${number}-DENIM`;
  await login(page);
  await newSample(page, number, "30");
  await addColor(page, "TAUPE");
  await addColor(page, "INDIGO");

  // Each color gets the factory's own number for it, and its material.
  await setCell(page.getByRole("row", { name: /TAUPE/ }), "tpStyle", suedeStyle);
  await setCell(page.getByRole("row", { name: /TAUPE/ }), "material", "Suede");
  await page.reload();
  await setCell(page.getByRole("row", { name: /INDIGO/ }), "tpStyle", denimStyle);
  await setCell(page.getByRole("row", { name: /INDIGO/ }), "material", "Denim");
  await page.reload();
  await expect(page.getByRole("row", { name: /TAUPE/ })).toContainText(suedeStyle);

  // The quote names those numbers, so no material guessing is needed at all.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Samples");
  ws.addRow(["TP Style #", "Style Name", "Composition", "FOB Cost"]);
  ws.addRow([suedeStyle, "TWO TONE HOBO", "SUEDE / LEATHER", 42.69]);
  ws.addRow([denimStyle, "TWO TONE HOBO", "DENIM / LEATHER", 24.61]);
  const file = path.join(mkdtempSync(path.join(tmpdir(), "color-style-")), "prices.xlsx");
  await wb.xlsx.writeFile(file);

  await page.goto("/samples");
  await page.getByRole("button", { name: "Factory prices" }).click();
  await page.locator('input[type="file"]').setInputFiles(file);
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("tr", { hasText: "TAUPE" })).toContainText("TP style # on the color");
  await dialog.getByRole("button", { name: /Apply 2 prices/ }).click();
  await expect(page.getByText("2 FOB prices updated.")).toBeVisible();

  await page.goto(`/samples?q=${encodeURIComponent(number)}`);
  await page.getByRole("link", { name: number }).first().click();
  await expect(page.getByRole("row", { name: /TAUPE/ })).toContainText("42.69");
  await expect(page.getByRole("row", { name: /INDIGO/ })).toContainText("24.61");
});
