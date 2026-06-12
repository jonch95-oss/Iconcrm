import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";

const COMPANY_NAME = "Wholesale Co. — Sample-to-PO";

export interface OrderFormExportData {
  orderFormNumber: string;
  status: string;
  factory: { name: string; contactName: string | null; contactEmail: string | null; country: string | null };
  sizes: string[];
  // One row per style/color with a quantity per size.
  rows: {
    styleNumber: string;
    styleName: string;
    color: string;
    fob: string;
    currency: string;
    quantities: Record<string, number>;
    total: number;
  }[];
  grandTotal: number;
}

/** Fetch and shape an order form into a size-grid export structure. */
export async function getOrderFormExportData(orderFormId: string): Promise<OrderFormExportData | null> {
  const of = await prisma.orderForm.findUnique({
    where: { id: orderFormId },
    include: {
      factory: true,
      lines: { include: { sample: true, skuVariant: true } },
    },
  });
  if (!of) return null;

  const sizeSet = new Set<string>();
  for (const l of of.lines) if (l.skuVariant?.size) sizeSet.add(l.skuVariant.size);
  const sizes = [...sizeSet].sort();

  // Group lines by style + color.
  const map = new Map<string, OrderFormExportData["rows"][number]>();
  for (const l of of.lines) {
    const style = l.sample.styleNumber ?? l.sample.styleName ?? l.sample.sampleNumber;
    const color = l.skuVariant?.color ?? "—";
    const key = `${style}__${color}`;
    if (!map.has(key)) {
      map.set(key, {
        styleNumber: l.sample.styleNumber ?? "",
        styleName: l.sample.styleName ?? l.sample.sampleNumber,
        color,
        fob: l.fobCostSnapshot?.toString() ?? l.sample.fobCost?.toString() ?? "",
        currency: l.currency,
        quantities: {},
        total: 0,
      });
    }
    const row = map.get(key)!;
    const size = l.skuVariant?.size ?? "OS";
    row.quantities[size] = (row.quantities[size] ?? 0) + l.quantity;
    row.total += l.quantity;
  }

  const rows = [...map.values()];
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return {
    orderFormNumber: of.orderFormNumber,
    status: of.status,
    factory: {
      name: of.factory.name,
      contactName: of.factory.contactName,
      contactEmail: of.factory.contactEmail,
      country: of.factory.country,
    },
    sizes,
    rows,
    grandTotal,
  };
}

/** Build an .xlsx workbook buffer for the order form (factory-friendly format). */
export async function buildOrderFormWorkbook(data: OrderFormExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;
  const ws = wb.addWorksheet("Order Form");

  // Company header
  ws.mergeCells("A1", "D1");
  ws.getCell("A1").value = COMPANY_NAME;
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A2").value = "Order Form";
  ws.getCell("A2").font = { bold: true, size: 12 };
  ws.getCell("A3").value = `Order Form #: ${data.orderFormNumber}`;
  ws.getCell("A4").value = `Factory: ${data.factory.name}${data.factory.country ? ` (${data.factory.country})` : ""}`;
  ws.getCell("A5").value = `Contact: ${data.factory.contactName ?? "—"} ${data.factory.contactEmail ?? ""}`;

  // Size grid header (row 7).
  const headerRow = 7;
  const headers = ["Style #", "Style name", "Color", "FOB", ...data.sizes, "Total"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    cell.border = { bottom: { style: "thin" } };
  });

  data.rows.forEach((r, idx) => {
    const row = headerRow + 1 + idx;
    ws.getCell(row, 1).value = r.styleNumber;
    ws.getCell(row, 2).value = r.styleName;
    ws.getCell(row, 3).value = r.color;
    ws.getCell(row, 4).value = r.fob ? Number(r.fob) : "";
    data.sizes.forEach((size, i) => {
      ws.getCell(row, 5 + i).value = r.quantities[size] ?? 0;
    });
    ws.getCell(row, 5 + data.sizes.length).value = r.total;
  });

  // Grand total row.
  const totalRow = headerRow + 1 + data.rows.length;
  ws.getCell(totalRow, 4).value = "Grand total";
  ws.getCell(totalRow, 4).font = { bold: true };
  ws.getCell(totalRow, 5 + data.sizes.length).value = data.grandTotal;
  ws.getCell(totalRow, 5 + data.sizes.length).font = { bold: true };

  ws.columns.forEach((c) => (c.width = 14));
  ws.getColumn(2).width = 24;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
