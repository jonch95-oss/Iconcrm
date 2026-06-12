import { Prisma } from "@prisma/client";
import { getSettings } from "@/lib/settings";

/**
 * Generate the next sequential document number of the form PREFIX-YYYY-####.
 * Uses the count of existing rows for the current year as the basis and retries
 * on unique-constraint collisions to stay safe under light concurrency.
 */
async function nextNumber(
  tx: Prisma.TransactionClient,
  opts: {
    prefix: string;
    year: number;
    start: number;
    existsForYear: (prefixYear: string) => Promise<number>;
  },
): Promise<string> {
  const prefixYear = `${opts.prefix}-${opts.year}-`;
  const count = await opts.existsForYear(prefixYear);
  const seq = opts.start + count;
  return `${prefixYear}${String(seq).padStart(4, "0")}`;
}

export async function nextOrderFormNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const settings = await getSettings();
  const year = new Date().getFullYear();
  return nextNumber(tx, {
    prefix: settings.orderFormPrefix,
    year,
    start: 1,
    existsForYear: (py) =>
      tx.orderForm.count({ where: { orderFormNumber: { startsWith: py } } }),
  });
}

export async function nextPoNumber(tx: Prisma.TransactionClient): Promise<string> {
  const settings = await getSettings();
  const year = new Date().getFullYear();
  return nextNumber(tx, {
    prefix: settings.poNumberPrefix,
    year,
    start: settings.poNumberStart,
    existsForYear: (py) =>
      tx.purchaseOrder.count({ where: { poNumber: { startsWith: py } } }),
  });
}
