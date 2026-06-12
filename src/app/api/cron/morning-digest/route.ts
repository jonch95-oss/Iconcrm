import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/cron";
import { sendEmail } from "@/lib/email";
import { MorningDigestEmail } from "@/emails/morning-digest";

/**
 * Morning digest (opt-in per user via notificationPrefs.morningDigest):
 * samples received yesterday, PIs awaiting review, POs with ETA this week,
 * unmatched packing lists.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [receivedYesterday, pisAwaiting, posThisWeek, unmatchedPacking, users] = await Promise.all([
    prisma.sample.findMany({
      where: { sampleReceivedDate: { gte: yesterday, lte: now } },
      select: { sampleNumber: true },
    }),
    prisma.proformaInvoice.findMany({
      where: { status: { in: ["received", "under_review"] } },
      select: { piNumber: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { factoryEta: { gte: now, lte: weekOut }, status: { notIn: ["delivered"] } },
      select: { poNumber: true },
    }),
    prisma.packingList.findMany({ where: { receivedAt: null }, select: { shipmentRef: true, id: true } }),
    prisma.user.findMany({ where: { isActive: true } }),
  ]);

  const sections = [
    { title: "Samples received yesterday", items: receivedYesterday.map((s) => s.sampleNumber) },
    { title: "PIs awaiting review", items: pisAwaiting.map((p) => p.piNumber) },
    { title: "POs with ETA this week", items: posThisWeek.map((p) => p.poNumber) },
    { title: "Unreceived packing lists", items: unmatchedPacking.map((p) => p.shipmentRef ?? p.id.slice(-6)) },
  ];

  let sent = 0;
  for (const u of users) {
    const prefs = (u.notificationPrefs ?? {}) as { morningDigest?: boolean };
    if (!prefs.morningDigest) continue;
    await sendEmail({
      to: u.email,
      subject: "Your morning CRM digest",
      react: MorningDigestEmail({ name: u.name, sections }),
    });
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}
