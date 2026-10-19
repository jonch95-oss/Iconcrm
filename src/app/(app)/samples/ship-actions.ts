"use server";

import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { assertRole } from "@/lib/session";
import { fetchShipWorkbook, previewShipSheet, applyShipUpdates, lastShipSheetRun, recordShipRun, SHIP_SHEET_URL_VAR } from "@/lib/ship-sync";
import type { ShipSkip, ShipUpdate } from "@/lib/ship-status";

export interface ShipPreview {
  ok: boolean;
  error?: string;
  /** Where the file came from, for the line above the table. */
  source: string;
  sheet?: string;
  columns?: Record<string, string>;
  sheetRows: number;
  receivedOnSheet: number;
  matched: number;
  changes: ShipUpdate[];
  alreadyRight: number;
  skipped: ShipSkip[];
}

const EMPTY: ShipPreview = { ok: false, source: "", sheetRows: 0, receivedOnSheet: 0, matched: 0, changes: [], alreadyRight: 0, skipped: [] };

function toPreview(report: Awaited<ReturnType<typeof previewShipSheet>>, source: string): ShipPreview {
  if (report.error) return { ...EMPTY, source, error: report.error };
  return {
    ok: true,
    source,
    sheet: report.sheet,
    columns: report.columns,
    sheetRows: report.sheetRows,
    receivedOnSheet: report.receivedOnSheet,
    matched: report.updates.length,
    changes: report.changes,
    alreadyRight: report.updates.length - report.changes.length,
    skipped: report.skipped,
  };
}

/** Read the sheet straight from OneDrive and say what it would do. */
export async function previewShipSheetFromOneDrive(): Promise<ShipPreview> {
  await assertRole("member");
  const { buffer, error } = await fetchShipWorkbook();
  if (!buffer) return { ...EMPTY, source: "OneDrive", error };
  return toPreview(await previewShipSheet(buffer), "OneDrive");
}

/** How the last read went — the line under the button. */
export async function lastShipRun(): Promise<{
  when: string;
  source: string;
  ok: boolean;
  by: string | null;
  sheetRows: number;
  written: number;
  unmatched: number;
  error: string | null;
} | null> {
  await assertRole("member");
  const run = await lastShipSheetRun();
  if (!run) return null;
  return {
    when: (run.finishedAt ?? run.startedAt).toISOString(),
    source: run.source,
    ok: run.ok,
    by: run.ranBy?.name ?? run.ranBy?.email ?? null,
    sheetRows: run.sheetRows,
    written: run.written,
    unmatched: run.unmatched,
    error: run.error,
  };
}

/** Same, for a copy of the sheet dragged in by hand. */
export async function previewShipSheetUpload(formData: FormData): Promise<ShipPreview> {
  await assertRole("member");
  const file = formData.get("file");
  const blobUrl = formData.get("blobUrl");
  let buffer: Buffer | null = null;
  let name = "the file";
  if (file instanceof File && file.size > 0) {
    name = file.name;
    buffer = Buffer.from(await file.arrayBuffer());
  } else if (typeof blobUrl === "string" && blobUrl) {
    if (!/^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(blobUrl)) {
      return { ...EMPTY, source: name, error: "Invalid upload URL." };
    }
    const res = await fetch(blobUrl);
    if (!res.ok) return { ...EMPTY, source: name, error: "Could not read the uploaded file." };
    buffer = Buffer.from(await res.arrayBuffer());
    await del(blobUrl).catch(() => {});
  }
  if (!buffer) return { ...EMPTY, source: name, error: "Choose an .xlsx file first." };
  return toPreview(await previewShipSheet(buffer), name);
}

/** Write the dates the preview showed. */
export async function applyShipSheet(updates: ShipUpdate[]): Promise<{ ok: boolean; updated: number; error?: string }> {
  const user = await assertRole("member");
  const clean = (updates ?? []).filter((u) => u && typeof u.sampleId === "string" && u.shippedDate).slice(0, 5000);
  if (clean.length === 0) return { ok: false, updated: 0, error: "Nothing to apply." };
  // Dates arrive from the browser as strings.
  const { updated } = await applyShipUpdates(
    clean.map((u) => ({ ...u, shippedDate: new Date(u.shippedDate), shippedNow: u.shippedNow ? new Date(u.shippedNow) : null })),
    user.id,
  );
  await recordShipRun({ source: "manual", userId: user.id, written: updated, matched: clean.length });
  revalidatePath("/samples");
  return { ok: true, updated };
}

/** Whether the OneDrive link is set, so the screen can say what it can do. */
export async function shipSheetLinkConfigured(): Promise<boolean> {
  await assertRole("member");
  return Boolean(process.env[SHIP_SHEET_URL_VAR]);
}
