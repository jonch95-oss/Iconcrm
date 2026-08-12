"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { advanceSampleStatus, sampleRank } from "@/lib/status";
import type { SampleStatus } from "@prisma/client";
import { sendEmail } from "@/lib/email";
import { MissingInfoEmail } from "@/emails/missing-info";
import { getSettings } from "@/lib/settings";
import { magicLink } from "@/lib/tokens";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * If a sample is marked "On Order Form" but is no longer on ANY order form,
 * revert it to its natural pre-order-form status (recomputed from ETA /
 * received / FOB). No-op otherwise.
 */
async function revertSampleIfOffOrderForm(sampleId: string): Promise<void> {
  const sm = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: { status: true, sampleEta: true, sampleReceivedDate: true, fobCost: true, _count: { select: { orderFormLines: true } } },
  });
  if (!sm || sm.status !== "on_order_form" || sm._count.orderFormLines > 0) return;
  const candidates: SampleStatus[] = ["sample_requested"];
  if (sm.sampleEta) candidates.push("eta_set");
  if (sm.sampleReceivedDate) candidates.push("sample_received");
  if (sm.fobCost) candidates.push("quoted");
  const reverted = candidates.reduce((a, b) => (sampleRank(b) > sampleRank(a) ? b : a));
  if (reverted !== sm.status) await prisma.sample.update({ where: { id: sampleId }, data: { status: reverted } });
}

export async function updateLineQuantity(
  lineId: string,
  orderFormId: string,
  quantity: number,
): Promise<ActionResult> {
  const user = await assertRole("member");
  const q = Math.max(0, Math.floor(quantity));
  const before = await prisma.orderFormLine.findUnique({
    where: { id: lineId },
    include: { sample: { select: { sampleNumber: true } }, skuVariant: { select: { color: true, size: true } } },
  });
  await prisma.orderFormLine.update({ where: { id: lineId }, data: { quantity: q } });
  if (before && before.quantity !== q) {
    const label = `${before.sample.sampleNumber}${before.skuVariant?.color ? ` ${before.skuVariant.color}` : ""}`;
    await logAudit({
      entityType: "order_form", entityId: orderFormId, action: "line_qty_changed", userId: user.id,
      before: { line: label, qty: before.quantity }, after: { line: label, qty: q },
    });
  }
  revalidatePath(`/order-forms/${orderFormId}`);
  return { ok: true };
}

export async function deleteOrderFormLine(
  lineId: string,
  orderFormId: string,
): Promise<ActionResult> {
  const user = await assertRole("member");
  const before = await prisma.orderFormLine.findUnique({
    where: { id: lineId },
    include: { sample: { select: { sampleNumber: true } }, skuVariant: { select: { color: true } } },
  });
  await prisma.orderFormLine.delete({ where: { id: lineId } });
  if (before) {
    const label = `${before.sample.sampleNumber}${before.skuVariant?.color ? ` ${before.skuVariant.color}` : ""}`;
    await logAudit({
      entityType: "order_form", entityId: orderFormId, action: "line_removed", userId: user.id,
      before: { line: label, qty: before.quantity },
    });
    await revertSampleIfOffOrderForm(before.sampleId);
  }
  revalidatePath(`/order-forms/${orderFormId}`);
  revalidatePath("/samples");
  return { ok: true };
}

const BLOB_URL_RE = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i;

/** Upload (a new version of) the order-form document. Each upload is retained. */
export async function uploadOrderFormFile(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const orderFormId = String(formData.get("orderFormId") ?? "");
  const blobUrl = String(formData.get("blobUrl") ?? "");
  const filename = String(formData.get("filename") ?? "document").slice(0, 200);
  const mimeType = String(formData.get("mimeType") ?? "") || null;
  if (!orderFormId || !blobUrl) return { ok: false, error: "Missing file." };
  if (!BLOB_URL_RE.test(blobUrl)) return { ok: false, error: "Invalid upload URL." };
  const version = (await prisma.attachment.count({ where: { parentType: "order_form", parentId: orderFormId } })) + 1;
  await prisma.attachment.create({
    data: { parentType: "order_form", parentId: orderFormId, blobUrl, filename, mimeType, uploadedById: user.id },
  });
  await prisma.orderForm.update({ where: { id: orderFormId }, data: { updatedAt: new Date() } });
  await logAudit({ entityType: "order_form", entityId: orderFormId, action: "file_uploaded", userId: user.id, after: { filename, version } });
  revalidatePath(`/order-forms/${orderFormId}`);
  return { ok: true };
}

