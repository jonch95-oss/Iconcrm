import ExcelJS from "exceljs";

/**
 * Matching a factory's price list to the samples we already have.
 *
 * A factory sheet is priced per MATERIAL: one style appears a dozen times with
 * a different FOB for leather, denim, raffia… while a sample in the CRM carries
 * one FOB. So a style gets priced only when the answer is unambiguous:
 *
 *   - one price for the style                      → applied
 *   - several, and the sample's own material
 *     names one of them                            → that one applied
 *   - several, nothing to choose with              → left alone, reported
 *
 * And nothing is ever invented: a price row only counts when its style number
 * already names a sample. Rows for styles we don't carry are reported, never
 * created — that's what separates this from the general Excel importer.
 */

export interface PriceRow {
  row: number;
  style: string;
  base: string;
  composition: string;
  styleName: string;
  brand: string;
  fob: number | null;
}

export interface MatchSample {
  id: string;
  sampleNumber: string;
  styleNumber?: string | null;
  styleName?: string | null;
  material?: string | null;
  composition?: string | null;
  fob: number | null;
  /** This sample's colors, each with whatever it carries of its own. */
  variants?: { id: string; color: string; material?: string | null; styleNumber?: string | null; fob: number | null }[];
}

export interface PricedSample {
  sampleId: string;
  sampleNumber: string;
  styleName: string;
  /** Set when the price belongs to one color rather than the whole sample. */
  variantId?: string;
  color?: string;
  fobNow: number | null;
  fob: number;
  matchedOn: string;
  why: string;
}

export interface UnpricedStyle {
  style: string;
  styleName: string;
  reason: string;
  detail: string;
}

export interface FobMatchReport {
  priceRows: number;
  styles: number;
  priced: PricedSample[];
  changes: PricedSample[];
  skipped: UnpricedStyle[];
}

const norm = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) => norm(v).toUpperCase().replace(/\s+/g, " ");

/**
 * A style number with its variant letter dropped: "OW-BBPM0001 A" and
 * "OW-BSAW-10001-B" are colour/material options on one sample, and anything
 * after a slash is a note rather than part of the number. Only ever a
 * fallback — an exact number wins, so a CRM that really does keep A and B as
 * separate samples still prices each one on its own.
 */
export function baseSampleNumber(style: string): string {
  return norm(style).split("/")[0].trim().replace(/[\s-]+[A-Z]$/i, "");
}

/** Words that say nothing about which material this is. */
// Only connective filler. Words like "distressed" or "embroidery" stay in:
// on these sheets they are exactly what separates one price from another.
const NOISE = new Set(["AND", "WITH", "THE", "MATERIAL"]);
const words = (v: unknown) =>
  key(v)
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 2 && !NOISE.has(w));

/**
 * How well a price row's composition describes a sample's material. `hits`
 * counts shared words; `extras` counts words the row adds that the sample never
 * mentions, so plain "LEATHER" beats "SUEDE / LEATHER" for a sample that only
 * says leather. A sample's Material and Composition are pooled because one shop
 * writes "SUEDE" in one and another writes it in the other.
 */
export function materialFit(composition: string, sampleWords: Set<string>) {
  const rowWords = new Set(words(composition));
  let hits = 0;
  for (const w of rowWords) if (sampleWords.has(w)) hits += 1;
  return { hits, extras: rowWords.size - hits };
}

type Fit = ReturnType<typeof materialFit>;
const betterFit = (a: Fit, b: Fit) => (a.hits !== b.hits ? b.hits - a.hits : a.extras - b.extras);
const sameFit = (a: Fit, b: Fit) => a.hits === b.hits && a.extras === b.extras;

const money = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/**
 * Read a factory price list: a header row, then one row per style/material.
 * Column titles are matched loosely, so the sheets factories actually send
 * ("TP Style #", "Composition", "FOB Cost") work untouched.
 */
export async function parsePriceList(
  buffer: Buffer,
): Promise<{ rows: PriceRow[]; error?: string; columns?: Record<string, string> }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { rows: [], error: "That file isn't a readable .xlsx — in Excel use File → Save As → .xlsx." };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], error: "The workbook has no sheets." };

  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, c) => (headers[c] = key(cell.text)));
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex((h) => h === key(n));
      if (i > 0) return i;
    }
    return -1;
  };
  const cStyle = col("TP Style #", "Style #", "Style", "Sample #", "Style Number");
  const cFob = col("FOB Cost", "FOB", "FOB Price", "Cost", "Price");
  if (cStyle < 0 || cFob < 0) {
    return {
      rows: [],
      error:
        "The first sheet needs a style column (Style #, TP Style #, Sample #) and a price column (FOB, FOB Cost) in its first row.",
    };
  }
  const cComp = col("Composition", "Material", "Fabric");
  const cName = col("Style Name", "Description", "Name");
  const cBrand = col("Brand");

  const rows: PriceRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const cell = (i: number) => (i > 0 ? norm(row.getCell(i).text) : "");
    const style = cell(cStyle);
    if (!style) return;
    rows.push({
      row: n,
      style,
      base: baseSampleNumber(style),
      composition: cell(cComp),
      styleName: cell(cName),
      brand: cell(cBrand),
      fob: money(cell(cFob)),
    });
  });
  const columns: Record<string, string> = { style: headers[cStyle], fob: headers[cFob] };
  if (cComp > 0) columns.composition = headers[cComp];
  return { rows, columns };
}

