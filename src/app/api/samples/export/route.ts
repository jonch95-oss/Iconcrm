import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * Mass export of all samples + variants, in exactly the columns the Excel
 * importer understands — download, bulk-edit, re-upload to apply changes.
 * The Sample # repeats on every row so variant rows always re-attach.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const samples = await prisma.sample.findMany({
    include: { factory: { select: { name: true } }, skuVariants: { orderBy: { upc: "asc" } } },
    orderBy: { sampleNumber: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "ICON LUXURY GROUP";
  const ws = wb.addWorksheet("Samples");
  const header = [
    "Sample #", "Brand", "Category", "Style #", "Style Name", "Description",
    "FOB", "Sell Price", "Duty %", "Freight/Unit", "Inland/Unit",
    "Factory", "Target Customer", "Status", "Size", "Color", "UPC", "SKU Code",
  ];
  ws.addRow(header);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const num = (d: unknown) => (d == null ? "" : Number(d));
  for (const s of samples) {
    const base = [
      s.sampleNumber, s.brand ?? "", s.category ?? "", s.styleNumber ?? "",
      s.styleName ?? "", s.description ?? "",
      num(s.fobCost), num(s.customerSellPrice), num(s.dutyRatePercent),
      num(s.freightPerUnit), num(s.inlandPerUnit),
      s.factory?.name ?? "", s.targetCustomer ?? "", s.status,
    ];
    if (s.skuVariants.length === 0) {
      ws.addRow([...base, "", "", "", ""]);
    } else {
      for (const v of s.skuVariants) {
        ws.addRow([...base, v.size, v.color, v.upc, v.skuCode ?? ""]);
      }
    }
  }
  ws.columns.forEach((c, i) => (c.width = i === 5 ? 28 : 15));

  const buffer = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(Buffer.from(buffer)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="samples-export-${today}.xlsx"`,
    },
  });
}
