"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SAMPLE_PIPELINE, SAMPLE_STATUS_LABEL, DROPPED_REASON_LABEL } from "@/lib/status";
import { updateSample } from "../actions";
import { toast } from "sonner";

export interface SampleEditData {
  id: string;
  sampleNumber: string;
  brand: string;
  category: string;
  styleName: string;
  styleNumber: string;
  description: string;
  targetCustomer: string;
  fobCost: string;
  currency: string;
  fobPort: string;
  customerSellPrice: string;
  dutyRatePercent: string;
  freightPerUnit: string;
  inlandPerUnit: string;
  factoryId: string;
  status: string;
}

export function SampleActions({
  data,
  factories,
  canEdit,
  isAdmin,
}: {
  data: SampleEditData;
  factories: { id: string; name: string }[];
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [currency, setCurrency] = React.useState(data.currency);
  const [factoryId, setFactoryId] = React.useState(data.factoryId);
  const [status, setStatus] = React.useState(data.status);
  const [droppedReason, setDroppedReason] = React.useState("other");
  const [pending, startTransition] = React.useTransition();

  if (!canEdit) return null;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", data.id);
    fd.set("currency", currency);
    fd.set("factoryId", factoryId);
    if (isAdmin) {
      fd.set("status", status);
      if (status === "dropped") fd.set("droppedReason", droppedReason);
    }
    startTransition(async () => {
      const res = await updateSample(fd);
      if (res.ok) {
        toast.success("Sample updated");
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
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit sample {data.sampleNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Sample #" name="sampleNumber" defaultValue={data.sampleNumber} />
            <F label="Brand" name="brand" defaultValue={data.brand} />
            <F label="Category" name="category" defaultValue={data.category} />
            <F label="Style name" name="styleName" defaultValue={data.styleName} />
            <F label="Style #" name="styleNumber" defaultValue={data.styleNumber} />
            <F label="Target customer" name="targetCustomer" defaultValue={data.targetCustomer} />
            <F label="FOB cost" name="fobCost" defaultValue={data.fobCost} type="number" step="0.01" />
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="RMB">RMB</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <F label="FOB port" name="fobPort" defaultValue={data.fobPort} />
            <F label="Customer sell price" name="customerSellPrice" defaultValue={data.customerSellPrice} type="number" step="0.01" />
            <F label="Duty rate %" name="dutyRatePercent" defaultValue={data.dutyRatePercent} type="number" step="0.001" />
            <F label="Freight / unit" name="freightPerUnit" defaultValue={data.freightPerUnit} type="number" step="0.01" />
            <F label="Inland / unit" name="inlandPerUnit" defaultValue={data.inlandPerUnit} type="number" step="0.01" />
            <div className="col-span-2 space-y-1.5">
              <Label>Factory</Label>
              <Select value={factoryId} onValueChange={setFactoryId}>
                <SelectTrigger><SelectValue placeholder="Select factory" /></SelectTrigger>
                <SelectContent>
                  {factories.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea name="description" defaultValue={data.description} rows={2} />
          </div>

          {isAdmin && (
            <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
              <Label className="text-xs uppercase text-[var(--muted-foreground)]">
                Admin: manual status override (audit-logged)
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...SAMPLE_PIPELINE, "dropped"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {SAMPLE_STATUS_LABEL[s as keyof typeof SAMPLE_STATUS_LABEL]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {status === "dropped" && (
                  <Select value={droppedReason} onValueChange={setDroppedReason}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(DROPPED_REASON_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({
  label,
  name,
  defaultValue,
  type = "text",
  step,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} type={type} step={step} />
    </div>
  );
}
