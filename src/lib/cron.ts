import { NextRequest } from "next/server";

/**
 * Verify a cron request. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 * Also accepts `?secret=` for manual triggering in dev.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("secret") === secret) return true;
  return false;
}
