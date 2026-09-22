/**
 * Unit tests for the overdue rule — one rule behind the table, the board, the
 * detail page, the dashboard count and the alert emails.
 * Run with: npx tsx tests/sample-overdue.test.ts
 */
import assert from "node:assert";
import { isSampleOverdue, NEVER_OVERDUE_STATUSES } from "../src/lib/status";

const past = new Date(Date.now() - 10 * 86_400_000);
const future = new Date(Date.now() + 10 * 86_400_000);

// The plain case: ETA gone by, nothing received.
assert.equal(isSampleOverdue({ status: "sample_requested", sampleEta: past, sampleReceivedDate: null }), true);
assert.equal(isSampleOverdue({ status: "eta_set", sampleEta: past, sampleReceivedDate: null }), true);

// On hold stops the clock — that's the point of putting it on hold.
assert.equal(isSampleOverdue({ status: "on_hold", sampleEta: past, sampleReceivedDate: null }), false);
// ...including a date typed on deliberately while it's on hold.
assert.equal(isSampleOverdue({ status: "on_hold", sampleEta: future, sampleReceivedDate: null }), false);

// Finished or abandoned samples aren't late either.
for (const status of NEVER_OVERDUE_STATUSES)
  assert.equal(isSampleOverdue({ status, sampleEta: past, sampleReceivedDate: null }), false, status);

// Received, or not yet due, or no ETA at all -> not late.
assert.equal(isSampleOverdue({ status: "eta_set", sampleEta: past, sampleReceivedDate: new Date() }), false);
assert.equal(isSampleOverdue({ status: "eta_set", sampleEta: future, sampleReceivedDate: null }), false);
assert.equal(isSampleOverdue({ status: "eta_set", sampleEta: null, sampleReceivedDate: null }), false);

// Revisions requested is still a live commitment, so it can still run late.
assert.equal(isSampleOverdue({ status: "revisions_requested", sampleEta: past, sampleReceivedDate: null }), true);

console.log("sample-overdue: all tests passed");
