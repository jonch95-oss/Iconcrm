import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toDecimal } from "@/lib/money";

// ---------------------------------------------------------------------------
// PO-level P&L
//
// Costs come from what we actually agreed to pay the factory (PI line unit
// price), plus the per-unit landed inputs recorded on each style (duty %,
// freight, inland). Revenue comes from the style's customer sell price.
// Missing inputs are treated as zero and surfaced via completeness flags so
// the UI can say "estimate — 3 styles missing a sell price".
// ---------------------------------------------------------------------------

const D = (v: Prisma.Decimal | string | number | null | undefined) =>
  toDecimal(v) ?? new Prisma.Decimal(0);

export interface PnlLine {
  label: string; // style # / name
  sampleId: string | null;
  units: number;
  fob: Prisma.Decimal;
  duty: Prisma.Decimal;
  freight: Prisma.Decimal;
  inland: Prisma.Decimal;
  landed: Prisma.Decimal;
  revenue: Prisma.Decimal;
  profit: Prisma.Decimal;
  marginPct: Prisma.Decimal | null; // null when revenue unknown/zero
  missingSell: boolean;
  missingLanded: boolean; // no duty/freight/inland recorded at all
}

export interface PoPnl {
  units: number;
  fob: Prisma.Decimal;
  duty: Prisma.Decimal;
  freight: Prisma.Decimal;
  inland: Prisma.Decimal;
  landed: Prisma.Decimal;
  revenue: Prisma.Decimal;
  profit: Prisma.Decimal;
  marginPct: Prisma.Decimal | null;
  currency: string;
  lines: PnlLine[];
  linesMissingSell: number;
  linesMissingLanded: number;
}

interface PnlInputLine {
  quantity: number;
  unitPrice: Prisma.Decimal | string | number;
  sample: {
    id: string;
    styleNumber: string | null;
    styleName: string | null;
    sampleNumber: string;
    currency: string;
    dutyRatePercent: Prisma.Decimal | null;
    freightPerUnit: Prisma.Decimal | null;
    inlandPerUnit: Prisma.Decimal | null;
    customerSellPrice: Prisma.Decimal | null;
  } | null;
}

/** Pure computation — unit-testable. */
export function computePoPnl(inputLines: PnlInputLine[]): PoPnl {
  const zero = new Prisma.Decimal(0);
  const lines: PnlLine[] = [];
  // Aggregate identical samples (a PI can carry one line per SKU variant).
  const bySample = new Map<string, PnlInputLine[]>();
  for (const l of inputLines) {
    const key = l.sample?.id ?? `__nosample_${bySample.size}`;
    const arr = bySample.get(key) ?? [];
    arr.push(l);
    bySample.set(key, arr);
  }

  for (const group of bySample.values()) {
    const s = group[0].sample;
    const units = group.reduce((n, l) => n + l.quantity, 0);
    let fob = zero;
    for (const l of group) fob = fob.plus(D(l.unitPrice).times(l.quantity));

    const dutyRate = D(s?.dutyRatePercent);
    const duty = fob.times(dutyRate).div(100);
    const freight = D(s?.freightPerUnit).times(units);
    const inland = D(s?.inlandPerUnit).times(units);
    const landed = fob.plus(duty).plus(freight).plus(inland);

    const sell = toDecimal(s?.customerSellPrice);
    const revenue = sell ? sell.times(units) : zero;
    const profit = revenue.minus(landed);
    const marginPct = sell && !revenue.isZero() ? profit.div(revenue).times(100) : null;

    lines.push({
      label: s ? (s.styleNumber ?? s.sampleNumber) + (s.styleName ? ` — ${s.styleName}` : "") : "Unassigned line",
      sampleId: s?.id ?? null,
      units,
      fob,
      duty,
      freight,
      inland,
      landed,
      revenue,
      profit,
      marginPct,
      missingSell: !sell,
      missingLanded: !s?.dutyRatePercent && !s?.freightPerUnit && !s?.inlandPerUnit,
    });
  }

  const sum = (pickField: (l: PnlLine) => Prisma.Decimal) =>
    lines.reduce((acc, l) => acc.plus(pickField(l)), zero);

  const revenue = sum((l) => l.revenue);
  const landed = sum((l) => l.landed);
  const profit = revenue.minus(landed);

  return {
    units: lines.reduce((n, l) => n + l.units, 0),
    fob: sum((l) => l.fob),
    duty: sum((l) => l.duty),
    freight: sum((l) => l.freight),
    inland: sum((l) => l.inland),
    landed,
    revenue,
    profit,
    marginPct: revenue.isZero() ? null : profit.div(revenue).times(100),
    currency: inputLines[0]?.sample?.currency ?? "USD",
    lines: lines.sort((a, b) => b.profit.comparedTo(a.profit)),
    linesMissingSell: lines.filter((l) => l.missingSell).length,
    linesMissingLanded: lines.filter((l) => l.missingLanded).length,
  };
}

/** Load and compute the P&L for one PO (costs from its PI's lines). */
export async function getPoPnl(poId: string): Promise<PoPnl | null> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: {
      pi: {
        select: {
          lines: {
            select: {
              quantity: true,
              unitPrice: true,
              sample: {
                select: {
                  id: true,
                  styleNumber: true,
                  styleName: true,
                  sampleNumber: true,
                  currency: true,
                  dutyRatePercent: true,
                  freightPerUnit: true,
                  inlandPerUnit: true,
                  customerSellPrice: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!po) return null;
  if (po.pi.lines.length === 0) return null;
  return computePoPnl(po.pi.lines);
}
