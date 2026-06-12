import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Single daily cron (Vercel Hobby allows max 2 cron jobs, daily precision).
 * Runs every job in sequence by invoking the sibling route handlers
 * in-process with the cron secret. Individual routes remain callable
 * directly for manual runs and debugging.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const JOBS: { name: string; load: () => Promise<any> }[] = [
  { name: "follow-ups", load: () => import("../follow-ups/route") },
  { name: "eta-watchdog", load: () => import("../eta-watchdog/route") },
  { name: "missing-upc-nag", load: () => import("../missing-upc-nag/route") },
  { name: "variance-digest", load: () => import("../variance-digest/route") },
  { name: "morning-digest", load: () => import("../morning-digest/route") },
  { name: "tracking-sync", load: () => import("../tracking-sync/route") },
  { name: "parcel-sync", load: () => import("../parcel-sync/route") },
];

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  for (const job of JOBS) {
    try {
      const mod = await job.load();
      const inner = new NextRequest("http://cron.internal/", {
        headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
      });
      const res = await mod.GET(inner);
      results[job.name] = { status: res.status, body: await res.json().catch(() => null) };
    } catch (err) {
      results[job.name] = { error: err instanceof Error ? err.message.slice(0, 200) : "failed" };
    }
  }
  return NextResponse.json({ ok: true, results });
}
