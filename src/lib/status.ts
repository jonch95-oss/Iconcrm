import type { SampleStatus, POStatus } from "@prisma/client";

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
  if (current === "dropped") return current;
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
