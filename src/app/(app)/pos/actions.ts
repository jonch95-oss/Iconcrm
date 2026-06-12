"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { POStatus } from "@prisma/client";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { changeEta } from "@/lib/eta";
import { advanceSampleStatus, nextPoStatus } from "@/lib/status";
import { parseDateInput } from "@/lib/date";

type ActionResult = { ok: true } | { ok: false; error: string };

// Map PO production status to the sample lifecycle status it implies.
const PO_TO_SAMPLE: Partial<Record<POStatus, "in_production" | "shipped">> = {
  in_production: "in_production",
  shipped: "shipped",
  delivered: "shipped",
};

async function syncSamplesForPO(poId: string, poStatus: POStatus) {
  const target = PO_TO_SAMPLE[poStatus];
  if (!target) return;
  const pi = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { pi: { include: { lines: true } } },
  });
  if (!pi) return;
  const sampleIds = [...new Set(pi.pi.lines.map((l) => l.sampleId).filter(Boolean))] as string[];
  for (const sid of sampleIds) {
    const sample = await prisma.sample.findUnique({ where: { id: sid } });
    if (!sample) continue;
    const next = advanceSampleStatus(sample.status, target);
    if (next !== sample.status) {
      await prisma.sample.update({ where: { id: sid }, data: { status: next } });
    }
  }
}

export async function advancePoStatus(poId: string): Promise<ActionResult> {
  const user = await assertRole("member");
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) return { ok: false, error: "PO not found" };
  const next = nextPoStatus(po.status);
  if (!next) return { ok: false, error: "PO already delivered" };
  await prisma.purchaseOrder.update({ where: { id: poId }, data: { status: next } });
  await logAudit({
    entityType: "po",
    entityId: poId,
    action: "status_changed",
    userId: user.id,
    before: { status: po.status },
    after: { status: next },
  });
  await syncSamplesForPO(poId, next);
  revalidatePath(`/pos/${poId}`);
  revalidatePath("/pos");
  return { ok: true };
}

export async function setPoStatus(poId: string, status: POStatus): Promise<ActionResult> {
  const user = await assertRole("admin");
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) return { ok: false, error: "PO not found" };
  await prisma.purchaseOrder.update({ where: { id: poId }, data: { status } });
  await logAudit({
    entityType: "po",
    entityId: poId,
    action: "status_overridden",
    userId: user.id,
    before: { status: po.status },
    after: { status },
  });
  await syncSamplesForPO(poId, status);
  revalidatePath(`/pos/${poId}`);
  return { ok: true };
}

export async function changePoEta(
  poId: string,
  newEta: string,
  reason: string,
): Promise<ActionResult> {
  const user = await assertRole("member");
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) return { ok: false, error: "PO not found" };
  await changeEta({
    parentType: "po",
    parentId: poId,
    oldEta: po.factoryEta,
    newEta: parseDateInput(newEta),
    reason: reason || "Updated",
    userId: user.id,
  });
  revalidatePath(`/pos/${poId}`);
  return { ok: true };
}

export async function updatePoDetails(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const poId = String(formData.get("poId"));
  const productionNotes = String(formData.get("productionNotes") ?? "");
  const inspectionDate = parseDateInput(String(formData.get("inspectionDate") ?? "") || null);
  const shipDate = parseDateInput(String(formData.get("shipDate") ?? "") || null);
  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { productionNotes, inspectionDate, shipDate },
  });
  await logAudit({ entityType: "po", entityId: poId, action: "updated", userId: user.id });
  revalidatePath(`/pos/${poId}`);
  return { ok: true };
}
