"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { toDecimal } from "@/lib/money";
import { parseSamplesWorkbook, parsePiLinesWorkbook, parseCustomerPoWorkbook, parseInventoryWorkbook, parseSkuWorkbook, parseColorCodeWorkbook } from "@/lib/import-excel";
import { buildHtsResolver } from "@/lib/hts";
import { advanceSampleStatus } from "@/lib/status";
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

  // Imported samples are given an estimated arrival 6 weeks out from the
  // upload date (overridable later per sample).
  const importEta = new Date(Date.now() + 42 * 24 * 60 * 60 * 1000);

  // HTS auto-fill: category + material -> HTS (+ effective duty), always applied.
  const htsRows = await prisma.htsMapping
    .findMany({ select: { category: true, material: true, htsCode: true, totalTariff: true } })
    .catch(() => [] as { category: string; material: string; htsCode: string; totalTariff: unknown }[]);
  const resolveHts = buildHtsResolver(htsRows as { category: string; material: string; htsCode: string; totalTariff: number | null }[]);

  // Color codes for SKU auto-generation, and which samples had a color received.
  const colorCodeRows = await prisma.colorCode.findMany().catch(() => [] as { color: string; code: string }[]);
  const colorCodeMap = new Map(colorCodeRows.map((c) => [c.color.trim().toUpperCase(), c.code]));
  const receivedSampleIds = new Set<string>();

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
          size: v.size?.trim() || undefined,
          season: v.season?.trim() || undefined,
          targetCustomer: v.targetCustomer?.trim() || undefined,
          fobCost: toDecimal(v.fobCost) ?? undefined,
          customerSellPrice: toDecimal(v.customerSellPrice) ?? undefined,
          dutyRatePercent: toDecimal(v.dutyRatePercent) ?? undefined,
          freightPerUnit: toDecimal(v.freightPerUnit) ?? undefined,
          inlandPerUnit: toDecimal(v.inlandPerUnit) ?? undefined,
          htsCode: v.htsCode?.trim() || undefined,
          composition: v.composition?.trim() || undefined,
          material: v.material?.trim() || undefined,
          cbmPerCarton: toDecimal(v.cbmPerCarton) ?? undefined,
          casePackDefault: v.casePackDefault ? parseInt(v.casePackDefault, 10) || undefined : undefined,
          trackingNumber: v.trackingNumber?.trim() || undefined,
          trackingCarrier: v.trackingNumber?.trim()
            ? ((v.trackingCarrier?.trim().toLowerCase() as ParcelCarrier) || detectCarrier(v.trackingNumber.trim()))
            : undefined,
          factoryId,
        };

        // Always set HTS (+ effective duty) from the mapping when it resolves.
        const htsHit = resolveHts(fields.category, fields.material);
        if (htsHit) {
          fields.htsCode = htsHit.htsCode;
          if (htsHit.totalTariff != null) fields.dutyRatePercent = toDecimal(htsHit.totalTariff * 100) ?? undefined;
        }

        const existing = await prisma.sample.findUnique({ where: { sampleNumber } });
        if (existing) {
          await prisma.sample.update({
            where: { id: existing.id },
            // Only set the 6-week ETA when one isn't already present, so a
            // manually-adjusted ETA survives a re-import.
            data: { ...fields, ...(existing.sampleEta ? {} : { sampleEta: importEta }) },
          });
          currentSampleId = existing.id;
          summary.updated += 1;
        } else {
          const created = await prisma.sample.create({
            data: {
              sampleNumber,
              ...fields,
              sampleEta: importEta,
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

      // SKU variant for this row: any row with a color (or UPC) becomes a
      // variant grouped under this sample family (repeat the Sample # per color).
      // UPC is optional — the SKU auto-builds from the color code when absent.
      // A Received flag marks the one color whose physical sample we got.
      const upc = (v.upc ?? "").trim();
      const size = (v.size ?? "").trim() || "OS";
      const color = (v.color ?? "").trim();
      const received = ["y", "yes", "true", "1", "x", "received"].includes((v.received ?? "").trim().toLowerCase());
      if (upc || color) {
        const provided = v.skuCode?.trim();
        const code = color ? colorCodeMap.get(color.toUpperCase()) : undefined;
        const autoSku = code ? `${currentSampleNumber.replace(/[^a-zA-Z0-9]/g, "")}${code}` : null;
        const skuCode = provided || autoSku;
        const units = v.casePackDefault ? parseInt(v.casePackDefault, 10) || null : null;

        let dup = upc ? await prisma.skuVariant.findUnique({ where: { upc } }) : null;
        if (!dup && color) {
          dup = await prisma.skuVariant.findFirst({
            where: {
              sampleId: currentSampleId,
              size: { equals: size, mode: "insensitive" },
              color: { equals: color || "—", mode: "insensitive" },
            },
          });
        }
        if (dup) {
          if (dup.sampleId !== currentSampleId) {
            summary.skipped.push({ row: row.rowNumber, reason: `UPC ${upc} already belongs to another sample` });
            continue;
          }
          await prisma.skuVariant.update({
            where: { id: dup.id },
            data: {
              size,
              color: color || dup.color,
              upc: upc || dup.upc,
              skuCode: skuCode ?? dup.skuCode,
              unitsPerCarton: units ?? dup.unitsPerCarton,
              ...(received ? { received: true } : {}),
            },
          });
        } else {
          await prisma.skuVariant.create({
            data: {
              sampleId: currentSampleId,
              upc: upc || null,
              size,
              color: color || "—",
              skuCode: skuCode ?? null,
              unitsPerCarton: units,
              received,
            },
          });
          summary.variantsAdded += 1;
        }
        if (received) receivedSampleIds.add(currentSampleId);
      }
    } catch (err) {
      summary.skipped.push({
        row: row.rowNumber,
        reason: err instanceof Error ? err.message.split("\n")[0].slice(0, 120) : "Unknown error",
      });
    }
  }

  // Any sample with a color marked received advances to Sample Received.
  for (const sid of receivedSampleIds) {
    const sm = await prisma.sample.findUnique({ where: { id: sid }, select: { status: true, sampleReceivedDate: true } });
    if (!sm) continue;
    await prisma.sample.update({
      where: { id: sid },
      data: {
        status: advanceSampleStatus(sm.status, "sample_received"),
        sampleReceivedDate: sm.sampleReceivedDate ?? new Date(),
      },
    });
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
    // (Inferred type avoids sharp's `export =` typing quirks.)
    const sharp = await import("sharp")
      .then((m) => m.default)
      .catch(() => null);
    let storageDown = false;

    // Resolve each embedded image to the sample that owns its row, then
    // compress + upload with bounded concurrency. Doing these one-at-a-time
    // previously blew past the function time limit on sheets with dozens of
    // photos (the cause of the import "Failed to fetch").
    type ImageJob = {
      rowNumber: number;
      img: NonNullable<ReturnType<typeof imageByRow.get>>;
      sampleId: string;
    };
    const jobs: ImageJob[] = [];
    for (const [rowNumber, img] of imageByRow) {
      const sampleId =
        rowToSample.get(rowNumber) ??
        // Images sometimes anchor a row above/below their data row.
        rowToSample.get(rowNumber + 1) ??
        rowToSample.get(rowNumber - 1);
      if (sampleId) jobs.push({ rowNumber, img, sampleId });
    }

    const processImage = async ({ rowNumber, img, sampleId }: ImageJob) => {
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
    };

    // Run up to 6 image jobs at once so a photo-heavy sheet finishes quickly.
    const CONCURRENCY = 6;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
        while (cursor < jobs.length) {
          await processImage(jobs[cursor++]);
        }
      }),
    );
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


