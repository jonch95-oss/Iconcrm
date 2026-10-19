"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveEtaChange, rejectEtaChange, undoEtaDecision, withdrawEtaChange } from "@/app/(app)/samples/eta-actions";

/**
 * Yes or no on one date, with the way back. Approving moves a date the factory
 * is working to, so a mis-click has to be one click to undo — which puts the
 * old date back on the sample, not just the row back in the queue.
 */
export function DecisionButtons({ requestId, canApprove }: { requestId: string; canApprove: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done: string,
    undo?: () => Promise<{ ok: boolean; error?: string }>,
  ) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "That didn't work.");
        return;
      }
      toast.success(done, {
        action: undo
          ? {
              label: "Undo",
              onClick: () =>
                start(async () => {
                  const back = await undo();
                  if (back.ok) {
                    toast.success("Put back.");
                    router.refresh();
                  } else {
                    toast.error(back.error ?? "Couldn't undo that.");
                  }
                }),
            }
          : undefined,
      });
      router.refresh();
    });

  if (!canApprove) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => withdrawEtaChange(requestId), "Request withdrawn.")}
      >
        Withdraw
      </Button>
    );
  }

  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          run(() => approveEtaChange(requestId), "Approved — the new date is live.", () => undoEtaDecision(requestId))
        }
      >
        <Check className="h-4 w-4" /> Approve
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          run(() => rejectEtaChange(requestId), "Rejected — the date stays as it was.", () => undoEtaDecision(requestId))
        }
      >
        <X className="h-4 w-4" /> Reject
      </Button>
    </div>
  );
}

/** Put a decision back from the history list. */
export function UndoDecision({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await undoEtaDecision(requestId);
          if (res.ok) {
            toast.success("Back in the queue.");
            router.refresh();
          } else {
            toast.error(res.error ?? "Couldn't undo that.");
          }
        })
      }
    >
      <Undo2 className="h-4 w-4" /> Undo
    </Button>
  );
}
