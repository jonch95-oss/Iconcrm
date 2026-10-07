/**
 * Matching a factory price list to the samples that already exist.
 * Run with: npx tsx tests/fob-match.test.ts
 */
import assert from "node:assert";
import ExcelJS from "exceljs";
import { baseSampleNumber, materialFit, matchPrices, parsePriceList, type MatchSample, type PriceRow } from "../src/lib/fob-match";

// ---- the pieces ------------------------------------------------------------
assert.equal(baseSampleNumber("OW-BBPM0001 A"), "OW-BBPM0001");
assert.equal(baseSampleNumber("OW-BSAW-10001-B"), "OW-BSAW-10001");
assert.equal(baseSampleNumber("LAB-0072 / second quote"), "LAB-0072");
// A colour word is part of the number, not a variant letter.
assert.equal(baseSampleNumber("LAB0074WOODROSE"), "LAB0074WOODROSE");

// Plain "LEATHER" beats "SUEDE / LEATHER" for a sample that only says leather.
assert.deepEqual(materialFit(" LEATHER", new Set(["LEATHER"])), { hits: 1, extras: 0 });
assert.deepEqual(materialFit("SUEDE/ LEATHER", new Set(["LEATHER"])), { hits: 1, extras: 1 });
assert.deepEqual(materialFit("NYLON / PU", new Set(["LEATHER"])), { hits: 0, extras: 1 });

// ---- a whole price list ----------------------------------------------------
let n = 1;
const price = (style: string, composition: string, fob: number | null, styleName = ""): PriceRow => ({
  row: ++n,
  style,
  base: baseSampleNumber(style),
  composition,
  styleName,
  brand: "off white",
  fob,
});

const priceRows: PriceRow[] = [
  // one price, one row: straight through
  price("CH26-203", "PU RIPSTOP", 3.54),
  // one price spread over several rows: still unambiguous
  price("LAB-0072", "PU", 11.08),
  price("LAB-0072", "PU LINED", 11.08),
  // several prices, and the sample's material names one of them
  price("OW-BBPM0006", "CANVAS / LEATHER", 14.68),
  price("OW-BBPM0006", "Distressed Denim LEATHER", 18.26),
  // several prices, sample says only "Leather" — the plain leather row wins
  price("OW-BBPW0003", " SUEDE/ LEATHER", 66.82),
  price("OW-BBPW0003", "DENIM /  LEATHER", 28.22),
  price("OW-BBPW0003", " LEATHER", 66.82),
  // several prices, nothing to choose with
  price("OW-BBPM0005", "CANVAS", 17.53),
  price("OW-BBPM0005", "NYLON", 34.36),
  // variant letters fold onto the base sample when the CRM has no A/B
  price("OW-BHOM-10001 A", "NAPPA LEATHER", 41.5),
  price("OW-BHOM-10001 B", "NAPPA LEATHER", 41.5),
  // ...but an exact number always wins over the folded one
  price("OW-BSAW-10002-A", "VINYL", 22),
  price("OW-BSAW-10002-B", "VINYL", 29),
  // the CRM only knows this one by its Style #
  price("TP-9001", "NYLON", 7.25),
  // the price the CRM already has: nothing to apply
  price("CH26-205", "PU RIPSTOP", 3.98),
  // nothing in the CRM carries this number
  price("ZZ-NOT-IN-CRM", "PU", 5, "GHOST"),
  // a row with no price at all
  price("CH26-209", "PU", null, "NO QUOTE YET"),
  // a style # shared by two samples is too ambiguous to price
  price("TP-SHARED", "PU", 9.5, "TWINS"),
];

const sample = (
  id: string,
  sampleNumber: string,
  extra: Partial<MatchSample> = {},
): MatchSample => ({ id, sampleNumber, fob: null, ...extra });

