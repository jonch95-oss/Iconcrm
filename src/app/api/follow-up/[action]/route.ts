import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken } from "@/lib/tokens";

/**
 * Magic-link endpoints for follow-up emails: snooze 7 days or stop follow-ups.
 * GET /api/follow-up/snooze?token=...  | /api/follow-up/stop?token=...
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyToken(token);
  if (!payload) {
    return new NextResponse("This link is invalid or has expired.", { status: 400 });
  }

  if (action === "snooze" && payload.purpose === "snooze_followup") {
    await prisma.sample.update({
      where: { id: payload.sampleId },
      data: { snoozeUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    return new NextResponse("Follow-ups snoozed for 7 days. You can close this page.");
  }

  if (action === "stop" && payload.purpose === "stop_followup") {
    await prisma.sample.update({
      where: { id: payload.sampleId },
      data: { followUpStopped: true },
    });
    return new NextResponse("Follow-ups stopped for this sample. You can close this page.");
  }

  return new NextResponse("Unknown action.", { status: 400 });
}
