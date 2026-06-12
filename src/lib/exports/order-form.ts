import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Production Order Form export — replicates the company template exactly:
// merged banner, Customer/PO/Shipping/Port labels with red PI/ETA cells,
// 18-column gray header (IMAGES → TTL LDP), numbered image-height rows,
// SUM totals. One row per style/color/size line.
// ---------------------------------------------------------------------------

export interface OrderFormExportData {
  orderFormNumber: string;
  status: string;
  factoryName: string | null;
  customer: string | null;
  customerPoNumbers: string;
  rows: {
    imageUrl: string | null;
    description: string;
    tpStyleNumber: string; // our style number
    styleNumber: string; // factory/sample reference
    color: string;
    size: string;
    casePack: number | null; // units per carton
    quantity: number;
    composition: string;
    upc: string;
    fob: number | null;
    freight: number | null;
    dutyRatePercent: number | null;
  }[];
}

/** Fetch and shape an order form into the template's row structure. */
export async function getOrderFormExportData(
  orderFormId: string,
): Promise<OrderFormExportData | null> {
  const of = await prisma.orderForm.findUnique({
    where: { id: orderFormId },
    include: {
      factory: true,
      lines: {
        include: { sample: true, skuVariant: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!of) return null;

  const customers = new Set<string>();
  for (const l of of.lines) if (l.sample.targetCustomer) customers.add(l.sample.targetCustomer);

  return {
    orderFormNumber: of.orderFormNumber,
    status: of.status,
    factoryName: of.factory?.name ?? null,
    customer: [...customers].join(", ") || null,
    customerPoNumbers: "",
    rows: of.lines.map((l) => ({
      imageUrl: l.sample.imageUrl,
      description: l.sample.styleName ?? l.sample.description ?? "",
      tpStyleNumber: l.sample.styleNumber ?? "",
      styleNumber: l.sample.sampleNumber,
      color: l.skuVariant?.color ?? "",
      size: l.skuVariant?.size ?? "",
      casePack: l.skuVariant?.unitsPerCarton ?? null,
      quantity: l.quantity,
      composition: "",
      upc: l.skuVariant?.upc ?? "",
      fob: l.fobCostSnapshot ? Number(l.fobCostSnapshot) : l.sample.fobCost ? Number(l.sample.fobCost) : null,
      freight: l.sample.freightPerUnit ? Number(l.sample.freightPerUnit) : null,
      dutyRatePercent: l.sample.dutyRatePercent ? Number(l.sample.dutyRatePercent) : null,
    })),
  };
}

const GRAY = "FFE8E8E8";
const RED = "FFFF0000";
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const HEADERS: { col: number; text: string; width: number }[] = [
  { col: 1, text: "", width: 40.2 }, // numbering column (A)
  { col: 2, text: "IMAGES", width: 40.8 },
  { col: 3, text: "DESCRIPTION", width: 35.4 },
  { col: 4, text: "TP STYLE NUMBER", width: 22 },
  { col: 5, text: "STYLE NUMER", width: 30.9 },
  { col: 6, text: "COLOR", width: 21.8 },
  { col: 7, text: "SIZE (if applicable)", width: 18 },
  { col: 8, text: "CBM", width: 12 },
  { col: 9, text: "CBM TOTAL", width: 25.4 },
  { col: 10, text: "CASE PACK", width: 11.8 },
  { col: 11, text: "TTL CASES", width: 24.8 },
  { col: 12, text: "TTL QUANTITY", width: 16 },
  { col: 13, text: "Composition W/ Percentages (if leather- input type of leather)", width: 62.6 },
  { col: 14, text: "HTS CODE", width: 20.3 },
  { col: 15, text: "UPC", width: 16.3 },
  { col: 16, text: "FOB", width: 12 },
  { col: 17, text: "FREIGHT", width: 14.9 },
  { col: 18, text: "LDP ", width: 37.2 },
  { col: 19, text: "TTL LDP", width: 28.5 },
];

/** Build the .xlsx matching the Production Order Form template. */
export async function buildOrderFormWorkbook(data: OrderFormExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ICON LUXURY GROUP";
  const ws = wb.addWorksheet("Order");

  for (const h of HEADERS) ws.getColumn(h.col).width = h.width;

  // Banner: A1:S2 merged.
  ws.mergeCells("A1:S2");
  const banner = ws.getCell("A1");
  banner.value = "Production Order Form";
  banner.font = { name: "Calibri", size: 36, bold: true };
  banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY } };
  banner.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 18.75;
  ws.getRow(2).height = 18.75;

  // Info labels A3:A9 (values in B).
  const info: { row: number; label: string; value: string; red?: boolean; height?: number }[] = [
    { row: 3, label: "Customer", value: data.customer ?? "", height: 34.15 },
    { row: 4, label: "Customer PO #", value: data.customerPoNumbers, height: 25.35 },
    { row: 5, label: "Shipping Address", value: "", height: 101.25 },
    { row: 6, label: "Port of Loading (LA, NY, Canada)", value: "", height: 42 },
    { row: 7, label: "PI NO.:", value: "", red: true, height: 21.75 },
    { row: 8, label: "SHIP DATE ETA (MM/DD/YY)", value: "", red: true, height: 40.5 },
    { row: 9, label: "DELIVERY DATE ETA (MM/DD/YY)", value: "", red: true, height: 40.5 },
  ];
  for (const i of info) {
    const cell = ws.getCell(i.row, 1);
    cell.value = i.label;
    cell.font = { name: "Calibri", size: 12, bold: true };
    cell.alignment = { vertical: "middle", wrapText: true };
    if (i.red) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    const val = ws.getCell(i.row, 2);
    val.value = i.value || "";
    val.alignment = { vertical: "middle", wrapText: true };
    val.border = THIN;
    if (i.height) ws.getRow(i.row).height = i.height;
  }

  // Header row 10.
  const HEADER_ROW = 10;
  for (const h of HEADERS) {
    if (!h.text) continue;
    const cell = ws.getCell(HEADER_ROW, h.col);
    cell.value = h.text;
    cell.font = { name: "Calibri", size: h.col === 14 ? 13 : 14, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = THIN;
  }
  ws.getRow(HEADER_ROW).height = 18.75;

  // Product photos, fetched in parallel; failures never block the export.
  const imageBuffers = await Promise.all(
    data.rows.map(async (r) => {
      if (!r.imageUrl || !r.imageUrl.startsWith("http")) return null;
      try {
        const res = await fetch(r.imageUrl);
        if (!res.ok) return null;
        const type = res.headers.get("content-type") ?? "";
        const ext = type.includes("png") ? "png" : type.includes("gif") ? "gif" : "jpeg";
        return { buffer: Buffer.from(await res.arrayBuffer()), ext: ext as "png" | "gif" | "jpeg" };
      } catch {
        return null;
      }
    }),
  );

  // Data rows: at least 20 numbered rows, like the template.
  const rowCount = Math.max(20, data.rows.length);
  const firstDataRow = HEADER_ROW + 1; // 11
  for (let i = 0; i < rowCount; i++) {
    const rowNum = firstDataRow + i;
    const row = ws.getRow(rowNum);
    row.height = 111.75;
    ws.getCell(rowNum, 1).value = i + 1;
    ws.getCell(rowNum, 1).alignment = { horizontal: "center", vertical: "middle" };

    for (let c = 2; c <= 19; c++) {
      const cell = ws.getCell(rowNum, c);
      cell.border = THIN;
      cell.alignment = { vertical: "middle", wrapText: true, horizontal: c >= 8 ? "center" : "left" };
    }

    const r = data.rows[i];
    if (!r) continue;

    const img = imageBuffers[i];
    if (img) {
      const imageId = wb.addImage({
        buffer: img.buffer as unknown as ExcelJS.Buffer,
        extension: img.ext,
      });
      ws.addImage(imageId, {
        tl: { col: 1.08, row: rowNum - 1 + 0.05 },
        ext: { width: 130, height: 130 },
      });
    }

    ws.getCell(rowNum, 3).value = r.description;
    ws.getCell(rowNum, 4).value = r.tpStyleNumber;
    ws.getCell(rowNum, 5).value = r.styleNumber;
    ws.getCell(rowNum, 6).value = r.color;
    ws.getCell(rowNum, 7).value = r.size;
    // CBM (H) is a manual fill-in; CBM TOTAL (I) = CBM × TTL CASES.
    ws.getCell(rowNum, 9).value = { formula: `H${rowNum}*K${rowNum}` };
    if (r.casePack) {
      ws.getCell(rowNum, 10).value = r.casePack;
      // TTL CASES = quantity / case pack.
      ws.getCell(rowNum, 11).value = { formula: `IF(J${rowNum}=0,0,ROUNDUP(L${rowNum}/J${rowNum},0))` };
    }
    ws.getCell(rowNum, 12).value = r.quantity;
    ws.getCell(rowNum, 13).value = r.composition;
    // HTS (N) manual fill-in.
    ws.getCell(rowNum, 15).value = r.upc;
    if (r.fob !== null) {
      ws.getCell(rowNum, 16).value = r.fob;
      ws.getCell(rowNum, 16).numFmt = "$#,##0.00";
    }
    if (r.freight !== null) {
      ws.getCell(rowNum, 17).value = r.freight;
      ws.getCell(rowNum, 17).numFmt = "$#,##0.00";
    }
    // LDP = FOB + duty + freight. Duty rate from the sample, inline in the
    // formula so the sheet stays live if FOB/FREIGHT are edited.
    const duty = r.dutyRatePercent ?? 0;
    ws.getCell(rowNum, 18).value = {
      formula: `IF(P${rowNum}="","",ROUND(P${rowNum}*${(1 + duty / 100).toFixed(4)}+IF(Q${rowNum}="",0,Q${rowNum}),2))`,
    };
    ws.getCell(rowNum, 18).numFmt = "$#,##0.00";
    // TTL LDP = LDP × quantity.
    ws.getCell(rowNum, 19).value = { formula: `IF(R${rowNum}="","",ROUND(R${rowNum}*L${rowNum},2))` };
    ws.getCell(rowNum, 19).numFmt = "$#,##0.00";
  }

  // Totals row (one blank row gap, like the template).
  const lastDataRow = firstDataRow + rowCount - 1;
  const totalRow = lastDataRow + 2;
  ws.getCell(totalRow, 12).value = { formula: `SUM(L${firstDataRow}:L${lastDataRow})` };
  ws.getCell(totalRow, 12).font = { bold: true };
  ws.getCell(totalRow, 19).value = { formula: `SUM(S${firstDataRow}:S${lastDataRow})` };
  ws.getCell(totalRow, 19).font = { bold: true };
  ws.getCell(totalRow, 19).numFmt = "$#,##0.00";

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
