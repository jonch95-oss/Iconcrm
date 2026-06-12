"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { computeFobLine } from "@/lib/match";
import { advanceSampleStatus } from "@/lib/status";
import { toDecimal, formatMoney } from "@/lib/money";
import { parseDateInput } from "@/lib/date";
import { nextPoNumber } from "@/lib/sequence";
import { getSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { VarianceAlertEmail } from "@/emails/variance-alert";
import { PoNotificationEmail } from "@/emails/po-notification";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const piCreateSchema = z.object({
  piNumber: z.string().trim().min(1, "PI # required"),
  factoryId: z.string().min(1, "Factory required"),
  orderFormId: z.string().optional(),
  currency: z.enum(["USD", "RMB", "EUR"]).default("USD"),
  paymentTerms: z.string().optional(),
  depositPercent: z.string().optional(),
  piDate: z.string().optional(),
});

export async function createPI(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = piCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;

  const pi = await prisma.proformaInvoice.create({
    data: {
      piNumber: d.piNumber,
      factoryId: d.factoryId,
      orderFormId: d.orderFormId || null,
      currency: d.currency,
      paymentTerms: d.paymentTerms,
      depositPercent: toDecimal(d.depositPercent),
      piDate: parseDateInput(d.piDate),
      status: "under_review",
    },
  });
  await logAudit({
    entityType: "pi",
    entityId: pi.id,
    action: "created",
    userId: user.id,
    after: { piNumber: pi.piNumber },
  });
  revalidatePath("/pis");
  return { ok: true, id: pi.id };
}

/** Compute FOB match for a unit price against a sample's recorded FOB. */
async function buildLineData(
  piId: string,
  sampleId: string | null,
  skuVariantId: string | null,
  quantity: number,
  unitPrice: Prisma.Decimal,
) {
  let fob: Prisma.Decimal | null = null;
  if (sampleId) {
    const sample = await prisma.sample.findUnique({ where: { id: sampleId }, select: { fobCost: true } });
    fob = sample?.fobCost ?? null;
  }
  const match = computeFobLine(unitPrice, fob);
  return {
    piId,
    sampleId,
    skuVariantId,
    quantity,
    unitPrice,
    fobSnapshot: fob,
    variance: match.variance,
    variancePercent: match.variancePercent,
    resolution: (match.hasFob && match.matches ? "approved" : "pending") as "approved" | "pending",
  };
}

const lineSchema = z.object({
  piId: z.string().min(1),
  sampleId: z.string().optional(),
  skuVariantId: z.string().optional(),
  quantity: z.coerce.number().int().min(0),
  unitPrice: z.string().min(1),
});

export async function addPILine(formData: FormData): Promise<ActionResult> {
  await assertRole("member");
  const parsed = lineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const up = toDecimal(parsed.data.unitPrice);
  if (!up) return { ok: false, error: "Invalid unit price" };

  const data = await buildLineData(
    parsed.data.piId,
    parsed.data.sampleId || null,
    parsed.data.skuVariantId || null,
    parsed.data.quantity,
    up,
  );
  await prisma.pILine.create({ data });
  await afterLinesChanged(parsed.data.piId);
  revalidatePath(`/pis/${parsed.data.piId}`);
  return { ok: true };
}

/**
 * Bulk-paste PI lines from Excel. Each row: sampleNumber, [size], [color],
 * quantity, unitPrice — tab or comma separated. SKUs matched by UPC or
 * size+color within the matched sample.
 */
export async function bulkPastePILines(
  piId: string,
  text: string,
): Promise<ActionResult> {
  await assertRole("member");
  const rows = text
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  if (rows.length === 0) return { ok: false, error: "Nothing to paste." };

  let created = 0;
  for (const row of rows) {
    const cols = row.split(/\t|,/).map((c) => c.trim());
    if (cols.length < 2) continue;
    // Heuristic: first col is sample #, last is unit price, 2nd-last is qty.
    const sampleNumber = cols[0];
    const unitPrice = toDecimal(cols[cols.length - 1]);
    const quantity = parseInt(cols[cols.length - 2] || "0", 10) || 0;
    if (!unitPrice) continue;

    const sample = await prisma.sample.findUnique({
      where: { sampleNumber },
      include: { skuVariants: true },
    });
    if (!sample) continue;

    // Optional size/color in middle columns.
    let skuVariantId: string | null = null;
    if (cols.length >= 4) {
      const size = cols[1];
      const color = cols[2];
      const match = sample.skuVariants.find(
        (v) => v.size.toLowerCase() === size.toLowerCase() && v.color.toLowerCase() === color.toLowerCase(),
      );
      skuVariantId = match?.id ?? null;
    }

    const data = await buildLineData(piId, sample.id, skuVariantId, quantity, unitPrice);
    await prisma.pILine.create({ data });
    created += 1;
  }

  if (created === 0) return { ok: false, error: "No rows matched a known sample #." };
  await afterLinesChanged(piId);
  revalidatePath(`/pis/${piId}`);
  return { ok: true, id: String(created) };
}

/** Recompute sample statuses, send variance alerts after lines change. */
async function afterLinesChanged(piId: string) {
  const pi = await prisma.proformaInvoice.findUnique({
    where: { id: piId },
    include: { lines: { include: { sample: true, skuVariant: true } }, factory: true },
  });
  if (!pi) return;

  // Advance linked samples to pi_received.
  const sampleIds = [...new Set(pi.lines.map((l) => l.sampleId).filter(Boolean))] as string[];
  for (const sid of sampleIds) {
    const sample = await prisma.sample.findUnique({ where: { id: sid } });
    if (!sample) continue;
    const next = advanceSampleStatus(sample.status, "pi_received");
    if (next !== sample.status) {
      await prisma.sample.update({ where: { id: sid }, data: { status: next } });
    }
  }

  // Variance alert email to admins for lines with non-zero variance.
  const varianceLines = pi.lines.filter((l) => l.variance && !l.variance.isZero() && l.resolution === "pending");
  if (varianceLines.length > 0) {
    const admins = await prisma.user.findMany({ where: { role: "admin", isActive: true }, select: { email: true } });
    if (admins.length > 0) {
      await sendEmail({
        to: admins.map((a) => a.email),
        subject: `FOB variance on PI ${pi.piNumber} (${varianceLines.length} line${varianceLines.length > 1 ? "s" : ""})`,
        react: VarianceAlertEmail({
          piNumber: pi.piNumber,
          factoryName: pi.factory.name,
          piUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/pis/${pi.id}`,
          rows: varianceLines.map((l) => ({
            label: `${l.sample?.sampleNumber ?? "—"} ${l.skuVariant ? `${l.skuVariant.size}/${l.skuVariant.color}` : ""}`.trim(),
            fob: formatMoney(l.fobSnapshot, pi.currency),
            unitPrice: formatMoney(l.unitPrice, pi.currency),
            variance: formatMoney(l.variance, pi.currency),
          })),
        }),
      });
    }
  }
}

export async function resolvePILine(
  lineId: string,
  piId: string,
  resolution: "approved" | "disputed",
): Promise<ActionResult> {
  const user = await assertRole("member");
  const line = await prisma.pILine.findUnique({ where: { id: lineId } });
  if (!line) return { ok: false, error: "Line not found" };

  await prisma.pILine.update({
    where: { id: lineId },
    data: { resolution, resolvedById: user.id, resolvedAt: new Date() },
  });
  await logAudit({
    entityType: "pi_line",
    entityId: lineId,
    action: resolution === "approved" ? "variance_approved" : "variance_disputed",
    userId: user.id,
    before: { resolution: line.resolution },
    after: { resolution },
  });

  // If all lines resolved-approved, advance PI + samples to pi_matched.
  await maybeMarkPiMatched(piId);
  revalidatePath(`/pis/${piId}`);
  return { ok: true };
}

async function maybeMarkPiMatched(piId: string) {
  const pi = await prisma.proformaInvoice.findUnique({
    where: { id: piId },
    include: { lines: true },
  });
  if (!pi || pi.lines.length === 0) return;
  const allApproved = pi.lines.every((l) => l.resolution === "approved");
  if (allApproved) {
    await prisma.proformaInvoice.update({ where: { id: piId }, data: { status: "approved" } });
    const sampleIds = [...new Set(pi.lines.map((l) => l.sampleId).filter(Boolean))] as string[];
    for (const sid of sampleIds) {
      const sample = await prisma.sample.findUnique({ where: { id: sid } });
      if (!sample) continue;
      const next = advanceSampleStatus(sample.status, "pi_matched");
      if (next !== sample.status) {
        await prisma.sample.update({ where: { id: sid }, data: { status: next } });
      }
    }
  }
}

const paymentSchema = z.object({
  piId: z.string().min(1),
  paymentTerms: z.string().optional(),
  depositPercent: z.string().optional(),
  depositPaidDate: z.string().optional(),
  balancePaidDate: z.string().optional(),
  status: z.enum(["received", "under_review", "approved", "disputed"]).optional(),
});

export async function updatePIPayment(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid" };
  const d = parsed.data;
  await prisma.proformaInvoice.update({
    where: { id: d.piId },
    data: {
      paymentTerms: d.paymentTerms,
      depositPercent: toDecimal(d.depositPercent),
      depositPaidDate: parseDateInput(d.depositPaidDate ?? null),
      balancePaidDate: parseDateInput(d.balancePaidDate ?? null),
      status: d.status,
    },
  });
  await logAudit({ entityType: "pi", entityId: d.piId, action: "payment_updated", userId: user.id });
  revalidatePath(`/pis/${d.piId}`);
  return { ok: true };
}

/** Issue a PO against a PI: next PO number, internal email, advance samples. */
export async function issuePO(piId: string, factoryEta?: string): Promise<ActionResult> {
  const user = await assertRole("member");
  const pi = await prisma.proformaInvoice.findUnique({
    where: { id: piId },
    include: { factory: true, lines: true },
  });
  if (!pi) return { ok: false, error: "PI not found" };

  const po = await prisma.$transaction(async (tx) => {
    const poNumber = await nextPoNumber(tx);
    const created = await tx.purchaseOrder.create({
      data: {
        poNumber,
        piId,
        issuedById: user.id,
        factoryEta: parseDateInput(factoryEta ?? null),
        status: "issued",
      },
    });
    if (factoryEta) {
      await tx.etaRevision.create({
        data: { parentType: "po", parentId: created.id, oldEta: null, newEta: parseDateInput(factoryEta), changedById: user.id, reason: "Initial factory ETA" },
      });
    }
    await logAudit(
      { entityType: "po", entityId: created.id, action: "created", userId: user.id, after: { poNumber, piId } },
      tx,
    );
    return created;
  });

  // Advance linked samples to po_issued.
  const sampleIds = [...new Set(pi.lines.map((l) => l.sampleId).filter(Boolean))] as string[];
  for (const sid of sampleIds) {
    const sample = await prisma.sample.findUnique({ where: { id: sid } });
    if (!sample) continue;
    const next = advanceSampleStatus(sample.status, "po_issued");
    if (next !== sample.status) {
      await prisma.sample.update({ where: { id: sid }, data: { status: next } });
    }
  }

  // Email PI + PO summary to internal distribution.
  const settings = await getSettings();
  if (settings.internalPoDistribution.length > 0) {
    await sendEmail({
      to: settings.internalPoDistribution,
      subject: `PO ${po.poNumber} issued against PI ${pi.piNumber}`,
      react: PoNotificationEmail({
        poNumber: po.poNumber,
        piNumber: pi.piNumber,
        factoryName: pi.factory.name,
        paymentTerms: pi.paymentTerms,
        poUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/pos/${po.id}`,
      }),
    });
  }

  revalidatePath("/pos");
  revalidatePath(`/pis/${piId}`);
  return { ok: true, id: po.id };
}
