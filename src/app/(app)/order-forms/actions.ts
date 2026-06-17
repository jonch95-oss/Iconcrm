"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { advanceSampleStatus } from "@/lib/status";
import { sendEmail } from "@/lib/email";
import { MissingInfoEmail } from "@/emails/missing-info";
import { getSettings } from "@/lib/settings";
import { magicLink } from "@/lib/tokens";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export async function updateLineQuantity(
  lineId: string,
  orderFormId: string,
  quantity: number,
): Promise<ActionResult> {
  await assertRole("member");
  await prisma.orderFormLine.update({
    where: { id: lineId },
    data: { quantity: Math.max(0, Math.floor(quantity)) },
  });
  revalidatePath(`/order-forms/${orderFormId}`);
  return { ok: true };
}

export async function deleteOrderFormLine(
  lineId: string,
  orderFormId: string,
): Promise<ActionResult> {
  await assertRole("member");
  await prisma.orderFormLine.delete({ where: { id: lineId } });
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
  await prisma.orderForm.delete({ where: { id: orderFormId } }); // cascades order form lines
  await logAudit({ entityType: "order_form", entityId: orderFormId, action: "deleted", userId: user.id });
  revalidatePath("/order-forms");
  return { ok: true };
}
