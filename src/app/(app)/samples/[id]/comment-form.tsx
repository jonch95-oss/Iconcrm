"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addComment } from "../actions";
import { toast } from "sonner";

export function CommentForm({ sampleId }: { sampleId: string }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    if (!body.trim()) return;
    const fd = new FormData();
    fd.set("sampleId", sampleId);
    fd.set("body", body);
    startTransition(async () => {
      const res = await addComment(fd);
      if (res.ok) {
        setBody("");
        toast.success("Comment added");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment…"
        rows={2}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
