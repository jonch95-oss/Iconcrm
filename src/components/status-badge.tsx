import { Badge } from "@/components/ui/badge";
import type { SampleStatus, POStatus, PIStatus, PackingMatchStatus, ShipmentStatus, RiskStatus } from "@prisma/client";
import {
  sampleStatusDisplay,
  PO_STATUS_LABEL,
  PO_STATUS_TONE,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUS_TONE,
  RISK_STATUS_LABEL,
  RISK_STATUS_TONE,
  type BadgeTone,
} from "@/lib/status";

/**
 * Sample status. Pass the sample's colors (SKU variants) and the badge tells
 * the truth about a part-shipment: all colors in reads "Sample Received",
 * some in reads "Partial - 2 of 5" so it's clear the rest is still coming.
 */
export function SampleStatusBadge({
  status,
  variants,
}: {
  status: SampleStatus;
  variants?: readonly { received: boolean }[];
}) {
  const { label, tone, hint } = sampleStatusDisplay(status, variants);
  return <Badge variant={tone} title={hint}>{label}</Badge>;
}

export function PoStatusBadge({ status }: { status: POStatus }) {
  return <Badge variant={PO_STATUS_TONE[status]}>{PO_STATUS_LABEL[status]}</Badge>;
}

const PI_TONE: Record<PIStatus, BadgeTone> = {
  received: "secondary",
  under_review: "warning",
  approved: "success",
  disputed: "destructive",
};
const PI_LABEL: Record<PIStatus, string> = {
  received: "Received",
  under_review: "Under Review",
  approved: "Approved",
  disputed: "Disputed",
};

export function PiStatusBadge({ status }: { status: PIStatus }) {
  return <Badge variant={PI_TONE[status]}>{PI_LABEL[status]}</Badge>;
}

const MATCH_TONE: Record<PackingMatchStatus, BadgeTone> = {
  matched: "success",
  short: "warning",
  over: "destructive",
};

export function MatchStatusBadge({ status }: { status: PackingMatchStatus }) {
  return <Badge variant={MATCH_TONE[status]} className="capitalize">{status}</Badge>;
}

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <Badge variant={SHIPMENT_STATUS_TONE[status]}>{SHIPMENT_STATUS_LABEL[status]}</Badge>;
}

export function RiskBadge({ status }: { status: RiskStatus }) {
  return <Badge variant={RISK_STATUS_TONE[status]}>{RISK_STATUS_LABEL[status]}</Badge>;
}
