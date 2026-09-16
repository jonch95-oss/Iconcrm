"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { getRevisionRecap, recapFiltersFromQuery, recapSubject } from "@/lib/revisions";
import { RevisionRecapEmail } from "@/emails/revision-recap";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Acknowledge a note — "seen, it's handled or I'll handle it". Acknowledging
 * records who did it, which is the point: the board shows the name, so an
 * unacknowledged note is unambiguously nobody's yet.
 */
export async function acknowledgeComment(commentId: string, acknowledged = true): Promise<Result> {
  const user = await assertRole("member");
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true, sampleId: true } });
  if (!comment) return { ok: false, error: "Note not found." };
  await prisma.comment.update({
    where: { id: commentId },
    data: acknowledged
      ? { acknowledgedAt: new Date(), acknowledgedById: user.id }
      : { acknowledgedAt: null, acknowledgedById: null },
  });
  await logAudit({
    entityType: "comment",
    entityId: commentId,
    action: acknowledged ? "comment_acknowledged" : "comment_unacknowledged",
    userId: user.id,
    after: { sampleId: comment.sampleId },
  });
  revalidatePath("/revisions");
  revalidatePath(`/samples/${comment.sampleId}`);
  return { ok: true };
}

/** Wave a note off the board. Kept, not deleted — "Show dismissed" brings it back. */
export async function dismissComment(commentId: string, dismissed = true): Promise<Result> {
  const user = await assertRole("member");
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true, sampleId: true, body: true } });
  if (!comment) return { ok: false, error: "Note not found." };
  await prisma.comment.update({
    where: { id: commentId },
    data: dismissed
      ? { dismissedAt: new Date(), dismissedById: user.id }
      : { dismissedAt: null, dismissedById: null },
  });
  await logAudit({
    entityType: "comment",
    entityId: commentId,
    action: dismissed ? "comment_dismissed" : "comment_restored",
    userId: user.id,
    after: { sampleId: comment.sampleId, body: comment.body.slice(0, 200) },
  });
  revalidatePath("/revisions");
  revalidatePath(`/samples/${comment.sampleId}`);
  return { ok: true };
}

/** Put a name against a note. Pass an empty id to unassign. */
export async function assignComment(commentId: string, assigneeId: string): Promise<Result> {
  const user = await assertRole("member");
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true, sampleId: true } });
  if (!comment) return { ok: false, error: "Note not found." };
  if (assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { isActive: true } });
    if (!assignee?.isActive) return { ok: false, error: "That person is no longer active." };
  }
  await prisma.comment.update({
    where: { id: commentId },
    data: assigneeId
      ? { assigneeId, assignedAt: new Date(), assignedById: user.id }
      : { assigneeId: null, assignedAt: null, assignedById: null },
  });
  await logAudit({
    entityType: "comment",
    entityId: commentId,
    action: assigneeId ? "comment_assigned" : "comment_unassigned",
    userId: user.id,
    after: { sampleId: comment.sampleId, assigneeId: assigneeId || null },
  });
  revalidatePath("/revisions");
  revalidatePath(`/samples/${comment.sampleId}`);
  return { ok: true };
}

/**
 * Acknowledge everything currently on the board for one factory. Returns the
 * ids it actually changed so Undo puts back only those — notes someone else
 * had already acknowledged stay acknowledged.
 */
export async function acknowledgeAllForFactory(
  commentIds: string[],
): Promise<({ ok: true; changed: string[] }) | { ok: false; error: string }> {
  const user = await assertRole("member");
  if (!commentIds.length) return { ok: false, error: "Nothing to acknowledge." };
  const targets = await prisma.comment.findMany({
    where: { id: { in: commentIds }, acknowledgedAt: null },
    select: { id: true },
  });
  const changed = targets.map((c) => c.id);
  if (!changed.length) return { ok: true, changed };
  await prisma.comment.updateMany({
    where: { id: { in: changed } },
    data: { acknowledgedAt: new Date(), acknowledgedById: user.id },
  });
  await logAudit({
    entityType: "comment",
    entityId: "bulk_acknowledge",
    action: "comments_acknowledged",
    userId: user.id,
    after: { count: changed.length },
  });
  revalidatePath("/revisions");
  return { ok: true, changed };
}

/** Undo for the above: put a specific set back to unacknowledged. */
export async function unacknowledgeMany(commentIds: string[]): Promise<Result> {
  const user = await assertRole("member");
  if (!commentIds.length) return { ok: false, error: "Nothing to undo." };
  await prisma.comment.updateMany({
    where: { id: { in: commentIds } },
    data: { acknowledgedAt: null, acknowledgedById: null },
  });
  await logAudit({
    entityType: "comment",
    entityId: "bulk_acknowledge",
    action: "comments_unacknowledged",
    userId: user.id,
    after: { count: commentIds.length },
  });
  revalidatePath("/revisions");
  return { ok: true };
}

/**
 * Mail one factory its recap. The filters come through as the dashboard's own
 * query string, so what lands in the factory's inbox is what was on screen.
 */
export async function emailRecapToFactory(
  factoryId: string,
  query: string,
): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const user = await assertRole("member");
  const factory = await prisma.factory.findUnique({ where: { id: factoryId } });
  if (!factory) return { ok: false, error: "Factory not found." };
  if (!factory.contactEmail)
    return { ok: false, error: `No contact email on ${factory.name} — add one under Factories.` };

  const filters = { ...recapFiltersFromQuery(Object.fromEntries(new URLSearchParams(query))), factoryId };
  const recap = await getRevisionRecap(filters);
  const bucket = recap.factories.find((f) => f.id === factoryId);
  if (!bucket || bucket.samples.length === 0)
    return { ok: false, error: "Nothing to send for this factory in the selected range." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "";
  const sent = await sendEmail({
    to: factory.contactEmail,
    replyTo: user.email,
    subject: recapSubject(bucket.samples.length, recap.since),
    react: RevisionRecapEmail({
      factoryName: factory.name,
      contactName: factory.contactName,
      since: recap.since,
      samples: bucket.samples,
      appUrl,
    }),
  });
  if (!sent.ok) return { ok: false, error: "The email failed to send." };

  await logAudit({
    entityType: "factory",
    entityId: factoryId,
    action: "revision_recap_emailed",
    userId: user.id,
    after: { to: factory.contactEmail, samples: bucket.samples.length, openRevisions: bucket.openRevisions },
  });
  return { ok: true, to: factory.contactEmail };
}
