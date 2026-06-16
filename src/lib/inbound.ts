import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { parseInboundEmail, missingRequiredFields } from "@/lib/parser";
import { uploadBlob } from "@/lib/blob";
import { sendEmail } from "@/lib/email";
import { MissingInfoEmail } from "@/emails/missing-info";
import { magicLink } from "@/lib/tokens";
import { logAudit } from "@/lib/audit";
import { importSampleRequestAttachment } from "@/lib/inbound-spreadsheet";

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

  // Resolve the sender to a known user if possible.
  const senderUser = await prisma.user.findUnique({ where: { email: payload.from.toLowerCase() } });

  // 2a) Sample-request spreadsheet attached? Import every row as its own
  // sample (style #, description, color, photo), dated to the email and with
  // a default 6-week ETA. This takes precedence over single-sample parsing.
  const sheetResult = await importSampleRequestAttachment(payload.attachments ?? [], {
    sentAt: new Date(),
    requestedByExternal: senderUser ? null : payload.from,
    requestedById: senderUser?.id ?? null,
    sourceEmailId: email.id,
  });
  if (sheetResult?.isSampleRequest && (sheetResult.created > 0 || sheetResult.updated > 0)) {
    await prisma.inboundEmail.update({
      where: { id: email.id },
      data: {
        parseStatus: "parsed",
        parseNotes: `Imported ${sheetResult.created} new + ${sheetResult.updated} updated styles from attachment (${sheetResult.photos} photos).`,
      },
    });
    return { emailId: email.id, outcome: "created_sample" };
  }

  // 2b) Otherwise parse subject first, then body (single-sample workflow).
  const parsed = parseInboundEmail(payload.subject ?? "", payload.textBody ?? "", settings);

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
  let firstImageUrl: string | null = null;
  for (const att of payload.attachments ?? []) {
    let url = `local://uploads/${att.name}`;
    let uploaded = false;
    if (att.contentBase64) {
      try {
        url = await uploadBlob(att.name, Buffer.from(att.contentBase64, "base64"), att.contentType);
        uploaded = true;
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
    // First real image in the email becomes the product photo candidate.
    if (!firstImageUrl && uploaded && (att.contentType ?? "").startsWith("image/")) {
      firstImageUrl = url;
    }
  }
  // Set as the sample's product photo only when none exists yet — a later
  // email shouldn't silently replace a photo someone chose on purpose.
  if (firstImageUrl) {
    await prisma.sample.updateMany({
      where: { id: sampleId, imageUrl: null },
      data: { imageUrl: firstImageUrl },
    });
  }
}
