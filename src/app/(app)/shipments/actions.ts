"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { parseDateInput } from "@/lib/date";
import { nextShipmentRef } from "@/lib/sequence";
import { getTrackingProvider } from "@/lib/tracking/provider";
import { applyTrackingUpdate } from "@/lib/tracking/alerts";
import { recomputeShipmentRisks } from "@/lib/tracking/risk";
import { getSettings } from "@/lib/settings";
import { extractBlFields, type BlFields } from "@/lib/bl-parse";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const createSchema = z.object({
  containerNumber: z.string().trim().optional(),
  mblNumber: z.string().trim().optional(),
  bookingNumber: z.string().trim().optional(),
  carrierScac: z.string().trim().optional(),
  originalEta: z.string().optional(),
  pol: z.string().trim().optional(),
  pod: z.string().trim().optional(),
  notes: z.string().optional(),
});

export async function createShipment(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;
  if (!d.containerNumber && !d.mblNumber && !d.bookingNumber) {
    return { ok: false, error: "Enter a container number, BOL number, or booking number." };
  }

  const settings = await getSettings();
  const originalEta = parseDateInput(d.originalEta ?? null);

  const shipment = await prisma.$transaction(async (tx) => {
    const shipmentRef = await nextShipmentRef(tx);
    return tx.shipment.create({
      data: {
        shipmentRef,
        containerNumber: d.containerNumber || null,
        mblNumber: d.mblNumber || null,
        bookingNumber: d.bookingNumber || null,
        carrierScac: d.carrierScac || null,
        pol: d.pol || null,
        pod: d.pod || null,
        notes: d.notes || null,
        originalEta,
        currentEta: originalEta,
        inlandBufferDays: settings.inlandBufferDaysDefault,
        trackingProvider: "manual",
      },
    });
  });

  // Subscribe with the tracking provider when configured; manual mode otherwise.
  const provider = getTrackingProvider();
  if (provider.configured) {
    try {
      const subscriptionId = await provider.subscribe({
        containerNumber: shipment.containerNumber,
        mblNumber: shipment.mblNumber,
        bookingNumber: shipment.bookingNumber,
        carrierScac: shipment.carrierScac,
      });
      if (subscriptionId) {
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: { trackingProvider: provider.name, trackingSubscriptionId: subscriptionId },
        });
      }
    } catch (err) {
      console.error("Tracking subscription failed; shipment stays in manual mode.", err);
    }
  }

  await logAudit({
    entityType: "shipment",
    entityId: shipment.id,
    action: "created",
    userId: user.id,
    after: { shipmentRef: shipment.shipmentRef },
  });
  revalidatePath("/shipments");
  return { ok: true, id: shipment.id };
}

/** Manual ETA edit — runs the same pipeline as a tracking update (revision, risk, alerts). */
export async function updateShipmentEta(shipmentId: string, etaInput: string): Promise<ActionResult> {
  const user = await assertRole("member");
  const eta = parseDateInput(etaInput);
  if (!eta) return { ok: false, error: "Enter a valid date." };
  await applyTrackingUpdate(shipmentId, { eta, events: [] }, "manual", user.id);
  revalidatePath(`/shipments/${shipmentId}`);
  revalidatePath("/shipments");
  return { ok: true };
}

const updateSchema = z.object({
  status: z.enum(["booked", "in_transit", "arrived_port", "inland", "delivered", "cancelled"]).optional(),
  inlandBufferDays: z.coerce.number().int().min(0).max(60).optional(),
  ata: z.string().optional(),
  notes: z.string().optional(),
});

export async function updateShipment(shipmentId: string, formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;
  const before = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });

  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      status: d.status,
      inlandBufferDays: d.inlandBufferDays,
      ata: d.ata !== undefined ? parseDateInput(d.ata) : undefined,
      notes: d.notes,
    },
  });
  await logAudit({
    entityType: "shipment",
    entityId: shipmentId,
    action: "updated",
    userId: user.id,
    before: { status: before.status, inlandBufferDays: before.inlandBufferDays },
    after: d,
  });
  await recomputeShipmentRisks(shipmentId);
  revalidatePath(`/shipments/${shipmentId}`);
  revalidatePath("/shipments");
  return { ok: true };
}

export async function linkPoToShipment(shipmentId: string, poId: string): Promise<ActionResult> {
  await assertRole("member");
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { purchaseOrders: { connect: { id: poId } } },
  });
  await recomputeShipmentRisks(shipmentId);
  revalidatePath(`/shipments/${shipmentId}`);
  return { ok: true };
}