const samples: MatchSample[] = [
  sample("s1", "CH26-203", { styleNumber: "CH26-203", material: "PU" }),
  sample("s2", "LAB-0072", { styleNumber: "LAB-0072", material: "PU" }),
  sample("s3", "OW-BBPM0006", { material: "Denim", fob: 20 }),
  sample("s4", "OW-BBPW0003", { material: "Leather" }),
  sample("s5", "OW-BBPM0005", { material: "" }),
  sample("s6", "OW-BHOM-10001", { material: "Nappa Leather" }),
  sample("s7", "OW-BSAW-10002-A", { material: "Vinyl" }),
  sample("s8", "OW-BSAW-10002-B", { material: "Vinyl" }),
  sample("s9", "LAB-BELT-1", { styleNumber: "TP-9001", material: "Nylon" }),
  sample("s10", "CH26-205", { styleNumber: "CH26-205", material: "PU", fob: 3.98 }),
  sample("s11", "TW-1", { styleNumber: "TP-SHARED", material: "PU" }),
  sample("s12", "TW-2", { styleNumber: "TP-SHARED", material: "PU" }),
];

const report = matchPrices(priceRows, samples);
const priced = new Map(report.priced.map((p) => [p.sampleNumber, p]));
const reason = (style: string) => report.skipped.find((s) => s.style === style)?.reason ?? "";

// one price, however many rows carry it
assert.equal(priced.get("CH26-203")!.fob, 3.54);
assert.equal(priced.get("LAB-0072")!.fob, 11.08);

// the material picks among several prices
assert.equal(priced.get("OW-BBPM0006")!.fob, 18.26, 'a "Denim" sample takes the denim price');
assert.equal(priced.get("OW-BBPW0003")!.fob, 66.82, 'a "Leather" sample takes the plain leather price');

// ...and when it can't, the sample is left alone
assert.ok(!priced.has("OW-BBPM0005"));
assert.match(reason("OW-BBPM0005"), /no material to match/);

// variant letters fold onto the base sample, but never over an exact match
assert.equal(priced.get("OW-BHOM-10001")!.fob, 41.5);
assert.match(priced.get("OW-BHOM-10001")!.matchedOn, /variant folded in/);
assert.equal(priced.get("OW-BSAW-10002-A")!.fob, 22);
assert.equal(priced.get("OW-BSAW-10002-B")!.fob, 29);

// the Style # fallback, and the point at which it gives up
assert.equal(priced.get("LAB-BELT-1")!.fob, 7.25);
assert.equal(priced.get("LAB-BELT-1")!.matchedOn, "style #");
assert.ok(!priced.has("TW-1") && !priced.has("TW-2"));
assert.match(reason("TP-SHARED"), /on 2 samples/);

// nothing invented, nothing needlessly rewritten
assert.match(reason("ZZ-NOT-IN-CRM"), /no sample with that number/);
assert.match(reason("CH26-209"), /no price on the list row/);
assert.equal(priced.get("CH26-205")!.fob, 3.98);
assert.deepEqual(
  report.changes.map((c) => c.sampleNumber).sort(),
  ["CH26-203", "LAB-0072", "LAB-BELT-1", "OW-BBPM0006", "OW-BBPW0003", "OW-BHOM-10001", "OW-BSAW-10002-A", "OW-BSAW-10002-B"],
  "only prices that actually move are offered",
);
// the one price already on the sample is reported as correct, not as a change
assert.equal(report.priced.length - report.changes.length, 1);
assert.equal(report.styles, new Set(priceRows.map((r) => r.base.toUpperCase())).size);

// ---- a style quoted per color ----------------------------------------------
// Two colors, two prices, each color's name naming its own row: the prices go
// on the colors, not on the sample.
const perColor = matchPrices(
  [
    price("OW-DUO", "DENIM / LEATHER", 24.61),
    price("OW-DUO", "SUEDE / LEATHER", 42.69),
  ],
  [
    sample("d1", "OW-DUO", {
      styleName: "TWO TONE HOBO",
      variants: [
        { id: "v-denim", color: "DENIM BLUE", fob: null },
        { id: "v-suede", color: "SUEDE TAUPE", fob: null },
      ],
    }),
  ],
);
assert.deepEqual(
  perColor.priced.map((p) => [p.color, p.fob, p.variantId]),
  [["DENIM BLUE", 24.61, "v-denim"], ["SUEDE TAUPE", 42.69, "v-suede"]],
);
assert.equal(perColor.skipped.length, 0);

