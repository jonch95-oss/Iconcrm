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
