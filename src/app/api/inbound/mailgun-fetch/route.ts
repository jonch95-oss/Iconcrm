import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchAndImportStoredMessages } from "@/lib/mailgun-fetch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manual "Import emailed sample sheets now" action.
 * Pulls any not-yet-seen stored messages from Mailgun and imports them.
 * Auth: requires a logged-in CRM user (session).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await fetchAndImportStoredMessages();
  return NextResponse.json(result);
}
