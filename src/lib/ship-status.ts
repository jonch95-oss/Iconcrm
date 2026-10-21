import ExcelJS from "exceljs";
import { detectCarrier } from "@/lib/parcel";
import { asDay } from "@/lib/date";

/**
 * Reading the factory's weekly status sheet.
 *
 * The "Sample Status" tab is a working document, not an export: it changes its
 * own headers partway down (MATERIAL up top, TP STYLE / Style # / UPC further
 * on), repeats them, leaves gaps, and carries a second table of notes off to
 * the right that has nothing to do with shipping. So the reader follows the
 * headers rather than fixed columns, and only looks at A–H.
 *
 * Most rows say "Receive" where a courier number would go: those shipped and
 * arrived with no number kept. The date is still real, so it lands; there's
 * simply nothing to chase.
 */

export interface ShipRow {
  row: number;
  /** The factory's own style number, or ours — whichever the column holds. */
  style: string;
  /** The second style column on the lower block: our SKU code. */
  skuCode: string;
  upc: string;
  material: string;
  color: string;
  shippedDate: Date | null;
  tracking: string;
  /** The sheet's own "Received" tick, where it has one. Read, not acted on. */
  received: boolean;
}

const norm = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");
const key = (v: unknown) => norm(v).toUpperCase();

/** Words that mean "no courier number", not a courier number. */
const NO_TRACKING = new Set(["RECEIVE", "RECEIVED", "SAMPLES", "FEDEX", "DHL", "UPS", "-", "N/A", "NA", "TBD"]);

export const isTrackingNumber = (v: string) => /^[A-Z0-9][A-Z0-9 -]{7,}$/i.test(v.trim()) && /\d{6,}/.test(v.replace(/\D/g, ""));

const cellText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return norm(v.richText.map((t) => t.text).join(""));
    if ("text" in v) return norm(String((v as { text: unknown }).text));
    if ("result" in v) return norm(String((v as { result: unknown }).result));
    return "";
  }
  return norm(v);
};

const cellDate = (cell: ExcelJS.Cell): Date | null => {
  const v = cell.value;
  if (v instanceof Date) return asDay(v);
  const text = cellText(cell);
  // A date typed as text ("10/12/26", "2026-10-12") still counts.
  const m = text.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/);
  if (!m) return null;
  const [a, b, c] = [m[1], m[2], m[3]].map(Number);
  const [y, mo, d] = a > 31 ? [a, b, c] : [c < 100 ? 2000 + c : c, a, b];
  const date = new Date(Date.UTC(y, mo - 1, d, 12));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Which header a column holds, by the words the factory actually types. */
type Field = "style" | "skuCode" | "upc" | "material" | "color" | "shipped" | "tracking" | "received";
const HEADERS: { field: Field; names: string[] }[] = [
  { field: "style", names: ["TP STYLE", "TP STYLE #", "STYLE #", "STYLE"] },
  { field: "skuCode", names: ["STYLE #", "SKU", "SKU CODE"] },
  { field: "upc", names: ["UPC", "BARCODE"] },
  { field: "material", names: ["MATERIAL", "FABRIC"] },
  { field: "color", names: ["COLOR", "COLOUR"] },
  { field: "shipped", names: ["SHIPPED", "SHIP DATE", "SHIP"] },
  { field: "tracking", names: ["FEDEX", "TRACKING", "TRACKING #", "COURIER", "SAMPLES"] },
  { field: "received", names: ["RECEIVED", "RECEIVED?", "IN HOUSE"] },
];

type Mapping = Partial<Record<Field, number>>;

/**
 * Read a header row into a column mapping. The lower block of the sheet has
 * both a "TP STYLE" and a "Style #" column, so style is taken left to right:
 * the first style-ish column is the style, a second one is our SKU code.
 */
