"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { addProductionSample, reviewProductionSample } from "../actions";

export interface ProductionRow {
  id: string;
  stage: "pp" | "top";
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  dueDate: string | null; // pre-formatted
  reviewedBy: string | null;
  reviewedAt: string | null; // pre-formatted
}

const STAGE_LABEL = { pp: "Pre-production (PP)", top: "Top of production (TOP)" } as const;
const STATUS_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
} as const;
const STATUS_LABEL = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Rejected",
} as const;

export function ProductionSamples({
  poId,
  rows,
  canEdit,
}: {
  poId: string;
  rows: ProductionRow[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [stage, setStage] = React.useState<"pp" | "top">("pp");

  const add = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("poId", poId);
    fd.set("stage", stage);
    startTransition(async () => {
      const res = await addProductionSample(fd);
      if (res.ok) toast.success("Production sample added");
      else toast.error(res.error);
    });
  };

  const review = (id: string, decision: "approved" | "rejected") => {
    startTransition(async () => {
      const res = await reviewProductionSample(id, decision);
      if (res.ok) toast.success(decision === "approved" ? "Approved" : "Rejected");
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No production samples yet. Add the PP sample when the factory sends it, and the TOP
          sample once production starts — approvals are recorded with who and when.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{STAGE_LABEL[r.stage]}</span>
                  <Badge variant={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {r.dueDate && <>Due {r.dueDate} · </>}
                  {r.reviewedBy && r.reviewedAt
                    ? `Reviewed by ${r.reviewedBy} on ${r.reviewedAt}`
                    : "Not reviewed yet"}
                </div>
                {r.notes && <div className="mt-1 text-sm">{r.notes}</div>}
              </div>
              {canEdit && r.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending} onClick={() => review(r.id, "approved")}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => review(r.id, "rejected")}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <form onSubmit={add} className="grid gap-2 border-t border-[var(--border)] pt-3 sm:grid-cols-[160px_1fr_auto]">
          <div className="space-y-1">
            <Label className="text-xs">Stage</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as "pp" | "top")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pp">PP sample</SelectItem>
                <SelectItem value="top">TOP sample</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dueDate" className="text-xs">Expected by</Label>
            <Input id="dueDate" name="dueDate" type="date" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>Add</Button>
          </div>
          <div className="sm:col-span-3 space-y-1">
            <Label htmlFor="notes" className="text-xs">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="e.g. Check stitching on collar against approved sample" />
          </div>
        </form>
      )}
    </div>
  );
}
