import { Prisma, type PackingMatchStatus } from "@prisma/client";
import { fobVariance } from "@/lib/money";

// ---------------------------------------------------------------------------
// FOB match engine (PI unit price vs recorded sample FOB cost)
// ---------------------------------------------------------------------------

export interface FobLineResult {
  variance: Prisma.Decimal | null;
  variancePercent: Prisma.Decimal | null;
  matches: boolean; // variance === 0
  hasFob: boolean;
}

/** Compute the FOB match for a single PI line. */
export function computeFobLine(
  unitPrice: Prisma.Decimal | string | number,
  fob: Prisma.Decimal | string | number | null | undefined,
): FobLineResult {
  const result = fobVariance(unitPrice, fob);
  if (!result) {
    return { variance: null, variancePercent: null, matches: false, hasFob: false };
  }
  return {
    variance: result.variance,
    variancePercent: result.variancePercent,
    matches: result.variance.isZero(),
    hasFob: true,
  };
}

export interface FobSummary {
  totalLines: number;
  matchedLines: number;
  varianceLines: number;
  varianceTotal: Prisma.Decimal; // sum of (variance * quantity)
}

/** Summarize FOB match results across a PI's lines. */
export function summarizeFob(
  lines: { quantity: number; variance: Prisma.Decimal | null }[],
): FobSummary {
  let matched = 0;
  let varianceLines = 0;
  let varianceTotal = new Prisma.Decimal(0);
  for (const l of lines) {
    if (l.variance === null) continue;
    if (l.variance.isZero()) {
      matched += 1;
    } else {
      varianceLines += 1;
      varianceTotal = varianceTotal.plus(l.variance.times(l.quantity));
    }
  }
  return {
    totalLines: lines.length,
    matchedLines: matched,
    varianceLines,
    varianceTotal,
  };
}

// ---------------------------------------------------------------------------
// 3-way match engine (PI qty vs cumulative units shipped across packing lists)
// ---------------------------------------------------------------------------

export interface ThreeWayLine {
  skuVariantId: string;
  piQuantity: number;
  shippedQuantity: number; // cumulative across all packing lists on the PI
  remaining: number;
  status: PackingMatchStatus;
}

/**
 * Compute the cumulative 3-way match for a PI. PI line quantities are summed by
 * SKU; packing list line quantities are summed by SKU across ALL packing lists
 * (partial shipments are normal). Status per SKU:
 *   matched -> shipped === pi
 *   short   -> shipped < pi (remaining units outstanding)
 *   over    -> shipped > pi (red flag)
 */
export function computeThreeWay(
  piLines: { skuVariantId: string | null; quantity: number }[],
  packingLines: { skuVariantId: string; unitsShipped: number }[],
): { lines: ThreeWayLine[]; totalPi: number; totalShipped: number; openLines: number } {
  const piBySku = new Map<string, number>();
  for (const l of piLines) {
    if (!l.skuVariantId) continue;
    piBySku.set(l.skuVariantId, (piBySku.get(l.skuVariantId) ?? 0) + l.quantity);
  }

  const shippedBySku = new Map<string, number>();
  for (const l of packingLines) {
    shippedBySku.set(
      l.skuVariantId,
      (shippedBySku.get(l.skuVariantId) ?? 0) + l.unitsShipped,
    );
  }

  // Union of all SKUs that appear on either side.
  const skuIds = new Set<string>([...piBySku.keys(), ...shippedBySku.keys()]);

  const lines: ThreeWayLine[] = [];
  let totalPi = 0;
  let totalShipped = 0;
  let openLines = 0;

  for (const skuVariantId of skuIds) {
    const piQuantity = piBySku.get(skuVariantId) ?? 0;
    const shippedQuantity = shippedBySku.get(skuVariantId) ?? 0;
    const remaining = piQuantity - shippedQuantity;
    let status: PackingMatchStatus;
    if (shippedQuantity > piQuantity) status = "over";
    else if (shippedQuantity < piQuantity) status = "short";
    else status = "matched";

    if (status !== "matched") openLines += 1;
    totalPi += piQuantity;
    totalShipped += shippedQuantity;

    lines.push({ skuVariantId, piQuantity, shippedQuantity, remaining, status });
  }

  return { lines, totalPi, totalShipped, openLines };
}

/** True when every line is matched and there is at least one line. */
export function isFullyMatched(result: { lines: ThreeWayLine[]; openLines: number }): boolean {
  return result.lines.length > 0 && result.openLines === 0;
}


// ---------------------------------------------------------------------------
// PI vs Order Form reconciliation (do the PI's styles + quantities match what
// the order form actually ordered?)
// ---------------------------------------------------------------------------

export type OFMatchStatus = "matched" | "short" | "over" | "missing_on_pi" | "extra_on_pi";

export interface OFMatchRow {
  sampleId: string;
  sampleNumber: string;
  styleNumber: string | null;
  orderFormQty: number;
  piQty: number;
  diff: number; // piQty - orderFormQty
  status: OFMatchStatus;
}

