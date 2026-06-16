import { prisma } from "@/lib/db";
import { processInboundEmail, type InboundPayload } from "@/lib/inbound";

/**
 * Mailgun store-and-fetch.
 *
 * Mailgun's store() action keeps each inbound message (and attachments) on its
 * servers for 3 days. Instead of having Mailgun PUSH the big message to us
 * (which trips Vercel's ~4.5MB body cap), we PULL it: list recent "stored"
 * events via the Events API, then download each message + attachments
 * server-to-server. A server-initiated download has no inbound body limit, so
 * large sample sheets with embedded photos come through fine.
 *
 * Dedup:
 *  - message-level: each Mailgun message has a unique storage key. We record it
 *    in InboundEmail.mailgunMessageKey (unique). Already-seen keys are skipped,
 *    so polling repeatedly (cron or button) never re-imports the same email.
 *  - style-level: the spreadsheet importer upserts by styleNumber, so the same
 *    style is updated, never duplicated.
 */

const MG_API_BASE = "https://api.mailgun.net/v3";

function mgDomain(): string {
  return process.env.MAILGUN_DOMAIN || "mg.icon-crm.com";
}

function authHeader(): string {
  const key = process.env.MAILGUN_API_KEY || "";
  return "Basic " + Buffer.from(`api:${key}`).toString("base64");
}

interface FetchResult {
  checked: number;
  imported: number;
  skipped: number;
  errors: string[];
}

interface StoredEvent {
  storage?: { key?: string; url?: string };
  message?: { headers?: { subject?: string; from?: string; to?: string } };
  timestamp?: number;
}

/**
 * Pull stored messages from Mailgun and import any not seen before.
 * @param sinceSeconds how far back to look (default 3 days = Mailgun's max retention)
 */
export async function fetchAndImportStoredMessages(
  sinceSeconds = 3 * 24 * 60 * 60,
): Promise<FetchResult> {
  const result: FetchResult = {
    checked: 0,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (!process.env.MAILGUN_API_KEY) {
    result.errors.push("MAILGUN_API_KEY not set — cannot fetch stored messages.");
    return result;
  }

  const begin = Math.floor(Date.now() / 1000) - sinceSeconds;
  const eventsUrl =
    `${MG_API_BASE}/${mgDomain()}/events?event=stored&ascending=yes&limit=300&begin=${begin}`;

  let next: string | null = eventsUrl;
  const events: StoredEvent[] = [];

  // Page through stored events (Mailgun paginates via paging.next).
  for (let page = 0; page < 10 && next; page++) {
    const res = await fetch(next, { headers: { Authorization: authHeader() } });
    if (!res.ok) {
      result.errors.push(`Events API ${res.status} ${res.statusText}`);
      break;
    }
    const data = (await res.json()) as {
      items?: StoredEvent[];
      paging?: { next?: string };
    };
    for (const it of data.items ?? []) events.push(it);
    const nx = data.paging?.next;
    // Stop when a page returns no items (Mailgun keeps returning the same
    // "next" url even when empty).
    if (!data.items || data.items.length === 0) break;
    next = nx ?? null;
  }

  for (const ev of events) {
    const key = ev.storage?.key;
    const url = ev.storage?.url;
    if (!key || !url) continue;
    result.checked++;

    // message-level dedup
    const seen = await prisma.inboundEmail.findUnique({
      where: { mailgunMessageKey: key },
    });
    if (seen) {
      result.skipped++;
      continue;
    }

    try {
      // Fetch the parsed stored message (JSON form: attachments as URL list).
      const msgRes = await fetch(url, {
        headers: { Authorization: authHeader(), Accept: "application/json" },
      });
      if (!msgRes.ok) {
        result.errors.push(`message ${key}: ${msgRes.status}`);
        continue;
      }
      const msg = (await msgRes.json()) as {
        sender?: string;
        from?: string;
        recipients?: string;
        subject?: string;
        "body-plain"?: string;
        "body-html"?: string;
        attachments?: { url: string; name?: string; "content-type"?: string }[];
      };

      // Download each attachment server-side (no body cap on our side).
      const attachments: InboundPayload["attachments"] = [];
      for (const a of msg.attachments ?? []) {
        if (!a.url) continue;
        const aRes = await fetch(a.url, { headers: { Authorization: authHeader() } });
        if (!aRes.ok) continue;
        const buf = Buffer.from(await aRes.arrayBuffer());
        attachments.push({
          name: a.name || "attachment",
          contentBase64: buf.toString("base64"),
          contentType: a["content-type"] || "application/octet-stream",
        });
      }

      const payload: InboundPayload = {
        from: msg.sender || msg.from || "unknown@unknown",
        to: msg.recipients,
        subject: msg.subject,
        textBody: msg["body-plain"],
        htmlBody: msg["body-html"],
        attachments,
      };

      const imp = await processInboundEmail(payload);
      // stamp the message key onto the InboundEmail row just created so future
      // polls skip it. processInboundEmail creates an InboundEmail; tag it.
      if (imp.emailId) {
        await prisma.inboundEmail.update({
          where: { id: imp.emailId },
          data: { mailgunMessageKey: key },
        });
      }
      result.imported++;
    } catch (e) {
      result.errors.push(`message ${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
