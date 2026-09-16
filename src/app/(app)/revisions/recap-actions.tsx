"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Download, Mail, Copy } from "lucide-react";
import { toast } from "sonner";
import { emailRecapToFactory } from "./actions";

/**
 * Per-factory recap actions: pull it as Excel (with photos), copy it as plain
 * text to paste into your own email, or send it to the factory contact.
 */
export function RecapActions({
  factoryId,
  factoryName,
  contactEmail,
  contactName,
  query,
  text,
  subject,
}: {
  factoryId: string | null;
  factoryName: string;
  contactEmail: string | null;
  contactName: string | null;
  /** The dashboard's current filters, so exports match what's on screen. */
  query: string;
  text: string;
  subject: string;
}) {
  const [pending, start] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  const params = new URLSearchParams(query);
  if (factoryId) params.set("factory", factoryId);
  const href = `/api/revisions/export${params.toString() ? `?${params}` : ""}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <a href={href}><Download className="h-4 w-4" /> Excel</a>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            toast.success("Recap copied — paste it into an email");
          } catch {
            toast.error("Couldn't copy — use the Excel export instead");
          }
        }}
      >
        <Copy className="h-4 w-4" /> Copy text
      </Button>

      {factoryId && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={!contactEmail}
              title={contactEmail ? `Send to ${contactEmail}` : `No contact email on ${factoryName} — add one under Factories`}
            >
              <Mail className="h-4 w-4" /> {contactEmail ? "Email factory" : "No contact email"}
            </Button>
          </DialogTrigger>
          {/* This leaves the building, so show exactly what goes out first —
              internal notes included, which is the thing worth catching. */}
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Send recap to {factoryName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-[var(--muted-foreground)]">To:</span>{" "}
                {contactName ? `${contactName} · ` : ""}
                {contactEmail}
              </p>
              <p>
                <span className="text-[var(--muted-foreground)]">Subject:</span> {subject}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Every note below goes to the factory — including internal comments. The email
                itself is sent with each style&apos;s photo; this is the text of it.
              </p>
              <Textarea readOnly value={text} className="h-64 font-mono text-xs" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await emailRecapToFactory(factoryId, query);
                    if (res.ok) {
                      toast.success(`Recap sent to ${res.to}`);
                      setOpen(false);
                    } else toast.error(res.error);
                  })
                }
              >
                <Mail className="h-4 w-4" /> {pending ? "Sending…" : "Send recap"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