export interface OFMatchResult {
  rows: OFMatchRow[];
  matchedCount: number;
  issueCount: number;
  ok: boolean; // every style matched and there is at least one row
}

interface OFMatchLine {
  sampleId: string | null;
  sampleNumber: string;
  styleNumber: string | null;
  quantity: number;
}

/**
 * Compare an order form's lines to a PI's lines, grouped by sample (style).
 * Flags styles that are short, over, missing from the PI, or extra on the PI.
 */
export function compareToOrderForm(ofLines: OFMatchLine[], piLines: OFMatchLine[]): OFMatchResult {
  const ofQty = new Map<string, number>();
  const piQty = new Map<string, number>();
  const labels = new Map<string, { sampleNumber: string; styleNumber: string | null }>();

  const tally = (lines: OFMatchLine[], target: Map<string, number>) => {
    for (const l of lines) {
      if (!l.sampleId) continue;
      target.set(l.sampleId, (target.get(l.sampleId) ?? 0) + (l.quantity || 0));
      if (!labels.has(l.sampleId)) {
        labels.set(l.sampleId, { sampleNumber: l.sampleNumber, styleNumber: l.styleNumber });
      }
    }
  };
  tally(ofLines, ofQty);
  tally(piLines, piQty);

  const rows: OFMatchRow[] = [];
  let matchedCount = 0;
  let issueCount = 0;
  for (const sampleId of new Set([...ofQty.keys(), ...piQty.keys()])) {
    const o = ofQty.get(sampleId) ?? 0;
    const p = piQty.get(sampleId) ?? 0;
    let status: OFMatchStatus;
    if (o > 0 && p === 0) status = "missing_on_pi";
    else if (o === 0 && p > 0) status = "extra_on_pi";
    else if (p === o) status = "matched";
    else if (p < o) status = "short";
    else status = "over";
    if (status === "matched") matchedCount += 1;
    else issueCount += 1;
    const lab = labels.get(sampleId)!;
    rows.push({
      sampleId,
      sampleNumber: lab.sampleNumber,
      styleNumber: lab.styleNumber,
      orderFormQty: o,
      piQty: p,
      diff: p - o,
      status,
    });
  }
  rows.sort((a, b) => a.sampleNumber.localeCompare(b.sampleNumber));
  return { rows, matchedCount, issueCount, ok: issueCount === 0 && rows.length > 0 };
}


// ---------------------------------------------------------------------------
// Customer PO vs internal PO reconciliation (by style number + quantity)
// ---------------------------------------------------------------------------

export type StyleMatchStatus = "matched" | "short" | "over" | "missing_on_po" | "extra_on_po";

export interface StyleMatchRow {
  styleNumber: string;
  customerQty: number;
  poQty: number;
  diff: number; // poQty - customerQty
  status: StyleMatchStatus;
}

export interface StyleMatchResult {
  rows: StyleMatchRow[];
  matchedCount: number;
  issueCount: number;
  ok: boolean;
}

const normStyle = (s: string) => s.trim().toUpperCase();

/**
 * Compare a customer PO's lines (their demand) to what our internal PO(s)
 * actually ordered, grouped by style number. Flags styles we're short/over on,
 * styles the customer wants that aren't on our PO, and styles on our PO that
 * aren't on the customer PO.
 */
export function compareCustomerPoToPo(
  customerLines: { styleNumber: string; quantity: number }[],
  poLines: { styleNumber: string; quantity: number }[],
): StyleMatchResult {
  const cust = new Map<string, number>();
  const po = new Map<string, number>();
  const display = new Map<string, string>();
  const tally = (lines: { styleNumber: string; quantity: number }[], target: Map<string, number>) => {
    for (const l of lines) {
      const key = normStyle(l.styleNumber);
      if (!key) continue;
      target.set(key, (target.get(key) ?? 0) + (l.quantity || 0));
      if (!display.has(key)) display.set(key, l.styleNumber.trim());
    }
  };
  tally(customerLines, cust);
  tally(poLines, po);

  const rows: StyleMatchRow[] = [];
  let matchedCount = 0;
  let issueCount = 0;
  for (const key of new Set([...cust.keys(), ...po.keys()])) {
    const c = cust.get(key) ?? 0;
    const p = po.get(key) ?? 0;
    let status: StyleMatchStatus;
    if (c > 0 && p === 0) status = "missing_on_po";
    else if (c === 0 && p > 0) status = "extra_on_po";
    else if (p === c) status = "matched";
    else if (p < c) status = "short";
    else status = "over";
    if (status === "matched") matchedCount += 1;
    else issueCount += 1;
    rows.push({ styleNumber: display.get(key) ?? key, customerQty: c, poQty: p, diff: p - c, status });
  }
  rows.sort((a, b) => a.styleNumber.localeCompare(b.styleNumber));
  return { rows, matchedCount, issueCount, ok: issueCount === 0 && rows.length > 0 };
}
