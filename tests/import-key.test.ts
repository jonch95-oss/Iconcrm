/**
 * Unit tests for the sample-sheet row key (which column identifies a row).
 * Run with: npx tsx tests/import-key.test.ts
 */
import assert from "node:assert";
import { rowSampleKey } from "../src/lib/import-excel";

// Sample # wins when there's no master.
assert.equal(rowSampleKey({ sampleNumber: "LAB-HB-10079BLK", styleNumber: "LAB-HB-10079" }), "LAB-HB-10079BLK");

// A Master Sample # groups rows into one family.
assert.equal(rowSampleKey({ masterNumber: "LAB-HB-10079", sampleNumber: "LAB-HB-10079BLK" }), "LAB-HB-10079");

// Regression: a sheet that *has* a Master Sample # column but leaves it blank
// must still key on Sample # — blank mapped columns arrive as "", so a
// null-coalescing chain used to pick the empty master and skip every row.
assert.equal(rowSampleKey({ masterNumber: "", sampleNumber: "LAB-HB-10079BLK", styleNumber: "LAB-HB-10079" }), "LAB-HB-10079BLK");

// Whitespace-only cells count as blank too.
assert.equal(rowSampleKey({ masterNumber: "   ", sampleNumber: " LAB-HB-10088BLKCMO " }), "LAB-HB-10088BLKCMO");

// Sample-request sheets with only a STYLE # fall back to it.
assert.equal(rowSampleKey({ masterNumber: "", sampleNumber: "", styleNumber: "LAB-HB-10090" }), "LAB-HB-10090");

// Nothing identifying at all -> no key (row is reported as skipped).
assert.equal(rowSampleKey({ masterNumber: "", sampleNumber: "", styleNumber: "" }), "");
assert.equal(rowSampleKey({}), "");

console.log("import-key: all tests passed");
