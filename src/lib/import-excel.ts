import ExcelJS from "exceljs";
import { SAMPLE_CATEGORIES, SAMPLE_BRANDS } from "@/lib/catalog";

// ---------------------------------------------------------------------------
// Excel import parsing (server-side, exceljs).
//
// Header matching is forgiving: case-insensitive, ignores spaces/#/punctuation,
// and accepts common aliases — so "Sample #", "sample_no", "SAMPLE NUMBER" all
// map to the same field. Unknown columns are simply ignored.
// ---------------------------------------------------------------------------

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** field -> accepted normalized header names */
const SAMPLE_ALIASES: Record<string, string[]> = {
  sampleNumber: ["sample", "sampleno", "samplenumber", "samplenum", "smpl", "s"],
  brand: ["brand", "vendor", "label"],
  category: ["category", "cat", "producttype", "type"],
  styleNumber: ["style", "styleno", "stylenumber", "stylenum", "styleref"],
  styleName: ["stylename", "name", "description1", "productname", "title"],
  description: ["description", "desc", "details", "notes"],
  fobCost: ["fob", "fobcost", "fobprice", "cost", "factoryprice", "firstcost", "targetfobcost", "targetfob"],
  customerSellPrice: ["sell", "sellprice", "customersellprice", "wholesale", "wholesaleprice", "price", "targetretail", "retail", "msrp"],
  dutyRatePercent: ["duty", "dutyrate", "dutypercent", "dutyratepercent"],
  freightPerUnit: ["freight", "freightperunit", "freightunit"],
  inlandPerUnit: ["inland", "inlandperunit", "inlandunit", "delivery"],
  targetCustomer: ["targetcustomer", "customer", "account"],
  factoryName: ["factory", "factoryname", "supplier", "mill"],
  size: ["size", "sz"],
  color: ["color", "colour", "colorway", "clr"],
  season: ["season", "seasoncode", "deliveryseason"],
  upc: ["upc", "barcode", "ean", "gtin", "upccode"],
  skuCode: ["sku", "skucode", "itemcode"],
  status: ["status", "stage"],
  htsCode: ["hts", "htscode", "htsno", "tariff", "tariffcode"],
  composition: ["composition", "compositionwpercentages", "fabric", "content", "fibercontent"],
  material: ["material", "materials", "matl"],
  cbmPerCarton: ["cbm", "cbmpercarton", "cbmcarton", "cartoncbm"],
  casePackDefault: ["casepack", "caseqty", "unitspercarton", "casepk", "pack"],
  trackingNumber: ["tracking", "trackingno", "trackingnumber", "trackingid", "awb", "airwaybill", "waybill"],
  trackingCarrier: ["carrier", "courier", "shipvia", "shippedvia"],
  received: ["received", "rcvd", "recd", "samplereceived", "got", "inhouse"],
};

const PI_LINE_ALIASES: Record<string, string[]> = {
  upc: ["upc", "barcode", "ean", "gtin"],
  styleNumber: ["style", "styleno", "stylenumber", "styleref"],
  sampleNumber: ["sample", "sampleno", "samplenumber"],
  size: ["size", "sz"],
  color: ["color", "colour", "clr"],
  quantity: ["qty", "quantity", "units", "pcs", "pieces", "orderqty"],
  unitPrice: ["unitprice", "price", "fob", "fobprice", "cost", "unitcost", "usd"],
};

export interface ParsedRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface ParsedImage {
  rowNumber: number; // 1-based worksheet row the image is anchored to
  buffer: Buffer;
  extension: string; // jpeg | png | gif
}

export interface ParseResult {
  headerRow: number;
  mappedColumns: Record<string, string>; // field -> original header text
  unmappedHeaders: string[];
  rows: ParsedRow[];
  images: ParsedImage[];
  error?: string;
}

/**
 * Parse the first worksheet. Finds the header row (first row where at least
 * two cells match known aliases), maps columns to fields, returns string
 * values per row. Works for .xlsx; callers convert CSV beforehand if needed.
 */
