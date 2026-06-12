import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/cron";
import { sendEmail } from "@/lib/email";
import { VarianceAlertEmail } from "@/emails/variance-alert";
import { formatMoney } from "@/lib/money";

/**
 * PI variance digest: any unresolved FOB variances → daily digest to admins
 * until resolved (resolve = approve at new price, or dispute).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lines = await prisma.pILine.findMany({
    where: { resolution: "pending", variance: { not: 0 } },
    include: {
      sample: { select: { sampleNumber: true } },
      skuVariant: { select: { size: true, color: true } },
      pi: { select: { piNumber: true, currency: true, factory: { select: { name: true } } } },
    },
  });

  if (lines.length === 0) return NextResponse.json({ ok: true, unresolved: 0 });

  const admins = await prisma.user.findMany({ where: { role: "admin", isActive: true }, select: { email: true } });
  if (admins.length === 0) return NextResponse.json({ ok: true, unresolved: lines.length, sent: 0 });

  await sendEmail({
    to: admins.map((a) => a.email),
    subject: `Daily FOB variance digest — ${lines.length} unresolved`,
    react: VarianceAlertEmail({
      digest: true,
      piNumber: "(multiple)",
      piUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/pis?variances=1`,
      rows: lines.map((l) => ({
        label: `${l.pi.piNumber} · ${l.sample?.sampleNumber ?? "—"} ${l.skuVariant ? `${l.skuVariant.size}/${l.skuVariant.color}` : ""}`.trim(),
        fob: formatMoney(l.fobSnapshot, l.pi.currency),
        unitPrice: formatMoney(l.unitPrice, l.pi.currency),
        variance: formatMoney(l.variance, l.pi.currency),
      })),
    }),
  });

  return NextResponse.json({ ok: true, unresolved: lines.length, sent: admins.length });
}
