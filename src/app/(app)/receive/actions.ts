"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { advanceSampleStatus } from "@/lib/status";
import { markAllVariantsReceived, bumpVersionIfRevised } from "@/lib/sample-receipt";

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

/**
 * One-tap receive: stamps today, advances status, logs audit, optional note.
 * `room` is the factory sample room the physical sample came out of — asked for
 * on the scan screen, since that's the moment anyone knows it.
 */
export async function markReceived(
  sampleId: string,
  note?: string,
  room?: string,
): Promise<{ ok: boolean; error?: string; renamedTo?: string }> {
  const user = await assertRole("member");
  const before = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!before) return { ok: false, error: "Sample not found." };
  if (before.sampleReceivedDate) return { ok: false, error: "Already marked received." };

  const now = new Date();
  await prisma.sample.update({
    where: { id: sampleId },
    data: {
      sampleReceivedDate: now,
      receivedById: user.id,
      status: advanceSampleStatus(before.status, "sample_received"),
      ...(room?.trim() ? { sampleRoom: room.trim() } : {}),
    },
  });
  // The physical box is in, so every color in it is too — otherwise the
  // per-color rollup would still read "Partial" on the samples table.
  await markAllVariantsReceived(sampleId, now, user.id);
  // If this was the revised sample we were waiting on, it becomes - v2.
  const renamedTo = await bumpVersionIfRevised(sampleId, user.id, before.status);
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
  return { ok: true, renamedTo: renamedTo ?? undefined };
}