/**
 * Import customer PO line items (style # + quantity) from an Excel sheet.
 * Replaces any existing lines so a re-upload is idempotent. These lines are
 * matched against our internal PO(s) by style number on the customer PO page.
 */
export async function importCustomerPoLines(customerPoId: string, formData: FormData): Promise<ImportSummary> {
  const user = await assertRole("member");
  const buf = await readUpload(formData);
  if (typeof buf === "string") return { ...EMPTY, error: buf };

  const cpo = await prisma.customerPO.findUnique({ where: { id: customerPoId }, select: { id: true } });
  if (!cpo) return { ...EMPTY, error: "Customer PO not found." };

  const parsed = await parseCustomerPoWorkbook(buf);
  if (parsed.error) return { ...EMPTY, error: parsed.error };
  if (!parsed.mappedColumns.styleNumber) return { ...EMPTY, error: "No Style # column found." };
  if (!parsed.mappedColumns.quantity) return { ...EMPTY, error: "No Quantity column found." };

  const summary: ImportSummary = { ok: true, created: 0, updated: 0, variantsAdded: 0, photosAdded: 0, skipped: [], mappedColumns: parsed.mappedColumns };

  // Replace existing lines so re-uploading the corrected sheet just works.
  await prisma.customerPoLine.deleteMany({ where: { customerPoId } });

  for (const row of parsed.rows.slice(0, 5000)) {
    const v = row.values;
    const styleNumber = (v.styleNumber ?? "").trim();
    const quantity = parseInt(v.quantity ?? "", 10);
    if (!styleNumber) {
      summary.skipped.push({ row: row.rowNumber, reason: "No style #" });
      continue;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      summary.skipped.push({ row: row.rowNumber, reason: "Missing or invalid quantity" });
      continue;
    }
    await prisma.customerPoLine.create({
      data: {
        customerPoId,
        styleNumber,
        description: v.description?.trim() || null,
        color: v.color?.trim() || null,
        size: v.size?.trim() || null,
        quantity,
        unitPrice: toDecimal(v.unitPrice) ?? null,
      },
    });
    summary.created += 1;
  }

  await logAudit({
    entityType: "customer_po",
    entityId: customerPoId,
    action: "import_lines",
    userId: user.id,
    after: { created: summary.created, skipped: summary.skipped.length },
  });
  revalidatePath(`/customer-pos/${customerPoId}`);
  return summary;
}


