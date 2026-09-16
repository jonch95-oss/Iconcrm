import { prisma } from "@/lib/db";
import { advanceSampleStatus, sampleReceipt } from "@/lib/status";
import { logAudit } from "@/lib/audit";
import type { SampleStatus } from "@prisma/client";

/**
 * Re-derive a sample's receipt state from its colors after a SKU variant is
 * ticked off (or un-ticked).
 *
 * A master sample is only received once every color is on the desk: with 2 of
 * 5 in, the sample stays where it is (the table badge shows "Partial - 2 of
 * 5") so nobody reads it as done and stops chasing the factory for the other
 * three. Samples with no colors at all are left alone — those are received at
 * the sample level, not per color.
 */
export async function syncSampleReceipt(sampleId: string, userId?: string): Promise<void> {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      status: true,
      sampleReceivedDate: true,
      skuVariants: { select: { received: true, sampleReceivedDate: true } },
    },
  });
  if (!sample) return;
  const { state } = sampleReceipt(sample.skuVariants);
  if (state !== "all") return;
  // Every color is in — stamp the sample with the date the last one landed.
  const dates = sample.skuVariants.map((v) => v.sampleReceivedDate).filter((d): d is Date => !!d);
  const received =
    sample.sampleReceivedDate ??
    (dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date());
  const status = advanceSampleStatus(sample.status, "sample_received");
  if (status !== sample.status || !sample.sampleReceivedDate)
    await prisma.sample.update({ where: { id: sampleId }, data: { status, sampleReceivedDate: received } });
  // A revised sample that just came back in full starts its next round (the
  // status read above is from before the update, which is what the check needs).
  await bumpVersionIfRevised(sampleId, userId, sample.status);
}

/**
 * The other direction: the whole sample was received in one go (bulk receive,
 * barcode scan), so every color that hasn't been ticked off individually is in
 * too. Keeps the per-color rollup from reading "Partial" right after someone
 * marked the sample received.
 */
export async function markAllVariantsReceived(sampleId: string, at: Date): Promise<void> {
  await prisma.skuVariant.updateMany({
    where: { sampleId, received: false },
    data: { received: true, sampleReceivedDate: at },
  });
}

/**
 * Parse a sample number into its base and revision round: "LAB-HB-10079" is
 * round 1, "LAB-HB-10079 - v2" is round 2. Tolerates the ways people type it
 * by hand ("-v2", " V3").
 */
export function parseSampleVersion(sampleNumber: string): { base: string; version: number } {
  // The suffix has to be set off by a space or dash, or a style number that
  // merely contains a "v" and digits ("LAB-HB-10079REV2") would be read as a
  // revision and get its tail eaten on the next round.
  const m = sampleNumber.match(/^(.*\S)[\s-]+v(\d+)\s*$/i);
  if (m) return { base: m[1].replace(/[\s-]+$/, ""), version: Number(m[2]) };
  return { base: sampleNumber.trim(), version: 1 };
}

/** The name a sample takes when its next revision round lands. */
export function nextSampleVersionNumber(sampleNumber: string): string {
  const { base, version } = parseSampleVersion(sampleNumber);
  return `${base} - v${version + 1}`;
}

/**
 * A revised sample just landed, so it isn't the same sample any more: rename
 * it to the next round ("LAB-HB-10079" -> "LAB-HB-10079 - v2") and close the
 * revision flags that were waiting on it. Returns the new number, or null when
 * nothing was pending revision.
 *
 * Call this as part of receiving. It's driven off the revision flags rather
 * than the status alone so per-color revision requests count too, and clearing
 * them makes it idempotent — receiving the same sample twice can't push it to
 * v3.
 */
export async function bumpVersionIfRevised(
  sampleId: string,
  userId?: string,
  /**
   * The sample's status *before* it was received. Receiving advances the status
   * out of `revisions_requested`, which is the signal this function keys on —
   * so a caller that has already updated the row has to pass what it was.
   */
  statusBefore?: SampleStatus,
): Promise<string | null> {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      sampleNumber: true,
      status: true,
      skuVariants: { where: { revisionsRequestedAt: { not: null } }, select: { id: true } },
    },
  });
  if (!sample) return null;
  const pending = (statusBefore ?? sample.status) === "revisions_requested" || sample.skuVariants.length > 0;
  if (!pending) return null;

  // Sample numbers are unique, so walk forward past any round already taken
  // (someone may have renamed a sample by hand).
  let next = nextSampleVersionNumber(sample.sampleNumber);
  for (let i = 0; i < 20; i++) {
    const taken = await prisma.sample.findUnique({ where: { sampleNumber: next }, select: { id: true } });
    if (!taken) break;
    next = nextSampleVersionNumber(next);
  }

  await prisma.$transaction([
    prisma.sample.update({ where: { id: sampleId }, data: { sampleNumber: next } }),
    prisma.skuVariant.updateMany({ where: { sampleId, revisionsRequestedAt: { not: null } }, data: { revisionsRequestedAt: null } }),
    prisma.comment.create({
      data: {
        sampleId,
        userId: userId ?? null,
        body: `Revised sample received — renamed ${sample.sampleNumber} \u2192 ${next}.`,
        // "version" marks this as the round closing, not a new request — the
        // revision recap buckets it separately.
        tags: ["revision", "version"],
      },
    }),
  ]);
  await logAudit({
    entityType: "sample",
    entityId: sampleId,
    action: "revision_received",
    userId,
    before: { sampleNumber: sample.sampleNumber },
    after: { sampleNumber: next },
  });
  return next;
}
