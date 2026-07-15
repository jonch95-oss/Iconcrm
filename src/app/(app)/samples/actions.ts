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
      season: d.season,
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
      color: d.color ?? before.color,
      category: d.category ?? before.category,
      season: d.season ?? before.season,
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
      dutyRatePercent:
        d.dutyRatePercent !== undefined ? toDecimal(d.dutyRatePercent) : before.dutyRatePercent,
      freightPerUnit:
        d.freightPerUnit !== undefined ? toDecimal(d.freightPerUnit) : before.freightPerUnit,
      inlandPerUnit:
        d.inlandPerUnit !== undefined ? toDecimal(d.inlandPerUnit) : before.inlandPerUnit,
      htsCode: d.htsCode !== undefined ? d.htsCode || null : before.htsCode,
      composition: d.composition !== undefined ? d.composition || null : before.composition,
      cbmPerCarton:
        d.cbmPerCarton !== undefined ? toDecimal(d.cbmPerCarton) : before.cbmPerCarton,
      casePackDefault:
        d.casePackDefault !== undefined
          ? d.casePackDefault
            ? parseInt(d.casePackDefault, 10) || null
            : null
          : before.casePackDefault,
      ...(d.trackingNumber !== undefined && d.trackingNumber.trim() !== (before.trackingNumber ?? "")
        ? await (async () => {
            const num = d.trackingNumber!.trim();
            if (!num) return { trackingNumber: null, trackingCarrier: null, trackingEta: null, trackingStatus: null };
            const { detectCarrier, resolveParcel } = await import("@/lib/parcel");
            const carrier = detectCarrier(num);
            const live = await resolveParcel(num, carrier);
            return {
              trackingNumber: num,
              trackingCarrier: carrier,
              trackingEta: live?.eta ?? null,
              trackingStatus: live?.status ?? "in_transit",
            };
          })()
        : {}),
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
  variantIds?: string[],
): Promise<ActionResult> {
  const user = await assertRole("member");
  if (sampleIds.length === 0) return { ok: false, error: "No samples selected." };
  const variantFilter = variantIds ? new Set(variantIds) : null;

  const samples = await prisma.sample.findMany({
    where: { id: { in: sampleIds } },
    include: { skuVariants: true },
  });
  // Factory is optional. Group by the first factory present; samples without a
  // factory are included when no factory exists in the selection, or alongside
  // the chosen factory's samples when they share none.
  const factoryIds = [...new Set(samples.map((s) => s.factoryId).filter(Boolean))] as string[];
  const factoryId = factoryIds[0] ?? null;
  const factorySamples = factoryId
    ? samples.filter((s) => s.factoryId === factoryId || s.factoryId === null)
    : samples;

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
    const includedSampleIds = new Set<string>();
    for (const s of factorySamples) {
      // When a variant selection is given, only include the chosen SKUs.
      const variants = variantFilter ? s.skuVariants.filter((v) => variantFilter.has(v.id)) : s.skuVariants;
      if (variants.length > 0) {
        for (const variant of variants) {
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
        includedSampleIds.add(s.id);
      } else if (s.skuVariants.length === 0) {
        // Sample has no SKUs at all — add a single base line.
        await tx.orderFormLine.create({
          data: {
            orderFormId: orderForm.id,
            sampleId: s.id,
            quantity: 0,
            fobCostSnapshot: s.fobCost,
            currency: s.currency,
          },
        });
        includedSampleIds.add(s.id);
      }
      // else: has SKUs but none were selected — skip this sample.
    }
    // Putting a sample on an order form advances it to "On Order Form".
    for (const s of factorySamples) {
      if (!includedSampleIds.has(s.id)) continue;
      const next = advanceSampleStatus(s.status, "on_order_form");
      if (next !== s.status) await tx.sample.update({ where: { id: s.id }, data: { status: next } });
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

// ---------------------------------------------------------------------------
// Sample image upload (primary product photo, carried into exports)
// ---------------------------------------------------------------------------

export async function uploadSampleImage(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const sampleId = String(formData.get("sampleId") ?? "");
  const file = formData.get("file");
  if (!sampleId || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image first." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "That file isn't an image." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { ok: false, error: "Image is too large (8 MB max)." };
  }

  const { uploadBlob } = await import("@/lib/blob");
  let url: string;
  try {
    url = await uploadBlob(
      `samples/${sampleId}/${file.name}`,
      Buffer.from(await file.arrayBuffer()),
      file.type,
    );
  } catch {
    return {
      ok: false,
      error:
        "Image storage isn't set up yet. In Vercel: Storage → Create → Blob, then redeploy.",
    };
  }

  await prisma.sample.update({ where: { id: sampleId }, data: { imageUrl: url } });
  await prisma.attachment.create({
    data: {
      parentType: "sample",
      parentId: sampleId,
      blobUrl: url,
      filename: file.name,
      mimeType: file.type,
      uploadedById: user.id,
    },
  });
  await logAudit({
    entityType: "sample",
    entityId: sampleId,
    action: "image_uploaded",
    userId: user.id,
    after: { filename: file.name },
  });
  revalidatePath(`/samples/${sampleId}`);
  revalidatePath("/samples");
  return { ok: true };
}

export async function removeSampleImage(sampleId: string): Promise<ActionResult> {
  const user = await assertRole("member");
  await prisma.sample.update({ where: { id: sampleId }, data: { imageUrl: null } });
  await logAudit({ entityType: "sample", entityId: sampleId, action: "image_removed", userId: user.id });
  revalidatePath(`/samples/${sampleId}`);
  revalidatePath("/samples");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bulk receive + parcel tracking
// ---------------------------------------------------------------------------

export async function bulkReceiveSamples(sampleIds: string[]): Promise<ActionResult> {
  const user = await assertRole("member");
  if (!sampleIds.length) return { ok: false, error: "No samples selected." };
  const now = new Date();
  const samples = await prisma.sample.findMany({
    where: { id: { in: sampleIds }, sampleReceivedDate: null },
    select: { id: true, status: true },
  });
  for (const s of samples) {
    await prisma.sample.update({
      where: { id: s.id },
      data: {
        sampleReceivedDate: now,
        trackingStatus: "delivered",
        status: ["sample_requested", "eta_set"].includes(s.status) ? "sample_received" : undefined,
      },
    });
  }
  await logAudit({
    entityType: "sample",
    entityId: "bulk_receive",
    action: "bulk_received",
    userId: user.id,
    after: { count: samples.length },
  });
  revalidatePath("/samples");
  revalidatePath("/receive");
  return { ok: true };
}

/** Set/refresh tracking on one sample (manual entry from the detail page). */
export async function updateSampleTracking(formData: FormData): Promise<ActionResult> {
  await assertRole("member");
  const sampleId = String(formData.get("sampleId") ?? "");
  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim();
  if (!sampleId) return { ok: false, error: "Missing sample." };

  const { detectCarrier, resolveParcel } = await import("@/lib/parcel");
  if (!trackingNumber) {
    await prisma.sample.update({
      where: { id: sampleId },
      data: { trackingNumber: null, trackingCarrier: null, trackingEta: null, trackingStatus: null },
    });
  } else {
    const carrier = detectCarrier(trackingNumber);
    const live = await resolveParcel(trackingNumber, carrier);
    await prisma.sample.update({
      where: { id: sampleId },
      data: {
        trackingNumber,
        trackingCarrier: carrier,
        trackingEta: live?.eta ?? undefined,
        trackingStatus: live?.status ?? "in_transit",
      },
    });
  }
  revalidatePath(`/samples/${sampleId}`);
  revalidatePath("/samples");
  revalidatePath("/receive");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete (admin-guarded; blocks when downstream records exist)
// ---------------------------------------------------------------------------

export async function deleteSample(sampleId: string): Promise<ActionResult> {
  const user = await assertRole("admin");
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    include: {
      _count: { select: { orderFormLines: true, piLines: true } },
    },
  });
  if (!sample) return { ok: false, error: "Sample not found." };

  const links = sample._count.orderFormLines + sample._count.piLines;
  if (links > 0) {
    return {
      ok: false,
      error: `Can't delete — this sample is used on ${links} order form / PI / packing-list line${links > 1 ? "s" : ""}. Remove it from those first.`,
    };
  }

  await prisma.sample.delete({ where: { id: sampleId } }); // cascades SKUs, comments, attachments
  await logAudit({
    entityType: "sample",
    entityId: sampleId,
    action: "deleted",
    userId: user.id,
    before: { sampleNumber: sample.sampleNumber },
  });
  revalidatePath("/samples");
  return { ok: true };
}

export async function bulkDeleteSamples(sampleIds: string[]): Promise<ActionResult> {
  const user = await assertRole("admin");
  if (!sampleIds.length) return { ok: false, error: "No samples selected." };

  // Skip any that are referenced downstream; report how many were protected.
  const linked = await prisma.sample.findMany({
    where: {
      id: { in: sampleIds },
      OR: [{ orderFormLines: { some: {} } }, { piLines: { some: {} } }],
    },
    select: { id: true },
  });
  const linkedIds = new Set(linked.map((s) => s.id));
  const deletable = sampleIds.filter((id) => !linkedIds.has(id));

  if (deletable.length) {
    await prisma.sample.deleteMany({ where: { id: { in: deletable } } });
    await logAudit({
      entityType: "sample",
      entityId: "bulk_delete",
      action: "bulk_deleted",
      userId: user.id,
      after: { count: deletable.length },
    });
  }
  revalidatePath("/samples");
  if (linkedIds.size > 0) {
    // Partial success — report via the id slot (caller shows it as a toast).
    return {
      ok: true,
      id: `Deleted ${deletable.length}. Skipped ${linkedIds.size} still used on order forms/PIs.`,
    };
  }
  return { ok: true };
}


/**
 * Flag a sample as needing revisions: records the reviewer's note in the
 * sample's comments, resets the ETA to 6 weeks out, and logs the ETA change.
 */
export async function requestRevisions(sampleId: string, comment: string): Promise<ActionResult> {
  const user = await assertRole("member");
  const note = comment.trim();
  if (!note) return { ok: false, error: "Add a note on what needs revising." };

  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: { id: true, status: true, sampleEta: true },
  });
  if (!sample) return { ok: false, error: "Sample not found." };

  const newEta = new Date(Date.now() + 42 * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.sample.update({
      where: { id: sampleId },
      data: { status: "revisions_requested", sampleEta: newEta },
    }),
    prisma.comment.create({
      data: { sampleId, userId: user.id, body: `Revisions requested: ${note}`, tags: ["revision"] },
    }),
    prisma.etaRevision.create({
      data: {
        parentType: "sample",
        parentId: sampleId,
        oldEta: sample.sampleEta,
        newEta,
        changedById: user.id,
        reason: "Revisions requested",
      },
    }),
  ]);

  await logAudit({ entityType: "sample", entityId: sampleId, action: "revisions_requested", userId: user.id, after: { note } });
  revalidatePath(`/samples/${sampleId}`);
  revalidatePath("/samples");
  return { ok: true };
}


