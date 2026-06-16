"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";

/**
 * Pulls any sample-request emails that arrived at samples@mg.icon-crm.com
 * (stored on Mailgun for 3 days) and imports them. Dedup is automatic:
 * already-imported emails and existing style numbers are skipped/updated,
 * never duplicated.
 */
export function FetchEmailedSheetsButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/inbound/mailgun-fetch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Failed to fetch");
      } else if (data.imported > 0) {
        setMsg(`Imported ${data.imported} new email${data.imported === 1 ? "" : "s"} (${data.skipped} already done).`);
        // refresh the table to show new styles
        setTimeout(() => window.location.reload(), 900);
      } else if (data.checked > 0) {
        setMsg(`No new emails — ${data.skipped} already imported.`);
      } else {
        setMsg("No emailed sheets found in the last 3 days.");
      }
      if (data.errors?.length) {
        setMsg((m) => `${m ?? ""} (${data.errors.length} error${data.errors.length === 1 ? "" : "s"})`);
      }
    } catch {
      setMsg("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {busy ? "Checking…" : "Fetch emailed sheets"}
      </Button>
      {msg && <span className="text-xs text-muted-foreground max-w-[16rem]">{msg}</span>}
    </div>
  );
}
