import { prisma } from "@/lib/db";
import { advanceSampleStatus, sampleReceipt } from "@/lib/status";

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
export async function syncSampleReceipt(sampleId: string): Promise<void> {
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
  if (status === sample.status && sample.sampleReceivedDate) return;
  await prisma.sample.update({ where: { id: sampleId }, data: { status, sampleReceivedDate: received } });
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
