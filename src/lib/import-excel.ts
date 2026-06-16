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
  fobCost: ["fob", "fobcost", "fobprice", "cost", "factoryprice", "firstcost", "targetfobcost", "targetfob"],
  customerSellPrice: ["sell", "sellprice", "customersellprice", "wholesale", "wholesaleprice", "price", "targetretail", "retail", "msrp"],
  dutyRatePercent: ["duty", "dutyrate", "dutypercent", "dutyratepercent"],
  freightPerUnit: ["freight", "freightperunit", "freightunit"],
  inlandPerUnit: ["inland", "inlandperunit", "delivery"],
  targetCustomer: ["targetcustomer", "customer", "account"],
  factoryName: ["factory", "factoryname", "supplier", "mill"],
  size: ["size", "sz"],
  color: ["color", "colour", "colorway", "clr"],
  season: ["season", "seasoncode", "deliveryseason"],
  upc: ["upc", "barcode", "ean", "gtin", "upccode"],
  skuCode: ["sku", "skucode", "itemcode"],
  status: ["status", "stage"],
  htsCode: ["hts", "htscode", "htsno", "tariff", "tariffcode"],
  composition: ["composition", "compositionwpercentages", "fabric", "material", "content", "fibercontent"],
  cbmPerCarton: ["cbm", "cbmpercarton", "cbmcarton", "cartoncbm"],
  casePackDefault: ["casepack", "caseqty", "unitspercarton", "casepk", "pack"],
  trackingNumber: ["tracking", "trackingno", "trackingnumber", "trackingid", "awb", "airwaybill", "waybill"],
  trackingCarrier: ["carrier", "courier", "shipvia", "shippedvia"],
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

/** Build the downloadable import template (matches the sample-request sheet
 *  layout: a wide IMAGE column where a photo is embedded per row, then Brand,
 *  STYLE #, DESCRIPTION, COLOR, Season). Each data row is tall enough to hold a
 *  thumbnail; the importer reads the embedded picture anchored to that row. */
export async function buildSamplesTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sample Request");
  ws.addRow(["IMAGE", "Brand", "STYLE #", "DESCRIPTION", "COLOR", "Season"]);
  ws.getRow(1).font = { bold: true };
  const examples = [
    ["", "Off White L/AB", "LAB-HB-10002", "ASSYMETRICAL HOBO", "CHERRY BLOSSOM CREAM", "ss27"],
    ["", "Off White L/AB", "LAB-HB-10004", "ASSYMETRICAL HOBO", "BLACK DENIM", "ss27"],
    ["", "Off White L/AB", "LAB-HB-10005", "EAST WEST SATCHEL", "GRAFFITTI", "ss27"],
  ];
  for (const r of examples) ws.addRow(r);
  // Column widths: wide IMAGE column, comfortable text columns.
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 26;
  ws.getColumn(5).width = 22;
  ws.getColumn(6).width = 10;
  // Tall rows so a pasted/embedded photo fits in the IMAGE column.
  for (let r = 2; r <= examples.length + 1; r++) ws.getRow(r).height = 120;
  // A small note so users know images go in column A, anchored to each row.
  const note = ws.addRow([]);
  ws.getCell(`A${note.number + 1}`).value =
    "Paste a product photo into column A on each style's row. Headers are matched loosely; extra columns are ignored.";
  ws.getCell(`A${note.number + 1}`).font = { italic: true, size: 9, color: { argb: "FF888888" } };
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
