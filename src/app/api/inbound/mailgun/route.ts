import { NextRequest, NextResponse } from "next/server";
import { processInboundEmail, type InboundPayload } from "@/lib/inbound";

/**
 * Mailgun inbound route (multipart/form-data).
 *
 * Unlike Postmark (which base64-encodes attachments inside a JSON body and
 * trips the ~4.5 MB serverless body cap), Mailgun POSTs the email as
 * multipart/form-data with each attachment as a real file part. Next.js parses
 * this as a streamed FormData upload — the same uncapped path the in-app Excel
 * import uses — so large sample-request sheets with embedded photos come
 * through fine.
 *
 * Auth: a shared secret in the URL (?token=...) matched against
 * MAILGUN_INBOUND_TOKEN. Mailgun also signs requests; we keep the simple token
 * check for parity with the existing inbound endpoint.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const expected = process.env.MAILGUN_INBOUND_TOKEN;
  const isProd = process.env.NODE_ENV === "production";
  if (!expected) {
    if (isProd) {
      console.error("MAILGUN_INBOUND_TOKEN not set; rejecting inbound email.");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
  } else {
    const provided = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-mailgun-token");
    if (provided !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json(
      { error: "Could not parse multipart form", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  // Mailgun field names (parsed/forwarded format):
  //   sender, from, subject, recipient, "body-plain", "body-html",
  //   "attachment-count", "attachment-1", "attachment-2", ...
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };

  const attachments: { name: string; contentBase64?: string; contentType?: string }[] = [];

  // --- Store-and-notify path (no size limit) ---
  // When the route uses store(), Mailgun keeps the attachments and sends an
  // "attachments" field: a JSON array of { url, name, content-type, size }.
  // We fetch each from Mailgun's API (server-to-server, bypassing the webhook
  // body cap entirely — this is how large sample sheets get through).
  const attachmentsJson = str("attachments");
  if (attachmentsJson) {
    try {
      const list = JSON.parse(attachmentsJson) as {
        url: string;
        name?: string;
        "content-type"?: string;
      }[];
      const apiKey = process.env.MAILGUN_API_KEY;
      for (const a of list) {
        if (!a.url) continue;
        const headers: Record<string, string> = {};
        if (apiKey) {
          headers["Authorization"] = "Basic " + Buffer.from(`api:${apiKey}`).toString("base64");
        }
        const res = await fetch(a.url, { headers });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        attachments.push({
          name: a.name || "attachment",
          contentBase64: buf.toString("base64"),
          contentType: a["content-type"] || "application/octet-stream",
        });
      }
    } catch {
      // fall through to inline parsing below
    }
  }

  // --- Inline forward path (small attachments) ---
  // Mailgun field names (parsed/forwarded format):
  //   sender, from, subject, recipient, "body-plain", "body-html",
  //   "attachment-count", "attachment-1", "attachment-2", ...
  const count = parseInt(str("attachment-count") ?? "0", 10) || 0;
  // Gather attachment-1..N, plus any File parts as a fallback.
  const seen = new Set<string>();
  const pushFile = async (f: File) => {
    const buf = Buffer.from(await f.arrayBuffer());
    attachments.push({
      name: f.name || "attachment",
      contentBase64: buf.toString("base64"),
      contentType: f.type || "application/octet-stream",
    });
  };
  for (let i = 1; i <= count; i++) {
    const f = form.get(`attachment-${i}`);
    if (f && typeof f !== "string") {
      seen.add(`attachment-${i}`);
      await pushFile(f as File);
    }
  }
  // Fallback: any other File parts Mailgun included (defensive).
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string" && !seen.has(k)) {
      await pushFile(v as File);
    }
  }

  const payload: InboundPayload = {
    from: str("sender") ?? str("from") ?? "unknown@unknown",
    to: str("recipient"),
    cc: str("Cc") ?? str("cc"),
    subject: str("subject"),
    textBody: str("body-plain") ?? str("stripped-text"),
    htmlBody: str("body-html"),
    attachments,
  };

  const result = await processInboundEmail(payload);
  return NextResponse.json({ ok: true, ...result });
}
