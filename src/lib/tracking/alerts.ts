import { prisma } from "@/lib/db";
import { changeEta } from "@/lib/eta";
import { sendEmail } from "@/lib/email";
import { EtaRiskAlertEmail } from "@/emails/eta-risk-alert";
import { recomputeShipmentRisks, diffDays } from "@/lib/tracking/risk";
import type { NormalizedTrackingUpdate } from "@/lib/tracking/provider";
import { logAudit } from "@/lib/audit";
import { appUrl } from "@/lib/tokens";
import { formatDate } from "@/lib/date";

const RISK_LABEL: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  late_for_window: "Late for window",
  early_for_window: "Early for window",
  no_window: "No window set",
};

/**
 * Apply a tracking update (webhook, cron poll, or manual edit) to a shipment:
 * 1. ETA changes go through changeEta -> EtaRevision (never silent).
 * 2. Risk is recomputed across all linked customer POs.
 * 3. Alert emails go out only when a PO's risk worsens or the ETA moved >= 2
 *    days, and at most once per hour per shipment (no spam).
 */
export async function applyTrackingUpdate(
  shipmentId: string,
  update: NormalizedTrackingUpdate,
  source: "webhook" | "cron" | "manual",
  userId?: string | null,
): Promise<void> {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });

  const etaChanged =
    update.eta !== undefined &&
    (update.eta?.getTime() ?? null) !== (shipment.currentEta?.getTime() ?? null);
  const etaMoveDays =
    etaChanged && update.eta && shipment.currentEta
      ? Math.abs(diffDays(update.eta, shipment.currentEta))
      : etaChanged
        ? 999
        : 0;

  if (etaChanged) {
    await changeEta({
      parentType: "shipment",
      parentId: shipmentId,
      oldEta: shipment.currentEta,
      newEta: update.eta ?? null,
      reason: source === "manual" ? "Manual update" : `Tracking update (${source})`,
      userId: userId ?? null,
    });
  }

  const data: Record<string, unknown> = { lastTrackingSyncAt: new Date() };
  // First real ETA we see becomes the immutable original.
  if (!shipment.originalEta && update.eta) data.originalEta = update.eta;
  if (!shipment.originalEtd && update.etd) data.originalEtd = update.etd;
  if (update.etd !== undefined && update.etd) data.currentEtd = update.etd;
  if (update.ata !== undefined && update.ata) data.ata = update.ata;
  if (update.atd !== undefined && update.atd) data.atd = update.atd;
  if (update.vesselName) data.vesselName = update.vesselName;
  if (update.voyage) data.voyage = update.voyage;
  if (update.pol && !shipment.pol) data.pol = update.pol;
  if (update.pod && !shipment.pod) data.pod = update.pod;
  if (update.events.length > 0) {
    const history = Array.isArray(shipment.milestones) ? shipment.milestones : [];
    data.milestones = [...history, ...update.events].slice(-200);
  }
  // Status progression from actuals.
  if (update.ata) data.status = shipment.status === "delivered" ? "delivered" : "arrived_port";
  else if (update.atd && shipment.status === "booked") data.status = "in_transit";

  await prisma.shipment.update({ where: { id: shipmentId }, data });

  if (source !== "manual") {
    await logAudit({
      entityType: "shipment",
      entityId: shipmentId,
      action: `tracking_${source}_update`,
      actorLabel: "tracking",
      after: { eta: update.eta, ata: update.ata },
    });
  }

  const result = await recomputeShipmentRisks(shipmentId);

  // Alerting: only on worsening or a >= 2 day ETA move; coalesce to 1/hour.
  const shouldAlert = result.worsened.length > 0 || etaMoveDays >= 2;
  if (!shouldAlert) return;

  const fresh = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: {
      risks: { include: { customerPo: true } },
      purchaseOrders: { include: { issuedBy: true } },
    },
  });

  const setting = await prisma.appSetting.findUnique({ where: { key: `alert_ts_${shipmentId}` } });
  const lastTs = setting ? new Date(setting.value as string).getTime() : 0;
  if (Date.now() - lastTs < 60 * 60 * 1000) return; // coalesce within an hour
  await prisma.appSetting.upsert({
    where: { key: `alert_ts_${shipmentId}` },
    create: { key: `alert_ts_${shipmentId}`, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });

  const admins = await prisma.user.findMany({
    where: { role: "admin", isActive: true },
    select: { email: true },
  });
  const issuers = fresh.purchaseOrders
    .map((po) => po.issuedBy?.email)
    .filter((e): e is string => Boolean(e));
  const recipients = [...new Set([...admins.map((a) => a.email), ...issuers])];
  if (recipients.length === 0) return;

  await sendEmail({
    to: recipients,
    subject: `Shipment ${fresh.shipmentRef}: ETA change affects customer PO window`,
    react: EtaRiskAlertEmail({
      shipmentRef: fresh.shipmentRef,
      containerNumber: fresh.containerNumber,
      oldEta: etaChanged ? formatDate(shipment.currentEta) : null,
      newEta: formatDate(fresh.currentEta),
      slipDays: result.slipDays,
      projectedDelivery: formatDate(result.projectedDeliveryDate),
      rows: fresh.risks.map((r) => ({
        customerPoNumber: r.customerPo.customerPoNumber,
        customerName: r.customerPo.customerName,
        window: `${formatDate(r.customerPo.startShipDate)} – ${formatDate(r.customerPo.cancelDate)}`,
        status: RISK_LABEL[r.status] ?? r.status,
        bad: r.status !== "on_track" && r.status !== "no_window",
      })),
      shipmentUrl: appUrl(`/shipments/${shipmentId}`),
    }),
  });
}
