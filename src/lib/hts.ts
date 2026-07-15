import type { Prisma } from "@prisma/client";

export interface HtsResolveRow {
  category: string;
  material: string;
  htsCode: string;
  totalTariff: Prisma.Decimal | number | null;
}

/**
 * Build a lookup from HtsMapping rows. Resolves (category, material) with an
 * exact match first, then a category-only (blank material) fallback.
 */
export function buildHtsResolver(rows: HtsResolveRow[]) {
  const map = new Map<string, { htsCode: string; totalTariff: number | null }>();
  for (const r of rows) {
    map.set(`${r.category.trim().toUpperCase()}|${r.material.trim().toUpperCase()}`, {
      htsCode: r.htsCode,
      totalTariff: r.totalTariff != null ? Number(r.totalTariff) : null,
    });
  }
  return (category: string | null | undefined, material: string | null | undefined) => {
    const c = (category ?? "").trim().toUpperCase();
    const m = (material ?? "").trim().toUpperCase();
    if (!c) return null;
    return map.get(`${c}|${m}`) ?? map.get(`${c}|`) ?? null;
  };
}
