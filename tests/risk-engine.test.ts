/**
 * Unit tests for the shipment window risk engine (pure date math).
 * Run with: npx tsx tests/risk-engine.test.ts
 */
import assert from "node:assert";
import { computeRiskStatus, addDays, diffDays, isWorse } from "../src/lib/tracking/risk";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const base = { riskThresholdDays: 7 };

// no window at all
assert.equal(
  computeRiskStatus({ projectedDeliveryDate: d("2026-07-10"), startShipDate: null, cancelDate: null, ...base }),
  "no_window",
);
// window set but no projection yet
assert.equal(
  computeRiskStatus({ projectedDeliveryDate: null, startShipDate: d("2026-07-01"), cancelDate: d("2026-07-20"), ...base }),
  "no_window",
);
// comfortably inside the window
assert.equal(
  computeRiskStatus({ projectedDeliveryDate: d("2026-07-08"), startShipDate: d("2026-07-01"), cancelDate: d("2026-07-30"), ...base }),
  "on_track",
);
// past the cancel date -> late
assert.equal(
  computeRiskStatus({ projectedDeliveryDate: d("2026-08-02"), startShipDate: d("2026-07-01"), cancelDate: d("2026-07-30"), ...base }),
  "late_for_window",
);
// within 7 days of cancel -> at risk
assert.equal(
  computeRiskStatus({ projectedDeliveryDate: d("2026-07-25"), startShipDate: d("2026-07-01"), cancelDate: d("2026-07-30"), ...base }),
  "at_risk",
);
// exactly on the cancel date -> at risk (0 days margin)
assert.equal(
  computeRiskStatus({ projectedDeliveryDate: d("2026-07-30"), startShipDate: d("2026-07-01"), cancelDate: d("2026-07-30"), ...base }),
  "at_risk",
);
// before the start date -> early (chargeback territory)
assert.equal(
  computeRiskStatus({ projectedDeliveryDate: d("2026-06-20"), startShipDate: d("2026-07-01"), cancelDate: d("2026-07-30"), ...base }),
  "early_for_window",
);
// cancel-only window, on time
assert.equal(
  computeRiskStatus({ projectedDeliveryDate: d("2026-07-01"), startShipDate: null, cancelDate: d("2026-07-30"), ...base }),
  "on_track",
);
// start-only window, early
assert.equal(
  computeRiskStatus({ projectedDeliveryDate: d("2026-06-20"), startShipDate: d("2026-07-01"), cancelDate: null, ...base }),
  "early_for_window",
);

// date helpers
assert.equal(diffDays(d("2026-07-10"), d("2026-07-01")), 9);
assert.equal(addDays(d("2026-07-01"), 5).toISOString().slice(0, 10), "2026-07-06");

// worsening detector
assert.equal(isWorse("on_track", "at_risk"), true);
assert.equal(isWorse("at_risk", "late_for_window"), true);
assert.equal(isWorse("late_for_window", "at_risk"), false);
assert.equal(isWorse(null, "on_track"), false);
assert.equal(isWorse("on_track", "early_for_window"), true);

console.log("risk-engine: all assertions passed");

// ---------------------------------------------------------------------------
// PO P&L engine
// ---------------------------------------------------------------------------
import { Prisma } from "@prisma/client";
import { computePoPnl } from "../src/lib/pnl";

const dec = (n: number) => new Prisma.Decimal(n);
const sample = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  styleNumber: "ST-100",
  styleName: "Puffer",
  sampleNumber: "S-1",
  currency: "USD",
  dutyRatePercent: dec(10),
  freightPerUnit: dec(1),
  inlandPerUnit: dec(0.5),
  customerSellPrice: dec(20),
  ...over,
});

// 100 units @ $8 FOB: fob=800, duty=80, freight=100, inland=50 → landed=1030
// revenue=2000 → profit=970, margin=48.5%
{
  const pnl = computePoPnl([{ quantity: 100, unitPrice: dec(8), sample: sample() }]);
  assert.equal(pnl.units, 100);
  assert.equal(pnl.fob.toString(), "800");
  assert.equal(pnl.duty.toString(), "80");
  assert.equal(pnl.landed.toString(), "1030");
  assert.equal(pnl.profit.toString(), "970");
  assert.equal(pnl.marginPct?.toFixed(1), "48.5");
  assert.equal(pnl.linesMissingSell, 0);
}

