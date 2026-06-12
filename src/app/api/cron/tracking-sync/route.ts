import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/cron";
import { getTrackingProvider } from "@/lib/tracking/provider";
import { applyTrackingUpdate } from "@/lib/tracking/alerts";
import { recomputeShipmentRisks } from "@/lib/tracking/risk";

/**
 * Daily reconciliation backstop: re-poll every active tracked shipment in case
 * a webhook was missed, and recompute risk for manual-mode shipments (windows
 * drift closer every day even when the ETA doesn't move). Idempotent.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const provider = getTrackingProvider();
  const active = await prisma.shipment.findMany({
    where: { status: { notIn: ["delivered", "cancelled"] } },
    select: { id: true, trackingSubscriptionId: true },
  });

  let polled = 0;
  let recomputed = 0;
  for (const s of active) {
    try {
      if (provider.configured && s.trackingSubscriptionId) {
        const update = await provider.fetchLatest(s.trackingSubscriptionId);
        if (update) {
          await applyTrackingUpdate(s.id, update, "cron");
          polled += 1;
          continue;
        }
      }
      await recomputeShipmentRisks(s.id);
      recomputed += 1;
    } catch (err) {
      console.error(`tracking-sync failed for shipment ${s.id}:`, err);
    }
  }
  return NextResponse.json({ ok: true, polled, recomputed, total: active.length });
}
