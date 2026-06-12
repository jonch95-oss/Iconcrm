import { prisma } from "@/lib/db";
import type { RiskStatus } from "@prisma/client";
import { getSettings } from "@/lib/settings";

// ---------------------------------------------------------------------------
// Shipment risk engine
//
// projectedDeliveryDate = (ata ?? currentEta) + inlandBufferDays
// Compared against every linked customer PO's delivery window:
//   late_for_window  -> projected > cancelDate            (red)
//   at_risk          -> projected within N days of cancel (amber)
//   early_for_window -> projected < startShipDate         (amber — chargebacks)
//   on_track         -> inside the window                 (green)
//   no_window        -> customer PO has no dates yet      (gray)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

export interface RiskInput {
  projectedDeliveryDate: Date | null;
  startShipDate: Date | null;
  cancelDate: Date | null;
  riskThresholdDays: number;
}

/** Pure window check — unit-testable, no I/O. */
export function computeRiskStatus(input: RiskInput): RiskStatus {
  const { projectedDeliveryDate: p, startShipDate, cancelDate, riskThresholdDays } = input;
  if (!startShipDate && !cancelDate) return "no_window";
  if (!p) return "no_window";
  if (cancelDate && p.getTime() > cancelDate.getTime()) return "late_for_window";
  if (cancelDate && diffDays(cancelDate, p) <= riskThresholdDays) return "at_risk";
  if (startShipDate && p.getTime() < startShipDate.getTime()) return "early_for_window";
  return "on_track";
}

/** Rank for "did the status get worse?" alerting. Higher = worse. */
const SEVERITY: Record<RiskStatus, number> = {
  no_window: 0,
  on_track: 0,
  early_for_window: 1,
  at_risk: 1,
  late_for_window: 2,
};

export function isWorse(prev: RiskStatus | null, next: RiskStatus): boolean {
  return SEVERITY[next] > (prev ? SEVERITY[prev] : 0);
}

export interface RecomputeResult {
  shipmentId: string;
  projectedDeliveryDate: Date | null;
  slipDays: number | null;
  /** Risk rows whose status got worse in this recompute (for alerting). */
  worsened: {
    customerPoId: string;
    customerPoNumber: string;
    customerName: string;
    cancelDate: Date | null;
    startShipDate: Date | null;
    previous: RiskStatus | null;
    next: RiskStatus;
  }[];
  risks: { customerPoId: string; status: RiskStatus }[];
}

/**
 * Recompute and persist ShipmentRisk rows for one shipment across every
 * customer PO reachable through the chain:
 *   shipment -> packing lists -> PI -> PO -> CustomerPoLink -> customer PO
 *   shipment -> directly linked POs -> CustomerPoLink -> customer PO
 * Call after any ETA change, link change, or customer PO date edit.
 */
export async function recomputeShipmentRisks(shipmentId: string): Promise<RecomputeResult> {
  const settings = await getSettings();

  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: {
      packingLists: {
        include: {
          pi: {
            include: {
              purchaseOrders: {
                include: { customerPoLinks: { include: { customerPo: true } } },
              },
            },
          },
        },
      },
      purchaseOrders: {
        include: { customerPoLinks: { include: { customerPo: true } } },
      },
      risks: true,
    },
  });

  // Collect distinct customer POs from both paths.
  const customerPos = new Map<
    string,
    { id: string; customerPoNumber: string; customerName: string; startShipDate: Date | null; cancelDate: Date | null }
  >();
  const collect = (cpo: {
    id: string;
    customerPoNumber: string;
    customerName: string;
    startShipDate: Date | null;
    cancelDate: Date | null;
  }) => customerPos.set(cpo.id, cpo);

  for (const po of shipment.purchaseOrders) {
    for (const link of po.customerPoLinks) collect(link.customerPo);
  }
  for (const pl of shipment.packingLists) {
    for (const po of pl.pi.purchaseOrders) {
      for (const link of po.customerPoLinks) collect(link.customerPo);
    }
  }

  const arrivalBasis = shipment.ata ?? shipment.currentEta;
  const projected = arrivalBasis ? addDays(arrivalBasis, shipment.inlandBufferDays) : null;
  const slipDays =
    shipment.currentEta && shipment.originalEta
      ? diffDays(shipment.currentEta, shipment.originalEta)
      : null;

  const previousByCpo = new Map(shipment.risks.map((r) => [r.customerPoId, r.status]));
  const worsened: RecomputeResult["worsened"] = [];
  const risks: RecomputeResult["risks"] = [];

  for (const cpo of customerPos.values()) {
    const status = computeRiskStatus({
      projectedDeliveryDate: projected,
      startShipDate: cpo.startShipDate,
      cancelDate: cpo.cancelDate,
      riskThresholdDays: settings.riskThresholdDays,
    });
    const previous = previousByCpo.get(cpo.id) ?? null;
    if (isWorse(previous, status)) {
      worsened.push({
        customerPoId: cpo.id,
        customerPoNumber: cpo.customerPoNumber,
        customerName: cpo.customerName,
        cancelDate: cpo.cancelDate,
        startShipDate: cpo.startShipDate,
        previous,
        next: status,
      });
    }
    risks.push({ customerPoId: cpo.id, status });

    await prisma.shipmentRisk.upsert({
      where: { shipmentId_customerPoId: { shipmentId, customerPoId: cpo.id } },
      create: {
        shipmentId,
        customerPoId: cpo.id,
        status,
        projectedDeliveryDate: projected,
        slipDays,
      },
      update: { status, projectedDeliveryDate: projected, slipDays, computedAt: new Date() },
    });
  }

  // Drop risk rows for customer POs no longer linked.
  const liveIds = new Set(customerPos.keys());
  const stale = shipment.risks.filter((r) => !liveIds.has(r.customerPoId));
  if (stale.length > 0) {
    await prisma.shipmentRisk.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  }

  return { shipmentId, projectedDeliveryDate: projected, slipDays, worsened, risks };
}

/** Recompute every shipment that touches a given customer PO (after its dates change). */
export async function recomputeRisksForCustomerPo(customerPoId: string): Promise<void> {
  const links = await prisma.customerPoLink.findMany({
    where: { customerPoId },
    include: {
      purchaseOrder: {
        include: {
          shipments: { select: { id: true } },
          pi: { include: { packingLists: { select: { shipmentId: true } } } },
        },
      },
    },
  });
  const shipmentIds = new Set<string>();
  for (const link of links) {
    for (const s of link.purchaseOrder.shipments) shipmentIds.add(s.id);
    for (const pl of link.purchaseOrder.pi.packingLists) {
      if (pl.shipmentId) shipmentIds.add(pl.shipmentId);
    }
  }
  // Also any risk rows that already exist for this customer PO.
  const existing = await prisma.shipmentRisk.findMany({
    where: { customerPoId },
    select: { shipmentId: true },
  });
  for (const r of existing) shipmentIds.add(r.shipmentId);

  for (const id of shipmentIds) await recomputeShipmentRisks(id);
}
