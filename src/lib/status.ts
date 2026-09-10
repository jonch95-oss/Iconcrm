import type { SampleStatus, POStatus, ShipmentStatus, RiskStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Sample lifecycle pipeline (single source of truth)
// ---------------------------------------------------------------------------

export const SAMPLE_PIPELINE: SampleStatus[] = [
  "sample_requested",
  "eta_set",
  "sample_received",
  "quoted",
  "on_order_form",
  "pi_received",
  "pi_matched",
  "po_issued",
  "in_production",
  "shipped",
  "packing_list_matched",
  "closed",
];

export const SAMPLE_STATUS_LABEL: Record<SampleStatus, string> = {
  sample_requested: "Sample Requested",
  eta_set: "ETA Set",
  sample_received: "Sample Received",
  quoted: "Quoted (FOB)",
  on_order_form: "On Order Form",
  pi_received: "PI Received",
  pi_matched: "PI Matched",
  po_issued: "PO Issued",
  in_production: "In Production",
  shipped: "Shipped",
  packing_list_matched: "Packing List Matched",
  closed: "Closed",
  revisions_requested: "Revisions Requested",
  on_hold: "On Hold",
  produced_without_sample: "Produced w/o Sample",
  approved_by_image: "Approved by Image",
  dropped: "Dropped",
};

export type BadgeTone =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

export const SAMPLE_STATUS_TONE: Record<SampleStatus, BadgeTone> = {
  sample_requested: "secondary",
  eta_set: "secondary",
  sample_received: "default",
  quoted: "default",
  on_order_form: "default",
  pi_received: "warning",
  pi_matched: "warning",
  po_issued: "default",
  in_production: "default",
  shipped: "default",
  packing_list_matched: "success",
  closed: "success",
  revisions_requested: "warning",
  on_hold: "warning",
  produced_without_sample: "default",
  approved_by_image: "success",
  dropped: "destructive",
};

/** Numeric rank of a sample status along the pipeline (dropped = -1). */
export function sampleRank(status: SampleStatus): number {
  if (status === "dropped") return -1;
  return SAMPLE_PIPELINE.indexOf(status);
}

/**
 * Advance a status forward only (never regress automatically). Returns the
 * later of the current and target statuses. Used by automatic transitions so
 * that, e.g., entering a received date never pulls a PO-issued sample back.
 */
export function advanceSampleStatus(
  current: SampleStatus,
  target: SampleStatus,
): SampleStatus {
  if (current === "dropped" || current === "on_hold" || current === "produced_without_sample") return current;
  return sampleRank(target) > sampleRank(current) ? target : current;
}

// ---------------------------------------------------------------------------
// PO production sub-pipeline
// ---------------------------------------------------------------------------

export const PO_PIPELINE: POStatus[] = [
  "issued",
  "deposit_paid",
  "in_production",
  "inspection",
  "ready_to_ship",
  "shipped",
  "delivered",
];

export const PO_STATUS_LABEL: Record<POStatus, string> = {
  issued: "Issued",
  deposit_paid: "Deposit Paid",
  in_production: "In Production",
  inspection: "Inspection",
  ready_to_ship: "Ready to Ship",
  shipped: "Shipped",
  delivered: "Delivered",
};

export const PO_STATUS_TONE: Record<POStatus, BadgeTone> = {
  issued: "secondary",
  deposit_paid: "default",
  in_production: "default",
  inspection: "warning",
  ready_to_ship: "default",
  shipped: "default",
  delivered: "success",
};

export function poRank(status: POStatus): number {
  return PO_PIPELINE.indexOf(status);
}

/** Next PO production status, or null if already delivered. */
export function nextPoStatus(status: POStatus): POStatus | null {
  const idx = poRank(status);
  return idx >= 0 && idx < PO_PIPELINE.length - 1 ? PO_PIPELINE[idx + 1] : null;
}

export const DROPPED_REASON_LABEL: Record<string, string> = {
  customer_passed: "Customer passed",
  price_too_high: "Price too high",
  quality_fail: "Quality fail",
  factory_issue: "Factory issue",
  other: "Other",
};

export const SHIPMENT_PIPELINE: ShipmentStatus[] = [
  "booked",
  "in_transit",
  "arrived_port",
  "inland",
  "delivered",
];

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  booked: "Booked",
  in_transit: "On the water",
  arrived_port: "Arrived at port",
  inland: "Inland to customer",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const SHIPMENT_STATUS_TONE: Record<ShipmentStatus, BadgeTone> = {
  booked: "secondary",
  in_transit: "default",
  arrived_port: "default",
  inland: "default",
  delivered: "success",
  cancelled: "destructive",
};

export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  late_for_window: "Late for window",
  early_for_window: "Early for window",
  no_window: "No window set",
};