/**
 * Import on-hand stock counts from Excel. Each row needs a quantity (on-hand)
 * plus a UPC (best) or Style # (+ optional size/color) to resolve the SKU.
 * Recorded as a reconciling ledger movement so on-hand becomes the counted
 * number. Re-uploading a fresh count just books the difference.
 */
export async function importInventoryCounts(formData: FormData): Promise<ImportSummary> {
  const user = await assertRole("member");
  const buf = await readUpload(formData);
  if (typeof buf === "string") return { ...EMPTY, error: buf };

  const parsed = await parseInventoryWorkbook(buf);
  if (parsed.error) return { ...EMPTY, error: parsed.error };
  if (!parsed.mappedColumns.quantity) return { ...EMPTY, error: "No quantity / on-hand column found." };
  if (!parsed.mappedColumns.upc && !parsed.mappedColumns.styleNumber) {
    return { ...EMPTY, error: "Need a UPC or Style # column to match SKUs." };
  }

  const summary: ImportSummary = { ok: true, created: 0, updated: 0, variantsAdded: 0, photosAdded: 0, skipped: [], mappedColumns: parsed.mappedColumns };

  for (const row of parsed.rows.slice(0, 5000)) {
    const v = row.values;
    const qty = parseInt(v.quantity ?? "", 10);
    if (!Number.isFinite(qty) || qty < 0) {
      summary.skipped.push({ row: row.rowNumber, reason: "Missing or invalid quantity" });
      continue;
    }
    let sku: { id: string } | null = null;
    const upc = (v.upc ?? "").trim();
    if (upc) sku = await prisma.skuVariant.findUnique({ where: { upc }, select: { id: true } });
    if (!sku) {
      const style = (v.styleNumber ?? "").trim();
      const size = (v.size ?? "").trim();
      const color = (v.color ?? "").trim();
      if (style) {
        sku = await prisma.skuVariant.findFirst({
          where: {
            sample: { styleNumber: { equals: style, mode: "insensitive" } },
            ...(size ? { size: { equals: size, mode: "insensitive" } } : {}),
            ...(color ? { color: { equals: color, mode: "insensitive" } } : {}),
          },
          select: { id: true },
        });
      }
    }
    if (!sku) {
      summary.skipped.push({ row: row.rowNumber, reason: `No SKU match (${upc || v.styleNumber || "blank"})` });
      continue;
    }
    const agg = await prisma.inventoryMovement.aggregate({ where: { skuVariantId: sku.id }, _sum: { delta: true } });
    const current = agg._sum.delta ?? 0;
    const delta = qty - current;
    if (delta !== 0) {
      await prisma.inventoryMovement.create({
        data: { skuVariantId: sku.id, delta, reason: "count", source: "excel", createdById: user.id },
      });
    }
    summary.created += 1;
  }

  await logAudit({ entityType: "inventory", entityId: "bulk_count", action: "import_counts", userId: user.id, after: { rows: summary.created, skipped: summary.skipped.length } });
  revalidatePath("/inventory");
  return summary;
}


