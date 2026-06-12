import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getOrderFormExportData, buildOrderFormWorkbook } from "@/lib/exports/order-form";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "xlsx";
  const data = await getOrderFormExportData(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (format === "pdf") {
    const { buildOrderFormPdf } = await import("@/lib/exports/order-form-pdf");
    const pdf = await buildOrderFormPdf(data);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${data.orderFormNumber}.pdf"`,
      },
    });
  }

  const xlsx = await buildOrderFormWorkbook(data);
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${data.orderFormNumber}.xlsx"`,
    },
  });
}