type Variant = NonNullable<MatchSample["variants"]>[number];

/** Everything a color says about itself: its material first, then its name. */
const colorWords = (variant: Variant) => new Set([...words(variant.material), ...words(variant.color)]);

/**
 * A color takes a price when its own name points at one row and no other:
 * "DENIM" on the sample, "DENIM / LEATHER" on the sheet. All or nothing — the
 * caller falls back to pricing the sample as a whole when any color misses.
 */
function priceEachColor(rows: PriceRow[], sample: MatchSample, on: string): PricedSample[] | null {
  const variants = sample.variants ?? [];
  if (variants.length < 2) return null;
  const lines: PricedSample[] = [];
  for (const variant of variants) {
    const mine = colorWords(variant);
    if (mine.size === 0) return null;
    const scored = rows.map((r) => ({ r, fit: materialFit(r.composition, mine) })).sort((a, b) => betterFit(a.fit, b.fit));
    const best = scored[0];
    const tiedPrices = [...new Set(scored.filter((x) => sameFit(x.fit, best.fit)).map((x) => x.r.fob))];
    if (best.fit.hits === 0 || tiedPrices.length > 1) return null;
    lines.push({
      sampleId: sample.id,
      sampleNumber: sample.sampleNumber,
      styleName: sample.styleName || rows[0].styleName,
      variantId: variant.id,
      color: variant.color,
      fobNow: variant.fob,
      fob: best.r.fob as number,
      matchedOn: on,
      why: `${variant.material ? `material “${variant.material}”` : `color “${variant.color}”`} matches “${best.r.composition}”`,
    });
  }
  return lines;
}