/** Remove one uploaded order-form document version. */
export async function deleteOrderFormFile(attachmentId: string, orderFormId: string): Promise<ActionResult> {
  const user = await assertRole("member");
  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!att || att.parentId !== orderFormId) return { ok: false, error: "Not found." };
  await prisma.attachment.delete({ where: { id: attachmentId } });
  try {
    const { del } = await import("@vercel/blob");
    await del(att.blobUrl);
  } catch { /* best-effort */ }
  await logAudit({ entityType: "order_form", entityId: orderFormId, action: "file_removed", userId: user.id, before: { filename: att.filename } });
  revalidatePath(`/order-forms/${orderFormId}`);
  return { ok: true };
}

/** Add a note to the order form (appears in the change history). */
export async function addOrderFormNote(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const orderFormId = String(formData.get("orderFormId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!orderFormId || !body) return { ok: false, error: "Note cannot be empty." };
  await logAudit({ entityType: "order_form", entityId: orderFormId, action: "note", userId: user.id, after: { note: body } });
  revalidatePath(`/order-forms/${orderFormId}`);
  return { ok: true };
}

export interface OrderFormBlocker {
  sampleId: string;
  sampleNumber: string;
  issue: string;
}

/** Compute validation blockers preventing the order form from being sent. */
export async function getOrderFormBlockers(orderFormId: string): Promise<OrderFormBlocker[]> {
  const lines = await prisma.orderFormLine.findMany({
    where: { orderFormId },
    include: { sample: true, skuVariant: true },
  });
  const blockers: OrderFormBlocker[] = [];
  for (const line of lines) {
    if (!line.sample.styleNumber) {
      blockers.push({
        sampleId: line.sampleId,
        sampleNumber: line.sample.sampleNumber,
        issue: "Missing style #",
      });
    }
    if (!line.skuVariantId || !line.skuVariant?.upc) {
      blockers.push({
        sampleId: line.sampleId,
        sampleNumber: line.sample.sampleNumber,
        issue: "Missing UPC",
      });
    }
  }
  return blockers;
}

export async function markOrderFormSent(orderFormId: string): Promise<ActionResult> {
  await assertRole("member");
  const blockers = await getOrderFormBlockers(orderFormId);
  if (blockers.length > 0) {
    return {
      ok: false,
      error: `Cannot send: ${blockers.length} blocker(s). Every style needs a style # and every SKU needs a UPC.`,
    };
  }
  const of = await prisma.orderForm.update({
    where: { id: orderFormId },
    data: { status: "sent", sentAt: new Date() },
    include: { lines: true },
  });

  // Linking to a sent order form advances the linked samples.
  const sampleIds = [...new Set(of.lines.map((l) => l.sampleId))];
  for (const sid of sampleIds) {
    const sample = await prisma.sample.findUnique({ where: { id: sid } });
    if (sample) {
      const next = advanceSampleStatus(sample.status, "on_order_form");
      if (next !== sample.status) {
        await prisma.sample.update({ where: { id: sid }, data: { status: next } });
        await logAudit({
          entityType: "sample",
          entityId: sid,
          action: "status_changed",
          before: { status: sample.status },
          after: { status: next },
        });
      }
    }
  }

  await logAudit({
    entityType: "order_form",
    entityId: orderFormId,
    action: "sent",
    after: { status: "sent" },
  });
  revalidatePath(`/order-forms/${orderFormId}`);
  revalidatePath("/order-forms");
  return { ok: true };
}

/** One-click "Request missing info" email to assigned users / requesters. */
export async function requestMissingInfo(orderFormId: string): Promise<ActionResult> {
  const user = await assertRole("member");
  const blockers = await getOrderFormBlockers(orderFormId);
  if (blockers.length === 0) return { ok: false, error: "Nothing missing." };

  const settings = await getSettings();
  // Recipients: configured missing-info recipients + each sample's requester.
  const sampleIds = [...new Set(blockers.map((b) => b.sampleId))];
  const samples = await prisma.sample.findMany({
    where: { id: { in: sampleIds } },
    include: { requestedBy: { select: { email: true } } },
  });

  for (const sample of samples) {
    const issues = blockers.filter((b) => b.sampleId === sample.id).map((b) => b.issue);
    const to = [
      ...settings.missingInfoRecipients,
      sample.requestedBy?.email,
      sample.requestedByExternal,
    ].filter(Boolean) as string[];
    if (to.length === 0) continue;
    const formUrl = magicLink("missing_info", sample.id, "/missing-info");
    await sendEmail({
      to,
      subject: `Missing info for sample ${sample.sampleNumber}`,
      react: MissingInfoEmail({
        sampleNumber: sample.sampleNumber,
        missingFields: [...new Set(issues)],
        formUrl,
      }),
    });
  }

  await logAudit({
    entityType: "order_form",
    entityId: orderFormId,
    action: "missing_info_requested",
    userId: user.id,
    after: { blockers: blockers.length },
  });
  return { ok: true };
}


/** Delete an order form (and its lines). Blocked if any PI references it. */
export async function deleteOrderForm(orderFormId: string): Promise<ActionResult> {
  const user = await assertRole("member");
  const of = await prisma.orderForm.findUnique({
    where: { id: orderFormId },
    include: { _count: { select: { proformaInvoices: true } } },
  });
  if (!of) return { ok: false, error: "Order form not found." };
  if (of._count.proformaInvoices > 0) {
    return {
      ok: false,
      error: `Can't delete — ${of._count.proformaInvoices} proforma invoice${of._count.proformaInvoices > 1 ? "s" : ""} reference this order form. Unlink those first.`,
    };
  }
  // Samples currently ON this order form — so we can revert their status once
  // it's gone (unless they sit on another order form too).
  const affectedIds = [
    ...new Set((await prisma.orderFormLine.findMany({ where: { orderFormId }, select: { sampleId: true } })).map((l) => l.sampleId)),
  ];

  await prisma.orderForm.delete({ where: { id: orderFormId } }); // cascades order form lines

  // Revert each affected sample to what it was BEFORE going on an order form.
  // On-hold / revisions samples never advance onto an order form (they're
  // guarded), so only "On Order Form" samples need reverting; their prior
  // pipeline status is recomputed from their data (ETA / received / FOB).
  for (const sid of affectedIds) {
    const s = await prisma.sample.findUnique({
      where: { id: sid },
      select: { status: true, sampleEta: true, sampleReceivedDate: true, fobCost: true, _count: { select: { orderFormLines: true } } },
    });
    if (!s || s.status !== "on_order_form" || s._count.orderFormLines > 0) continue; // still on another order form, or moved on
    const candidates: import("@prisma/client").SampleStatus[] = ["sample_requested"];
    if (s.sampleEta) candidates.push("eta_set");
    if (s.sampleReceivedDate) candidates.push("sample_received");
    if (s.fobCost) candidates.push("quoted");
    const reverted = candidates.reduce((a, b) => (sampleRank(b) > sampleRank(a) ? b : a));
    if (reverted !== s.status) {
      await prisma.sample.update({ where: { id: sid }, data: { status: reverted } });
    }
  }

  await logAudit({ entityType: "order_form", entityId: orderFormId, action: "deleted", userId: user.id });
  revalidatePath("/order-forms");
  revalidatePath("/samples");
  return { ok: true };
}
