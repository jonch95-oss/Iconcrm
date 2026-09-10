/**
 * Unit tests for the per-color receipt rollup on a sample's status badge.
 * Run with: npx tsx tests/sample-receipt.test.ts
 */
import assert from "node:assert";
import { sampleReceipt, sampleStatusDisplay } from "../src/lib/status";

const v = (...received: boolean[]) => received.map((r) => ({ received: r }));

// --- counts -----------------------------------------------------------------
assert.deepEqual(sampleReceipt([]), { state: "none", received: 0, total: 0 });
assert.deepEqual(sampleReceipt(v(false, false)), { state: "none", received: 0, total: 2 });
assert.deepEqual(sampleReceipt(v(true, false, false)), { state: "partial", received: 1, total: 3 });
assert.deepEqual(sampleReceipt(v(true, true)), { state: "all", received: 2, total: 2 });

// --- what the badge says ----------------------------------------------------
// The reported bug: every color received but the sample still sat at
// "Sample Requested" (colors were ticked off through a path that never rolled
// the sample forward, e.g. a merge). The colors decide it now.
assert.equal(sampleStatusDisplay("sample_requested", v(true, true)).label, "Sample Received");

// Some in, some still coming -> neither "Requested" nor "Received".
const partial = sampleStatusDisplay("sample_requested", v(true, false, false));
assert.equal(partial.label, "Partial · 1 of 3");
assert.equal(partial.tone, "warning");
assert.match(partial.hint ?? "", /waiting on the rest/);

// A sample stamped Received whose colors are only half in reads Partial too.
assert.equal(sampleStatusDisplay("sample_received", v(true, false)).label, "Partial · 1 of 2");

// Nothing in yet -> the stored status stands.
assert.equal(sampleStatusDisplay("eta_set", v(false, false)).label, "ETA Set");
// No colors at all -> received at the sample level, stored status stands.
assert.equal(sampleStatusDisplay("sample_received", []).label, "Sample Received");
assert.equal(sampleStatusDisplay("sample_requested", []).label, "Sample Requested");

// Past the receiving stretch the stored status is the real state and wins:
// a part-received sample already on an order form must not read "Partial".
assert.equal(sampleStatusDisplay("on_order_form", v(true, false)).label, "On Order Form");
assert.equal(sampleStatusDisplay("dropped", v(true, true)).label, "Dropped");
assert.equal(sampleStatusDisplay("on_hold", v(true, false)).label, "On Hold");
// Revisions asked for on a color keeps the warning it earned.
assert.equal(sampleStatusDisplay("revisions_requested", v(true, false)).label, "Revisions Requested");

console.log("sample-receipt: all tests passed");
