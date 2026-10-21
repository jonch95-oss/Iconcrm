"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setRequestedDate } from "@/app/(app)/samples/eta-actions";

/** The implied ETA for a yyyy-mm-dd, for the line under the field. */
function impliedEta(requested: string, weeks: number): string {
  if (!requested) return "";
  const d = new Date(`${requested}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * "Change" next to the requested date, for the owner and Moshe. Moving that
 * date re-dates the sample, so the dialog says what the new ETA will be before
 * they save rather than after.
 */
export function ChangeRequestedDateButton({
  sampleId,
  sampleNumber,
  requestedAt,
  colorsWithEta,
  etaWeeks,
}: {
  sampleId: string;
  sampleNumber: string;
  /** yyyy-mm-dd. */
  requestedAt: string;
  /** How many colors carry their own date and so move with it. */
  colorsWithEta: number;
  /** How far past the requested date the ETA lands (REQUESTED_ETA_WEEKS). */
  etaWeeks: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(requestedAt);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    if (open) setDate(requestedAt);
  }, [open, requestedAt]);

  const eta = impliedEta(date, etaWeeks);

  const submit = () => {
    start(async () => {
      const fd = new FormData();
      fd.set("sampleId", sampleId);
      fd.set("requestedAt", date);
      const res = await setRequestedDate(fd);
      if (!res.ok) {
        toast.error(res.error ?? "That didn't work.");
        return;
      }
      toast.success(`Requested ${date} — ETA now ${eta}.`);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        aria-label="Change the requested date"
        onClick={() => setOpen(true)}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        Change
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change the requested date — {sampleNumber}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--muted-foreground)]">
            The ETA is re-dated to {etaWeeks} weeks from whatever you set here, on the sample
            {colorsWithEta > 0
              ? ` and on ${colorsWithEta === 1 ? "the color that has" : `the ${colorsWithEta} colors that have`} its own date`
              : ""}
            . Goes live as you save it, recorded against your name.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="requested-date">Requested on</Label>
            <Input id="requested-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="text-xs text-[var(--muted-foreground)]">
              Now: {requestedAt || "no date"}. {eta ? `New ETA: ${eta}.` : "Pick a date to see the new ETA."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !eta || date === requestedAt}>
              <CalendarDays className="h-4 w-4" />
              {pending ? "Saving…" : "Save and re-date"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
