/**
 * Unit tests for the Samples list filter <-> URL round trip. Keeping these in
 * sync is what lets Back return to the filtered list.
 * Run with: npx tsx tests/sample-filters.test.ts
 */
import assert from "node:assert";
import { EMPTY_SAMPLE_FILTERS, sampleFiltersFromQuery, sampleFiltersToQuery } from "../src/lib/sample-filters";

// Nothing filtered -> no query string (so a clean list keeps a clean URL).
assert.equal(sampleFiltersToQuery(EMPTY_SAMPLE_FILTERS), "");
assert.deepEqual(sampleFiltersFromQuery({}), EMPTY_SAMPLE_FILTERS);

// The reported case: brand + a status, then back from a sample.
const filters = { ...EMPTY_SAMPLE_FILTERS, brand: "Off White L/AB", status: "sample_received" };
const qs = sampleFiltersToQuery(filters);
assert.deepEqual(sampleFiltersFromQuery(Object.fromEntries(new URLSearchParams(qs))), filters);

// Every field survives the round trip, search box included.
const all = {
  q: "hobo",
  status: "partial_receipt",
  factory: "fac_1",
  brand: "Ted Baker",
  season: "ss27",
  category: "Handbag",
  color: "BLACK",
  overdue: true,
};
assert.deepEqual(sampleFiltersFromQuery(Object.fromEntries(new URLSearchParams(sampleFiltersToQuery(all)))), all);

// Existing deep links still work: /samples?overdue=1 and ?factory=<id>.
assert.equal(sampleFiltersFromQuery({ overdue: "1" }).overdue, true);
assert.equal(sampleFiltersFromQuery({ overdue: "0" }).overdue, false);
assert.equal(sampleFiltersFromQuery({ factory: "fac_9" }).factory, "fac_9");

// Repeated params take the first; whitespace is trimmed off.
assert.equal(sampleFiltersFromQuery({ brand: ["Ted Baker", "Off White"] }).brand, "Ted Baker");
assert.equal(sampleFiltersFromQuery({ color: "  BLACK  " }).color, "BLACK");

console.log("sample-filters: all tests passed");
