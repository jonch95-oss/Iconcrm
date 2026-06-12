import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Uptime/health check: verifies the app is up and the database is reachable. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
