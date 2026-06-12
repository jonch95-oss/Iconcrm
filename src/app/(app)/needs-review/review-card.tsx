"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createSampleFromEmail, mergeEmailToSample, ignoreEmail } from "./actions";
import { toast } from "sonner";

export interface ReviewEmail {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
  notes: string | null;
}

export function ReviewCard({
  email,
  samples,
}: {
  email: ReviewEmail;
  samples: { id: string; sampleNumber: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<"none" | "create" | "merge">("none");
  const [mergeId, setMergeId] = React.useState("");

  const create = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("emailId", email.id);
    startTransition(async () => {
      const res = await createSampleFromEmail(fd);
      if (res.ok && res.id) {
        toast.success("Sample created");
        router.push(`/samples/${res.id}`);
      } else if (!res.ok) toast.error(res.error);
    });
  };

  const merge = () => {
    if (!mergeId) return;
    startTransition(async () => {
      const res = await mergeEmailToSample(email.id, mergeId);
      if (res.ok) {
        toast.success("Merged");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const ignore = () => {
    startTransition(async () => {
      await ignoreEmail(email.id);
      toast.success("Ignored");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">{email.subject || "(no subject)"}</div>
            <div className="text-xs text-[var(--muted-foreground)]">
              From {email.from} · {email.receivedAt}
            </div>
          </div>
          {email.notes && <Badge variant="warning">{email.notes}</Badge>}
        </div>
        <p className="line-clamp-3 whitespace-pre-wrap text-sm text-[var(--muted-foreground)]">{email.body}</p>

        {mode === "none" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setMode("create")}>Create sample</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("merge")}>Merge into sample</Button>
            <Button size="sm" variant="ghost" onClick={ignore} disabled={pending}>Ignore</Button>
          </div>
        )}

        {mode === "create" && (
          <form onSubmit={create} className="space-y-2 rounded-md border border-[var(--border)] p-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Sample #</Label>
                <Input name="sampleNumber" required className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Brand</Label>
                <Input name="brand" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Input name="category" className="h-8 text-xs" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={pending}>Create</Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
            </div>
          </form>
        )}

        {mode === "merge" && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--border)] p-3">
            <div className="space-y-1">
              <Label className="text-xs">Existing sample</Label>
              <select value={mergeId} onChange={(e) => setMergeId(e.target.value)} className="h-8 w-56 rounded-md border border-[var(--input)] bg-[var(--background)] px-2 text-xs">
                <option value="">Select sample…</option>
                {samples.map((s) => <option key={s.id} value={s.id}>{s.sampleNumber}</option>)}
              </select>
            </div>
            <Button size="sm" onClick={merge} disabled={pending || !mergeId}>Merge</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
