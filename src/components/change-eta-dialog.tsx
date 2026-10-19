"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { submitEtaChangeRequest } from "@/app/(app)/samples/eta-actions";

/**
 * Moving a date that's already set. Whoever is asking has to say why: the
 * owner and Moshe decide these from a list, and "3 Dec" on its own tells them
 * nothing about whether to say yes.
 *
 * An approver gets the same box, and their change goes live as they save it.
 */
export function ChangeEtaDialog({
  sampleId,
  skuVariantId,
  sampleNumber,
  color,
  currentEta,
  canApprove,
  open,
  onOpenChange,
}: {
  sampleId: string;
  skuVariantId?: string | null;
  sampleNumber: string;
  color?: string | null;
  /** yyyy-mm-dd, or "" when there's no date yet. */
  currentEta: string;
  canApprove: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [eta, setEta] = React.useState(currentEta);
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setEta(currentEta);
      setReason("");
    }
  }, [open, currentEta]);

  const submit = () => {
    if (!reason.trim()) {
      toast.error("Say why the date is moving.");
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("sampleId", sampleId);
      if (skuVariantId) fd.set("skuVariantId", skuVariantId);
      fd.set("eta", eta);
      fd.set("reason", reason);
      const res = await submitEtaChangeRequest(fd);
      if (!res.ok) {
        toast.error(res.error ?? "That didn't work.");
        return;
      }
      toast.success(
        res.pending ? "Sent to the owner and Moshe — the date moves once one of them approves." : "ETA updated.",
      );
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {canApprove ? "Change the ETA" : "Ask to change the ETA"} — {sampleNumber}
            {color ? ` · ${color}` : ""}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--muted-foreground)]">
          {canApprove
            ? "Goes live as you save it, recorded against your name."
            : "The sample keeps its current date until the owner or Moshe approves the change."}
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="eta-change-date">New ETA</Label>
            <Input id="eta-change-date" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            <p className="text-xs text-[var(--muted-foreground)]">
              Now: {currentEta || "no date"}. Clear the field to ask for the date to come off.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eta-change-reason">Why is it moving?</Label>
            <Textarea
              id="eta-change-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Factory says the leather is two weeks late…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !reason.trim()}>
            <CalendarClock className="h-4 w-4" />
            {pending ? "Saving…" : canApprove ? "Save ETA" : "Send for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
