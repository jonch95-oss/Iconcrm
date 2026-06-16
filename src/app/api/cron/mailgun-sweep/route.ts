import { NextResponse } from "next/server";
import { fetchAndImportStoredMessages } from "@/lib/mailgun-fetch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily sweep: pull any stored Mailgun messages not yet imported.
 * Dedup is handled inside fetchAndImportStoredMessages (message-level via
 * InboundEmail.mailgunMessageKey; style-level via the spreadsheet upsert).
 * Safe to run repeatedly — already-seen messages are skipped.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await fetchAndImportStoredMessages();
  return NextResponse.json(result);
}
