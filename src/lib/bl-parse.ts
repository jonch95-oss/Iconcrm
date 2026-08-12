// Best-effort extraction of shipment fields from Bill of Lading text.
// Label-driven with sensible fallbacks; the UI always confirms before saving.

export interface BlFields {
  containerNumber: string;
  mblNumber: string;
  bookingNumber: string;
  vesselName: string;
  voyage: string;
  pol: string;
  pod: string;
  finalDestination: string;
  originalEtd: string; // YYYY-MM-DD when found
  originalEta: string;
}

const EMPTY: BlFields = {
  containerNumber: "", mblNumber: "", bookingNumber: "", vesselName: "",
  voyage: "", pol: "", pod: "", finalDestination: "", originalEtd: "", originalEta: "",
};

/** First capture group of the first matching pattern, trimmed. */
function first(text: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim().replace(/\s{2,}/g, " ");
  }
  return "";
}

/** Normalize a loosely-formatted date to YYYY-MM-DD, else "". */
function normDate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); // DD/MM/YYYY (assume day-first)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const MON: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  m = s.match(/(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{4})/); // 25-Aug-2026
  if (m) { const mo = MON[m[2].toLowerCase()]; if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, "0")}`; }
  return "";
}

export function extractBlFields(text: string): BlFields {
  if (!text || !text.trim()) return { ...EMPTY };
  const t = text.replace(/\r/g, "");

  // Container: prefer a labelled value, else the first ISO 6346 code (AAAA1234567).
  let containerNumber = first(t, [
    /container\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z]{4}\s?\d{7})/i,
  ]).replace(/\s+/g, "").toUpperCase();
  if (!containerNumber) {
    const iso = t.match(/\b([A-Z]{4}\d{7})\b/);
    if (iso) containerNumber = iso[1].toUpperCase();
  }

  const mblNumber = first(t, [
    /(?:master\s*)?bill\s*of\s*lading\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9-]{6,})/i,
    /\bB\/?L\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9-]{6,})/i,
    /\bMBL\s*(?:no\.?|#)?\s*[:\-]?\s*([A-Z0-9-]{6,})/i,
    /\b(?:sea\s*)?waybill\s*(?:no\.?|#)?\s*[:\-]?\s*([A-Z0-9-]{6,})/i,
  ]).toUpperCase();

  const bookingNumber = first(t, [
    /booking\s*(?:no\.?|number|#|ref\.?)?\s*[:\-]?\s*([A-Z0-9-]{5,})/i,
  ]).toUpperCase();

  const vesselName = first(t, [
    /vessel(?:\s*(?:name|\/\s*voyage))?\s*[:\-]?\s*([A-Z0-9 .'-]+?)(?:\s{2,}|\s*voyage|\s*voy\.?|\n|$)/i,
  ]);

  const voyage = first(t, [
    /voyage\s*(?:no\.?|#)?\s*[:\-]?\s*([A-Z0-9-]{2,})/i,
    /\bvoy\.?\s*(?:no\.?|#)?\s*[:\-]?\s*([A-Z0-9-]{2,})/i,
  ]).toUpperCase();

  const pol = first(t, [
    /port\s*of\s*loading\s*[:\-]?\s*([A-Za-z0-9 ,.'-]+?)(?:\n|$)/i,
    /(?:place|port)\s*of\s*receipt\s*[:\-]?\s*([A-Za-z0-9 ,.'-]+?)(?:\n|$)/i,
  ]);

  const pod = first(t, [
    /port\s*of\s*discharge\s*[:\-]?\s*([A-Za-z0-9 ,.'-]+?)(?:\n|$)/i,
  ]);

  const finalDestination = first(t, [
    /(?:place\s*of\s*delivery|final\s*destination)\s*[:\-]?\s*([A-Za-z0-9 ,.'-]+?)(?:\n|$)/i,
  ]);

  const originalEtd = normDate(first(t, [
    /\bE\.?T\.?D\.?\s*[:\-]?\s*([0-9A-Za-z\/.\- ]{6,20})/i,
    /estimated\s*(?:time\s*of\s*)?depart\w*\s*[:\-]?\s*([0-9A-Za-z\/.\- ]{6,20})/i,
  ]));
  const originalEta = normDate(first(t, [
    /\bE\.?T\.?A\.?\s*[:\-]?\s*([0-9A-Za-z\/.\- ]{6,20})/i,
    /estimated\s*(?:time\s*of\s*)?arriv\w*\s*[:\-]?\s*([0-9A-Za-z\/.\- ]{6,20})/i,
  ]));

  return { containerNumber, mblNumber, bookingNumber, vesselName, voyage, pol, pod, finalDestination, originalEtd, originalEta };
}
