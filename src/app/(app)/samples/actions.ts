"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { changeEta } from "@/lib/eta";
import { advanceSampleStatus } from "@/lib/status";
import { toDecimal } from "@/lib/money";
import { parseDateInput } from "@/lib/date";
import {
  sampleCreateSchema,
  sampleUpdateSchema,
  skuVariantSchema,
  commentSchema,
} from "@/lib/validation";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export async function createSample(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = sampleCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const existing = await prisma.sample.findUnique({
    where: { sampleNumber: d.sampleNumber },
  });
  if (existing) {
    return { ok: false, error: `Sample # ${d.sampleNumber} already exists.` };
  }

  const eta = parseDateInput(d.sampleEta);
  const received = parseDateInput(d.sampleReceivedDate);
  let status: "sample_requested" | "eta_set" | "sample_received" | "quoted" =
    "sample_requested";
  if (d.fobCost) status = "quoted";
  else if (received) status = "sample_received";
  else if (eta) status = "eta_set";

  const sample = await prisma.sample.create({
    data: {
      sampleNumber: d.sampleNumber,
      brand: d.brand,
      category: d.category,
      styleName: d.styleName,
      styleNumber: d.styleNumber,
      description: d.description,
      factoryId: d.factoryId,
      targetCustomer: d.targetCustomer,
      fobCost: toDecimal(d.fobCost),
      currency: d.currency,
      fobPort: d.fobPort,
      customerSellPrice: toDecimal(d.customerSellPrice),
      sampleEta: eta,
      sampleReceivedDate: received,
      status,
      requestedById: user.id,
    },
  });

  await logAudit({
    entityType: "sample",
    entityId: sample.id,
    action: "created",
    userId: user.id,
    after: { sampleNumber: sample.sampleNumber, status },
  });

  if (eta) {
    await prisma.etaRevision.create({
      data: { parentType: "sample", parentId: sample.id, oldEta: null, newEta: eta, changedById: user.id, reason: "Initial ETA" },
    });
  }

  revalidatePath("/samples");
  return { ok: true, id: sample.id };
}

export async function updateSample(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = sampleUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const before = await prisma.sample.findUnique({ where: { id: d.id } });
  if (!before) return { ok: false, error: "Sample not found" };

  // Duplicate sample-number guard on rename.
  if (d.sampleNumber && d.sampleNumber !== before.sampleNumber) {
    const dup = await prisma.sample.findUnique({ where: { sampleNumber: d.sampleNumber } });
    if (dup) return { ok: false, error: `Sample # ${d.sampleNumber} already exists.` };
  }

  const newEta = d.sampleEta !== undefined ? parseDateInput(d.sampleEta) : before.sampleEta;
  const received =
    d.sampleReceivedDate !== undefined
      ? parseDateInput(d.sampleReceivedDate)
      : before.sampleReceivedDate;
  const fob = d.fobCost !== undefined ? toDecimal(d.fobCost) : before.fobCost;

  // ETA change → log a revision (never silently overwrite).
  if (d.sampleEta !== undefined && (newEta?.getTime() ?? null) !== (before.sampleEta?.getTime() ?? null)) {
    await changeEta({
      parentType: "sample",
      parentId: before.id,
      oldEta: before.sampleEta,
      newEta,
      reason: d.etaReason ?? "Updated",
      userId: user.id,
    });
  }

  // Automatic forward status transitions.
  let status = d.status ?? before.status;
  if (!d.status) {
    if (received && !before.sampleReceivedDate)
      status = advanceSampleStatus(status, "sample_received");
    if (fob && !before.fobCost) status = advanceSampleStatus(status, "quoted");
    if (newEta && before.status === "sample_requested")
      status = advanceSampleStatus(status, "eta_set");
  }

  // Dropped requires a reason.
  if (status === "dropped" && !d.droppedReason && !before.droppedReason) {
    return { ok: false, error: "A dropped reason is required to drop a sample." };
  }
  // Manual status override requires admin.
  if (d.status && d.status !== before.status) {
    await assertRole("admin");
  }

  const updated = await prisma.sample.update({
    where: { id: d.id },
    data: {
      sampleNumber: d.sampleNumber ?? before.sampleNumber,
      brand: d.brand ?? before.brand,
      category: d.category ?? before.category,
      styleName: d.styleName ?? before.styleName,
      styleNumber: d.styleNumber ?? before.styleNumber,
      description: d.description ?? before.description,
      factoryId: d.factoryId ?? before.factoryId,
      targetCustomer: d.targetCustomer ?? before.targetCustomer,
      fobCost: fob,
      currency: d.currency ?? before.currency,
      fobPort: d.fobPort ?? before.fobPort,
      customerSellPrice:
        d.customerSellPrice !== undefined ? toDecimal(d.customerSellPrice) : before.customerSellPrice,
      sampleReceivedDate: received,
      sampleEta: newEta,
      status,
      droppedReason: status === "dropped" ? d.droppedReason ?? before.droppedReason : null,
    },
  });

  // Audit material changes.
  const changes: Record<string, [unknown, unknown]> = {};
  if (before.status !== updated.status) changes.status = [before.status, updated.status];
  if (String(before.fobCost) !== String(updated.fobCost)) changes.fobCost = [before.fobCost, updated.fobCost];
  if ((before.sampleReceivedDate?.getTime() ?? null) !== (updated.sampleReceivedDate?.getTime() ?? null))
    changes.sampleReceivedDate = [before.sampleReceivedDate, updated.sampleReceivedDate];
  if (Object.keys(changes).length > 0) {
    await logAudit({
      entityType: "sample",
      entityId: updated.id,
      action: before.status !== updated.status ? "status_changed" : "updated",
      userId: user.id,
      before: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v[0]])),
      after: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v[1]])),
    });
  }

  revalidatePath("/samples");
  revalidatePath(`/samples/${updated.id}`);
  return { ok: true, id: updated.id };
}

