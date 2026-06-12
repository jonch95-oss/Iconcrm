import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/cron";
import { sendEmail } from "@/lib/email";
import { MorningDigestEmail } from "@/emails/morning-digest";

/**
 * ETA watchdog: samples/POs with ETA within 3 days → reminder; ETA passed with
 * nothing received → overdue alert to requester + admins. (The red OVERDUE
 * badge is rendered client-side from the same ETA logic.)
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const in3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const [dueSoonSamples, overdueSamples, dueSoonPOs, overduePOs, admins] = await Promise.all([
    prisma.sample.findMany({
      where: { sampleReceivedDate: null, sampleEta: { gte: now, lte: in3 }, status: { notIn: ["closed", "dropped"] } },
      select: { sampleNumber: true, sampleEta: true },
    }),
    prisma.sample.findMany({
      where: { sampleReceivedDate: null, sampleEta: { lt: now }, status: { notIn: ["closed", "dropped", "shipped", "packing_list_matched"] } },
      select: { sampleNumber: true, sampleEta: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { factoryEta: { gte: now, lte: in3 }, status: { notIn: ["delivered", "shipped"] } },
      select: { poNumber: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { factoryEta: { lt: now }, status: { notIn: ["delivered", "shipped"] } },
      select: { poNumber: true },
    }),
    prisma.user.findMany({ where: { role: "admin", isActive: true }, select: { email: true } }),
  ]);

  const sections = [
    { title: "Samples due within 3 days", items: dueSoonSamples.map((s) => s.sampleNumber) },
    { title: "OVERDUE samples (not received)", items: overdueSamples.map((s) => s.sampleNumber) },
    { title: "POs due within 3 days", items: dueSoonPOs.map((p) => p.poNumber) },
    { title: "OVERDUE POs", items: overduePOs.map((p) => p.poNumber) },
  ];
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  if (total > 0 && admins.length > 0) {
    await sendEmail({
      to: admins.map((a) => a.email),
      subject: `ETA watchdog: ${overdueSamples.length + overduePOs.length} overdue, ${dueSoonSamples.length + dueSoonPOs.length} due soon`,
      react: MorningDigestEmail({ name: "Admins", sections }),
    });
  }

  return NextResponse.json({ ok: true, total, overdue: overdueSamples.length + overduePOs.length });
}
