// Shared picklists used by the template, the New Sample form, and the table.
// Keep this module free of server-only deps so client components can import it.

export const SAMPLE_CATEGORIES = [
  "Handbag",
  "Cooler",
  "Duffel",
  "Rolling Duffle",
  "Cosmetic Bag",
  "Toiletry Bag",
  "Wallet",
  "Belt",
  "Luggage",
  "Backpack",
  "Neck Pillow",
  "Packing Cube",
] as const;

export const SAMPLE_BRANDS = [
  "Ted Baker",
  "Champion",
  "Off White",
  "Off White L/AB",
  "Palm Angels",
  "Palm Angels PLAY",
  "Pink London",
] as const;

// Seasons are restricted to SSxx / FWxx / Holiday.
export const SEASON_PATTERN = /^(SS|FW)\d{2}$/;

/** Canonical season choices: SS/FW across a rolling year range, plus Holiday. */
export function seasonChoices(): string[] {
  const yy = new Date().getFullYear() % 100;
  const out: string[] = [];
  for (let y = yy - 1; y <= yy + 5; y++) {
    const s = String(y).padStart(2, "0");
    out.push(`SS${s}`, `FW${s}`);
  }
  out.push("Holiday");
  return out;
}

/** Normalize to SSxx / FWxx / Holiday. Returns "" when the value isn't valid. */
export function normalizeSeason(raw: string): string {
  const v = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (v === "HOLIDAY") return "Holiday";
  return SEASON_PATTERN.test(v) ? v : "";
}
