import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { parseTerminal49Webhook } from "@/lib/tracking/provider";
import { applyTrackingUpdate } from "@/lib/tracking/alerts";

/**
 * Terminal49 webhook receiver. Verifies the X-T49-Webhook-Signature HMAC
 * (sha256 of the raw body with TERMINAL49_WEBHOOK_SECRET). Fails closed in
 * production when the secret is missing.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TERMINAL49_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === "production";
  const raw = await req.text();

  if (!secret) {
    if (isProd) {
      console.error("TERMINAL49_WEBHOOK_SECRET is not set; rejecting tracking webhook.");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
  } else {
    const signature = req.headers.get("x-t49-webhook-signature") ?? "";
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const ok =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update = parseTerminal49Webhook(payload);
  if (!update.subscriptionId) {
    return NextResponse.json({ ok: true, skipped: "no subscription id" });
  }

  const shipment = await prisma.shipment.findFirst({
    where: { trackingSubscriptionId: update.subscriptionId },
    select: { id: true },
  });
  if (!shipment) {
    return NextResponse.json({ ok: true, skipped: "unknown shipment" });
  }

  await applyTrackingUpdate(shipment.id, update, "webhook");
  return NextResponse.json({ ok: true });
}
