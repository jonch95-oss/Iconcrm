"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const createSchema = z.object({
  emailId: z.string().min(1),
  sampleNumber: z.string().trim().min(1, "Sample # required"),
  brand: z.string().trim().optional(),
  category: z.string().trim().optional(),
});

/** Create a sample from a needs-review email. */
export async function createSampleFromEmail(formData: FormData): Promise<ActionResult> {
  const user = await assertRole("member");
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;

  const email = await prisma.inboundEmail.findUnique({ where: { id: d.emailId } });
  if (!email) return { ok: false, error: "Email not found" };

  const dup = await prisma.sample.findUnique({ where: { sampleNumber: d.sampleNumber } });
  if (dup) return { ok: false, error: `Sample # ${d.sampleNumber} already exists — use Merge instead.` };

  const sample = await prisma.sample.create({
    data: {
      sampleNumber: d.sampleNumber,
      brand: d.brand,
      category: d.category,
      status: "sample_requested",
      requestedByExternal: email.fromEmail,
      sourceEmailId: email.id,
    },
  });
  await prisma.inboundEmail.update({
    where: { id: email.id },
    data: { parseStatus: "parsed", parsedSampleId: sample.id, parseNotes: "Manually created." },
  });
  await logAudit({ entityType: "sample", entityId: sample.id, action: "created_from_review", userId: user.id });
  revalidatePath("/needs-review");
  return { ok: true, id: sample.id };
}

/** Merge a needs-review email into an existing sample (append as comment). */
export async function mergeEmailToSample(emailId: string, sampleId: string): Promise<ActionResult> {
  await assertRole("member");
  const email = await prisma.inboundEmail.findUnique({ where: { id: emailId } });
  if (!email) return { ok: false, error: "Email not found" };
  const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!sample) return { ok: false, error: "Sample not found" };

  await prisma.comment.create({
    data: {
      sampleId,
      authorLabel: email.fromEmail,
      body: `${email.subject ?? "(no subject)"}\n\n${email.bodyText ?? ""}`.trim(),
      tags: ["merged-email"],
    },
  });
  await prisma.inboundEmail.update({
    where: { id: emailId },
    data: { parseStatus: "parsed", parsedSampleId: sampleId, parseNotes: "Merged into existing sample." },
  });
  revalidatePath("/needs-review");
  return { ok: true, id: sampleId };
}

export async function ignoreEmail(emailId: string): Promise<ActionResult> {
  await assertRole("member");
  await prisma.inboundEmail.update({ where: { id: emailId }, data: { parseStatus: "ignored" } });
  revalidatePath("/needs-review");
  return { ok: true };
}
