import { prisma } from "@/lib/db";

/** One row on the ETA changes screen. */
export interface EtaChangeRow {
  id: string;
  sampleId: string;
  sampleNumber: string;
  styleName: string | null;
  brand: string | null;
  factory: string | null;
  color: string | null;
  currentEta: Date | null;
  proposedEta: Date | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  requestedBy: string;
  requestedAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
}

const include = {
  sample: { select: { sampleNumber: true, styleName: true, brand: true, factory: { select: { name: true } } } },
  skuVariant: { select: { color: true } },
  requestedBy: { select: { name: true, email: true } },
  decidedBy: { select: { name: true, email: true } },
} as const;

type Row = Awaited<ReturnType<typeof prisma.etaChangeRequest.findMany<{ include: typeof include }>>>[number];

const who = (u: { name: string | null; email: string } | null) => u?.name?.trim() || u?.email || "Someone";

const toRow = (r: Row): EtaChangeRow => ({
  id: r.id,
  sampleId: r.sampleId,
  sampleNumber: r.sample.sampleNumber,
  styleName: r.sample.styleName,
  brand: r.sample.brand,
  factory: r.sample.factory?.name ?? null,
  color: r.skuVariant?.color ?? null,
  currentEta: r.currentEta,
  proposedEta: r.proposedEta,
  reason: r.reason,
  status: r.status,
  requestedBy: who(r.requestedBy),
  requestedAt: r.createdAt,
  decidedBy: r.decidedBy ? who(r.decidedBy) : null,
  decidedAt: r.decidedAt,
});

/** Dates waiting on a yes, oldest ask first — it's a queue, not a feed. */
export async function pendingEtaChanges(): Promise<EtaChangeRow[]> {
  const rows = await prisma.etaChangeRequest.findMany({
    where: { status: "pending" },
    include,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toRow);
}

/** What was decided lately, so a mistake can be put back. */
export async function decidedEtaChanges(limit = 25): Promise<EtaChangeRow[]> {
  const rows = await prisma.etaChangeRequest.findMany({
    where: { status: { in: ["approved", "rejected", "withdrawn"] } },
    include,
    orderBy: { decidedAt: "desc" },
    take: limit,
  });
  return rows.map(toRow);
}

/** How many dates are waiting — the number on the nav. */
export function pendingEtaChangeCount(): Promise<number> {
  return prisma.etaChangeRequest.count({ where: { status: "pending" } });
}

/**
 * Which of these samples have a date waiting on a decision, so the list can
 * mark them rather than quietly showing the old date as if nothing was asked.
 */
export async function pendingEtaBySample(sampleIds: string[]): Promise<Map<string, { proposedEta: Date | null; requestedBy: string }>> {
  if (sampleIds.length === 0) return new Map();
  const rows = await prisma.etaChangeRequest.findMany({
    where: { status: "pending", sampleId: { in: sampleIds }, skuVariantId: null },
    select: { sampleId: true, proposedEta: true, requestedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const out = new Map<string, { proposedEta: Date | null; requestedBy: string }>();
  for (const r of rows) out.set(r.sampleId, { proposedEta: r.proposedEta, requestedBy: who(r.requestedBy) });
  return out;
}
