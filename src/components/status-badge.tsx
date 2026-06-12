import { Badge } from "@/components/ui/badge";
import type { SampleStatus, POStatus, PIStatus, PackingMatchStatus } from "@prisma/client";
import {
  SAMPLE_STATUS_LABEL,
  SAMPLE_STATUS_TONE,
  PO_STATUS_LABEL,
  PO_STATUS_TONE,
  type BadgeTone,
} from "@/lib/status";

export function SampleStatusBadge({ status }: { status: SampleStatus }) {
  return (
    <Badge variant={SAMPLE_STATUS_TONE[status]}>{SAMPLE_STATUS_LABEL[status]}</Badge>
  );
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
