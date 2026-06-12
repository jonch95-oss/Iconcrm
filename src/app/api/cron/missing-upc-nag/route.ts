import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/cron";
import { sendEmail } from "@/lib/email";
import { MorningDigestEmail } from "@/emails/morning-digest";

/**
 * Missing UPC/style # nag: styles on DRAFT order forms missing UPCs/style #s for
 * more than 2 business days get a reminder to the order form's creator.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // ~2 days (business-day approximation)

  const drafts = await prisma.orderForm.findMany({
    where: { status: "draft", createdAt: { lt: cutoff } },
    include: {
      createdBy: { select: { email: true, name: true } },
      lines: { include: { sample: true, skuVariant: true } },
    },
  });

  let nagged = 0;
  for (const of of drafts) {
    const blockers: string[] = [];
    for (const line of of.lines) {
      if (!line.sample.styleNumber) blockers.push(`${line.sample.sampleNumber}: missing style #`);
      if (!line.skuVariantId || !line.skuVariant?.upc) blockers.push(`${line.sample.sampleNumber}: missing UPC`);
    }
    if (blockers.length === 0 || !of.createdBy?.email) continue;
    await sendEmail({
      to: of.createdBy.email,
      subject: `Order form ${of.orderFormNumber}: ${blockers.length} missing UPC/style #`,
      react: MorningDigestEmail({
        name: of.createdBy.name,
        sections: [{ title: `Blockers on ${of.orderFormNumber}`, items: [...new Set(blockers)] }],
      }),
    });
    nagged += 1;
  }

  return NextResponse.json({ ok: true, drafts: drafts.length, nagged });
}
