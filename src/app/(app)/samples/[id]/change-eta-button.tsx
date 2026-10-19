"use client";

import * as React from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChangeEtaDialog } from "@/components/change-eta-dialog";

/** "Change ETA" on the sample page — the one way the date moves by hand. */
export function ChangeEtaButton({
  sampleId,
  sampleNumber,
  currentEta,
  canApprove,
}: {
  sampleId: string;
  sampleNumber: string;
  currentEta: string;
  canApprove: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="h-7" onClick={() => setOpen(true)}>
        <CalendarClock className="h-3.5 w-3.5" />
        {currentEta && !canApprove ? "Ask to change" : "Change"}
      </Button>
      <ChangeEtaDialog
        sampleId={sampleId}
        sampleNumber={sampleNumber}
        currentEta={currentEta}
        canApprove={canApprove}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
