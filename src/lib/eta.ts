import { prisma } from "@/lib/db";
import { Prisma, type EtaParentType } from "@prisma/client";
import { logAudit } from "@/lib/audit";

interface ChangeEtaInput {
  parentType: EtaParentType;
  parentId: string;
  oldEta: Date | null;
  newEta: Date | null;
  reason?: string;
  userId?: string | null;
}

/**
 * Records an EtaRevision and updates the parent's ETA field in a single
 * transaction. ETAs are never silently overwritten — every change is logged.
 * Returns the created revision, or null when the value is unchanged.
 */
export async function changeEta(input: ChangeEtaInput) {
  const oldMs = input.oldEta?.getTime() ?? null;
  const newMs = input.newEta?.getTime() ?? null;
  if (oldMs === newMs) return null;

  return prisma.$transaction(async (tx) => {
    const revision = await tx.etaRevision.create({
      data: {
        parentType: input.parentType,
        parentId: input.parentId,
        oldEta: input.oldEta,
        newEta: input.newEta,
        reason: input.reason,
        changedById: input.userId ?? null,
      },
    });

    if (input.parentType === "sample") {
      await tx.sample.update({
        where: { id: input.parentId },
        data: { sampleEta: input.newEta },
      });
    } else {
      await tx.purchaseOrder.update({
        where: { id: input.parentId },
        data: { factoryEta: input.newEta },
      });
    }

    await logAudit(
      {
        entityType: input.parentType,
        entityId: input.parentId,
        action: "eta_changed",
        userId: input.userId,
        before: { eta: input.oldEta },
        after: { eta: input.newEta, reason: input.reason },
      },
      tx,
    );

    return revision;
  });
}

export interface EtaSlipStats {
  totalRevisions: number;
  recordsWithRevisions: number;
  daysSlippedTotal: number;
  averageSlipDays: number | null;
}

/** Aggregate ETA-slip stats for a factory (across its samples and POs). */
export async function factoryEtaSlipStats(factoryId: string): Promise<EtaSlipStats> {
  // Collect sample + PO ids belonging to this factory.
  const samples = await prisma.sample.findMany({
    where: { factoryId },
    select: { id: true },
  });
  const pos = await prisma.purchaseOrder.findMany({
    where: { pi: { factoryId } },
    select: { id: true },
  });
  const sampleIds = samples.map((s) => s.id);
  const poIds = pos.map((p) => p.id);

  const revisions = await prisma.etaRevision.findMany({
    where: {
      OR: [
        { parentType: "sample", parentId: { in: sampleIds } },
        { parentType: "po", parentId: { in: poIds } },
      ],
    },
  });

  const parents = new Set<string>();
  let daysSlippedTotal = 0;
  for (const r of revisions) {
    parents.add(`${r.parentType}:${r.parentId}`);
    if (r.oldEta && r.newEta) {
      const slip = Math.round(
        (r.newEta.getTime() - r.oldEta.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (slip > 0) daysSlippedTotal += slip;
    }
  }

  return {
    totalRevisions: revisions.length,
    recordsWithRevisions: parents.size,
    daysSlippedTotal,
    averageSlipDays:
      parents.size > 0 ? Math.round((daysSlippedTotal / parents.size) * 10) / 10 : null,
  };
}

/** Average FOB variance (PI unit price vs recorded FOB) across a factory's PIs. */
export async function factoryAvgFobVariance(
  factoryId: string,
): Promise<Prisma.Decimal | null> {
  const lines = await prisma.pILine.findMany({
    where: { pi: { factoryId }, variance: { not: null } },
    select: { variance: true },
  });
  if (lines.length === 0) return null;
  let sum = new Prisma.Decimal(0);
  for (const l of lines) sum = sum.plus(l.variance ?? 0);
  return sum.dividedBy(lines.length);
}
