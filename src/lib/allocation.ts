// ---------------------------------------------------------------------------
// Allocation: production on order vs customer demand, by style number.
// ---------------------------------------------------------------------------

export type AllocStatus = "balanced" | "open" | "oversold" | "uncommitted";

export interface AllocRow {
  styleNumber: string;
  onOrder: number; // units on order from the factory (PI lines)
  committed: number; // units committed to customers (customer PO lines)
  free: number; // onOrder - committed (negative = oversold)
  status: AllocStatus;
}

export interface AllocResult {
  rows: AllocRow[];
  oversoldCount: number;
  openCount: number;
  totalOnOrder: number;
  totalCommitted: number;
}

const norm = (s: string) => s.trim().toUpperCase();

/**
 * Roll up, per style, how many units are on order from the factory vs how many
 * are committed to customers. Flags oversold styles (committed > on order),
 * styles with free units to sell, and styles with nothing committed yet.
 */
export function computeAllocation(
  onOrderLines: { styleNumber: string; quantity: number }[],
  committedLines: { styleNumber: string; quantity: number }[],
): AllocResult {
  const onOrder = new Map<string, number>();
  const committed = new Map<string, number>();
  const display = new Map<string, string>();
  const tally = (lines: { styleNumber: string; quantity: number }[], target: Map<string, number>) => {
    for (const l of lines) {
      const key = norm(l.styleNumber);
      if (!key) continue;
      target.set(key, (target.get(key) ?? 0) + (l.quantity || 0));
      if (!display.has(key)) display.set(key, l.styleNumber.trim());
    }
  };
  tally(onOrderLines, onOrder);
  tally(committedLines, committed);

  const rows: AllocRow[] = [];
  let oversoldCount = 0;
  let openCount = 0;
  let totalOnOrder = 0;
  let totalCommitted = 0;
  for (const key of new Set([...onOrder.keys(), ...committed.keys()])) {
    const o = onOrder.get(key) ?? 0;
    const c = committed.get(key) ?? 0;
    const free = o - c;
    let status: AllocStatus;
    if (c > o) status = "oversold";
    else if (c === o && o > 0) status = "balanced";
    else if (c === 0) status = "uncommitted";
    else status = "open";
    if (status === "oversold") oversoldCount += 1;
    if (status === "open" || status === "uncommitted") openCount += 1;
    totalOnOrder += o;
    totalCommitted += c;
    rows.push({ styleNumber: display.get(key) ?? key, onOrder: o, committed: c, free, status });
  }
  rows.sort((a, b) => a.styleNumber.localeCompare(b.styleNumber));
  return { rows, oversoldCount, openCount, totalOnOrder, totalCommitted };
}
