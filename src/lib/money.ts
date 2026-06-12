import { Prisma } from "@prisma/client";

export type Currency = "USD" | "RMB" | "EUR";

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  RMB: "¥",
  EUR: "€",
};

/** Coerce any Decimal-ish value to a Prisma.Decimal (never float math). */
export function toDecimal(
  value: Prisma.Decimal | string | number | null | undefined,
): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return new Prisma.Decimal(value);
  } catch {
    return null;
  }
}

/** Format a money value with currency symbol, 2 decimal places, thousands grouping. */
export function formatMoney(
  value: Prisma.Decimal | string | number | null | undefined,
  currency: string = "USD",
): string {
  const d = toDecimal(value);
  if (d === null) return "—";
  const symbol = CURRENCY_SYMBOL[currency] ?? "";
  const sign = d.isNegative() ? "-" : "";
  const abs = d.abs().toFixed(2);
  const [int, frac] = abs.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${symbol}${grouped}.${frac}`;
}

/** Format a percent value (already in percentage units, e.g. 12.5 -> "12.5%"). */
export function formatPercent(
  value: Prisma.Decimal | string | number | null | undefined,
  digits = 1,
): string {
  const d = toDecimal(value);
  if (d === null) return "—";
  const sign = d.isPositive() ? "+" : "";
  return `${sign}${d.toFixed(digits)}%`;
}

/**
 * Compute margin percent given a sell price and FOB cost.
 * margin% = (sell - fob) / sell * 100. Returns null if inputs missing/invalid.
 */
export function marginPercent(
  sell: Prisma.Decimal | string | number | null | undefined,
  fob: Prisma.Decimal | string | number | null | undefined,
): Prisma.Decimal | null {
  const s = toDecimal(sell);
  const f = toDecimal(fob);
  if (s === null || f === null || s.isZero()) return null;
  return s.minus(f).dividedBy(s).times(100);
}

/**
 * FOB variance between a PI unit price and the recorded FOB cost.
 * Returns { variance, variancePercent } or null when fob is missing.
 */
export function fobVariance(
  unitPrice: Prisma.Decimal | string | number,
  fob: Prisma.Decimal | string | number | null | undefined,
): { variance: Prisma.Decimal; variancePercent: Prisma.Decimal | null } | null {
  const u = toDecimal(unitPrice);
  const f = toDecimal(fob);
  if (u === null || f === null) return null;
  const variance = u.minus(f);
  const variancePercent = f.isZero() ? null : variance.dividedBy(f).times(100);
  return { variance, variancePercent };
}
