import { prisma } from "@/lib/db";
import { parseSamplesWorkbook } from "@/lib/import-excel";
import { uploadBlob } from "@/lib/blob";
import { logAudit } from "@/lib/audit";
import { toDecimal } from "@/lib/money";

const SHEET_EXT = /\.(xlsx|xlsm)$/i;
const SS27_DEFAULT_ETA_WEEKS = 6;

export interface SpreadsheetImportResult {
  isSampleRequest: boolean;
  created: number;
  updated: number;
  photos: number;
  styleNumbers: string[];
}

/**
 * When a cc'd email carries a sample-request spreadsheet (STYLE # / DESCRIPTION
 * / COLOR / IMAGE columns), create a sample per row instead of one sample for
 * the whole email. Pulls embedded photos, sets the request date to when the
 * email was sent, and defaults each ETA to +6 weeks.
 */
export async function importSampleRequestAttachment(
  attachments: { name: string; contentBase64?: string; contentType?: string; downloadUrl?: string }[],
  opts: { sentAt: Date; requestedByExternal: string | null; requestedById: string | null; sourceEmailId: string },
): Promise<SpreadsheetImportResult | null> {
  const sheet = attachments.find((a) => SHEET_EXT.test(a.name) && (a.contentBase64 || a.downloadUrl));
  if (!sheet) return null;

  let buf: Buffer;
  if (sheet.contentBase64) {
    buf = Buffer.from(sheet.contentBase64, "base64");
  } else if (sheet.downloadUrl) {
    const token = process.env.POSTMARK_SERVER_TOKEN;
    const res = await fetch(
      sheet.downloadUrl,
      token ? { headers: { "X-Postmark-Server-Token": token } } : undefined,
    );
    if (!res.ok) return null;
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    return null;
  }

  const parsed = await parseSamplesWorkbook(buf);
  if (parsed.error) return null;

  const idField = parsed.mappedColumns.styleNumber
    ? "styleNumber"
    : parsed.mappedColumns.sampleNumber
      ? "sampleNumber"
      : null;
  if (!idField) return null;
  const looksLikeRequest =
    !!parsed.mappedColumns.styleName ||
    !!parsed.mappedColumns.description ||
    !!parsed.mappedColumns.color;
  if (!looksLikeRequest) return null;

  const eta = new Date(opts.sentAt);
  eta.setDate(eta.getDate() + SS27_DEFAULT_ETA_WEEKS * 7);

  const result: SpreadsheetImportResult = {
    isSampleRequest: true,
    created: 0,
    updated: 0,
    photos: 0,
    styleNumbers: [],
  };

  const rowToSample = new Map<number, string>();

  for (const row of parsed.rows.slice(0, 500)) {
    const v = row.values;
    const styleNo = (v[idField] ?? "").trim();
    if (!styleNo) continue;

    const fields = {
      styleNumber: styleNo,
      styleName: v.styleName?.trim() || v.description?.trim() || undefined,
      description: v.description?.trim() || undefined,
      brand: v.brand?.trim() || undefined,
      category: v.category?.trim() || undefined,
      customerSellPrice: toDecimal(v.customerSellPrice) ?? undefined,
      fobCost: toDecimal(v.fobCost) ?? undefined,
    };

    const existing = await prisma.sample.findUnique({ where: { sampleNumber: styleNo } });
    let sampleId: string;
    if (existing) {
      await prisma.sample.update({ where: { id: existing.id }, data: fields });
      sampleId = existing.id;
      result.updated += 1;
    } else {
      const created = await prisma.sample.create({
        data: {
          sampleNumber: styleNo,
          ...fields,
          status: "sample_requested",
          requestedById: opts.requestedById,
          requestedByExternal: opts.requestedByExternal,
          requestedAt: opts.sentAt,
          sampleEta: eta,
          sourceEmailId: result.created === 0 ? opts.sourceEmailId : undefined,
        },
      });
      sampleId = created.id;
      result.created += 1;
    }

    const color = (v.color ?? "").trim();
    if (color) {
      const dupVariant = await prisma.skuVariant.findFirst({ where: { sampleId, color } });
      if (!dupVariant) {
        await prisma.skuVariant
          .create({
            data: { sampleId, upc: `REQ-${styleNo}-${color}`.slice(0, 64), size: "OS", color },
          })
          .catch(() => {});
      }
    }

    rowToSample.set(row.rowNumber, sampleId);
    result.styleNumbers.push(styleNo);
  }

  for (const img of parsed.images) {
    const sampleId =
      rowToSample.get(img.rowNumber) ??
      rowToSample.get(img.rowNumber + 1) ??
      rowToSample.get(img.rowNumber - 1);
    if (!sampleId) continue;
    try {
      const url = await uploadBlob(
        `samples/${sampleId}/request-${img.rowNumber}.${img.extension}`,
        img.buffer,
        `image/${img.extension}`,
      );
      await prisma.sample.update({ where: { id: sampleId }, data: { imageUrl: url } });
      result.photos += 1;
    } catch {
      // Blob not configured — styles still import; photos can be added later.
    }
  }

  await logAudit({
    entityType: "sample",
    entityId: "email_sample_request",
    action: "imported_from_email_sheet",
    actorLabel: opts.requestedByExternal ?? "email",
    after: { created: result.created, updated: result.updated, photos: result.photos },
  });

  return result;
}
