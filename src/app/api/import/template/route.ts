import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buildSamplesTemplate } from "@/lib/import-excel";

/** Downloadable Excel template for bulk sample import. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const buffer = await buildSamplesTemplate();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="sample-import-template.xlsx"',
    },
  });
}