// Two SKU lines of the same style aggregate into one P&L line.
{
  const pnl = computePoPnl([
    { quantity: 60, unitPrice: dec(8), sample: sample() },
    { quantity: 40, unitPrice: dec(8), sample: sample() },
  ]);
  assert.equal(pnl.lines.length, 1);
  assert.equal(pnl.units, 100);
}

// Missing sell price → flagged, margin null, revenue zero for that line.
{
  const pnl = computePoPnl([
    { quantity: 10, unitPrice: dec(5), sample: sample({ id: "s2", customerSellPrice: null }) },
  ]);
  assert.equal(pnl.linesMissingSell, 1);
  assert.equal(pnl.marginPct, null);
}

// Missing landed inputs → landed = FOB only, flagged.
{
  const pnl = computePoPnl([
    {
      quantity: 10,
      unitPrice: dec(5),
      sample: sample({ id: "s3", dutyRatePercent: null, freightPerUnit: null, inlandPerUnit: null }),
    },
  ]);
  assert.equal(pnl.landed.toString(), "50");
  assert.equal(pnl.linesMissingLanded, 1);
}

// Losing PO: sell below landed → negative profit/margin.
{
  const pnl = computePoPnl([
    { quantity: 100, unitPrice: dec(8), sample: sample({ customerSellPrice: dec(9) }) },
  ]);
  assert.ok(pnl.profit.isNegative());
  assert.ok(pnl.marginPct && pnl.marginPct.isNegative());
}

console.log("po-pnl: all assertions passed");

// --- Container fill ---
import { computeContainerFill, CBM_40HQ } from "../src/lib/container";

{
  // partial: 30 CBM of a 68 CBM box
  const partial = computeContainerFill([
    { quantity: 600, unitsPerCarton: 20, casePackDefault: null, cbmPerCarton: 1.0 }, // 30 cartons, 30 CBM
  ]);
  console.assert(partial.totalCartons === 30 && partial.totalCbm === 30, "partial cartons/cbm");
  console.assert(partial.verdict === "partial", "partial verdict, got " + partial.verdict);

  // near full: 65 CBM
  const full = computeContainerFill([
    { quantity: 650, unitsPerCarton: 10, casePackDefault: null, cbmPerCarton: 1.0 },
  ]);
  console.assert(full.verdict === "near_full", "near_full verdict, got " + full.verdict);

  // overflow: 1 full + 40% partial
  const over = computeContainerFill([
    { quantity: 950, unitsPerCarton: 10, casePackDefault: null, cbmPerCarton: 1.0 }, // 95 CBM
  ]);
  console.assert(over.verdict === "overflow_partial", "overflow verdict, got " + over.verdict);
  console.assert(over.message.includes("1 full"), "overflow message mentions whole containers");

  // case pack fallback to sample default + missing-data line
  const mixed = computeContainerFill([
    { quantity: 100, unitsPerCarton: null, casePackDefault: 25, cbmPerCarton: 0.5 }, // 4 cartons, 2 CBM
    { quantity: 100, unitsPerCarton: null, casePackDefault: null, cbmPerCarton: 0.5 }, // missing
  ]);
  console.assert(mixed.totalCartons === 4 && mixed.missingDataLines === 1, "fallback + missing");

  // exact multiples: 2 × 68
  const two = computeContainerFill([
    { quantity: 136, unitsPerCarton: 1, casePackDefault: null, cbmPerCarton: 1.0 },
  ]);
  console.assert(two.verdict === "full_multiple", "two-container verdict, got " + two.verdict);
  console.log("container-fill: all assertions passed");
}

// --- Parcel carrier detection ---
import { detectCarrier } from "../src/lib/parcel";
{
  console.assert(detectCarrier("1Z999AA10123456784") === "ups", "ups");
  console.assert(detectCarrier("9405511899223197428490") === "usps", "usps");
  console.assert(detectCarrier("123456789012") === "fedex", "fedex 12");
  console.assert(detectCarrier("1234567890") === "dhl", "dhl 10");
  console.assert(detectCarrier("ABC-XYZ-1") === "other", "other");
  console.log("parcel-detect: all assertions passed");
}
