import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sample = await prisma.sample.findUnique({
    where: { id },
    select: {
      sampleNumber: true,
      skuVariants: { orderBy: [{ color: "asc" }, { size: "asc" }], select: { size: true, color: true, upc: true, skuCode: true, unitsPerCarton: true } },
    },
  });
  if (!sample) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("SKUs");
  ws.addRow(["Size", "Color", "UPC", "SKU Code", "Units/Carton"]);
  ws.getRow(1).font = { bold: true };
  for (const v of sample.skuVariants) ws.addRow([v.size, v.color, v.upc ?? "", v.skuCode ?? "", v.unitsPerCarton ?? ""]);
  ws.columns.forEach((c) => (c.width = 16));

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(Buffer.from(buf)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${sample.sampleNumber}-skus.xlsx"`,
    },
  });
}
