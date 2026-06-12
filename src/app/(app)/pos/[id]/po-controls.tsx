"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PO_STATUS_LABEL, nextPoStatus } from "@/lib/status";
import type { POStatus } from "@prisma/client";
import { advancePoStatus, changePoEta, updatePoDetails } from "../actions";
import { toast } from "sonner";

export function PoControls({
  poId,
  status,
  factoryEta,
  productionNotes,
  inspectionDate,
  shipDate,
  canEdit,
}: {
  poId: string;
  status: POStatus;
  factoryEta: string;
  productionNotes: string;
  inspectionDate: string;
  shipDate: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [eta, setEta] = React.useState(factoryEta);
  const [etaReason, setEtaReason] = React.useState("");
  const next = nextPoStatus(status);

  if (!canEdit) return null;

  const advance = () => {
    startTransition(async () => {
      const res = await advancePoStatus(poId);
      if (res.ok) {
        toast.success("Production status advanced");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const saveEta = () => {
    if (eta === factoryEta) return;
    startTransition(async () => {
      const res = await changePoEta(poId, eta, etaReason);
      if (res.ok) {
        toast.success("ETA updated (revision logged)");
        setEtaReason("");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const saveDetails = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("poId", poId);
    startTransition(async () => {
      const res = await updatePoDetails(fd);
      if (res.ok) {
        toast.success("Saved");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {next ? (
          <Button onClick={advance} disabled={pending}>
            Advance to {PO_STATUS_LABEL[next]} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <span className="text-sm text-[var(--muted-foreground)]">Delivered — pipeline complete.</span>
        )}
      </div>

      <div className="space-y-2 rounded-md border border-[var(--border)] p-3">
        <Label>Factory ETA (revision logged on change)</Label>
        <div className="flex flex-wrap items-end gap-2">
          <Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className="w-40" />
          <Input placeholder="Reason for change" value={etaReason} onChange={(e) => setEtaReason(e.target.value)} className="w-56" />
          <Button size="sm" variant="secondary" onClick={saveEta} disabled={pending || eta === factoryEta}>
            Update ETA
          </Button>
        </div>
      </div>

      <form onSubmit={saveDetails} className="space-y-3 rounded-md border border-[var(--border)] p-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Inspection date</Label>
            <Input name="inspectionDate" type="date" defaultValue={inspectionDate} />
          </div>
          <div className="space-y-1">
            <Label>Ship date</Label>
            <Input name="shipDate" type="date" defaultValue={shipDate} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Production notes</Label>
          <Textarea name="productionNotes" defaultValue={productionNotes} rows={2} />
        </div>
        <Button type="submit" size="sm" disabled={pending}>Save details</Button>
      </form>
    </div>
  );
}