export interface VariantPickSample {
  sampleId: string;
  sampleNumber: string;
  styleNumber: string | null;
  factoryName: string | null;
  variants: { id: string; size: string; color: string; upc: string | null; skuCode: string | null }[];
}

/** Variants of the selected samples, for the order-form variant picker. */
export async function listVariantsForSamples(sampleIds: string[]): Promise<VariantPickSample[]> {
  await assertRole("member");
  if (sampleIds.length === 0) return [];
  const samples = await prisma.sample.findMany({
    where: { id: { in: sampleIds } },
    select: {
      id: true,
      sampleNumber: true,
      styleNumber: true,
      factory: { select: { name: true } },
      skuVariants: { orderBy: [{ color: "asc" }, { size: "asc" }], select: { id: true, size: true, color: true, upc: true, skuCode: true } },
    },
    orderBy: { sampleNumber: "asc" },
  });
  return samples.map((s) => ({
    sampleId: s.id,
    sampleNumber: s.sampleNumber,
    styleNumber: s.styleNumber,
    factoryName: s.factory?.name ?? null,
    variants: s.skuVariants,
  }));
}


/**
 * Bulk-issue SKUs by color for one sample. For each color x size it creates a
 * variant with an auto-generated SKU (sample # with non-alphanumerics stripped
 * + the color's code, e.g. TB26_ACC0052 + BLK -> TB26ACC0052BLK). UPCs are left
 * blank to be filled in later. Existing size/color combos are skipped, and any
 * colors without a code mapping are reported so their SKU can be filled once a
 * code is added in Settings.
 */
