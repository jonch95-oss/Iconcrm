import ExcelJS from "exceljs";

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
  fobCost: ["fob", "fobcost", "fobprice", "cost", "factoryprice", "firstcost"],
  customerSellPrice: ["sell", "sellprice", "customersellprice", "wholesale", "wholesaleprice", "price"],
  dutyRatePercent: ["duty", "dutyrate", "dutypercent", "dutyratepercent"],
  freightPerUnit: ["freight", "freightperunit", "freightunit"],
  inlandPerUnit: ["inland", "inlandperunit", "delivery"],
  targetCustomer: ["targetcustomer", "customer", "account"],
  factoryName: ["factory", "factoryname", "supplier", "mill"],
  size: ["size", "sz"],
  color: ["color", "colour", "colorway", "clr"],
  upc: ["upc", "barcode", "ean", "gtin", "upccode"],
  skuCode: ["sku", "skucode", "itemcode"],
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

export const parseSamplesWorkbook = (b: Buffer) => parseWorkbook(b, SAMPLE_ALIASES);
export const parsePiLinesWorkbook = (b: Buffer) => parseWorkbook(b, PI_LINE_ALIASES);

/** Build the downloadable import template. */
export async function buildSamplesTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Samples");
  ws.addRow([
    "Sample #", "Brand", "Category", "Style #", "Style Name", "Description",
    "FOB", "Sell Price", "Duty %", "Freight/Unit", "Inland/Unit",
    "Factory", "Target Customer", "Size", "Color", "UPC",
  ]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(["S-1001", "Aurora", "Outerwear", "AUR-PF-01", "Quilted Puffer", "Recycled fill", 18.5, 42, 17.5, 1.1, 0.4, "Saigon Garment", "Nordstrom", "S", "Black", "812345678001"]);
  ws.addRow(["S-1001", "", "", "", "", "", "", "", "", "", "", "", "", "M", "Black", "812345678002"]);
  ws.addRow(["S-1001", "", "", "", "", "", "", "", "", "", "", "", "", "L", "Black", "812345678003"]);
  ws.columns.forEach((c) => (c.width = 16));
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
