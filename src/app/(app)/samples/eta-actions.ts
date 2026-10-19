"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertRole, getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { changeEta } from "@/lib/eta";
import { canApproveEta, etaDiffers } from "@/lib/eta-approval";
import { advanceSampleStatus } from "@/lib/status";

export interface EtaActionResult {
  ok: boolean;
  error?: string;
  /** Set when the edit was filed for approval rather than applied. */
  pending?: boolean;
  requestId?: string;
}

/** Can this person take an ETA change live? Reads their saved preference. */
export async function viewerCanApproveEta(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true } });
  return canApproveEta(user, row?.notificationPrefs);
}

/** Put the date on the sample (or the color), with the usual revision trail. */
async function applyEta(
  target: { sampleId: string; skuVariantId?: string | null },
  nextEta: Date | null,
  reason: string,
  userId: string,
) {
  if (target.skuVariantId) {
    const before = await prisma.skuVariant.findUnique({
      where: { id: target.skuVariantId },
      select: { sampleEta: true },
    });
    await prisma.skuVariant.update({ where: { id: target.skuVariantId }, data: { sampleEta: nextEta } });
    await logAudit({
      entityType: "sku_variant",
      entityId: target.skuVariantId,
      action: "eta_changed",
      userId,
      before: { sampleId: target.sampleId, eta: before?.sampleEta ?? null },
      after: { eta: nextEta, reason },
    });
    return;
  }
  const sample = await prisma.sample.findUnique({
    where: { id: target.sampleId },
    select: { sampleEta: true, status: true },
  });
  if (!sample) return;
  await changeEta({
    parentType: "sample",
    parentId: target.sampleId,
    oldEta: sample.sampleEta,
    newEta: nextEta,
    reason,
    userId,
  });
  // A sample that was only ever asked for now has a date to work to.
  if (nextEta && sample.status === "sample_requested") {
    await prisma.sample.update({
      where: { id: target.sampleId },
      data: { status: advanceSampleStatus(sample.status, "eta_set") },
    });
  }
}

/**
 * File a date change for approval. The live ETA doesn't move: it sits here with
 * the reason until the owner or Moshe says yes.
 *
 * One pending request per date — asking again replaces the earlier ask rather
 * than queueing a second one for an approver to puzzle over.
 */
export async function requestEtaChange(input: {
  sampleId: string;
  skuVariantId?: string | null;
  currentEta: Date | null;
  proposedEta: Date | null;
  reason: string;
  userId: string;
}): Promise<string> {
  const reason = input.reason.trim();
  await prisma.etaChangeRequest.updateMany({
    where: {
      sampleId: input.sampleId,
      skuVariantId: input.skuVariantId ?? null,
      status: "pending",
    },
    data: { status: "withdrawn", decidedAt: new Date(), decisionNote: "Replaced by a newer request" },
  });
  const request = await prisma.etaChangeRequest.create({
    data: {
      sampleId: input.sampleId,
      skuVariantId: input.skuVariantId ?? null,
      currentEta: input.currentEta,
      proposedEta: input.proposedEta,
      reason,
      requestedById: input.userId,
    },
  });
  await logAudit({
    entityType: input.skuVariantId ? "sku_variant" : "sample",
    entityId: input.skuVariantId ?? input.sampleId,
    action: "eta_change_requested",
    userId: input.userId,
    before: { eta: input.currentEta },
    after: { eta: input.proposedEta, reason },
  });
  revalidatePath("/eta-changes");
  revalidatePath("/samples");
  revalidatePath(`/samples/${input.sampleId}`);
  return request.id;
}

/** Ask for a date change from the UI (the sample's own ETA or one color's). */
export async function submitEtaChangeRequest(formData: FormData): Promise<EtaActionResult> {
  const user = await assertRole("member");
  const sampleId = String(formData.get("sampleId") ?? "");
  const skuVariantId = String(formData.get("skuVariantId") ?? "") || null;
  const reason = String(formData.get("reason") ?? "").trim();
  const raw = String(formData.get("eta") ?? "").trim();
  if (!sampleId) return { ok: false, error: "Which sample?" };
  if (!reason) return { ok: false, error: "Say why the date is moving." };
  const proposedEta = raw ? new Date(`${raw}T00:00:00.000Z`) : null;
  if (raw && Number.isNaN(proposedEta!.getTime())) return { ok: false, error: "That date doesn't read as a date." };

  const current = skuVariantId
    ? (await prisma.skuVariant.findUnique({ where: { id: skuVariantId }, select: { sampleEta: true } }))?.sampleEta ?? null
    : (await prisma.sample.findUnique({ where: { id: sampleId }, select: { sampleEta: true } }))?.sampleEta ?? null;
  if (!etaDiffers(current, proposedEta)) return { ok: false, error: "That's the date it already has." };

  // An approver asking is an approver deciding: straight on, recorded as theirs.
  const prefs = await prisma.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true } });
  if (canApproveEta(user, prefs?.notificationPrefs)) {
    await applyEta({ sampleId, skuVariantId }, proposedEta, reason, user.id);
    revalidatePath("/samples");
    revalidatePath(`/samples/${sampleId}`);
    return { ok: true };
  }

  const requestId = await requestEtaChange({ sampleId, skuVariantId, currentEta: current, proposedEta, reason, userId: user.id });
  return { ok: true, pending: true, requestId };
}