export const RISK_STATUS_TONE: Record<RiskStatus, BadgeTone> = {
  on_track: "success",
  at_risk: "warning",
  late_for_window: "destructive",
  early_for_window: "warning",
  no_window: "secondary",
};

/** Worst-of for a set of risk statuses (for table rollups). */
const RISK_RANK: Record<RiskStatus, number> = {
  no_window: 0,
  on_track: 1,
  early_for_window: 2,
  at_risk: 3,
  late_for_window: 4,
};
export function worstRisk(statuses: RiskStatus[]): RiskStatus | null {
  if (statuses.length === 0) return null;
  return statuses.reduce((a, b) => (RISK_RANK[b] > RISK_RANK[a] ? b : a));
}

// ---------------------------------------------------------------------------
// Receipt rollup across a sample's colors (SKU variants).
// ---------------------------------------------------------------------------

export type SampleReceipt = {
  /** none = nothing in yet, partial = some colors in, all = every color in. */
  state: "none" | "partial" | "all";
  received: number;
  total: number;
};

/** Count how many of a sample's colors have physically arrived. */
export function sampleReceipt(variants: readonly { received: boolean }[]): SampleReceipt {
  const total = variants.length;
  const received = variants.reduce((n, v) => n + (v.received ? 1 : 0), 0);
  const state = total === 0 || received === 0 ? "none" : received === total ? "all" : "partial";
  return { state, received, total };
}

/**
 * What a sample's status badge should actually say. A master sample is only
 * as received as its colors: with 2 of 5 in the stored status would either
 * claim "Sample Received" (it isn't — three are still coming) or sit at
 * "Sample Requested" (also wrong — two are on the desk). So while the sample
 * is still in the receiving stretch of the pipeline, the colors decide the
 * label; past that (quoted, on order form, dropped, on hold...) the stored
 * status is the real state and wins.
 */
export function sampleStatusDisplay(
  status: SampleStatus,
  variants: readonly { received: boolean }[] = [],
): { label: string; tone: BadgeTone; hint?: string } {
  const stored = { label: SAMPLE_STATUS_LABEL[status], tone: SAMPLE_STATUS_TONE[status] };
  const receiving = status === "sample_requested" || status === "eta_set" || status === "sample_received";
  if (!receiving) return stored;
  const { state, received, total } = sampleReceipt(variants);
  if (state === "partial")
    return {
      label: `Partial · ${received} of ${total}`,
      tone: "warning",
      hint: `${received} of ${total} colors received — waiting on the rest to come in.`,
    };
  if (state === "all")
    return {
      label: SAMPLE_STATUS_LABEL.sample_received,
      tone: SAMPLE_STATUS_TONE.sample_received,
      hint: `All ${total} color${total === 1 ? "" : "s"} received.`,
    };
  return stored;
}

// ---------------------------------------------------------------------------
// Per-color (SKU variant) sample state — derived, not a stored enum.
// ---------------------------------------------------------------------------
export function variantSampleStatus(v: {
  received?: boolean;
  revisionsRequestedAt?: Date | string | null;
  sampleEta?: Date | string | null;
}): { label: string; tone: BadgeTone } {
  if (v.received) return { label: "Received", tone: "success" };
  if (v.revisionsRequestedAt) return { label: "Revisions Requested", tone: "warning" };
  if (v.sampleEta) return { label: "ETA Set", tone: "secondary" };
  return { label: "Requested", tone: "secondary" };
}
