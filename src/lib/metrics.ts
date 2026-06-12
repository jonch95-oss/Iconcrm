import { prisma } from "@/lib/db";
import { computeThreeWay, isFullyMatched } from "@/lib/match";

/** Dashboard KPI counts. */
export async function dashboardMetrics() {
  const now = new Date();

  const [openSamples, overdueSamples, pisAwaiting, unresolvedVariances, posInProduction] =
    await Promise.all([
      prisma.sample.count({
        where: { status: { notIn: ["closed", "dropped"] } },
      }),
      prisma.sample.count({
        where: {
          sampleReceivedDate: null,
          sampleEta: { lt: now },
          status: { notIn: ["closed", "dropped", "packing_list_matched", "shipped"] },
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
    openSamples,
    overdueSamples,
    pisAwaiting,
    unresolvedVariances,
    posInProduction,
    unmatchedPacking,
  };
}