export async function parseWorkbook(
  buffer: Buffer,
  aliases: Record<string, string[]>,
): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { headerRow: 0, mappedColumns: {}, unmappedHeaders: [], rows: [], images: [], error: "Couldn't read that file. Save it as .xlsx and try again." };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { headerRow: 0, mappedColumns: {}, unmappedHeaders: [], rows: [], images: [], error: "The file has no sheets." };

  const aliasToField = new Map<string, string>();
  for (const [field, names] of Object.entries(aliases)) {
    for (const n of names) aliasToField.set(n, field);
  }

  // Locate header row within the first 10 rows.
  let headerRow = 0;
  const colField = new Map<number, string>();
  const mappedColumns: Record<string, string> = {};
  const unmappedHeaders: string[] = [];

  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const found = new Map<number, string>();
    const unmapped: string[] = [];
    const seen = new Set<string>();
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const header = norm(cell.text);
      const field = aliasToField.get(header);
      if (field && !seen.has(field)) {
        found.set(col, field);
        seen.add(field);
        mappedColumns[field] = String(cell.text).trim();
      } else if (cell.text) {
        unmapped.push(String(cell.text).trim());
      }
    });
    if (found.size >= 2) {
      headerRow = r;
      for (const [c, f] of found) colField.set(c, f);
      unmappedHeaders.push(...unmapped);
      break;
    }
    for (const k of Object.keys(mappedColumns)) delete mappedColumns[k];
  }

  if (!headerRow) {
    return {
      headerRow: 0,
      mappedColumns: {},
      unmappedHeaders: [],
      rows: [],
      images: [],
      error:
        "Couldn't find a header row. The first sheet needs column titles like Sample #, Brand, Size, UPC…",
    };
  }

  const rows: ParsedRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: Record<string, string> = {};
    let hasAny = false;
    for (const [col, field] of colField) {
      const cell = row.getCell(col);
      const text = (cell.text ?? "").toString().trim();
      if (text) hasAny = true;
      values[field] = text;
    }
    if (hasAny) rows.push({ rowNumber: r, values });
  }
  // Embedded pictures: exceljs anchors are zero-based, worksheet rows are
  // one-based — an image whose top-left sits in native row r belongs to
  // spreadsheet row r + 1.
  const images: ParsedImage[] = [];
  try {
    for (const img of ws.getImages()) {
      const media = wb.getImage(Number(img.imageId));
      if (!media?.buffer) continue;
      images.push({
        rowNumber: Math.floor(img.range.tl.nativeRow) + 1,
        buffer: Buffer.from(media.buffer as unknown as ArrayBuffer),
        extension: media.extension ?? "png",
      });
    }
  } catch {
    // Image extraction is best-effort; never fail the whole import over it.
  }

  return { headerRow, mappedColumns, unmappedHeaders, rows, images };
}

const CUSTOMER_PO_LINE_ALIASES: Record<string, string[]> = {
  styleNumber: ["style", "styleno", "stylenumber", "stylenum", "styleref", "itemnumber", "model", "sku"],
  description: ["description", "desc", "productname", "details", "name"],
  color: ["color", "colour", "clr"],
  size: ["size", "sz"],
  quantity: ["qty", "quantity", "units", "pcs", "pieces", "orderqty", "unitsordered"],
  unitPrice: ["unitprice", "price", "cost", "wholesale", "wholesaleprice", "retail"],
  upc: ["upc", "barcode", "ean", "gtin"],
};

const INVENTORY_ALIASES: Record<string, string[]> = {
  upc: ["upc", "barcode", "ean", "gtin", "upccode"],
  styleNumber: ["style", "styleno", "stylenumber", "styleref", "itemnumber"],
  size: ["size", "sz"],
  color: ["color", "colour", "clr"],
  skuCode: ["sku", "skucode", "itemcode"],
  quantity: ["qty", "quantity", "onhand", "onhandqty", "stock", "units", "count", "available", "oh"],
};

export const parseSamplesWorkbook = (b: Buffer) => parseWorkbook(b, SAMPLE_ALIASES);
export const parsePiLinesWorkbook = (b: Buffer) => parseWorkbook(b, PI_LINE_ALIASES);
export const parseCustomerPoWorkbook = (b: Buffer) => parseWorkbook(b, CUSTOMER_PO_LINE_ALIASES);
export const parseInventoryWorkbook = (b: Buffer) => parseWorkbook(b, INVENTORY_ALIASES);

const SKU_ALIASES: Record<string, string[]> = {
  size: ["size", "sz"],
  color: ["color", "colour", "clr"],
  upc: ["upc", "barcode", "ean", "gtin", "upccode"],
  skuCode: ["sku", "skucode", "itemcode", "skunumber"],
  unitsPerCarton: ["units", "unitspercarton", "casepack", "caseqty", "pack", "unitscarton"],
  received: ["received", "rcvd", "recd", "samplereceived"],
};
export const parseSkuWorkbook = (b: Buffer) => parseWorkbook(b, SKU_ALIASES);

