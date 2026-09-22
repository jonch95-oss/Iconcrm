import { prisma } from "@/lib/db";
import { computeThreeWay, isFullyMatched } from "@/lib/match";
import { NEVER_OVERDUE_STATUSES, AWAITING_SAMPLE_STATUSES } from "@/lib/status";

/** Dashboard KPI counts. */
export async function dashboardMetrics() {
  const shipmentsLate = await prisma.shipmentRisk.count({
    where: { status: "late_for_window" },
  });
  const shipmentsAtRisk = await prisma.shipmentRisk.count({
    where: { status: { in: ["at_risk", "early_for_window"] } },
  });
  const now = new Date();

  const [openSamples, overdueSamples, pisAwaiting, unresolvedVariances, posInProduction] =
    await Promise.all([
      // "Open" = a physical sample is still owed. It used to mean "not closed
      // or dropped", which counted everything ever requested — a style received,
      // quoted, ordered and shipped stayed "open" until someone archived it by
      // hand, so the number only ever grew.
      prisma.sample.count({
        where: { status: { in: AWAITING_SAMPLE_STATUSES }, sampleReceivedDate: null },
      }),
      prisma.sample.count({
        where: {
          sampleReceivedDate: null,
          sampleEta: { lt: now },
          // Same rule the badges use — on hold is not late.
          status: { notIn: NEVER_OVERDUE_STATUSES },
        },
      }),
      prisma.proformaInvoice.count({
        where: { status: { in: ["received", "under_review"] } },
      }),
      prisma.pILine.count({
        where: { resolution: "pending", variance: { not: 0 } },
      }),
      prisma.purchaseOrder.count({
        where: { status: { in: ["in_production", "deposit_paid", "inspection"] } },
      }),
    ]);

  // Unmatched packing lists: PIs that have at least one packing list but are not
  // fully matched on the 3-way engine.
  const pisWithPacking = await prisma.proformaInvoice.findMany({
    where: { packingLists: { some: {} } },
    select: {
      id: true,
      lines: { select: { skuVariantId: true, quantity: true } },
      packingLists: { select: { lines: { select: { skuVariantId: true, unitsShipped: true } } } },
    },
  });
  let unmatchedPacking = 0;
  for (const pi of pisWithPacking) {
    const packingLines = pi.packingLists.flatMap((pl) => pl.lines);
    const result = computeThreeWay(pi.lines, packingLines);
    if (!isFullyMatched(result)) unmatchedPacking += 1;
  }

  return {
    shipmentsLate,
    shipmentsAtRisk,

    openSamples,
    overdueSamples,
    pisAwaiting,
    unresolvedVariances,
    posInProduction,
    unmatchedPacking,
  };
}
