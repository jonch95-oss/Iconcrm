"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { advanceSampleStatus } from "@/lib/status";

type Result =
  | { ok: true; sample: { id: string; sampleNumber: string; brand: string | null; styleName: string | null; status: string; received: boolean } }
  | { ok: false; error: string };

/** Look up a sample by its number (exact, then loose contains match). */
export async function findSample(query: string): Promise<Result> {
  await assertRole("member");
  const q = query.trim();
  if (!q) return { ok: false, error: "Type a sample number first." };
  const sample =
    (await prisma.sample.findUnique({ where: { sampleNumber: q } })) ??
    (await prisma.sample.findFirst({
      where: { sampleNumber: { contains: q, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    }));
  if (!sample) return { ok: false, error: `No sample matches “${q}”.` };
  return {
    ok: true,
    sample: {
      id: sample.id,
      sampleNumber: sample.sampleNumber,
      brand: sample.brand,
      styleName: sample.styleName,
      status: sample.status,
      received: Boolean(sample.sampleReceivedDate),
    },
  };
}

/** One-tap receive: stamps today, advances status, logs audit, optional note. */
export async function markReceived(sampleId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  const user = await assertRole("member");
  const before = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!before) return { ok: false, error: "Sample not found." };
  if (before.sampleReceivedDate) return { ok: false, error: "Already marked received." };

  await prisma.sample.update({
    where: { id: sampleId },
    data: {
      sampleReceivedDate: new Date(),
      status: advanceSampleStatus(before.status, "sample_received"),
    },
  });
  if (note?.trim()) {
    await prisma.comment.create({
      data: { sampleId, userId: user.id, body: `Received: ${note.trim()}` },
    });
  }
  await logAudit({
    entityType: "sample",
    entityId: sampleId,
    action: "received_quick",
    userId: user.id,
    after: { receivedDate: new Date() },
  });
  revalidatePath(`/samples/${sampleId}`);
  revalidatePath("/samples");
  return { ok: true };
}
