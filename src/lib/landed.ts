import { Prisma } from "@prisma/client";
import { toDecimal } from "@/lib/money";

/**
 * Landed cost per unit = FOB + (duty% of FOB) + freight per unit + inland per unit.
 * Returns null when FOB is unknown. Missing components are treated as zero so a
 * partially filled-in style still shows a best-known landed figure.
 */
export function landedCost(input: {
  fobCost: Prisma.Decimal | string | number | null | undefined;
  dutyRatePercent?: Prisma.Decimal | string | number | null;
  freightPerUnit?: Prisma.Decimal | string | number | null;
  inlandPerUnit?: Prisma.Decimal | string | number | null;
}): Prisma.Decimal | null {
  const fob = toDecimal(input.fobCost);
  if (fob === null) return null;
  const duty = toDecimal(input.dutyRatePercent) ?? new Prisma.Decimal(0);
  const freight = toDecimal(input.freightPerUnit) ?? new Prisma.Decimal(0);
  const inland = toDecimal(input.inlandPerUnit) ?? new Prisma.Decimal(0);
  return fob.plus(fob.times(duty).div(100)).plus(freight).plus(inland);
}

/** Margin % on sell price: (sell - cost) / sell * 100. Null when either is unknown or sell is 0. */
export function marginPercent(
  sellPrice: Prisma.Decimal | string | number | null | undefined,
  cost: Prisma.Decimal | string | number | null | undefined,
): Prisma.Decimal | null {
  const sell = toDecimal(sellPrice);
  const c = toDecimal(cost);
  if (sell === null || c === null || sell.isZero()) return null;
  return sell.minus(c).div(sell).times(100);
}
