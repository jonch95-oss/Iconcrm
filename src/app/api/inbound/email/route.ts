import { NextRequest, NextResponse } from "next/server";
import { postmarkInboundSchema } from "@/lib/validation";
import { processInboundEmail, type InboundPayload } from "@/lib/inbound";

/**
 * Postmark Inbound webhook. Authenticated by a shared token passed either as
 * `?token=` or the `X-Postmark-Token` header (matched against
 * POSTMARK_INBOUND_TOKEN). Postmark POSTs the full parsed email as JSON.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.POSTMARK_INBOUND_TOKEN;
  const isProd = process.env.NODE_ENV === "production";

  // Fail closed: in production this endpoint must never run unauthenticated.
  if (!expected) {
    if (isProd) {
      console.error("POSTMARK_INBOUND_TOKEN is not set; rejecting inbound email webhook.");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
  } else {
    // Header only in production — query strings leak into request logs.
    const provided = isProd
      ? req.headers.get("x-postmark-token")
      : (req.headers.get("x-postmark-token") ?? req.nextUrl.searchParams.get("token"));
    if (provided !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postmarkInboundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const p = parsed.data;

  const payload: InboundPayload = {
    from: p.FromFull?.Email ?? p.From ?? "unknown@unknown",
    to: p.To,
    cc: p.Cc,
    subject: p.Subject,
    textBody: p.TextBody,
    htmlBody: p.HtmlBody,
    attachments: (p.Attachments ?? []).map((a) => ({
      name: a.Name,
      contentBase64: a.Content,
      contentType: a.ContentType,
    })),
    raw: body,
  };

  const result = await processInboundEmail(payload);
  return NextResponse.json({ ok: true, ...result });
}