const COLOR_CODE_ALIASES: Record<string, string[]> = {
  color: ["color", "colour", "colorname", "name"],
  code: ["code", "abbreviation", "abbr", "abbrev", "short", "colorcode"],
};
export const parseColorCodeWorkbook = (b: Buffer) => parseWorkbook(b, COLOR_CODE_ALIASES);

/** Build the downloadable import template (matches the sample-request sheet
 *  layout: a wide IMAGE column where a photo is embedded per row, then Brand,
 *  STYLE #, DESCRIPTION, COLOR, Season). Each data row is tall enough to hold a
 *  thumbnail; the importer reads the embedded picture anchored to that row. */
export async function buildSamplesTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sample Request");
  // Every column the importer understands. IMAGE holds an embedded photo per
  // row; everything else maps to a sample field (headers are matched loosely,
  // and any column you leave out is simply skipped). FOB/CBM/Case Pack/HTS feed
  // costing + the Order Form container-fill calc.
  const columns: { header: string; width: number }[] = [
    { header: "IMAGE", width: 28 },
    { header: "Sample #", width: 16 },
    { header: "Brand", width: 18 },
    { header: "Category", width: 16 },
    { header: "STYLE #", width: 16 },
    { header: "Style Name", width: 20 },
    { header: "DESCRIPTION", width: 26 },
    { header: "COLOR", width: 22 },
    { header: "Season", width: 10 },
    { header: "Size", width: 10 },
    { header: "FOB", width: 10 },
    { header: "Sell Price", width: 11 },
    { header: "Duty %", width: 9 },
    { header: "Freight/Unit", width: 12 },
    { header: "Inland/Unit", width: 12 },
    { header: "CBM", width: 9 },
    { header: "Case Pack", width: 11 },
    { header: "HTS Code", width: 14 },
    { header: "Material", width: 16 },
    { header: "Composition", width: 18 },
    { header: "Factory", width: 18 },
    { header: "Target Customer", width: 18 },
    { header: "UPC", width: 16 },
    { header: "SKU Code", width: 14 },
    { header: "Received", width: 10 },
  ];
  ws.addRow(columns.map((c) => c.header));
  ws.getRow(1).font = { bold: true };
  const examples = [
    ["", "", "Off White L/AB", "Handbag", "LAB-HB-10002", "Assymetrical Hobo", "ASSYMETRICAL HOBO", "CHERRY BLOSSOM CREAM", "ss27", "OS", 45, 120, 17.5, 2.5, 0.75, 0.182, 12, "4202.21.9000", "Leather", "100% Leather", "", "", "", ""],
    ["", "", "Off White L/AB", "Handbag", "LAB-HB-10004", "Assymetrical Hobo", "ASSYMETRICAL HOBO", "BLACK DENIM", "ss27", "OS", 45, 120, 17.5, 2.5, 0.75, 0.182, 12, "4202.21.9000", "Leather", "100% Leather", "", "", "", ""],
    ["", "", "Off White L/AB", "Handbag", "LAB-HB-10005", "East West Satchel", "EAST WEST SATCHEL", "GRAFFITTI", "ss27", "OS", 48, 130, 17.5, 2.5, 0.75, 0.182, 12, "4202.21.9000", "Leather", "100% Leather", "", "", "", ""],
  ];
  for (const r of examples) ws.addRow(r);
  columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  // Dropdowns (data validation) for Brand + Category on their data-row cells.
  const colLetter = (i: number) => String.fromCharCode(65 + i);
  const applyList = (header: string, values: readonly string[], title: string) => {
    const idx = columns.findIndex((c) => c.header === header);
    if (idx < 0) return;
    const letter = colLetter(idx);
    const formula = `"${values.join(",")}"`;
    for (let r = 2; r <= 500; r++) {
      ws.getCell(`${letter}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: title,
        error: `Pick a ${title.toLowerCase()} from the list.`,
      };
    }
  };
  applyList("Brand", SAMPLE_BRANDS, "Brand");
  applyList("Category", SAMPLE_CATEGORIES, "Category");
  // Tall rows so a pasted/embedded photo fits in the IMAGE column.
  for (let r = 2; r <= examples.length + 1; r++) ws.getRow(r).height = 120;
  // A small note so users know images go in column A, anchored to each row.
  const note = ws.addRow([]);
  ws.getCell(`A${note.number + 1}`).value =
    "Repeat the Sample # on a new row per color to group SKUs under one sample family; leave UPC blank to auto-build the SKU from the color code. Paste a photo into column A. Headers are matched loosely; extra columns are ignored.";
  ws.getCell(`A${note.number + 1}`).font = { italic: true, size: 9, color: { argb: "FF888888" } };
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
