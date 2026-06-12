import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getLineSheetData, buildLineSheetPdf } from "@/lib/exports/line-sheet";

/** GET /api/line-sheet?ids=a,b,c — customer-facing PDF for selected samples. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Select at least one sample." }, { status: 400 });
  }
  const data = await getLineSheetData(ids.slice(0, 200));
  const pdf = await buildLineSheetPdf(data);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="line-sheet-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
