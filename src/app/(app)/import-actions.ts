"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { toDecimal } from "@/lib/money";
import { parseSamplesWorkbook, parsePiLinesWorkbook } from "@/lib/import-excel";
import { computeFobLine } from "@/lib/match";
import { detectCarrier, resolveParcel, type ParcelCarrier } from "@/lib/parcel";
import type { Prisma, SampleStatus } from "@prisma/client";

const VALID_STATUS = new Set([
  "sample_requested", "eta_set", "sample_received", "quoted", "on_order_form",
  "pi_received", "pi_matched", "po_issued", "in_production", "shipped",
  "packing_list_matched", "closed",
]);

export interface ImportSummary {
  ok: boolean;
  error?: string;
  created: number;
  updated: number;
  variantsAdded: number;
  photosAdded: number;
  skipped: { row: number; reason: string }[];
  mappedColumns?: Record<string, string>;
}

const EMPTY: ImportSummary = { ok: false, created: 0, updated: 0, variantsAdded: 0, photosAdded: 0, skipped: [] };

async function readUpload(formData: FormData): Promise<Buffer | string> {
  // Large files (sample sheets with embedded photos) are uploaded directly to
  // Vercel Blob from the browser, bypassing the ~4.5MB server-action body cap.
  // The client then passes the resulting blobUrl here and we fetch it server-
  // side (no cap on outbound fetch).
  const blobUrl = formData.get("blobUrl");
  if (typeof blobUrl === "string" && blobUrl) {
    if (!/^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(blobUrl)) {
      return "Invalid upload URL.";
    }
    const res = await fetch(blobUrl);
    if (!res.ok) return "Could not read the uploaded file.";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 50 * 1024 * 1024) return "File is too large (50 MB max).";
    return buf;
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose an Excel file first.";
  if (file.size > 10 * 1024 * 1024) return "File is too large (10 MB max).";
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm")) {
    return "Please upload an .xlsx file (in Excel: File → Save As → .xlsx).";
  }
  return Buffer.from(await file.arrayBuffer());
}

/**
 * Bulk import samples (and their size/color/UPC variants) from Excel.
 * Rows sharing a Sample # are grouped: the first row sets the sample's fields,
 * and every row with size/color/UPC adds a SKU variant. Existing samples are
 * updated with any non-empty values provided.
 */
