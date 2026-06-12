import type { Prisma } from "@prisma/client";

/**
 * Container-fill math for order forms.
 *
 * Usable capacity assumptions (industry-practical, not nominal):
 *   40' HQ ≈ 68 CBM loadable (76.4 nominal)
 *   40' STD ≈ 58 CBM · 20' ≈ 28 CBM (shown as context)
 */
export const CBM_40HQ = 68;
export const CBM_40STD = 58;
export const CBM_20 = 28;

export interface ContainerLine {
  quantity: number;
  unitsPerCarton: number | null; // variant case pack
  casePackDefault: number | null; // sample-level fallback
  cbmPerCarton: Prisma.Decimal | number | null;
}

export interface ContainerFill {
  totalCartons: number;
  totalCbm: number;
  containers40hq: number; // exact ratio, e.g. 0.87 or 1.62
  /** Lines that couldn't be counted because case pack or CBM is missing. */
  missingDataLines: number;
  verdict: "empty" | "partial" | "near_full" | "overflow_partial" | "full_multiple";
  message: string;
}

/** Compute how the order sits against 40' HQ capacity, with a plain-English callout. */
export function computeContainerFill(lines: ContainerLine[]): ContainerFill {
  let totalCartons = 0;
  let totalCbm = 0;
  let missing = 0;

  for (const l of lines) {
    const pack = l.unitsPerCarton ?? l.casePackDefault;
    const cbm = l.cbmPerCarton === null ? null : Number(l.cbmPerCarton);
    if (!pack || pack <= 0 || !cbm || cbm <= 0) {
      missing += 1;
      continue;
    }
    const cartons = Math.ceil(l.quantity / pack);
    totalCartons += cartons;
    totalCbm += cartons * cbm;
  }

  totalCbm = Math.round(totalCbm * 100) / 100;
  const ratio = totalCbm / CBM_40HQ;
  const containers40hq = Math.round(ratio * 100) / 100;

  let verdict: ContainerFill["verdict"];
  let message: string;
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  if (totalCbm === 0) {
    verdict = "empty";
    message =
      missing > 0
        ? "Container fill can't be computed yet — add CBM/carton and case packs to the styles."
        : "No volume on this order yet.";
  } else if (ratio >= 0.92 && ratio <= 1.05) {
    verdict = "near_full";
    message = `Fills a 40' HQ (${fmt(totalCbm)} of ${CBM_40HQ} CBM, ${Math.round(ratio * 100)}%). Good to book.`;
  } else if (ratio < 0.92) {
    const short = Math.round((CBM_40HQ - totalCbm) * 100) / 100;
    verdict = "partial";
    message = `Only ${Math.round(ratio * 100)}% of a 40' HQ — ${fmt(short)} CBM short of a full container. Add styles or quantities, or plan LCL.`;
  } else {
    const whole = Math.floor(ratio + 0.05); // 1.05x counts as 1 full
    const remainder = totalCbm - whole * CBM_40HQ;
    const remRatio = remainder / CBM_40HQ;
    if (remRatio <= 0.08) {
      verdict = "full_multiple";
      message = `Fills ${whole} × 40' HQ (${fmt(totalCbm)} CBM total). Good to book.`;
    } else {
      verdict = "overflow_partial";
      const toTrim = Math.round(remainder * 100) / 100;
      const toFill = Math.round((CBM_40HQ - remainder) * 100) / 100;
      message = `${fmt(totalCbm)} CBM = ${whole} full 40' HQ + a ${Math.round(remRatio * 100)}% partial. Trim ${fmt(toTrim)} CBM to fit ${whole}, or add ${fmt(toFill)} CBM to fill ${whole + 1}.`;
    }
  }

  return { totalCartons, totalCbm, containers40hq, missingDataLines: missing, verdict, message };
}
