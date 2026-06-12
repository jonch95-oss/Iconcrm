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