export async function unlinkPoFromShipment(shipmentId: string, poId: string): Promise<ActionResult> {
  await assertRole("member");
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { purchaseOrders: { disconnect: { id: poId } } },
  });
  await recomputeShipmentRisks(shipmentId);
  revalidatePath(`/shipments/${shipmentId}`);
  return { ok: true };
}

export async function linkPackingListToShipment(
  shipmentId: string,
  packingListId: string,
): Promise<ActionResult> {
  await assertRole("member");
  await prisma.packingList.update({
    where: { id: packingListId },
    data: { shipmentId },
  });
  await recomputeShipmentRisks(shipmentId);
  revalidatePath(`/shipments/${shipmentId}`);
  return { ok: true };
}


const BLOB_URL_RE = /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i;

export type BlParseResult =
  | { ok: true; fields: BlFields; textLength: number }
  | { ok: false; error: string };

/**
 * Read an uploaded Bill of Lading (PDF) and extract shipment fields. Text-based
 * PDFs auto-fill; scanned PDFs yield little text (textLength ~0) so the UI
 * prompts for manual entry. Never creates anything — the caller confirms first.
 */
export async function parseBillOfLading(blobUrl: string): Promise<BlParseResult> {
  await assertRole("member");
  if (!BLOB_URL_RE.test(blobUrl)) return { ok: false, error: "Invalid upload URL." };
  const res = await fetch(blobUrl);
  if (!res.ok) return { ok: false, error: "Could not read the uploaded BL." };
  const buf = Buffer.from(await res.arrayBuffer());
  let text = "";
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const out = await parser.getText();
    text = out.text ?? "";
    await parser.destroy?.();
  } catch {
    // Unreadable/scanned PDF: fall through with empty text for manual entry.
  }
  return { ok: true, fields: extractBlFields(text), textLength: text.trim().length };
}

const blCreateSchema = z.object({
  containerNumber: z.string().trim().optional(),
  mblNumber: z.string().trim().optional(),
  bookingNumber: z.string().trim().optional(),
  vesselName: z.string().trim().optional(),
  voyage: z.string().trim().optional(),
  pol: z.string().trim().optional(),
  pod: z.string().trim().optional(),
  finalDestination: z.string().trim().optional(),
  originalEtd: z.string().optional(),
  originalEta: z.string().optional(),
  blobUrl: z.string().trim().optional(),
  filename: z.string().trim().optional(),
});

/** Create a shipment from confirmed BL fields and attach the BL document. */
export async function createShipmentFromBl(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const d = blCreateSchema.parse(Object.fromEntries(formData));
  if (!d.containerNumber && !d.mblNumber && !d.bookingNumber) {
    return { ok: false, error: "Need a container, BOL, or booking number to create a shipment." };
  }
  const settings = await getSettings();
  const originalEta = parseDateInput(d.originalEta ?? null);
  const originalEtd = parseDateInput(d.originalEtd ?? null);

  const shipment = await prisma.$transaction(async (tx) => {
    const shipmentRef = await nextShipmentRef(tx);
    const sh = await tx.shipment.create({
      data: {
        shipmentRef,
        containerNumber: d.containerNumber || null,
        mblNumber: d.mblNumber || null,
        bookingNumber: d.bookingNumber || null,
        vesselName: d.vesselName || null,
        voyage: d.voyage || null,
        pol: d.pol || null,
        pod: d.pod || null,
        finalDestination: d.finalDestination || null,
        originalEtd,
        currentEtd: originalEtd,
        originalEta,
        currentEta: originalEta,
        inlandBufferDays: settings.inlandBufferDaysDefault,
        trackingProvider: "manual",
      },
    });
    if (d.blobUrl && BLOB_URL_RE.test(d.blobUrl)) {
      await tx.attachment.create({
        data: { parentType: "shipment", parentId: sh.id, blobUrl: d.blobUrl, filename: d.filename || "bill-of-lading.pdf", mimeType: "application/pdf", uploadedById: user.id },
      });
    }
    return sh;
  });

  await logAudit({ entityType: "shipment", entityId: shipment.id, action: "created_from_bl", userId: user.id, after: { shipmentRef: shipment.shipmentRef, container: shipment.containerNumber } });
  revalidatePath("/shipments");
  return { ok: true, id: shipment.id };
}