function readHeader(row: ExcelJS.Row, lastColumn: number): Mapping | null {
  const seen: Mapping = {};
  let hits = 0;
  const styleCols: number[] = [];
  for (let c = 1; c <= lastColumn; c++) {
    const text = key(cellText(row.getCell(c)));
    if (!text) continue;
    if (text === "STYLE #" || text === "STYLE" || text === "TP STYLE" || text === "TP STYLE #") {
      styleCols.push(c);
      hits += 1;
      continue;
    }
    for (const { field, names } of HEADERS) {
      if (field === "style" || field === "skuCode") continue;
      if (names.includes(text) && seen[field] === undefined) {
        seen[field] = c;
        hits += 1;
      }
    }
  }
  if (styleCols.length) seen.style = styleCols[0];
  if (styleCols.length > 1) seen.skuCode = styleCols[1];
  // A header row has to carry a style and a ship date to be worth following.
  return hits >= 2 && seen.style !== undefined && seen.shipped !== undefined ? seen : null;
}

export interface ShipSheetParse {
  rows: ShipRow[];
  error?: string;
  sheet?: string;
  /** What the reader decided the columns were, for the record. */
  columns?: Record<string, string>;
}

const COLUMN_LETTER = (c: number) => String.fromCharCode(64 + c);

/**
 * Pull the shipped rows out of the workbook. Only columns A–H are read: the
 * sheet's right-hand side is a scratch area (notes from the factory, a
 * stuck-at-customs list) that doesn't describe the same thing.
 */
export async function parseShipSheet(buffer: Buffer, sheetName = "Sample Status"): Promise<ShipSheetParse> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { rows: [], error: "That file isn't a readable .xlsx." };
  }
  const ws =
    wb.worksheets.find((s) => key(s.name) === key(sheetName)) ??
    wb.worksheets.find((s) => key(s.name).includes("SAMPLE STATUS"));
  if (!ws) {
    return { rows: [], error: `No "${sheetName}" tab in that workbook (found: ${wb.worksheets.map((s) => s.name).join(", ")}).` };
  }

  const LAST_COLUMN = 8; // A–H, as the factory keeps the shipping columns there
  let mapping: Mapping | null = null;
  let first: Mapping | null = null;
  const rows: ShipRow[] = [];

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const header = readHeader(row, LAST_COLUMN);
    if (header) {
      mapping = header;
      first ??= header;
      continue;
    }
    if (!mapping) continue;
    const at = (f: Field) => (mapping![f] ? cellText(row.getCell(mapping![f]!)) : "");
    const style = at("style");
    const skuCode = at("skuCode");
    const upc = at("upc");
    const shippedDate = mapping.shipped ? cellDate(row.getCell(mapping.shipped)) : null;
    if (!style && !skuCode && !upc) continue;
    if (!shippedDate) continue; // nothing to record yet
    const trackingRaw = at("tracking");
    const receivedRaw = mapping.received ? row.getCell(mapping.received).value : null;
    rows.push({
      row: r,
      style,
      skuCode,
      upc,
      material: at("material"),
      color: at("color"),
      shippedDate,
      tracking: NO_TRACKING.has(key(trackingRaw)) || !isTrackingNumber(trackingRaw) ? "" : trackingRaw,
      received: receivedRaw === true || ["Y", "YES", "TRUE", "1", "X"].includes(key(at("received"))),
    });
  }

  const columns: Record<string, string> = {};
  for (const [field, c] of Object.entries(first ?? {})) columns[field] = COLUMN_LETTER(c as number);
  return { rows, sheet: ws.name, columns };
}

/** The carrier a number belongs to, where it can be told from the number. */
export const carrierFor = (tracking: string) => (tracking ? detectCarrier(tracking) ?? null : null);

// ---------------------------------------------------------------------------
// Matching a sheet row to a sample, and to one of its colors.
// ---------------------------------------------------------------------------

export interface ShipVariant {
  id: string;
  color: string;
  material?: string | null;
  skuCode?: string | null;
  upc?: string | null;
  styleNumber?: string | null;
  shippedDate: Date | null;
  trackingNumber?: string | null;
}

