import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveParcel, type ParcelCarrier } from "@/lib/parcel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily refresh of expected-delivery dates for in-transit sample parcels. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.AFTERSHIP_API_KEY) {
    return NextResponse.json({ ok: true, skipped: "AFTERSHIP_API_KEY not set" });
  }

  const pending = await prisma.sample.findMany({
    where: {
      trackingNumber: { not: null },
      sampleReceivedDate: null,
      NOT: { trackingStatus: "delivered" },
    },
    select: { id: true, trackingNumber: true, trackingCarrier: true },
    take: 100,
  });

  let updated = 0;
  for (const s of pending) {
    const live = await resolveParcel(s.trackingNumber!, (s.trackingCarrier ?? "other") as ParcelCarrier);
    if (live) {
      await prisma.sample.update({
        where: { id: s.id },
        data: { trackingEta: live.eta, trackingStatus: live.status ?? undefined },
      });
      updated += 1;
    }
  }
  return NextResponse.json({ ok: true, checked: pending.length, updated });
}
