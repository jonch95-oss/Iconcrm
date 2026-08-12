// Heuristic clustering of look-alike sample numbers into candidate families.
// Client-safe (no server deps). A "family" is a set of samples whose numbers
// share a base once a trailing color word and/or a trailing A/B/C… suffix is
// stripped — e.g. "PA BCLW-2 A".."F" -> base "PA BCLW 2".

export const COLOR_WORDS = new Set([
  "BLACK", "WHITE", "RED", "BLUE", "GREEN", "GOLD", "SILVER", "NAVY", "BROWN",
  "TAN", "CAMEL", "CHOCOLATE", "GREY", "GRAY", "PINK", "CREAM", "DENIM", "BEIGE",
  "IVORY", "ORANGE", "YELLOW", "PURPLE", "BURGUNDY", "KHAKI", "OLIVE", "MAROON",
  "TEAL", "CLEAR", "OMBRE", "MULTI", "MUTI", "GRAFFITI", "GRAFFITTI",
]);

export interface GroupMember {
  id: string;
  sampleNumber: string;
  color: string;
  status: string;
}
export interface GroupCluster {
  base: string;
  suggestedMaster: string;
  brand: string;
  members: GroupMember[];
  duplicateColors: string[]; // colors that appear on more than one member
}

/** Base key used to cluster: strip trailing color tokens + a trailing lone letter. */
export function baseOf(sampleNumber: string, color: string): string {
  const toks = (sampleNumber ?? "").trim().toUpperCase().split(/[\s\-_]+/).filter(Boolean);
  const colTokens = new Set((color ?? "").toUpperCase().split(/\s+/).filter(Boolean));
  while (toks.length > 1) {
    const last = toks[toks.length - 1];
    if (COLOR_WORDS.has(last) || colTokens.has(last)) { toks.pop(); continue; }
    break;
  }
  if (toks.length > 1 && /^[A-Z]$/.test(toks[toks.length - 1])) toks.pop();
  return toks.join(" ");
}

/** Longest common prefix of the members' numbers, tidied of trailing separators. */
export function commonPrefix(nums: string[]): string {
  if (nums.length === 0) return "";
  let p = nums[0];
  for (const n of nums.slice(1)) {
    let i = 0;
    while (i < p.length && i < n.length && p[i] === n[i]) i++;
    p = p.slice(0, i);
  }
  return p.replace(/[\s\-_]+$/, "").trim();
}

export function suggestGroups(
  samples: { id: string; sampleNumber: string; color: string; status: string; brand: string }[],
): GroupCluster[] {
  const byBase = new Map<string, typeof samples>();
  for (const s of samples) {
    const b = baseOf(s.sampleNumber, s.color);
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b)!.push(s);
  }
  const clusters: GroupCluster[] = [];
  for (const [base, members] of byBase) {
    if (members.length < 2) continue;
    const nums = members.map((m) => m.sampleNumber);
    const prefix = commonPrefix(nums);
    const suggestedMaster = prefix.length >= 4 ? prefix : base;
    const colorCounts = new Map<string, number>();
    for (const m of members) {
      const c = (m.color ?? "").trim().toUpperCase();
      if (c) colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1);
    }
    const duplicateColors = [...colorCounts.entries()].filter(([, n]) => n > 1).map(([c]) => c);
    clusters.push({
      base,
      suggestedMaster,
      brand: members[0].brand ?? "",
      members: members.map((m) => ({ id: m.id, sampleNumber: m.sampleNumber, color: m.color, status: m.status })),
      duplicateColors,
    });
  }
  // Biggest families first.
  clusters.sort((a, b) => b.members.length - a.members.length || a.base.localeCompare(b.base));
  return clusters;
}