// One color matching and one not is not a result: pricing half the colors
// leaves the rest on a price meant for another material.
const halfMatched = matchPrices(
  [
    price("OW-HALF", "DENIM / LEATHER", 24.61),
    price("OW-HALF", "SUEDE / LEATHER", 42.69),
  ],
  [
    sample("h1", "OW-HALF", {
      variants: [
        { id: "v-denim", color: "DENIM BLUE", fob: null },
        { id: "v-black", color: "BLACK", fob: null },
      ],
    }),
  ],
);
assert.equal(halfMatched.priced.length, 0);
assert.match(halfMatched.skipped[0].reason, /several prices/);

// ---- a color that knows its own factory style number ------------------------
// The sheet quotes LAB-77-SUEDE; that number is on the color, so the price goes
// straight onto it — no material guessing, and the sample is left alone.
const byColorStyle = matchPrices(
  [price("LAB-77-SUEDE", "SUEDE / LEATHER", 42.69), price("LAB-77-DENIM", "DENIM / LEATHER", 24.61)],
  [
    sample("c1", "LAB-77", {
      fob: 30,
      variants: [
        { id: "v-s", color: "TAUPE", material: "Suede", styleNumber: "LAB-77-SUEDE", fob: null },
        { id: "v-d", color: "INDIGO", material: "Denim", styleNumber: "LAB-77-DENIM", fob: null },
      ],
    }),
  ],
);
assert.deepEqual(
  byColorStyle.priced.map((p) => [p.variantId, p.fob, p.matchedOn]),
  [["v-s", 42.69, "TP style # on the color"], ["v-d", 24.61, "TP style # on the color"]],
);
assert.equal(byColorStyle.skipped.length, 0);

// The color's own material breaks a tie when its style number is quoted twice.
const twoQuotes = matchPrices(
  [price("LAB-88-A", "SUEDE / LEATHER", 42.69), price("LAB-88-A", "RAFFIA / LEATHER", 31.4)],
  [
    sample("c2", "LAB-88", {
      variants: [{ id: "v-r", color: "NATURAL", material: "Raffia", styleNumber: "LAB-88-A", fob: null }],
    }),
  ],
);
assert.deepEqual(twoQuotes.priced.map((p) => [p.variantId, p.fob]), [["v-r", 31.4]]);

// A style number two colors share names neither of them; the sample's own
// number still catches the row.
const sharedByColors = matchPrices(
  [price("LAB-99", "PU", 8.5)],
  [
    sample("c3", "LAB-99", {
      variants: [
        { id: "v-1", color: "BLACK", styleNumber: "LAB-99", fob: null },
        { id: "v-2", color: "WHITE", styleNumber: "LAB-99", fob: null },
      ],
    }),
  ],
);
assert.deepEqual(sharedByColors.priced.map((p) => [p.sampleNumber, p.variantId, p.fob]), [["LAB-99", undefined, 8.5]]);

// ---- reading the factory's own sheet ---------------------------------------
async function readsTheFactorySheet() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Samples");
  ws.addRow(["TP Style #", "Brand", "Style Name", "Composition", "FOB Cost"]);
  ws.addRow(["CH26-203", "champion", "CAMPER 6 CAN COOLER", "PU RIPSTOP", 3.54]);
  ws.addRow(["OW-BHOM-10001 A", "off white", "SHOULDER", "NAPPA LEATHER", "$41.50"]);
  ws.addRow(["", "", "", "", ""]); // a blank filler row the factory left in
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const parsed = await parsePriceList(buf);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.rows.length, 2, "blank rows are not price rows");
  assert.deepEqual(parsed.columns, { style: "TP STYLE #", fob: "FOB COST", composition: "COMPOSITION" });
  assert.equal(parsed.rows[1].fob, 41.5, "a price typed as text still reads as money");
  assert.equal(parsed.rows[1].base, "OW-BHOM-10001");

  // a sheet that isn't a price list says so instead of importing nothing
  const other = new ExcelJS.Workbook();
  other.addWorksheet("Sheet1").addRow(["Name", "Qty"]);
  const bad = await parsePriceList(Buffer.from(await other.xlsx.writeBuffer()));
  assert.match(bad.error ?? "", /needs a style column/);

}

readsTheFactorySheet().then(() => console.log("fob-match: all tests passed"));