export async function importSamplesExcel(formData: FormData): Promise<ImportSummary> {
  const user = await assertRole("member");
  const buf = await readUpload(formData);
  if (typeof buf === "string") return { ...EMPTY, error: buf };

  const parsed = await parseSamplesWorkbook(buf);
  if (parsed.error) return { ...EMPTY, error: parsed.error };
  // Accept either a Sample # column or a STYLE # column as the row key.
  // Sample-request sheets (IMAGE/Brand/STYLE #/DESCRIPTION/COLOR/Season) use
  // STYLE #; SKU-style sheets use Sample #.
  if (!parsed.mappedColumns.sampleNumber && !parsed.mappedColumns.styleNumber) {
    return { ...EMPTY, error: "No Sample # or STYLE # column found — every row needs one." };
  }

  const summary: ImportSummary = { ok: true, created: 0, updated: 0, variantsAdded: 0, photosAdded: 0, skipped: [], mappedColumns: parsed.mappedColumns };
  const factoryCache = new Map<string, string>();
  // Embedded pictures, keyed by the worksheet row they're anchored to.
  const imageByRow = new Map(parsed.images.map((img) => [img.rowNumber, img]));
  const rowToSample = new Map<number, string>(); // worksheet row -> sampleId
  let currentSampleId: string | null = null;
  let currentSampleNumber = "";

  for (const row of parsed.rows.slice(0, 2000)) {
    const v = row.values;
    // Key on Sample # when present; otherwise fall back to STYLE # so
    // sample-request sheets (IMAGE / Brand / STYLE # / DESCRIPTION / COLOR /
    // Season) import one sample per style row, same as the emailed sheets.
    const sampleNumber = ((v.sampleNumber ?? v.styleNumber) ?? "").trim();

    try {
      if (sampleNumber && sampleNumber !== currentSampleNumber) {
        currentSampleNumber = sampleNumber;

        let factoryId: string | undefined;
        const factoryName = (v.factoryName ?? "").trim();
        if (factoryName) {
          if (!factoryCache.has(factoryName)) {
            const f =
              (await prisma.factory.findFirst({ where: { name: { equals: factoryName, mode: "insensitive" } } })) ??
              (await prisma.factory.create({ data: { name: factoryName } }));
            factoryCache.set(factoryName, f.id);
          }
          factoryId = factoryCache.get(factoryName);
        }

        const statusRaw = (v.status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
        const fields = {
          status: VALID_STATUS.has(statusRaw) ? (statusRaw as SampleStatus) : undefined,
          brand: v.brand?.trim() || undefined,
          category: v.category?.trim() || undefined,
          styleNumber: v.styleNumber?.trim() || undefined,
          styleName: v.styleName?.trim() || v.description?.trim() || undefined,
          description: v.description?.trim() || undefined,
          color: v.color?.trim() || undefined,
          season: v.season?.trim() || undefined,
          targetCustomer: v.targetCustomer?.trim() || undefined,
          fobCost: toDecimal(v.fobCost) ?? undefined,
          customerSellPrice: toDecimal(v.customerSellPrice) ?? undefined,
          dutyRatePercent: toDecimal(v.dutyRatePercent) ?? undefined,
          freightPerUnit: toDecimal(v.freightPerUnit) ?? undefined,
          inlandPerUnit: toDecimal(v.inlandPerUnit) ?? undefined,
          htsCode: v.htsCode?.trim() || undefined,
          composition: v.composition?.trim() || undefined,
          cbmPerCarton: toDecimal(v.cbmPerCarton) ?? undefined,
          casePackDefault: v.casePackDefault ? parseInt(v.casePackDefault, 10) || undefined : undefined,
          trackingNumber: v.trackingNumber?.trim() || undefined,
          trackingCarrier: v.trackingNumber?.trim()
            ? ((v.trackingCarrier?.trim().toLowerCase() as ParcelCarrier) || detectCarrier(v.trackingNumber.trim()))
            : undefined,
          factoryId,
        };

        const existing = await prisma.sample.findUnique({ where: { sampleNumber } });
        if (existing) {
          await prisma.sample.update({ where: { id: existing.id }, data: fields });
          currentSampleId = existing.id;
          summary.updated += 1;
        } else {
          const created = await prisma.sample.create({
            data: {
              sampleNumber,
              ...fields,
              status: fields.fobCost ? "quoted" : "sample_requested",
              requestedById: user.id,
            },
          });
          currentSampleId = created.id;
          summary.created += 1;
        }
      }

      if (!currentSampleId) {
        summary.skipped.push({ row: row.rowNumber, reason: "No Sample # on or above this row" });
        continue;
      }
      rowToSample.set(row.rowNumber, currentSampleId);

      // Variant on this row?
      const upc = (v.upc ?? "").trim();
      const size = (v.size ?? "").trim();
      const color = (v.color ?? "").trim();
      if (upc || (size && color)) {
        if (!upc) {
          summary.skipped.push({ row: row.rowNumber, reason: "Size/color without a UPC" });
          continue;
        }
        const dup = await prisma.skuVariant.findUnique({ where: { upc } });
        if (dup) {
          if (dup.sampleId !== currentSampleId) {
            summary.skipped.push({ row: row.rowNumber, reason: `UPC ${upc} already belongs to another sample` });
            continue;
          }
          // Same sample: bulk-update the variant's details from the sheet.
          await prisma.skuVariant.update({
            where: { id: dup.id },
            data: {
              size: size || dup.size,
              color: color || dup.color,
              skuCode: v.skuCode?.trim() || dup.skuCode,
            },
          });
          continue;
        }
        await prisma.skuVariant.create({
          data: {
            sampleId: currentSampleId,
            upc,
            size: size || "OS",
            color: color || "—",
            skuCode: v.skuCode?.trim() || null,
            unitsPerCarton: v.casePackDefault ? parseInt(v.casePackDefault, 10) || null : null,
          },
        });
        summary.variantsAdded += 1;
      }
    } catch (err) {
      summary.skipped.push({
        row: row.rowNumber,
        reason: err instanceof Error ? err.message.split("\n")[0].slice(0, 120) : "Unknown error",
      });
    }
  }

  // Live ETAs for any tracking numbers in the file (best-effort, parallel,
  // capped so a big sheet can't stall the import).
  {
    const tracked = await prisma.sample.findMany({
      where: {
        trackingNumber: { not: null },
        sampleReceivedDate: null,
        id: { in: [...rowToSample.values()] },
      },
      select: { id: true, trackingNumber: true, trackingCarrier: true },
      take: 50,
    });
    await Promise.allSettled(
      tracked.map(async (t) => {
        const live = await resolveParcel(t.trackingNumber!, (t.trackingCarrier ?? "other") as ParcelCarrier);
        if (live) {
          await prisma.sample.update({
            where: { id: t.id },
            data: { trackingEta: live.eta, trackingStatus: live.status ?? undefined },
          });
        }
      }),
    );
  }

  // Photos embedded in the spreadsheet: each image belongs to the sample
  // owning the row it's anchored to. The last image per sample wins.
  if (imageByRow.size > 0) {
    const { uploadBlob } = await import("@/lib/blob");
    // Compress embedded photos before storing: they render as ~130px
    // thumbnails, so full-resolution images just waste storage/bandwidth.
    // Load sharp lazily and tolerate its absence: if it can't be resolved or
    // initialized at runtime, fall back to storing the original bytes rather
    // than failing the whole import after samples were already created.
    let sharp: typeof import("sharp").default | null = null;
    try {
      sharp = (await import("sharp")).default;
    } catch {
      // sharp unavailable — photos will be stored uncompressed.
    }
    let storageDown = false;
    for (const [rowNumber, img] of imageByRow) {
      const sampleId =
        rowToSample.get(rowNumber) ??
        // Images sometimes anchor a row above/below their data row.
        rowToSample.get(rowNumber + 1) ??
        rowToSample.get(rowNumber - 1);
      if (!sampleId) continue;
      try {
        let buffer: Buffer = img.buffer;
        let ext = img.extension;
        if (sharp) {
          try {
            buffer = await sharp(img.buffer)
              .resize({ width: 700, height: 700, fit: "inside", withoutEnlargement: true })
              .jpeg({ quality: 72 })
              .toBuffer();
            ext = "jpeg";
          } catch {
            // If sharp can't read it, fall back to the original bytes.
          }
        }
        const url = await uploadBlob(
          `samples/${sampleId}/import-row-${rowNumber}.${ext}`,
          buffer,
          `image/${ext}`,
        );
        await prisma.sample.update({ where: { id: sampleId }, data: { imageUrl: url } });
        summary.photosAdded += 1;
      } catch {
        storageDown = true;
      }
    }
    if (storageDown) {
      summary.skipped.push({
        row: 0,
        reason: "Photos found in the file but image storage isn't set up (Vercel → Storage → Blob).",
      });
    }
  }

  await logAudit({
    entityType: "sample",
    entityId: "bulk_import",
    action: "excel_import",
    userId: user.id,
    after: { created: summary.created, updated: summary.updated, variants: summary.variantsAdded, photos: summary.photosAdded },
  });
  revalidatePath("/samples");
  return summary;
}

/**
 * Import PI lines from a factory Excel. Each row needs a quantity + unit price
 * plus something to match on: UPC (best), or Style # / Sample # (matched at
 * the style level). FOB variance is computed exactly like manual entry.
 */
export async function importPiLinesExcel(piId: string, formData: FormData): Promise<ImportSummary> {
  const user = await assertRole("member");
  const buf = await readUpload(formData);
  if (typeof buf === "string") return { ...EMPTY, error: buf };

  const pi = await prisma.proformaInvoice.findUnique({ where: { id: piId }, select: { id: true } });
  if (!pi) return { ...EMPTY, error: "PI not found." };

  const parsed = await parsePiLinesWorkbook(buf);
  if (parsed.error) return { ...EMPTY, error: parsed.error };
  if (!parsed.mappedColumns.quantity || !parsed.mappedColumns.unitPrice) {
    return { ...EMPTY, error: "Need both a quantity column and a price column." };
  }

  const summary: ImportSummary = { ok: true, created: 0, updated: 0, variantsAdded: 0, photosAdded: 0, skipped: [], mappedColumns: parsed.mappedColumns };

  for (const row of parsed.rows.slice(0, 1000)) {
    const v = row.values;
    const quantity = parseInt(v.quantity ?? "", 10);
    const unitPrice = toDecimal(v.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || !unitPrice) {
      summary.skipped.push({ row: row.rowNumber, reason: "Missing or invalid quantity/price" });
      continue;
    }

    // Resolve sample / SKU.
    let sampleId: string | null = null;
    let skuVariantId: string | null = null;
    const upc = (v.upc ?? "").trim();
    if (upc) {
      const sku = await prisma.skuVariant.findUnique({ where: { upc }, select: { id: true, sampleId: true } });
      if (sku) {
        skuVariantId = sku.id;
        sampleId = sku.sampleId;
      }
    }
    if (!sampleId) {
      const styleNo = (v.styleNumber ?? "").trim();
      const sampleNo = (v.sampleNumber ?? "").trim();
      const sample =
        (sampleNo && (await prisma.sample.findUnique({ where: { sampleNumber: sampleNo }, select: { id: true } }))) ||
        (styleNo &&
          (await prisma.sample.findFirst({
            where: { styleNumber: { equals: styleNo, mode: "insensitive" } },
            select: { id: true },
          }))) ||
        null;
      if (sample) sampleId = sample.id;
    }
    if (!sampleId) {
      summary.skipped.push({ row: row.rowNumber, reason: `No matching style/UPC (${upc || v.styleNumber || v.sampleNumber || "blank"})` });
      continue;
    }

    let fob: Prisma.Decimal | null = null;
    const sample = await prisma.sample.findUnique({ where: { id: sampleId }, select: { fobCost: true } });
    fob = sample?.fobCost ?? null;
    const match = computeFobLine(unitPrice, fob);

    await prisma.pILine.create({
      data: {
        piId,
        sampleId,
        skuVariantId,
        quantity,
        unitPrice,
        fobSnapshot: fob,
        variance: match.variance,
        variancePercent: match.variancePercent,
        resolution: match.hasFob && match.matches ? "approved" : "pending",
      },
    });
    summary.created += 1;
  }

  await logAudit({
    entityType: "pi",
    entityId: piId,
    action: "excel_import_lines",
    userId: user.id,
    after: { created: summary.created, skipped: summary.skipped.length },
  });
  revalidatePath(`/pis/${piId}`);
  return summary;
}