/** Decide, per sample, which price on the list is the right one. */
export function matchPrices(priceRows: PriceRow[], samples: MatchSample[]): FobMatchReport {
  const byNumber = new Map<string, MatchSample>();
  const byStyleNumber = new Map<string, MatchSample[]>();
  const byColorStyleNumber = new Map<string, { sample: MatchSample; variant: Variant }[]>();
  const sampleWords = new Map<string, Set<string>>();
  for (const s of samples) {
    byNumber.set(key(s.sampleNumber), s);
    sampleWords.set(s.id, new Set([...words(s.material), ...words(s.composition)]));
    if (s.styleNumber) {
      const list = byStyleNumber.get(key(s.styleNumber)) ?? [];
      list.push(s);
      byStyleNumber.set(key(s.styleNumber), list);
    }
    for (const variant of s.variants ?? []) {
      if (!variant.styleNumber) continue;
      const list = byColorStyleNumber.get(key(variant.styleNumber)) ?? [];
      list.push({ sample: s, variant });
      byColorStyleNumber.set(key(variant.styleNumber), list);
    }
  }

  // Point each price row at a sample that already exists: exact number, then
  // the number without its variant letter, then the same two against Style #
  // — and only when exactly one sample carries it.
  const resolve = (row: PriceRow) => {
    // A color that carries the factory's own style number needs no guesswork:
    // the row names it outright, material and all.
    for (const k of [key(row.style), key(row.base)]) {
      const hits = byColorStyleNumber.get(k);
      if (hits?.length === 1) return { sample: hits[0].sample, variant: hits[0].variant, on: "TP style # on the color" };
    }
    for (const k of [key(row.style), key(row.base)]) {
      const hit = byNumber.get(k);
      if (hit) return { sample: hit, on: k === key(row.style) ? "sample #" : "sample # (variant folded in)" };
    }
    let ambiguous = 0;
    for (const k of [key(row.style), key(row.base)]) {
      const hits = byStyleNumber.get(k);
      if (hits?.length === 1) return { sample: hits[0], on: "style #" };
      if (hits && hits.length > 1) ambiguous = Math.max(ambiguous, hits.length);
    }
    return { ambiguous };
  };

  const groups = new Map<string, { sample: MatchSample; variant?: Variant; on: string; rows: PriceRow[] }>();
  const unmatched = new Map<string, { rows: PriceRow[]; ambiguous: number }>();
  const noPrice: PriceRow[] = [];
  for (const row of priceRows) {
    if (row.fob === null) {
      noPrice.push(row);
      continue;
    }
    const { sample, variant, on, ambiguous } = resolve(row);
    if (!sample) {
      const g = unmatched.get(key(row.base)) ?? { rows: [], ambiguous: 0 };
      g.rows.push(row);
      g.ambiguous = Math.max(g.ambiguous, ambiguous ?? 0);
      unmatched.set(key(row.base), g);
      continue;
    }
    const target = variant?.id ?? sample.id;
    const g = groups.get(target) ?? { sample, variant, on: on!, rows: [] };
    g.rows.push(row);
    groups.set(target, g);
  }

  const priced: PricedSample[] = [];
  const skipped: UnpricedStyle[] = [];
  for (const { sample, variant, on, rows } of groups.values()) {
    const line = (fob: number, why: string): PricedSample => ({
      sampleId: sample.id,
      sampleNumber: sample.sampleNumber,
      styleName: sample.styleName || rows[0].styleName,
      ...(variant ? { variantId: variant.id, color: variant.color } : {}),
      fobNow: variant ? variant.fob : sample.fob,
      fob,
      matchedOn: on,
      why,
    });
    const prices = [...new Set(rows.map((r) => r.fob as number))];
    if (prices.length === 1) {
      priced.push(line(prices[0], rows.length > 1 ? `${rows.length} price rows, all ${prices[0]}` : "one price on the list"));
      continue;
    }
    // The rows belong to one color: its own material decides between them.
    if (variant) {
      const scored = rows.map((r) => ({ r, fit: materialFit(r.composition, colorWords(variant)) })).sort((a, b) => betterFit(a.fit, b.fit));
      const best = scored[0];
      const tiedPrices = [...new Set(scored.filter((x) => sameFit(x.fit, best.fit)).map((x) => x.r.fob))];
      if (best.fit.hits > 0 && tiedPrices.length === 1) {
        priced.push(line(best.r.fob as number, `material “${variant.material || variant.color}” matches “${best.r.composition}”`));
      } else {
        skipped.push({
          style: `${sample.sampleNumber} · ${variant.color}`,
          styleName: sample.styleName || rows[0].styleName,
          reason: "several prices for this color, and its material doesn't pick one",
          detail: rows.map((r) => `${r.fob} (${r.composition || "no composition"})`).join(" · "),
        });
      }
      continue;
    }

    // Several prices and several colors: the quote is probably per color
    // (suede, denim, raffia), so price the colors themselves — but only when
    // every one of them lands on a price of its own. A half-matched set would
    // leave the rest quietly falling back to a price meant for another
    // material, which is worse than leaving the lot for a human.
    const perColor = priceEachColor(rows, sample, on);
    if (perColor) {
      priced.push(...perColor);
      continue;
    }

    // Otherwise: let the sample's own material pick one price for all of it.
    const mine = sampleWords.get(sample.id)!;
    const scored = rows.map((r) => ({ r, fit: materialFit(r.composition, mine) })).sort((a, b) => betterFit(a.fit, b.fit));
    const best = scored[0];
    const tied = scored.filter((s) => sameFit(s.fit, best.fit));
    const tiedPrices = [...new Set(tied.map((s) => s.r.fob))];
    if (best.fit.hits > 0 && tiedPrices.length === 1) {
      const mat = [sample.material, sample.composition].filter(Boolean).join(" / ");
      priced.push(line(best.r.fob as number, `material “${mat}” matches “${best.r.composition}”`));
    } else {
      skipped.push({
        style: sample.sampleNumber,
        styleName: sample.styleName || rows[0].styleName,
        reason:
          best.fit.hits === 0
            ? "several prices, and this sample has no material to match them against"
            : "several prices, and the material doesn't single one out",
        detail: rows.map((r) => `${r.fob} (${r.composition || "no composition"})`).join(" · "),
      });
    }
  }
  for (const { rows, ambiguous } of unmatched.values()) {
    const r = rows[0];
    skipped.push({
      style: r.style,
      styleName: r.styleName,
      reason: ambiguous ? `style # is on ${ambiguous} samples — too ambiguous to price` : "no sample with that number",
      detail: `${rows.length} price row${rows.length > 1 ? "s" : ""}, e.g. row ${r.row}: ${r.fob} (${r.composition || "no composition"})`,
    });
  }
  for (const r of noPrice) {
    skipped.push({ style: r.style, styleName: r.styleName, reason: "no price on the list row", detail: `row ${r.row}` });
  }

  return {
    priceRows: priceRows.length,
    styles: new Set(priceRows.map((r) => key(r.base))).size,
    priced,
    changes: priced.filter((p) => p.fobNow !== p.fob),
    skipped,
  };
}
