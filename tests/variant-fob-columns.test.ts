/**
 * The per-color price has to survive the sheets it travels in: the SKU sheet
 * for one sample, and the whole-catalog sample sheet.
 * Run with: npx tsx tests/variant-fob-columns.test.ts
 */
import assert from "node:assert";
import ExcelJS from "exceljs";
import { parseSkuWorkbook, parseSamplesWorkbook } from "../src/lib/import-excel";

async function book(headers: string[], rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function main() {
  // The SKU sheet the app exports, read back in.
  const skus = await parseSkuWorkbook(
    await book(
      ["Size", "Color", "UPC", "SKU Code", "Units/Carton", "TP Style #", "Material", "FOB", "Received"],
      [["OS", "DENIM BLUE", "", "X-DEN", 12, "LAB-77-DENIM", "Denim", 24.61, "Y"]],
    ),
  );
  assert.equal(skus.error, undefined);
  assert.equal(skus.mappedColumns.fobCost, "FOB");
  assert.equal(skus.rows[0].values.fobCost, "24.61");
  assert.equal(skus.rows[0].values.material, "Denim");
  assert.equal(skus.rows[0].values.styleNumber, "LAB-77-DENIM");

  // On the sample sheet the two prices are different columns: the sample's own
  // FOB, and the price of the color on that row.
  const samples = await parseSamplesWorkbook(
    await book(
      ["Sample #", "STYLE #", "Material", "Color", "FOB", "Color TP Style #", "Color Material", "Color FOB"],
      [["LAB-HB-10079", "LAB-77", "Leather", "DENIM BLUE", 30, "LAB-77-DENIM", "Denim", 24.61]],
    ),
  );
  assert.equal(samples.error, undefined);
  assert.equal(samples.rows[0].values.fobCost, "30");
  assert.equal(samples.rows[0].values.material, "Leather");
  assert.equal(samples.rows[0].values.styleNumber, "LAB-77");
  assert.equal(samples.rows[0].values.variantFob, "24.61");
  assert.equal(samples.rows[0].values.variantMaterial, "Denim");
  assert.equal(samples.rows[0].values.variantStyleNumber, "LAB-77-DENIM");

  // A sheet without the color column still reads: the color simply has no
  // price of its own and falls back to the sample's.
  const plain = await parseSamplesWorkbook(await book(["Sample #", "Color", "FOB"], [["LAB-HB-10079", "DENIM BLUE", 30]]));
  assert.equal(plain.rows[0].values.variantFob, undefined);

  console.log("variant-fob-columns: all tests passed");
}

main();
