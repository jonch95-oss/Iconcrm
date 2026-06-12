import type { AppSettings } from "@/lib/settings";

export interface ParsedFields {
  sampleNumber?: string;
  brand?: string;
  category?: string;
}

/** Apply a list of regex patterns to text and return the first capture group. */
function firstMatch(patterns: string[], text: string): string | undefined {
  for (const p of patterns) {
    try {
      const re = new RegExp(p, "i");
      const m = re.exec(text);
      if (m && m[1]) return m[1].trim();
    } catch {
      // Invalid pattern — skip it (admins edit these freely).
      continue;
    }
  }
  return undefined;
}

/**
 * Parse an inbound email for sample #, brand and category. Subject is searched
 * first, then body. Patterns come from admin settings so formats can evolve.
 */
export function parseInboundEmail(
  subject: string,
  body: string,
  settings: AppSettings,
): ParsedFields {
  const searchOrder = [subject ?? "", body ?? ""];
  const result: ParsedFields = {};

  for (const text of searchOrder) {
    if (!result.sampleNumber)
      result.sampleNumber = firstMatch(settings.sampleNumberPatterns, text);
    if (!result.brand) result.brand = firstMatch(settings.brandPatterns, text);
    if (!result.category)
      result.category = firstMatch(settings.categoryPatterns, text);
  }

  return result;
}

/** Required fields for a "clean" parse (no needs-review). */
export function missingRequiredFields(parsed: ParsedFields): string[] {
  const missing: string[] = [];
  if (!parsed.sampleNumber) missing.push("Sample #");
  if (!parsed.brand) missing.push("Brand");
  if (!parsed.category) missing.push("Category");
  return missing;
}

/** Extract a sample # from a subject line for reply-threading. */
export function extractSampleNumberFromSubject(
  subject: string,
  settings: AppSettings,
): string | undefined {
  return firstMatch(settings.sampleNumberPatterns, subject ?? "");
}
