import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/** Live duplicate check for the new-sample form. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const n = (req.nextUrl.searchParams.get("sampleNumber") ?? "").trim();
  if (!n) return NextResponse.json({ exists: false });
  const dup = await prisma.sample.findUnique({
    where: { sampleNumber: n },
    select: { styleName: true, brand: true },
  });
  return NextResponse.json({ exists: !!dup, styleName: dup?.styleName ?? null, brand: dup?.brand ?? null });
}