async function decide(requestId: string, approve: boolean, note?: string): Promise<EtaActionResult> {
  const user = await assertRole("member");
  const prefs = await prisma.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true } });
  if (!canApproveEta(user, prefs?.notificationPrefs)) {
    return { ok: false, error: "Only the owner or Moshe can decide an ETA change." };
  }
  const request = await prisma.etaChangeRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, error: "That request is gone." };
  if (request.status !== "pending") return { ok: false, error: "Someone already decided this one." };

  if (approve) {
    // The live date may have moved since the ask; record what we're replacing
    // so Undo puts back what was really there.
    const live = request.skuVariantId
      ? (await prisma.skuVariant.findUnique({ where: { id: request.skuVariantId }, select: { sampleEta: true } }))?.sampleEta ?? null
      : (await prisma.sample.findUnique({ where: { id: request.sampleId }, select: { sampleEta: true } }))?.sampleEta ?? null;
    await applyEta(
      { sampleId: request.sampleId, skuVariantId: request.skuVariantId },
      request.proposedEta,
      request.reason,
      user.id,
    );
    await prisma.etaChangeRequest.update({
      where: { id: requestId },
      data: { status: "approved", decidedById: user.id, decidedAt: new Date(), currentEta: live, decisionNote: note?.trim() || null },
    });
  } else {
    await prisma.etaChangeRequest.update({
      where: { id: requestId },
      data: { status: "rejected", decidedById: user.id, decidedAt: new Date(), decisionNote: note?.trim() || null },
    });
  }

  await logAudit({
    entityType: request.skuVariantId ? "sku_variant" : "sample",
    entityId: request.skuVariantId ?? request.sampleId,
    action: approve ? "eta_change_approved" : "eta_change_rejected",
    userId: user.id,
    before: { eta: request.currentEta },
    after: { eta: request.proposedEta, note: note?.trim() || null },
  });
  revalidatePath("/eta-changes");
  revalidatePath("/samples");
  revalidatePath(`/samples/${request.sampleId}`);
  return { ok: true };
}

export async function approveEtaChange(requestId: string): Promise<EtaActionResult> {
  return decide(requestId, true);
}

export async function rejectEtaChange(requestId: string, note?: string): Promise<EtaActionResult> {
  return decide(requestId, false, note);
}

/**
 * Put a decision back. An approval puts the old date back on the sample too —
 * a mis-click shouldn't leave the factory working to the wrong week.
 */
export async function undoEtaDecision(requestId: string): Promise<EtaActionResult> {
  const user = await assertRole("member");
  const prefs = await prisma.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true } });
  if (!canApproveEta(user, prefs?.notificationPrefs)) {
    return { ok: false, error: "Only the owner or Moshe can undo an ETA decision." };
  }
  const request = await prisma.etaChangeRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, error: "That request is gone." };
  if (request.status === "pending") return { ok: true };

  if (request.status === "approved") {
    await applyEta(
      { sampleId: request.sampleId, skuVariantId: request.skuVariantId },
      request.currentEta,
      "Undo — approval taken back",
      user.id,
    );
  }
  await prisma.etaChangeRequest.update({
    where: { id: requestId },
    data: { status: "pending", decidedById: null, decidedAt: null, decisionNote: null },
  });
  await logAudit({
    entityType: request.skuVariantId ? "sku_variant" : "sample",
    entityId: request.skuVariantId ?? request.sampleId,
    action: "eta_change_decision_undone",
    userId: user.id,
    after: { requestId },
  });
  revalidatePath("/eta-changes");
  revalidatePath("/samples");
  revalidatePath(`/samples/${request.sampleId}`);
  return { ok: true };
}

/** The person who asked can take their own request back. */
export async function withdrawEtaChange(requestId: string): Promise<EtaActionResult> {
  const user = await assertRole("member");
  const request = await prisma.etaChangeRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, error: "That request is gone." };
  if (request.status !== "pending") return { ok: false, error: "Someone already decided this one." };
  const prefs = await prisma.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true } });
  if (request.requestedById !== user.id && !canApproveEta(user, prefs?.notificationPrefs)) {
    return { ok: false, error: "That's someone else's request." };
  }
  await prisma.etaChangeRequest.update({
    where: { id: requestId },
    data: { status: "withdrawn", decidedById: user.id, decidedAt: new Date() },
  });
  revalidatePath("/eta-changes");
  revalidatePath(`/samples/${request.sampleId}`);
  return { ok: true };
}
