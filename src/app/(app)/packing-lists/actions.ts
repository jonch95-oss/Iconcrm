"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { computeThreeWay, isFullyMatched } from "@/lib/match";
import { advanceSampleStatus } from "@/lib/status";
import { parseDateInput } from "@/lib/date";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const createSchema = z.object({
  piId: z.string().min(1, "PI required"),
  poId: z.string().optional(),
  shipmentRef: z.string().optional(),
  vesselOrAwb: z.string().optional(),
  etd: z.string().optional(),
  eta: z.string().optional(),
  receivedAt: z.string().optional(),
});

export async function createPackingList(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;
  const pl = await prisma.packingList.create({
    data: {
      piId: d.piId,
      poId: d.poId || null,
      shipmentRef: d.shipmentRef,
      vesselOrAwb: d.vesselOrAwb,
      etd: parseDateInput(d.etd ?? null),
      eta: parseDateInput(d.eta ?? null),
      receivedAt: parseDateInput(d.receivedAt ?? null),
    },
  });
  await logAudit({ entityType: "packing_list", entityId: pl.id, action: "created", userId: user.id });
  revalidatePath("/packing-lists");
  return { ok: true, id: pl.id };
}

const lineSchema = z.object({
  packingListId: z.string().min(1),
  skuVariantId: z.string().min(1, "SKU required"),
  cartons: z.coerce.number().int().min(0),
  unitsShipped: z.coerce.number().int().min(0),
});

export async function addPackingLine(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = lineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const pl = await prisma.packingList.findUnique({ where: { id: parsed.data.packingListId } });
  if (!pl) return { ok: false, error: "Packing list not found" };

  await prisma.packingListLine.create({ data: parsed.data });
  await afterPackingChanged(pl.piId, user.id);
  revalidatePath(`/packing-lists/${parsed.data.packingListId}`);
  return { ok: true };
}

/** Bulk paste: UPC, cartons, unitsShipped (tab/comma separated). */
export async function bulkPastePackingLines(
  packingListId: string,
  text: string,
): Promise<ActionResult> {
  const user = await assertRole("member");
  const pl = await prisma.packingList.findUnique({ where: { id: packingListId } });
  if (!pl) return { ok: false, error: "Packing list not found" };

  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  let created = 0;
  for (const row of rows) {
    const cols = row.split(/\t|,/).map((c) => c.trim());
    if (cols.length < 3) continue;
    const upc = cols[0];
    const cartons = parseInt(cols[1] || "0", 10) || 0;
    const unitsShipped = parseInt(cols[2] || "0", 10) || 0;
    const sku = await prisma.skuVariant.findUnique({ where: { upc } });
    if (!sku) continue;
    await prisma.packingListLine.create({
      data: { packingListId, skuVariantId: sku.id, cartons, unitsShipped },
    });
    created += 1;
  }
  if (created === 0) return { ok: false, error: "No rows matched a known UPC." };
  await afterPackingChanged(pl.piId, user.id);
  revalidatePath(`/packing-lists/${packingListId}`);
  return { ok: true, id: String(created) };
}

export async function deletePackingLine(
  lineId: string,
  packingListId: string,
  piId: string,
): Promise<ActionResult> {
  const user = await assertRole("member");
  await prisma.packingListLine.delete({ where: { id: lineId } });
  await afterPackingChanged(piId, user.id);
  revalidatePath(`/packing-lists/${packingListId}`);
  return { ok: true };
}

/**
 * Recompute the cumulative 3-way match across ALL packing lists on the PI.
 * When fully matched, advance linked samples to packing_list_matched and mark
 * the sample shipped/closed pipeline accordingly.
 */
async function afterPackingChanged(piId: string, userId: string) {
  const pi = await prisma.proformaInvoice.findUnique({
    where: { id: piId },
    include: {
      lines: { select: { skuVariantId: true, quantity: true, sampleId: true } },
      packingLists: { select: { lines: { select: { skuVariantId: true, unitsShipped: true } } } },
    },
  });
  if (!pi) return;

  const packingLines = pi.packingLists.flatMap((pl) => pl.lines);
  const result = computeThreeWay(pi.lines, packingLines);

  const sampleIds = [...new Set(pi.lines.map((l) => l.sampleId).filter(Boolean))] as string[];
  const target = isFullyMatched(result) ? "packing_list_matched" : "shipped";
  for (const sid of sampleIds) {
    const sample = await prisma.sample.findUnique({ where: { id: sid } });
    if (!sample) continue;
    const next = advanceSampleStatus(sample.status, target);
    if (next !== sample.status) {
      await prisma.sample.update({ where: { id: sid }, data: { status: next } });
      await logAudit({
        entityType: "sample",
        entityId: sid,
        action: "status_changed",
        userId,
        before: { status: sample.status },
        after: { status: next, via: "packing_list" },
      });
    }
  }
}