export async function bulkAddVariantsByColor(
  sampleId: string,
  sizes: string[],
  colors: string[],
): Promise<{ ok: boolean; created?: number; skippedExisting?: number; missingCodes?: string[]; error?: string }> {
  await assertRole("member");
  const sample = await prisma.sample.findUnique({ where: { id: sampleId }, select: { id: true, sampleNumber: true } });
  if (!sample) return { ok: false, error: "Sample not found." };

  const cleanSizes = [...new Set(sizes.map((x) => x.trim()).filter(Boolean))];
  const cleanColors = [...new Set(colors.map((x) => x.trim()).filter(Boolean))];
  if (cleanSizes.length === 0) cleanSizes.push("OS");
  if (cleanColors.length === 0) return { ok: false, error: "Add at least one color." };

  const base = sample.sampleNumber.replace(/[^a-zA-Z0-9]/g, "");
  const codeRows = await prisma.colorCode.findMany();
  const codeMap = new Map(codeRows.map((c) => [c.color.trim().toUpperCase(), c.code]));

  const existing = await prisma.skuVariant.findMany({ where: { sampleId }, select: { size: true, color: true } });
  const existsKey = new Set(existing.map((v) => `${v.size.trim().toUpperCase()}|${v.color.trim().toUpperCase()}`));

  let created = 0;
  let skippedExisting = 0;
  const missingCodes = new Set<string>();

  for (const color of cleanColors) {
    const code = codeMap.get(color.toUpperCase());
    if (!code) missingCodes.add(color.toUpperCase());
    const skuCode = code ? `${base}${code}` : null;
    for (const size of cleanSizes) {
      const key = `${size.toUpperCase()}|${color.toUpperCase()}`;
      if (existsKey.has(key)) {
        skippedExisting += 1;
        continue;
      }
      existsKey.add(key);
      await prisma.skuVariant.create({ data: { sampleId, size, color, upc: null, skuCode } });
      created += 1;
    }
  }

  await logAudit({ entityType: "sample", entityId: sampleId, action: "bulk_skus_by_color", userId: (await assertRole("member")).id, after: { created } });
  revalidatePath(`/samples/${sampleId}`);
  return { ok: true, created, skippedExisting, missingCodes: [...missingCodes].sort() };
}
