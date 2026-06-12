"use server";

import { prisma } from "@/lib/db";
import { z } from "zod";
import { verifyToken } from "@/lib/tokens";
import { logAudit } from "@/lib/audit";

type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  token: z.string().min(1),
  brand: z.string().trim().optional(),
  category: z.string().trim().optional(),
  styleName: z.string().trim().optional(),
  styleNumber: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

/** Public submission of missing sample details via signed magic-link token. */
export async function submitMissingInfo(formData: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const payload = verifyToken(parsed.data.token);
  if (!payload || payload.purpose !== "missing_info") {
    return { ok: false, error: "This link is invalid or has expired." };
  }
  const sample = await prisma.sample.findUnique({ where: { id: payload.sampleId } });
  if (!sample) return { ok: false, error: "Sample not found." };

  const d = parsed.data;
  await prisma.sample.update({
    where: { id: sample.id },
    data: {
      brand: d.brand || sample.brand,
      category: d.category || sample.category,
      styleName: d.styleName || sample.styleName,
      styleNumber: d.styleNumber || sample.styleNumber,
      description: d.description || sample.description,
    },
  });

  // Mark any related needs-review emails as parsed now that info is provided.
  await prisma.inboundEmail.updateMany({
    where: { parsedSampleId: sample.id, parseStatus: "needs_review" },
    data: { parseStatus: "parsed", parseNotes: "Completed via missing-info form." },
  });

  await logAudit({
    entityType: "sample",
    entityId: sample.id,
    action: "missing_info_completed",
    actorLabel: "external (magic link)",
    after: { brand: d.brand, category: d.category, styleNumber: d.styleNumber },
  });

  return { ok: true };
}
