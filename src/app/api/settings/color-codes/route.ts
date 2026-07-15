import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const codes = await prisma.colorCode.findMany({ orderBy: { color: "asc" } });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Color Codes");
  ws.addRow(["Color", "Code"]);
  ws.getRow(1).font = { bold: true };
  for (const c of codes) ws.addRow([c.color, c.code]);
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 12;
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(Buffer.from(buf)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="color-codes.xlsx"`,
    },
  });
}