export async function addComment(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Comment cannot be empty" };
  await prisma.comment.create({
    data: { sampleId: parsed.data.sampleId, userId: user.id, body: parsed.data.body },
  });
  revalidatePath(`/samples/${parsed.data.sampleId}`);
  return { ok: true };
}

export async function addSkuVariant(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = skuVariantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const dup = await prisma.skuVariant.findUnique({ where: { upc: parsed.data.upc } });
  if (dup) return { ok: false, error: `UPC ${parsed.data.upc} already exists.` };
  await prisma.skuVariant.create({
    data: {
      sampleId: parsed.data.sampleId,
      size: parsed.data.size,
      color: parsed.data.color,
      upc: parsed.data.upc,
      skuCode: parsed.data.skuCode,
      unitsPerCarton: parsed.data.unitsPerCarton ?? null,
    },
  });
  await logAudit({
    entityType: "sample",
    entityId: parsed.data.sampleId,
    action: "sku_added",
    userId: user.id,
    after: { upc: parsed.data.upc },
  });
  revalidatePath(`/samples/${parsed.data.sampleId}`);
  return { ok: true };
}

export async function deleteSkuVariant(id: string, sampleId: string): Promise<ActionResult> {
  await assertRole("member");
  await prisma.skuVariant.delete({ where: { id } });
  revalidatePath(`/samples/${sampleId}`);
  return { ok: true };
}

/**
 * Bulk-create an order form from selected samples. Groups by factory; if more
 * than one factory is represented, the caller is warned client-side, but we
 * create one order form for the dominant factory's samples (others skipped).
 */
export async function createOrderFormFromSamples(
  sampleIds: string[],
): Promise<ActionResult> {
  const user = await assertRole("member");
  if (sampleIds.length === 0) return { ok: false, error: "No samples selected." };

  const samples = await prisma.sample.findMany({
    where: { id: { in: sampleIds } },
    include: { skuVariants: true },
  });
  const factoryIds = [...new Set(samples.map((s) => s.factoryId).filter(Boolean))] as string[];
  if (factoryIds.length === 0) return { ok: false, error: "Selected samples have no factory." };
  const factoryId = factoryIds[0];
  const factorySamples = samples.filter((s) => s.factoryId === factoryId);

  const { nextOrderFormNumber } = await import("@/lib/sequence");

  const of = await prisma.$transaction(async (tx) => {
    const number = await nextOrderFormNumber(tx);
    const orderForm = await tx.orderForm.create({
      data: {
        orderFormNumber: number,
        factoryId,
        status: "draft",
        createdById: user.id,
      },
    });
    for (const s of factorySamples) {
      if (s.skuVariants.length > 0) {
        for (const variant of s.skuVariants) {
          await tx.orderFormLine.create({
            data: {
              orderFormId: orderForm.id,
              sampleId: s.id,
              skuVariantId: variant.id,
              quantity: 0,
              fobCostSnapshot: s.fobCost,
              currency: s.currency,
            },
          });
        }
      } else {
        await tx.orderFormLine.create({
          data: {
            orderFormId: orderForm.id,
            sampleId: s.id,
            quantity: 0,
            fobCostSnapshot: s.fobCost,
            currency: s.currency,
          },
        });
      }
    }
    await logAudit(
      {
        entityType: "order_form",
        entityId: orderForm.id,
        action: "created",
        userId: user.id,
        after: { orderFormNumber: number, sampleCount: factorySamples.length },
      },
      tx,
    );
    return orderForm;
  });

  revalidatePath("/order-forms");
  return { ok: true, id: of.id };
}