/** Import/replace-in-place a sample's SKU rows from a small per-sample sheet. */
export async function importSkusForSample(sampleId: string, formData: FormData): Promise<ImportSummary> {
  await assertRole("member");
  const buf = await readUpload(formData);
  if (typeof buf === "string") return { ...EMPTY, error: buf };
  const sample = await prisma.sample.findUnique({ where: { id: sampleId }, select: { id: true, sampleNumber: true } });
  if (!sample) return { ...EMPTY, error: "Sample not found." };
  const parsed = await parseSkuWorkbook(buf);
  if (parsed.error) return { ...EMPTY, error: parsed.error };

  const summary: ImportSummary = { ok: true, created: 0, updated: 0, variantsAdded: 0, photosAdded: 0, skipped: [], mappedColumns: parsed.mappedColumns };
  const ccRows = await prisma.colorCode.findMany().catch(() => [] as { color: string; code: string }[]);
  const ccMap = new Map(ccRows.map((c) => [c.color.trim().toUpperCase(), c.code]));
  const base = sample.sampleNumber.replace(/[^a-zA-Z0-9]/g, "");
  let anyReceived = false;
  for (const row of parsed.rows.slice(0, 3000)) {
    const v = row.values;
    const size = (v.size ?? "").trim();
    const color = (v.color ?? "").trim();
    const upc = (v.upc ?? "").trim();
    const receivedRow = ["y", "yes", "true", "1", "x", "received"].includes((v.received ?? "").trim().toLowerCase());
    if (receivedRow) anyReceived = true;
    const code = color ? ccMap.get(color.toUpperCase()) : undefined;
    const skuCode = (v.skuCode ?? "").trim() || (code ? `${base}${code}` : null);
    const units = v.unitsPerCarton ? parseInt(v.unitsPerCarton, 10) || null : null;
    if (!size && !color && !upc) continue;

    let existing = upc ? await prisma.skuVariant.findUnique({ where: { upc } }) : null;
    if (!existing && (size || color)) {
      existing = await prisma.skuVariant.findFirst({
        where: { sampleId, size: { equals: size, mode: "insensitive" }, color: { equals: color, mode: "insensitive" } },
      });
    }
    if (existing) {
      if (existing.sampleId !== sampleId) {
        summary.skipped.push({ row: row.rowNumber, reason: `UPC ${upc} belongs to another sample` });
        continue;
      }
      await prisma.skuVariant.update({
        where: { id: existing.id },
        data: {
          size: size || existing.size,
          color: color || existing.color,
          upc: upc || existing.upc,
          skuCode: skuCode ?? existing.skuCode,
          unitsPerCarton: units ?? existing.unitsPerCarton,
          ...(receivedRow ? { received: true } : {}),
        },
      });
      summary.updated += 1;
    } else {
      await prisma.skuVariant.create({
        data: { sampleId, size: size || "OS", color: color || "—", upc: upc || null, skuCode, unitsPerCarton: units, received: receivedRow },
      });
      summary.created += 1;
    }
  }
  if (anyReceived) {
    const sm = await prisma.sample.findUnique({ where: { id: sampleId }, select: { status: true, sampleReceivedDate: true } });
    if (sm) {
      await prisma.sample.update({
        where: { id: sampleId },
        data: { status: advanceSampleStatus(sm.status, "sample_received"), sampleReceivedDate: sm.sampleReceivedDate ?? new Date() },
      });
    }
  }
  revalidatePath(`/samples/${sampleId}`);
  return summary;
}


/** Import/replace color -> code mappings from Excel (admin). */
export async function importColorCodes(formData: FormData): Promise<ImportSummary> {
  await assertRole("admin");
  const buf = await readUpload(formData);
  if (typeof buf === "string") return { ...EMPTY, error: buf };
  const parsed = await parseColorCodeWorkbook(buf);
  if (parsed.error) return { ...EMPTY, error: parsed.error };
  if (!parsed.mappedColumns.color || !parsed.mappedColumns.code) {
    return { ...EMPTY, error: "Need a Color column and a Code column." };
  }
  const summary: ImportSummary = { ok: true, created: 0, updated: 0, variantsAdded: 0, photosAdded: 0, skipped: [], mappedColumns: parsed.mappedColumns };
  for (const row of parsed.rows.slice(0, 5000)) {
    const v = row.values;
    const color = (v.color ?? "").trim().toUpperCase();
    const code = (v.code ?? "").trim().toUpperCase();
    if (!color || !code) { summary.skipped.push({ row: row.rowNumber, reason: "Missing color or code" }); continue; }
    const existing = await prisma.colorCode.findUnique({ where: { color } });
    await prisma.colorCode.upsert({ where: { color }, update: { code }, create: { color, code } });
    if (existing) summary.updated += 1; else summary.created += 1;
  }
  revalidatePath("/settings");
  return summary;
}
