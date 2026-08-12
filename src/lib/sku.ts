// Shared SKU code generation. A SKU is the sample number stripped of
// non-alphanumerics + the color's code, uppercased — e.g. sample PA-BEAR-10001
// with color code BLK -> PABEAR10001BLK.

export function skuBase(sampleNumber: string): string {
  return (sampleNumber ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function autoSkuCode(sampleNumber: string, colorCode: string): string {
  return `${skuBase(sampleNumber)}${(colorCode ?? "").trim().toUpperCase()}`;
}
