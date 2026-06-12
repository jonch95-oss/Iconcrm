"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { toDecimal } from "@/lib/money";
import { parseDateInput } from "@/lib/date";
import { recomputeRisksForCustomerPo } from "@/lib/tracking/risk";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const createSchema = z.object({
  customerPoNumber: z.string().trim().min(1, "Customer PO # required"),
  customerName: z.string().trim().min(1, "Customer name required"),
  receivedDate: z.string().optional(),
  totalValue: z.string().optional(),
  startShipDate: z.string().optional(),
  cancelDate: z.string().optional(),
  deliveryLocation: z.string().optional(),
  currency: z.enum(["USD", "RMB", "EUR"]).default("USD"),
});

export async function createCustomerPO(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;
  const dup = await prisma.customerPO.findUnique({ where: { customerPoNumber: d.customerPoNumber } });
  if (dup) return { ok: false, error: `Customer PO ${d.customerPoNumber} already exists.` };

  const cpo = await prisma.customerPO.create({
    data: {
      customerPoNumber: d.customerPoNumber,
      customerName: d.customerName,
      receivedDate: parseDateInput(d.receivedDate ?? null),
      totalValue: toDecimal(d.totalValue),
      currency: d.currency,
      startShipDate: parseDateInput(d.startShipDate ?? null),
      cancelDate: parseDateInput(d.cancelDate ?? null),
      deliveryLocation: d.deliveryLocation || null,
    },
  });
  await logAudit({ entityType: "customer_po", entityId: cpo.id, action: "created", userId: user.id, after: { customerPoNumber: cpo.customerPoNumber } });
  revalidatePath("/customer-pos");
  return { ok: true, id: cpo.id };
}

export async function linkPO(
  customerPoId: string,
  purchaseOrderId: string,
  note?: string,
): Promise<ActionResult> {
  const user = await assertRole("member");
  const existing = await prisma.customerPoLink.findUnique({
    where: { customerPoId_purchaseOrderId: { customerPoId, purchaseOrderId } },
  });
  if (existing) return { ok: false, error: "Already linked." };
  await prisma.customerPoLink.create({ data: { customerPoId, purchaseOrderId, note } });
  await recomputeRisksForCustomerPo(customerPoId);
  await logAudit({
    entityType: "customer_po",
    entityId: customerPoId,
    action: "linked_po",
    userId: user.id,
    after: { purchaseOrderId },
  });
  revalidatePath(`/customer-pos/${customerPoId}`);
  return { ok: true };
}

export async function unlinkPO(linkId: string, customerPoId: string): Promise<ActionResult> {
  const user = await assertRole("member");
  const link = await prisma.customerPoLink.findUnique({ where: { id: linkId } });
  await prisma.customerPoLink.delete({ where: { id: linkId } });
  await recomputeRisksForCustomerPo(customerPoId);
  await logAudit({
    entityType: "customer_po",
    entityId: customerPoId,
    action: "unlinked_po",
    userId: user.id,
    before: { purchaseOrderId: link?.purchaseOrderId },
  });
  revalidatePath(`/customer-pos/${customerPoId}`);
  return { ok: true };
}

const windowSchema = z.object({
  startShipDate: z.string().optional(),
  cancelDate: z.string().optional(),
  deliveryLocation: z.string().optional(),
});

/** Edit the delivery window; re-runs the window check on every linked shipment. */
export async function updateCustomerPoWindow(
  customerPoId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = windowSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;
  const start = parseDateInput(d.startShipDate ?? null);
  const cancel = parseDateInput(d.cancelDate ?? null);
  if (start && cancel && start.getTime() > cancel.getTime()) {
    return { ok: false, error: "The start date must be before the cancel date." };
  }
  const before = await prisma.customerPO.findUniqueOrThrow({ where: { id: customerPoId } });
  await prisma.customerPO.update({
    where: { id: customerPoId },
    data: {
      startShipDate: start,
      cancelDate: cancel,
      deliveryLocation: d.deliveryLocation || null,
    },
  });
  await logAudit({
    entityType: "customer_po",
    entityId: customerPoId,
    action: "window_updated",
    userId: user.id,
    before: { startShipDate: before.startShipDate, cancelDate: before.cancelDate },
    after: { startShipDate: start, cancelDate: cancel },
  });
  await recomputeRisksForCustomerPo(customerPoId);
  revalidatePath(`/customer-pos/${customerPoId}`);
  return { ok: true };
}
