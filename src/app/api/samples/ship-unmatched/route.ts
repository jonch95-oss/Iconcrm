import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser, hasRole } from "@/lib/session";
import type { ShipSkip } from "@/lib/ship-status";

export const dynamic = "force-dynamic";

/**
 * The rows the status sheet carried that we couldn't place, as a spreadsheet.
 *
 * On a first read that's hundreds of lines — far too many to work through in a
 * dialog. They're the useful half of the job, though: each one is either a
 * style the CRM hasn't got, a colour spelled differently in the two systems,
 * or a number the factory writes its own way. So they come out in the format
 * everyone here works in, with the reason against each.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, "member")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rows: ShipSkip[] = [];
  try {
    const body = (await request.json()) as { rows?: ShipSkip[] };
    rows = Array.isArray(body.rows) ? body.rows.slice(0, 20000) : [];
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "ICON LUXURY GROUP";
  const ws = wb.addWorksheet("Not matched");
  ws.addRow(["Style #", "Colour", "Why it didn't match", "Detail"]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) ws.addRow([r.style, r.color, r.reason, r.detail]);
  ws.columns.forEach((c, i) => (c.width = i === 3 ? 48 : i === 2 ? 44 : 22));

  const buffer = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(Buffer.from(buffer)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ship-sheet-not-matched-${today}.xlsx"`,
    },
  });
}
