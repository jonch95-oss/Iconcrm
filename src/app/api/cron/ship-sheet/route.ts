import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { fetchShipWorkbook, previewShipSheet, applyShipUpdates } from "@/lib/ship-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The factory's status sheet, read from OneDrive. It's updated on Mondays, but
 * this runs with the daily jobs: a late edit is picked up the next morning
 * rather than waiting a week, and re-reading costs nothing because only rows
 * whose date or courier number actually moved are written.
 *
 * Anything it can't place — a style we don't carry, a color that isn't on the
 * sample — is counted here and listed in Samples → Shipping sheet, never
 * guessed at and never created.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { buffer, error } = await fetchShipWorkbook();
  if (!buffer) return NextResponse.json({ ok: false, error }, { status: error?.startsWith("No OneDrive link") ? 200 : 502 });

  const report = await previewShipSheet(buffer);
  if (report.error) return NextResponse.json({ ok: false, error: report.error }, { status: 422 });

  const { updated } = await applyShipUpdates(report.changes, null, "OneDrive status sheet");
  return NextResponse.json({
    ok: true,
    sheetRows: report.sheetRows,
    matched: report.updates.length,
    updated,
    unmatched: report.skipped.length,
  });
}
