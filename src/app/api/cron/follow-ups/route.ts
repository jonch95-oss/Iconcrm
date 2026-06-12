import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/cron";
import { sendEmail } from "@/lib/email";
import { SampleFollowUpEmail } from "@/emails/sample-followup";
import { magicLink } from "@/lib/tokens";

/**
 * Weekly sample follow-up: samples in sample_requested/eta_set with no received
 * date get a follow-up to factory contact + requester every N days (per-sample
 * cadence). Respects snooze + stop. Idempotent via lastFollowUpAt.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();

  const candidates = await prisma.sample.findMany({
    where: {
      status: { in: ["sample_requested", "eta_set"] },
      sampleReceivedDate: null,
      followUpStopped: false,
      OR: [{ snoozeUntil: null }, { snoozeUntil: { lt: now } }],
    },
    include: {
      factory: { select: { contactEmail: true, name: true } },
      requestedBy: { select: { email: true } },
    },
  });

  let sent = 0;
  for (const s of candidates) {
    const cadenceMs = (s.followUpCadenceDays || 7) * 24 * 60 * 60 * 1000;
    if (s.lastFollowUpAt && now.getTime() - s.lastFollowUpAt.getTime() < cadenceMs) continue;

    const to = [s.factory?.contactEmail, s.requestedBy?.email, s.requestedByExternal].filter(
      Boolean,
    ) as string[];
    if (to.length === 0) continue;

    await sendEmail({
      to,
      subject: `Follow-up: sample ${s.sampleNumber}`,
      react: SampleFollowUpEmail({
        sampleNumber: s.sampleNumber,
        styleName: s.styleName,
        factoryName: s.factory?.name,
        sampleUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/samples/${s.id}`,
        snoozeUrl: magicLink("snooze_followup", s.id, "/api/follow-up/snooze"),
        stopUrl: magicLink("stop_followup", s.id, "/api/follow-up/stop"),
      }),
    });
    await prisma.sample.update({ where: { id: s.id }, data: { lastFollowUpAt: now } });
    sent += 1;
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, sent });
}