export interface ShipSample {
  id: string;
  sampleNumber: string;
  styleNumber?: string | null;
  styleName?: string | null;
  material?: string | null;
  shippedDate: Date | null;
  trackingNumber?: string | null;
  variants: ShipVariant[];
}

export interface ShipUpdate {
  sampleId: string;
  sampleNumber: string;
  variantId?: string;
  color?: string;
  shippedNow: Date | null;
  shippedDate: Date;
  trackingNow: string | null;
  tracking: string;
  matchedOn: string;
  /** Sheet rows behind this one — the factory lists a style more than once. */
  rows: number[];
}

export interface ShipSkip {
  style: string;
  color: string;
  reason: string;
  detail: string;
}

export interface ShipReport {
  sheetRows: number;
  /** How many of those the sheet also ticks as received (not acted on here). */
  receivedOnSheet: number;
  updates: ShipUpdate[];
  /** Updates that would actually change something. */
  changes: ShipUpdate[];
  skipped: ShipSkip[];
}

/** The style number on its own: "OFW25-1039 ROLLING DUFFEL [26]" → "OFW25-1039". */
export function styleHead(style: string): string {
  return norm(style).split(/[\s[(]/)[0].replace(/[,;]$/, "");
}

const NOISE = new Set(["AND", "WITH", "THE", "COLOR", "COLOUR"]);
const words = (v: unknown) =>
  key(v)
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 2 && !NOISE.has(w));

/**
 * Words the sheet and the CRM use for the same color. The factory writes
 * "Navy" where we carry BLUE DENIM, "Aperol" for ORANGE, "Biege" for TAN —
 * and "Print" for whatever the patterned colorway happens to be called:
 * MULTI, CAMO, GRAFFITI, CHERRY BLOSSOM.
 */
const SYNONYMS = [
  ["PRINT", "PRINTED", "PATTERN", "MULTI", "MULTICOLOR", "CAMO", "CAMOUFLAGE", "GRAFFITI", "FLORAL", "BLOSSOM", "LEOPARD", "PAISLEY", "STRIPE", "STRIPED", "PLAID", "CHECK", "ZEBRA", "SNAKE", "PYTHON", "CROC", "TIEDYE", "ANIMAL"],
  ["NAVY", "BLUE", "DENIM", "INDIGO", "MARINE", "COBALT"],
  ["BEIGE", "BIEGE", "TAN", "SAND", "NUDE", "KHAKI", "CAMEL", "STONE", "TAUPE"],
  ["APEROL", "ORANGE", "RUST", "TERRACOTTA", "CORAL", "APRICOT"],
  ["GREY", "GRAY", "CHARCOAL", "SILVER", "SLATE"],
  ["BURGUNDY", "WINE", "MAROON", "OXBLOOD"],
  ["OLIVE", "ARMY", "MILITARY", "GREEN", "SAGE", "FOREST", "MOSS"],
  ["CREAM", "IVORY", "WHITE", "ECRU", "BONE", "CHALK", "OFFWHITE"],
  ["BROWN", "CHOCOLATE", "COGNAC", "MOCHA", "ESPRESSO", "WALNUT"],
  ["PINK", "BLUSH", "ROSE", "FUCHSIA", "MAGENTA"],
  ["PURPLE", "LILAC", "LAVENDER", "VIOLET", "PLUM"],
  ["YELLOW", "MUSTARD", "GOLD", "LEMON", "OCHRE"],
  ["RED", "CHERRY", "SCARLET", "CRIMSON"],
];

const SAME = new Map<string, Set<string>>();
for (const group of SYNONYMS) {
  for (const word of group) {
    const set = SAME.get(word) ?? new Set<string>();
    for (const other of group) if (other !== word) set.add(other);
    SAME.set(word, set);
  }
}

/**
 * How well a sheet row's color (and material) describes one of our colors.
 * The same word scores higher than a synonym of it, so a sample carrying both
 * NAVY and BLUE DENIM still resolves "Navy" to NAVY rather than tying.
 */
function colorFit(row: ShipRow, variant: ShipVariant): number {
  const mine = new Set([...words(variant.color), ...words(variant.material)]);
  if (mine.size === 0) return 0;
  let fit = 0;
  for (const w of [...words(row.color), ...words(row.material)]) {
    if (mine.has(w)) fit += 3;
    else {
      const same = SAME.get(w);
      if (same) for (const alt of same) if (mine.has(alt)) { fit += 1; break; }
    }
  }
  return fit;
}

const laterOf = (a: Date | null, b: Date) => (a && a.getTime() > b.getTime() ? a : b);

/**
 * Point each dated row at a sample, and at one of its colors where the sheet
 * says which. Exact identifiers first — a UPC or a SKU code leaves nothing to
 * argue about — then the style number, then the style number with the
 * factory's description trimmed off it.
 *
 * A style listed several times (resamples, a second shipment) keeps the latest
 * date, and any courier number that came with it.
 */
export function matchShipRows(rows: ShipRow[], samples: ShipSample[]): ShipReport {
  const byUpc = new Map<string, { sample: ShipSample; variant: ShipVariant }>();
  const bySkuCode = new Map<string, { sample: ShipSample; variant: ShipVariant }>();
  const byVariantStyle = new Map<string, { sample: ShipSample; variant: ShipVariant }[]>();
  const byNumber = new Map<string, ShipSample>();
  const byStyle = new Map<string, ShipSample[]>();
  for (const s of samples) {
    byNumber.set(key(s.sampleNumber), s);
    if (s.styleNumber) {
      const list = byStyle.get(key(s.styleNumber)) ?? [];
      list.push(s);
      byStyle.set(key(s.styleNumber), list);
    }
    for (const v of s.variants) {
      if (v.upc) byUpc.set(key(v.upc), { sample: s, variant: v });
      if (v.skuCode) bySkuCode.set(key(v.skuCode), { sample: s, variant: v });
      if (v.styleNumber) {
        const list = byVariantStyle.get(key(v.styleNumber)) ?? [];
        list.push({ sample: s, variant: v });
        byVariantStyle.set(key(v.styleNumber), list);
      }
    }
  }

  // The same style gets written OW-BBPW-10001 here and OW-BBPW10001 there, so
  // a last pass compares the letters and digits alone — and only when exactly
  // one sample answers to it.
  const loose = (v: string) => key(v).replace(/[^A-Z0-9]/g, "");
  const byLoose = new Map<string, Set<ShipSample>>();
  const looseVariantStyle = new Map<string, { sample: ShipSample; variant: ShipVariant }[]>();
  for (const s of samples) {
    for (const v of [s.sampleNumber, s.styleNumber]) {
      if (!v) continue;
      const k = loose(v);
      if (!k) continue;
      const set = byLoose.get(k) ?? new Set<ShipSample>();
      set.add(s);
      byLoose.set(k, set);
    }
    for (const variant of s.variants) {
      if (!variant.styleNumber) continue;
      const k = loose(variant.styleNumber);
      const list = looseVariantStyle.get(k) ?? [];
      list.push({ sample: s, variant });
      looseVariantStyle.set(k, list);
    }
  }

  const resolve = (row: ShipRow): { sample?: ShipSample; variant?: ShipVariant; on?: string; ambiguous?: number } => {
    if (row.upc) {
      const hit = byUpc.get(key(row.upc));
      if (hit) return { ...hit, on: "UPC" };
    }
    if (row.skuCode) {
      const hit = bySkuCode.get(key(row.skuCode));
      if (hit) return { ...hit, on: "SKU code" };
    }
    for (const candidate of [row.style, styleHead(row.style)]) {
      if (!candidate) continue;
      const k = key(candidate);
      const colorStyle = byVariantStyle.get(k);
      if (colorStyle?.length === 1) return { ...colorStyle[0], on: "TP style # on the color" };
      const sample = byNumber.get(k);
      if (sample) return { sample, on: candidate === row.style ? "sample #" : "sample # (description trimmed)" };
      const styled = byStyle.get(k);
      if (styled?.length === 1) return { sample: styled[0], on: "style #" };
      if (styled && styled.length > 1) return { ambiguous: styled.length };
    }
    for (const candidate of [row.style, styleHead(row.style)]) {
      if (!candidate) continue;
      const k = loose(candidate);
      if (!k) continue;
      const onColor = looseVariantStyle.get(k);
      if (onColor?.length === 1) return { ...onColor[0], on: "TP style # on the color (spacing ignored)" };
      const hits = byLoose.get(k);
      if (hits?.size === 1) return { sample: [...hits][0], on: "style # (spacing ignored)" };
      if (hits && hits.size > 1) return { ambiguous: hits.size };
    }
    return {};
  };

  const merged = new Map<string, ShipUpdate>();
  const skipped: ShipSkip[] = [];
  const add = (update: ShipUpdate) => {
    const k = update.variantId ?? `sample:${update.sampleId}`;
    const existing = merged.get(k);
    if (!existing) {
      merged.set(k, update);
      return;
    }
    existing.shippedDate = laterOf(existing.shippedDate, update.shippedDate);
    existing.tracking = existing.tracking || update.tracking;
    existing.rows.push(...update.rows);
  };

  for (const row of rows) {
    const { sample, variant, on, ambiguous } = resolve(row);
    if (!sample) {
      skipped.push({
        style: row.style || row.skuCode || row.upc,
        color: row.color,
        reason: ambiguous ? `style # is on ${ambiguous} samples — too ambiguous` : "no sample with that number",
        detail: `row ${row.row}: shipped ${row.shippedDate!.toISOString().slice(0, 10)}${row.tracking ? `, ${row.tracking}` : ""}`,
      });
      continue;
    }

    // Which color? The row says, or the sample only has the one, or it's the
    // whole sample (no colors on it at all).
    let target = variant;
    if (!target && sample.variants.length > 0) {
      // One colour on the sample and one row for it: whatever the factory
      // calls it — "Print", "Black P", "Biege" — there is nothing else it
      // could be. Most of what used to land in the unmatched list was this.
      if (sample.variants.length === 1) target = sample.variants[0];
      else if (row.color) {
        const scored = sample.variants
          .map((v) => ({ v, fit: colorFit(row, v) }))
          .sort((a, b) => b.fit - a.fit);
        const best = scored[0];
        const tied = scored.filter((x) => x.fit === best.fit);
        if (best.fit > 0 && tied.length === 1) target = best.v;
        else {
          skipped.push({
            style: sample.sampleNumber,
            color: row.color,
            reason: best.fit === 0 ? `“${row.color}” isn't a color on this sample` : `“${row.color}” fits ${tied.length} of its colors`,
            detail: `row ${row.row}: ours are ${sample.variants.map((v) => v.color).join(", ") || "none"}`,
          });
          continue;
        }
      }
      // No color on the row and several on the sample: the whole style shipped.
    }

    add({
      sampleId: sample.id,
      sampleNumber: sample.sampleNumber,
      ...(target ? { variantId: target.id, color: target.color } : {}),
      shippedNow: target ? target.shippedDate : sample.shippedDate,
      shippedDate: row.shippedDate!,
      trackingNow: (target ? target.trackingNumber : sample.trackingNumber) ?? null,
      tracking: row.tracking,
      matchedOn: on ?? "sample #",
      rows: [row.row],
    });
  }

  const updates = [...merged.values()];
  const changes = updates.filter(
    (u) =>
      (u.shippedNow?.getTime() ?? null) !== u.shippedDate.getTime() ||
      (u.tracking !== "" && u.tracking !== (u.trackingNow ?? "")),
  );
  return { sheetRows: rows.length, receivedOnSheet: rows.filter((r) => r.received).length, updates, changes, skipped };
}
