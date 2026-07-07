"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { requestRevisions } from "../actions";

export function RequestRevisionsButton({ sampleId }: { sampleId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const [pending, start] = React.useTransition();

  const submit = () => {
    if (!comment.trim()) {
      toast.error("Add a note on what needs revising.");
      return;
    }
    start(async () => {
      const res = await requestRevisions(sampleId, comment.trim());
      if (res.ok) {
        toast.success("Revisions requested — ETA reset to 6 weeks");
        setComment("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RotateCcw className="h-4 w-4" /> Request revisions
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request revisions</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--muted-foreground)]">
          Describe what needs revising. The sample moves to “Revisions Requested”, its ETA resets to
          6 weeks from today, and your note is saved to Comments.
        </p>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="e.g. Strap too long; switch hardware to gold; fix stitching on the flap."
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            Request revisions
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
