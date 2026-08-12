// Shared SKU code generation. A SKU is the sample number stripped of
// non-alphanumerics + the color's code, uppercased — e.g. sample PA-BEAR-10001
// with color code BLK -> PABEAR10001BLK.

export function skuBase(sampleNumber: string): string {
  return (sampleNumber ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function autoSkuCode(sampleNumber: string, colorCode: string): string {
  return `${skuBase(sampleNumber)}${(colorCode ?? "").trim().toUpperCase()}`;
}

/**
 * Derive a short, unique color code from a color name when one isn't mapped
 * yet — multi-word colors use initials ("Ombre Gold" -> "OG"), single words use
 * the first 3 letters ("Purple" -> "PUR"). Pass a `used` set to guarantee
 * uniqueness (collisions get a numeric suffix). Meant as a starting point the
 * admin can refine in Settings > Color Codes.
 */
export function deriveColorCode(color: string, used?: Set<string>): string {
  const clean = (color ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  let cand = "";
  if (words.length >= 2) cand = words.map((w) => w[0]).join("").slice(0, 4);
  else if (words.length === 1) cand = words[0].slice(0, 3);
  if (cand.length < 2) cand = ((words.join("") || "CLR").slice(0, 3)) || "CLR";
  if (!used) return cand;
  let final = cand, i = 2;
  while (used.has(final)) { final = `${cand}${i}`; i++; }
  used.add(final);
  return final;
}
