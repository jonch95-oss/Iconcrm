/**
 * Who can take an ETA live, and which edits have to wait for them.
 * Run with: npx tsx tests/eta-approval.test.ts
 */
import assert from "node:assert";
import { canApproveEta, etaChangeNeedsApproval, etaDiffers, describeEtaChange, defaultEta, DEFAULT_ETA_WEEKS } from "../src/lib/eta-approval";

const OWNER = process.env.ADMIN_EMAIL ?? "jonc@iconluxurygroup.com";

// --- who decides -------------------------------------------------------------
assert.equal(canApproveEta({ email: OWNER, name: "Jon C" }, {}), true);
assert.equal(canApproveEta({ email: "moshe@iconluxurygroup.com", name: "Moshe Nahum" }, {}), true);
assert.equal(canApproveEta({ email: "moshe@iconluxurygroup.com", name: "  moshe nahum " }, null), true);
assert.equal(canApproveEta({ email: "designer@iconluxurygroup.com", name: "Dana Designer" }, {}), false);

// Set by hand under Settings, either way, for anyone.
assert.equal(canApproveEta({ email: "designer@iconluxurygroup.com", name: "Dana" }, { etaApprover: true }), true);
assert.equal(canApproveEta({ email: OWNER, name: "Jon C" }, { etaApprover: false }), false);
assert.equal(canApproveEta({ email: "moshe@iconluxurygroup.com", name: "Moshe Nahum" }, { etaApprover: false }), false);

// --- which edits wait --------------------------------------------------------
const nov12 = new Date("2026-11-12T00:00:00.000Z");
const dec03 = new Date("2026-12-03T00:00:00.000Z");

// A designer moving a date that's already there: that's the whole point.
assert.equal(etaChangeNeedsApproval({ currentEta: nov12, nextEta: dec03, canApprove: false }), true);
// ...and clearing one is moving it too.
assert.equal(etaChangeNeedsApproval({ currentEta: nov12, nextEta: null, canApprove: false }), true);
// The first date a sample ever gets isn't a change — nothing is being moved.
assert.equal(etaChangeNeedsApproval({ currentEta: null, nextEta: dec03, canApprove: false }), false);
// An approver's own edit is its own approval, so it never waits.
assert.equal(etaChangeNeedsApproval({ currentEta: nov12, nextEta: dec03, canApprove: true }), false);
// The same date typed again changes nothing, so there's nothing to approve.
assert.equal(etaChangeNeedsApproval({ currentEta: nov12, nextEta: new Date(nov12), canApprove: false }), false);
assert.equal(etaChangeNeedsApproval({ currentEta: nov12, nextEta: "2026-11-12T00:00:00.000Z", canApprove: false }), false);
assert.equal(etaChangeNeedsApproval({ currentEta: null, nextEta: null, canApprove: false }), false);

// The date the system set carries a time of day; the same date typed into a
// form arrives at midnight. Saving an untouched form is not a change.
const nov12Afternoon = new Date("2026-11-12T16:42:09.000Z");
assert.equal(etaDiffers(nov12Afternoon, nov12), false);
assert.equal(etaChangeNeedsApproval({ currentEta: nov12Afternoon, nextEta: nov12, canApprove: false }), false);
assert.equal(etaChangeNeedsApproval({ currentEta: nov12Afternoon, nextEta: dec03, canApprove: false }), true);

// Dates arrive as strings from forms and as Dates from the database.
assert.equal(etaDiffers(nov12, "2026-11-12T00:00:00.000Z"), false);
assert.equal(etaDiffers(nov12, "2026-12-03T00:00:00.000Z"), true);
assert.equal(etaDiffers(null, nov12), true);
assert.equal(etaDiffers(null, null), false);
assert.equal(etaDiffers(nov12, "not a date"), true);

// --- how it reads ------------------------------------------------------------
const day = (d: Date) => d.toISOString().slice(0, 10);
assert.equal(describeEtaChange(nov12, dec03, day), "2026-11-12 → 2026-12-03");
assert.equal(describeEtaChange(nov12, null, day), "2026-11-12 → cleared");
assert.equal(describeEtaChange(null, dec03, day), "no date → 2026-12-03");

// --- the date the system sets itself -----------------------------------------
// Eight weeks, counted from the day the sheet lands (or the email was sent),
// and the same eight everywhere: import, emailed request sheet, revision reset.
assert.equal(DEFAULT_ETA_WEEKS, 8);
const sent = new Date("2026-01-05T09:30:00.000Z");
assert.equal(defaultEta(sent).toISOString(), "2026-03-02T09:30:00.000Z");
assert.equal(Math.round((defaultEta(sent).getTime() - sent.getTime()) / 86_400_000), 56);
// Counting from a given day never moves that day.
assert.equal(sent.toISOString(), "2026-01-05T09:30:00.000Z");

console.log("eta-approval: all tests passed");
