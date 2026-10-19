import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { getCurrentUser, hasRole } from "@/lib/session";
import { runShipSheet } from "@/lib/ship-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The factory's status sheet, read from OneDrive. It's updated on Mondays, but
 * this runs with the daily jobs: a late edit is picked up the next morning
 * rather than waiting a week, and re-reading costs nothing because only rows
 * whose date or courier number actually moved are written.
 *
 * An admin can also open this in a browser to run it on the spot and read the
 * result — the same thing the Shipping sheet dialog does, in plain JSON when
 * someone wants to see exactly what came back.
 *
 * Anything it can't place — a style we don't carry, a colour that isn't on the
 * sample — is counted here and listed in Samples → Shipping sheet, never
 * guessed at and never created.
 */
export async function GET(req: NextRequest) {
  const cron = isAuthorizedCron(req);
  const user = cron ? null : await getCurrentUser();
  if (!cron && !(user && hasRole(user.role, "admin"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runShipSheet({ source: cron ? "cron" : "manual", userId: user?.id ?? null });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
