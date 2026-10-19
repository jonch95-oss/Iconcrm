import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { detectCarrier } from "@/lib/parcel";
import {
  parseShipSheet,
  matchShipRows,
  type ShipReport,
  type ShipSample,
  type ShipUpdate,
} from "@/lib/ship-status";

/**
 * The factory's weekly status sheet, read from the OneDrive link it lives on.
 *
 * The link is a share link ("anyone with the link"), kept in the environment
 * as ONEDRIVE_SHIP_SHEET_URL — it's a password to that one file, so it never
 * belongs in the code or in the database.
 */
export const SHIP_SHEET_URL_VAR = "ONEDRIVE_SHIP_SHEET_URL";

/** OneDrive's own encoding for "the file behind this share link". */
function sharesApiUrl(link: string): string {
  const b64 = Buffer.from(link, "utf8").toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  return `https://api.onedrive.com/v1.0/shares/u!${b64}/root/content`;
}

/** A SharePoint / OneDrive-for-Business link downloads with ?download=1. */
function directDownloadUrl(link: string): string {
  const url = new URL(link);
  url.searchParams.set("download", "1");
  return url.toString();
}

const looksLikeXlsx = (buf: Buffer) => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK" — a zip, which an .xlsx is

/**
 * Fetch the workbook. Share links come in two flavours and neither announces
 * itself, so both are tried; a sign-in page comes back as HTML, which is the
 * one failure worth explaining properly.
 */
export async function fetchShipWorkbook(link = process.env[SHIP_SHEET_URL_VAR]): Promise<{ buffer?: Buffer; error?: string }> {
  if (!link) {
    return { error: `No OneDrive link set. Add ${SHIP_SHEET_URL_VAR} to the environment settings and redeploy.` };
  }
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    return { error: "That OneDrive link isn't a URL." };
  }
  if (parsed.protocol !== "https:") return { error: "The OneDrive link has to be https." };

  const candidates = /sharepoint\.com$/i.test(parsed.hostname) || parsed.hostname.endsWith("sharepoint.com")
    ? [directDownloadUrl(link), sharesApiUrl(link)]
    : [sharesApiUrl(link), directDownloadUrl(link)];

  let lastError = "Could not download the file.";
  for (const url of candidates) {
    try {
      const res = await fetch(url, { redirect: "follow", headers: { accept: "*/*" } });
      if (!res.ok) {
        lastError =
          res.status === 401 || res.status === 403
            ? `OneDrive refused the link (${res.status}) — it's scoped to people who are signed in. Re-share it as "Anyone with the link".`
            : `OneDrive answered ${res.status} for that link.`;
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (looksLikeXlsx(buffer)) return { buffer };
      // A sign-in page, which is what a link scoped to "people in your
      // organisation" gives a server that isn't signed in as anybody.
      lastError =
        "That link asked for a sign-in instead of giving back the file. The CRM has no Microsoft account, so the link has to be Share → Anyone with the link → Copy. If your tenant doesn't allow those, the file needs a Microsoft app registration instead — say the word and I'll build that path.";
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 160) : lastError;
    }
  }
  return { error: lastError };
}

/** Everything the matcher needs to know about what we already have. */
export async function loadShipSamples(): Promise<ShipSample[]> {
  const samples = await prisma.sample.findMany({
    select: {
      id: true,
      sampleNumber: true,
      styleNumber: true,
      styleName: true,
      material: true,
      shippedDate: true,
      trackingNumber: true,
      skuVariants: {
        select: { id: true, color: true, material: true, skuCode: true, upc: true, styleNumber: true, shippedDate: true, trackingNumber: true },
      },
    },
  });
  return samples.map((s) => ({ ...s, variants: s.skuVariants }));
}

/** Read a workbook and say what it would do, without touching anything. */
export async function previewShipSheet(buffer: Buffer): Promise<ShipReport & { error?: string; sheet?: string; columns?: Record<string, string> }> {
  const { rows, error, sheet, columns } = await parseShipSheet(buffer);
  if (error) return { sheetRows: 0, receivedOnSheet: 0, updates: [], changes: [], skipped: [], error };
  if (rows.length === 0) {
    return { sheetRows: 0, receivedOnSheet: 0, updates: [], changes: [], skipped: [], error: "No dated rows on the Sample Status tab." };
  }
  return { ...matchShipRows(rows, await loadShipSamples()), sheet, columns };
}

/**
 * Write the ship dates. Only the shipped fields move — nothing here marks a
 * sample received, changes its status or touches an ETA. A courier number
 * also lands on the sample itself when the colors share one, so the existing
 * parcel sync can chase a delivery date for it.
 */
export async function applyShipUpdates(
  updates: ShipUpdate[],
  userId: string | null,
  source = "factory status sheet",
): Promise<{ updated: number }> {
  let updated = 0;
  for (const u of updates) {
    const carrier = u.tracking ? detectCarrier(u.tracking) ?? null : null;
    if (u.variantId) {
      await prisma.skuVariant.update({
        where: { id: u.variantId },
        data: {
          shippedDate: u.shippedDate,
          ...(u.tracking ? { trackingNumber: u.tracking, trackingCarrier: carrier } : {}),
        },
      });
    } else {
      await prisma.sample.update({
        where: { id: u.sampleId },
        data: {
          shippedDate: u.shippedDate,
          ...(u.tracking ? { trackingNumber: u.tracking, trackingCarrier: carrier } : {}),
        },
      });
    }
    await logAudit({
      entityType: u.variantId ? "sku_variant" : "sample",
      entityId: u.variantId ?? u.sampleId,
      action: "shipped_from_factory",
      userId,
      actorLabel: userId ? null : source,
      before: { shippedDate: u.shippedNow, trackingNumber: u.trackingNow },
      after: { shippedDate: u.shippedDate, trackingNumber: u.tracking || u.trackingNow, source, sheetRows: u.rows },
    });
    updated += 1;
  }
  // A sample's own date is the first of its colors to leave the factory, so a
  // half-shipped style doesn't read as shipped on the day its last color goes.
  const sampleIds = [...new Set(updates.filter((u) => u.variantId).map((u) => u.sampleId))];
  for (const sampleId of sampleIds) {
    const variants = await prisma.skuVariant.findMany({
      where: { sampleId, NOT: { shippedDate: null } },
      select: { shippedDate: true },
      orderBy: { shippedDate: "asc" },
    });
    const earliest = variants[0]?.shippedDate ?? null;
    if (earliest) await prisma.sample.update({ where: { id: sampleId }, data: { shippedDate: earliest } });
  }
  return { updated };
}
