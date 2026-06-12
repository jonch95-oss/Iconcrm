import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { parseInboundEmail, missingRequiredFields } from "@/lib/parser";
import { uploadBlob } from "@/lib/blob";
import { sendEmail } from "@/lib/email";
import { MissingInfoEmail } from "@/emails/missing-info";
import { magicLink } from "@/lib/tokens";
import { logAudit } from "@/lib/audit";

export interface InboundPayload {
  from: string;
  to?: string;
  cc?: string;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: { name: string; contentBase64?: string; contentType?: string }[];
  raw?: unknown;
}

export interface InboundResult {
  emailId: string;
  outcome: "created_sample" | "appended_duplicate" | "needs_review";
  sampleId?: string;
  missingFields?: string[];
}

/**
 * Core inbound-email processing (the Asana-style cc workflow). Idempotent-ish:
 * duplicate sample numbers append a comment rather than create new records.
 */
export async function processInboundEmail(payload: InboundPayload): Promise<InboundResult> {
  const settings = await getSettings();

  // 1) Store the raw email.
  const email = await prisma.inboundEmail.create({
    data: {
      fromEmail: payload.from,
      toEmail: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      bodyText: payload.textBody,
      bodyHtml: payload.htmlBody,
      attachments: (payload.attachments ?? []).map((a) => ({
        name: a.name,
        contentType: a.contentType,
      })),
      rawPayload: payload.raw ? (payload.raw as object) : undefined,
      parseStatus: "needs_review",
    },
  });

  // 2) Parse subject first, then body.
  const parsed = parseInboundEmail(payload.subject ?? "", payload.textBody ?? "", settings);

  // Resolve the sender to a known user if possible.
  const senderUser = await prisma.user.findUnique({ where: { email: payload.from.toLowerCase() } });

  // No sample # → goes to Needs Review.
  if (!parsed.sampleNumber) {
    await prisma.inboundEmail.update({
      where: { id: email.id },
      data: { parseStatus: "needs_review", parseNotes: "No sample # detected." },
    });
    return { emailId: email.id, outcome: "needs_review" };
  }

  // 3) Duplicate check / reply-threading.
  const existing = await prisma.sample.findUnique({ where: { sampleNumber: parsed.sampleNumber } });
  if (existing) {
    await prisma.comment.create({
      data: {
        sampleId: existing.id,
        userId: senderUser?.id ?? null,
        authorLabel: senderUser ? null : payload.from,
        body: `${payload.subject ?? "(no subject)"}\n\n${payload.textBody ?? ""}`.trim(),
        tags: ["duplicate-email"],
      },
    });
    await saveAttachments(payload, existing.id);
    await prisma.inboundEmail.update({
      where: { id: email.id },
      data: { parseStatus: "parsed", parsedSampleId: existing.id, parseNotes: "Appended to existing sample." },
    });
    return { emailId: email.id, outcome: "appended_duplicate", sampleId: existing.id };
  }

  // 4) Create the sample (sample_requested).
  const missing = missingRequiredFields(parsed); // checks brand/category too
  const sample = await prisma.sample.create({
    data: {
      sampleNumber: parsed.sampleNumber,
      brand: parsed.brand,
      category: parsed.category,
      status: "sample_requested",
      requestedById: senderUser?.id ?? null,
      requestedByExternal: senderUser ? null : payload.from,
      sourceEmailId: email.id,
    },
  });
  await saveAttachments(payload, sample.id);
  await logAudit({
    entityType: "sample",
    entityId: sample.id,
    action: "created_from_email",
    actorLabel: payload.from,
    after: { sampleNumber: sample.sampleNumber },
  });

  // 5) Missing required fields (brand/category) → needs_review + missing-info email.
  if (missing.length > 0) {
    await prisma.inboundEmail.update({
      where: { id: email.id },
      data: {
        parseStatus: "needs_review",
        parsedSampleId: sample.id,
        parseNotes: `Missing: ${missing.join(", ")}`,
      },
    });
    const formUrl = magicLink("missing_info", sample.id, "/missing-info");
    const recipients = [...settings.missingInfoRecipients, payload.from].filter(Boolean);
    await sendEmail({
      to: recipients,
      subject: `More info needed for sample ${sample.sampleNumber}`,
      react: MissingInfoEmail({
        sampleNumber: sample.sampleNumber,
        missingFields: missing,
        formUrl,
      }),
      replyTo: payload.from,
    });
    return { emailId: email.id, outcome: "needs_review", sampleId: sample.id, missingFields: missing };
  }

  await prisma.inboundEmail.update({
    where: { id: email.id },
    data: { parseStatus: "parsed", parsedSampleId: sample.id },
  });
  return { emailId: email.id, outcome: "created_sample", sampleId: sample.id };
}

async function saveAttachments(payload: InboundPayload, sampleId: string) {
  for (const att of payload.attachments ?? []) {
    let url = `local://uploads/${att.name}`;
    if (att.contentBase64) {
      try {
        url = await uploadBlob(att.name, Buffer.from(att.contentBase64, "base64"), att.contentType);
      } catch {
        // Fall back to placeholder url on upload error.
      }
    }
    await prisma.attachment.create({
      data: {
        parentType: "sample",
        parentId: sampleId,
        blobUrl: url,
        filename: att.name,
        mimeType: att.contentType,
      },
    });
  }
}
