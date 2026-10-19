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

/**
 * SharePoint's own download endpoint for a share id. A link of the shape
 * /:x:/p/moshe/IQBg… carries that id in its last segment, and this endpoint
 * serves the bytes rather than the viewer page around them.
 */
export function shareIdDownloadUrl(link: string): string | null {
  const url = new URL(link);
  // A share link always begins /:x:/ (x for Excel, w for Word, and so on) and
  // ends with the id itself, however many segments Microsoft puts in between.
  if (!/^\/:[a-z]:\//i.test(url.pathname)) return null;
  const id = url.pathname.split("/").filter(Boolean).pop();
  if (!id) return null;
  return `${url.origin}/_layouts/15/download.aspx?share=${encodeURIComponent(id)}`;
}

const looksLikeXlsx = (buf: Buffer) => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK" — a zip, which an .xlsx is

/**
 * Follow the redirects ourselves, a few hops at most, keeping a note of where
 * each one went. Microsoft bounces these links between hosts — the viewer, the
 * tenant, the CDN that actually holds the bytes — and when one of those hops
 * refuses, the status on its own ("308") says nothing about which. The hop
 * list is hosts and statuses only: the URLs in between carry access tokens.
 */
async function fetchFollowing(url: string, hops: string[], limit = 6): Promise<Response | null> {
  let current = url;
  for (let i = 0; i < limit; i += 1) {
    const res = await fetch(current, { redirect: "manual", headers: { accept: "*/*" } });
    hops.push(`${new URL(current).hostname} ${res.status}`);
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    if (!location) return res; // a redirect with nowhere to go
    current = new URL(location, current).toString();
  }
  hops.push("gave up after too many redirects");
  return null;
}

/**
 * Fetch the workbook. Share links come in several flavours and none of them
 * announces itself, so each is tried in turn; a sign-in page comes back as
 * HTML, which is the one failure worth explaining properly.
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

  const sharePoint = parsed.hostname.endsWith("sharepoint.com");
  const candidates = (
    sharePoint
      ? [shareIdDownloadUrl(link), directDownloadUrl(link), sharesApiUrl(link)]
      : [sharesApiUrl(link), directDownloadUrl(link), shareIdDownloadUrl(link)]
  ).filter((u): u is string => Boolean(u));

  const tried: string[] = [];
  let signIn = false;
  for (const url of candidates) {
    const hops: string[] = [];
    try {
      const res = await fetchFollowing(url, hops);
      if (res?.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        if (looksLikeXlsx(buffer)) return { buffer };
        // HTML back instead of a workbook: a sign-in page, which is what a
        // link scoped to "people in your organisation" gives a server that
        // isn't signed in as anybody.
        signIn = true;
      }
      if (res && (res.status === 401 || res.status === 403)) signIn = true;
    } catch (e) {
      hops.push(e instanceof Error ? e.message.slice(0, 60) : "failed");
    }
    tried.push(hops.join(" → "));
  }

  if (signIn) {
    return {
      error:
        "That link asks for a Microsoft sign-in, and the CRM hasn't got one. Re-share the file as Share → Anyone with the link → Copy, or say the word and I'll build the app-registration path your tenant will allow. " +
        `(Tried: ${tried.join(" | ")})`,
    };
  }
  return { error: `Could not download the file. (Tried: ${tried.join(" | ")})` };
}

/**
 * Read the sheet and write what it says, start to finish, leaving a record of
 * how it went. This is what the cron runs and what the screen reports.
 */
export async function runShipSheet(opts: {
  source: "cron" | "manual";
  userId?: string | null;
  /** Supply a workbook to read instead of fetching the OneDrive link. */
  buffer?: Buffer;
}): Promise<{ ok: boolean; error?: string; sheetRows: number; matched: number; written: number; unmatched: number }> {
  const run = await prisma.shipSheetRun.create({ data: { source: opts.source, ranById: opts.userId ?? null } });
  const finish = async (result: { ok: boolean; error?: string; sheetRows?: number; matched?: number; written?: number; unmatched?: number }) => {
    const row = {
      ok: result.ok,
      error: result.error?.slice(0, 500) ?? null,
      sheetRows: result.sheetRows ?? 0,
      matched: result.matched ?? 0,
      written: result.written ?? 0,
      unmatched: result.unmatched ?? 0,
    };
    await prisma.shipSheetRun.update({ where: { id: run.id }, data: { ...row, finishedAt: new Date() } });
    return { ok: row.ok, error: row.error ?? undefined, sheetRows: row.sheetRows, matched: row.matched, written: row.written, unmatched: row.unmatched };
  };

  let buffer = opts.buffer;
  if (!buffer) {
    const fetched = await fetchShipWorkbook();
    if (!fetched.buffer) return finish({ ok: false, error: fetched.error });
    buffer = fetched.buffer;
  }
  const report = await previewShipSheet(buffer);
  if (report.error) return finish({ ok: false, error: report.error, sheetRows: report.sheetRows });
  const { updated } = await applyShipUpdates(report.changes, opts.userId ?? null, `${opts.source} · status sheet`);
  return finish({
    ok: true,
    sheetRows: report.sheetRows,
    matched: report.updates.length,
    written: updated,
    unmatched: report.skipped.length,
  });
}

/** Note a read that happened outside runShipSheet (the dialog's Apply). */
export async function recordShipRun(input: {
  source: string;
  userId?: string | null;
  written: number;
  matched: number;
}): Promise<void> {
  const now = new Date();
  await prisma.shipSheetRun.create({
    data: {
      source: input.source,
      ok: true,
      matched: input.matched,
      written: input.written,
      ranById: input.userId ?? null,
      startedAt: now,
      finishedAt: now,
    },
  });
}

/** How the last read went, for the line on the screen. */
export async function lastShipSheetRun() {
  return prisma.shipSheetRun.findFirst({
    where: { NOT: { finishedAt: null } },
    orderBy: { startedAt: "desc" },
    include: { ranBy: { select: { name: true, email: true } } },
  });
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
  if (updates.length === 0) return { updated: 0 };

  // A first run over a year of history is hundreds of rows, and the cron has
  // sixty seconds for every job it runs. So the writes go out a handful at a
  // time rather than one after another, and the rollup below reads once for
  // all of them instead of once per sample.
  const CONCURRENCY = 8;
  const write = async (u: ShipUpdate) => {
    const carrier = u.tracking ? detectCarrier(u.tracking) ?? null : null;
    const data = {
      shippedDate: u.shippedDate,
      ...(u.tracking ? { trackingNumber: u.tracking, trackingCarrier: carrier } : {}),
    };
    if (u.variantId) await prisma.skuVariant.update({ where: { id: u.variantId }, data });
    else await prisma.sample.update({ where: { id: u.sampleId }, data });
    await logAudit({
      entityType: u.variantId ? "sku_variant" : "sample",
      entityId: u.variantId ?? u.sampleId,
      action: "shipped_from_factory",
      userId,
      actorLabel: userId ? null : source,
      before: { shippedDate: u.shippedNow, trackingNumber: u.trackingNow },
      after: { shippedDate: u.shippedDate, trackingNumber: u.tracking || u.trackingNow, source, sheetRows: u.rows },
    });
  };

  let cursor = 0;
  let updated = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, updates.length) }, async () => {
      while (cursor < updates.length) {
        const u = updates[cursor++];
        try {
          await write(u);
          updated += 1;
        } catch {
          // One row that won't write (a sample deleted since the preview) must
          // not cost the other several hundred.
        }
      }
    }),
  );

  // A sample's own date is the first of its colors to leave the factory, so a
  // half-shipped style doesn't read as shipped on the day its last color goes.
  const sampleIds = [...new Set(updates.filter((u) => u.variantId).map((u) => u.sampleId))];
  if (sampleIds.length > 0) {
    const shipped = await prisma.skuVariant.findMany({
      where: { sampleId: { in: sampleIds }, NOT: { shippedDate: null } },
      select: { sampleId: true, shippedDate: true },
    });
    const earliest = new Map<string, Date>();
    for (const v of shipped) {
      const seen = earliest.get(v.sampleId);
      if (!seen || v.shippedDate!.getTime() < seen.getTime()) earliest.set(v.sampleId, v.shippedDate!);
    }
    await Promise.all(
      [...earliest.entries()].map(([sampleId, date]) =>
        prisma.sample.update({ where: { id: sampleId }, data: { shippedDate: date } }).catch(() => {}),
      ),
    );
  }
  return { updated };
}
