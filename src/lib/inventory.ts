// ---------------------------------------------------------------------------
// Inventory / available-to-sell (ATS). On-hand is tracked per SKU via the
// InventoryMovement ledger; ATS is rolled up to the style level, since customer
// demand (customer PO lines) is recorded by style number.
// ---------------------------------------------------------------------------

export interface AtsRow {
  styleNumber: string;
  onHand: number;
  committed: number;
  ats: number; // onHand - committed (negative = oversold from stock)
}

const norm = (s: string) => s.trim().toUpperCase();

export function computeAts(
  onHandByStyle: { styleNumber: string; quantity: number }[],
  committedByStyle: { styleNumber: string; quantity: number }[],
): { rows: AtsRow[]; totalOnHand: number; totalCommitted: number } {
  const onHand = new Map<string, number>();
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
  tally(onHandByStyle, onHand);
  tally(committedByStyle, committed);

  const rows: AtsRow[] = [];
  let totalOnHand = 0;
  let totalCommitted = 0;
  for (const key of new Set([...onHand.keys(), ...committed.keys()])) {
    const oh = onHand.get(key) ?? 0;
    const c = committed.get(key) ?? 0;
    totalOnHand += oh;
    totalCommitted += c;
    rows.push({ styleNumber: display.get(key) ?? key, onHand: oh, committed: c, ats: oh - c });
  }
  rows.sort((a, b) => a.styleNumber.localeCompare(b.styleNumber));
  return { rows, totalOnHand, totalCommitted };
}
