/**
 * Reading the factory's weekly status sheet, and matching it to our samples.
 * Run with: npx tsx tests/ship-status.test.ts
 */
import assert from "node:assert";
import ExcelJS from "exceljs";
import { parseShipSheet, matchShipRows, styleHead, isTrackingNumber, type ShipRow, type ShipSample } from "../src/lib/ship-status";

// --- the pieces --------------------------------------------------------------
assert.equal(styleHead("OFW25-1039 ROLLING DUFFEL  [26]"), "OFW25-1039");
assert.equal(styleHead("LAB-HB-10071 VEGAN LEATHER CAMERA BAG"), "LAB-HB-10071");
assert.equal(styleHead("OW-BBPW-10001"), "OW-BBPW-10001");

assert.equal(isTrackingNumber("878499244331"), true);
assert.equal(isTrackingNumber("1Z999AA10123456784"), true);
assert.equal(isTrackingNumber("Receive"), false);
assert.equal(isTrackingNumber("-"), false);

// --- a sheet shaped like the factory's --------------------------------------
async function sheet(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sample Status");
  ws.addRow(["UPDATED 10/01/26"]);
  ws.addRow(["Style #", "MATERIAL", "Color", "Pcs", "", "Shipped", "FedEx", "Year"]);
  ws.addRow(["Style #", "MATERIAL", "Color", "Pcs", "", "Shipped", "SAMPLES", "Year"]); // repeated
  ws.addRow([]);
  ws.addRow(["OW-SHIP-1", "CANVAS ", "Army", 1, 419, new Date(Date.UTC(2026, 9, 12)), 878499244331]);
  ws.addRow(["OW-SHIP-1", "SUEDE", "Tan", 1, 419, new Date(Date.UTC(2026, 9, 12)), "Receive"]);
  ws.addRow(["OW-SHIP-2 ROLLING DUFFEL  [26]", "NYLON", "Black", 1, 308, new Date(Date.UTC(2026, 8, 20)), "Receive"]);
  ws.addRow(["OW-SHIP-3", "", "", 1, 263, new Date(Date.UTC(2026, 6, 15)), "Receive"]); // no color: the whole style
  ws.addRow(["OW-NOT-OURS", "PU", "Gray", 1, 263, new Date(Date.UTC(2026, 5, 15)), "Receive"]);
  ws.addRow(["OW-SHIP-1", "MESH", "Aubergine", 1, 419, new Date(Date.UTC(2026, 9, 12)), "Receive"]); // color we don't carry
  ws.addRow(["OW-SHIP-4", "LEATHER", "Black", 1, 263, "", "Receive"]); // no date yet
  ws.addRow([]);
  // The sheet changes its headers partway down, and adds a UPC column.
  ws.addRow(["TP STYLE", "Style #", "UPC", "Color", "Pcs", "Shipped", "FedEx"]);
  ws.addRow(["TP STYLE", "Style #", "UPC", "Color", "Pcs", "Shipped", "SAMPLES"]);
  ws.addRow(["OW-TP-9", "OWMBP002S261001", "199450157539", "BLACK", 1, new Date(Date.UTC(2026, 0, 6)), "Receive"]);
  ws.addRow(["OW-TP-9", "OWMBP003S265400", "199450157553", "ARMY", 1, new Date(Date.UTC(2026, 0, 9)), 877956909160]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The shape the factory moved to: Tracking # and a Received tick, no filler. */
async function newShape(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sample Status");
  ws.addRow(["UPDATED 10/19/26"]);
  ws.addRow(["Style #", "MATERIAL", "Color", "Pcs", "Shipped", "Tracking #", "Received", "Year"]);
  ws.addRow(["OW-SHIP-1", "CANVAS ", "Army", 1, new Date(Date.UTC(2026, 9, 12)), "Receive", true]);
  ws.addRow(["OW-SHIP-1", "SUEDE", "Tan", 1, new Date(Date.UTC(2026, 9, 14)), 878499244331, false]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function main() {
  // The factory rearranges its own sheet, so the reader follows the headers:
  // both the shape it had and the one it moved to read the same way.
  const now = await parseShipSheet(await newShape());
  assert.equal(now.error, undefined);
  assert.deepEqual(now.columns, { style: "A", material: "B", color: "C", shipped: "E", tracking: "F", received: "G" });
  assert.equal(now.rows.length, 2);
  assert.deepEqual(
    now.rows.map((r) => [r.color, r.shippedDate!.toISOString().slice(0, 10), r.tracking, r.received]),
    [["Army", "2026-10-12", "", true], ["Tan", "2026-10-14", "878499244331", false]],
  );

  const parsed = await parseShipSheet(await sheet());
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.sheet, "Sample Status");
  assert.deepEqual(parsed.columns, { style: "A", material: "B", color: "C", shipped: "F", tracking: "G" });
  // Eight dated rows; the one with no ship date isn't a shipment yet.
  assert.equal(parsed.rows.length, 8);
  assert.ok(!parsed.rows.some((r) => r.style === "OW-SHIP-4"));
  // "Receive" is not a courier number, and a real one survives as text.
  assert.equal(parsed.rows[0].tracking, "878499244331");
  assert.equal(parsed.rows[1].tracking, "");
  // The lower block's own columns are picked up from its own header.
  const tp = parsed.rows.filter((r) => r.upc);
  assert.equal(tp.length, 2);
  assert.deepEqual([tp[0].style, tp[0].skuCode, tp[0].upc, tp[0].color], ["OW-TP-9", "OWMBP002S261001", "199450157539", "BLACK"]);

  // --- matching ---------------------------------------------------------------
  const variant = (id: string, color: string, extra: Partial<ShipSample["variants"][number]> = {}) => ({
    id, color, shippedDate: null, ...extra,
  });
  const samples: ShipSample[] = [
    {
      id: "s1", sampleNumber: "OW-SHIP-1", shippedDate: null, variants: [
        variant("v-army", "ARMY"), variant("v-tan", "TAN"),
      ],
    },
    { id: "s2", sampleNumber: "OW-SHIP-2", shippedDate: null, variants: [variant("v-black", "BLACK")] },
    { id: "s3", sampleNumber: "OW-SHIP-3", shippedDate: null, variants: [] },
    {
      id: "s4", sampleNumber: "LAB-99", shippedDate: null, variants: [
        variant("v-upc", "BLACK", { upc: "199450157539" }),
        variant("v-sku", "ARMY", { skuCode: "OWMBP003S265400" }),
      ],
    },
  ];

  const report = matchShipRows(parsed.rows, samples);
  const by = (id: string) => report.updates.find((u) => u.variantId === id || (!u.variantId && u.sampleId === id));

  // Color named on the row, color on the sample: the date lands on the color.
  assert.equal(by("v-army")!.shippedDate.toISOString().slice(0, 10), "2026-10-12");
  assert.equal(by("v-army")!.tracking, "878499244331");
  assert.equal(by("v-tan")!.tracking, "", '"Receive" leaves no number to chase');
  // The factory's description after the style number doesn't stop it matching.
  assert.equal(by("v-black")!.matchedOn, "sample # (description trimmed)");
  // No color on the row and no colors on the sample: the whole style shipped.
  assert.equal(by("s3")!.variantId, undefined);
  assert.equal(by("s3")!.shippedDate.toISOString().slice(0, 10), "2026-07-15");
  // A UPC and a SKU code beat everything else, even a style we don't carry.
  assert.equal(by("v-upc")!.matchedOn, "UPC");
  assert.equal(by("v-sku")!.matchedOn, "SKU code");
  assert.equal(by("v-sku")!.tracking, "877956909160");

  // One colour on the sample, and the factory calls it something else
  // entirely — "Print", "Black P", a typo. There is nothing else it could be,
  // so it matches rather than landing in a list for someone to read.
  const oneColour = matchShipRows(
    [
      { row: 170, style: "LAB-HB-10014", skuCode: "", upc: "", material: "", color: "Print", shippedDate: new Date(Date.UTC(2026, 9, 12)), tracking: "", received: false },
      { row: 151, style: "LAB-HB-10083", skuCode: "", upc: "", material: "", color: "Biege", shippedDate: new Date(Date.UTC(2026, 9, 12)), tracking: "", received: false },
    ],
    [
      { id: "o1", sampleNumber: "LAB-HB-10014", shippedDate: null, variants: [variant("v-black", "BLACK")] },
      { id: "o2", sampleNumber: "LAB-HB-10083", shippedDate: null, variants: [variant("v-blk", "BLK")] },
    ],
  );
  assert.deepEqual(oneColour.updates.map((u) => u.variantId).sort(), ["v-black", "v-blk"]);
  assert.equal(oneColour.skipped.length, 0);

  // Several colours, and the factory's word for one of them isn't ours:
  // "Aperol" is the orange, "Navy" is the denim, "Print" is the camo. An
  // exact word still wins over a synonym of it.
  const named = matchShipRows(
    [
      { row: 52, style: "OW-A", skuCode: "", upc: "", material: "", color: "Aperol", shippedDate: new Date(Date.UTC(2026, 9, 12)), tracking: "", received: false },
      { row: 53, style: "OW-B", skuCode: "", upc: "", material: "", color: "Navy", shippedDate: new Date(Date.UTC(2026, 9, 12)), tracking: "", received: false },
      { row: 54, style: "OW-C", skuCode: "", upc: "", material: "", color: "Print", shippedDate: new Date(Date.UTC(2026, 9, 12)), tracking: "", received: false },
      { row: 55, style: "OW-D", skuCode: "", upc: "", material: "", color: "Navy", shippedDate: new Date(Date.UTC(2026, 9, 12)), tracking: "", received: false },
    ],
    [
      { id: "a", sampleNumber: "OW-A", shippedDate: null, variants: [variant("a-tan", "Tan"), variant("a-orange", "ORANGE")] },
      { id: "b", sampleNumber: "OW-B", shippedDate: null, variants: [variant("b-black", "BLACK"), variant("b-denim", "BLUE DENIM")] },
      { id: "c", sampleNumber: "OW-C", shippedDate: null, variants: [variant("c-black", "BLACK"), variant("c-camo", "CAMO")] },
      { id: "d", sampleNumber: "OW-D", shippedDate: null, variants: [variant("d-denim", "BLUE DENIM"), variant("d-navy", "NAVY")] },
    ],
  );
  assert.deepEqual(named.updates.map((u) => u.variantId), ["a-orange", "b-denim", "c-camo", "d-navy"]);
  assert.equal(named.skipped.length, 0);

  // A word that fits none of them is still a question for a person: picking
  // one at random would be worse than saying so.
  const several = matchShipRows(
    [{ row: 52, style: "OW-BSAW-10001", skuCode: "", upc: "", material: "", color: "Sunset", shippedDate: new Date(Date.UTC(2026, 9, 12)), tracking: "", received: false }],
    [
      {
        id: "m1", sampleNumber: "OW-BSAW-10001", shippedDate: null,
        variants: [variant("v-tan", "Tan"), variant("v-brown", "Brown"), variant("v-black", "BLACK"), variant("v-orange", "ORANGE")],
      },
    ],
  );
  assert.equal(several.updates.length, 0);
  assert.match(several.skipped[0].reason, /isn't a color on this sample/);

  // Hyphens drift between the two systems; the letters and digits don't.
  const drifted = matchShipRows(
    [{ row: 2, style: "OW-BBPW-10001", skuCode: "", upc: "", material: "CANVAS", color: "Army", shippedDate: new Date(Date.UTC(2026, 9, 12)), tracking: "", received: false }],
    [{ id: "d1", sampleNumber: "OW-BBPW10001", shippedDate: null, variants: [] }],
  );
  assert.equal(drifted.updates.length, 1);
  assert.equal(drifted.updates[0].matchedOn, "style # (spacing ignored)");

  // ...but only when one sample answers to it.
  const twins = matchShipRows(
    [{ row: 2, style: "OW BBPW 10002", skuCode: "", upc: "", material: "", color: "", shippedDate: new Date(Date.UTC(2026, 9, 12)), tracking: "", received: false }],
    [
      { id: "t1", sampleNumber: "OW-BBPW10002", shippedDate: null, variants: [] },
      { id: "t2", sampleNumber: "OWBBPW-10002", shippedDate: null, variants: [] },
    ],
  );
  assert.equal(twins.updates.length, 0);
  assert.match(twins.skipped[0].reason, /too ambiguous/);

  // What it wouldn't guess at.
  const reason = (style: string) => report.skipped.find((s) => s.style === style)?.reason ?? "";
  assert.match(reason("OW-NOT-OURS"), /no sample with that number/);
  assert.match(reason("OW-SHIP-1"), /isn't a color on this sample/);

  // Nothing is written twice: every update is one target.
  assert.equal(new Set(report.updates.map((u) => u.variantId ?? u.sampleId)).size, report.updates.length);
  // All of it is new, so all of it is a change.
  assert.equal(report.changes.length, report.updates.length);

  // Running it again over a database that already has these dates changes nothing.
  const after: ShipSample[] = samples.map((s) => ({
    ...s,
    shippedDate: by(s.id)?.variantId ? s.shippedDate : (by(s.id)?.shippedDate ?? s.shippedDate),
    variants: s.variants.map((v) => {
      const u = report.updates.find((x) => x.variantId === v.id);
      return u ? { ...v, shippedDate: u.shippedDate, trackingNumber: u.tracking || null } : v;
    }),
  }));
  assert.equal(matchShipRows(parsed.rows, after).changes.length, 0, "a second run has nothing to do");

  console.log("ship-status: all tests passed");
}

main();
