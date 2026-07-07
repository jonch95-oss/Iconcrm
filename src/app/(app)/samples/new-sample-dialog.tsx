"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SAMPLE_CATEGORIES, SAMPLE_BRANDS } from "@/lib/catalog";
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
import { createSample } from "./actions";
import { toast } from "sonner";

export function NewSampleDialog({
  factories,
}: {
  factories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [currency, setCurrency] = React.useState("USD");
  const [factoryId, setFactoryId] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [dupWarning, setDupWarning] = React.useState<string | null>(null);

  const checkDuplicate = React.useCallback(async (value: string) => {
    const v = value.trim();
    if (!v) { setDupWarning(null); return; }
    try {
      const res = await fetch(`/api/samples/check-duplicate?sampleNumber=${encodeURIComponent(v)}`);
      const data = await res.json();
      setDupWarning(
        data.exists
          ? `Heads up: sample # "${v}" already exists${data.styleName ? ` (${data.styleName})` : ""}. Saving will be blocked — edit the existing one instead.`
          : null,
      );
    } catch { setDupWarning(null); }
  }, []);
  const [pending, startTransition] = React.useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("currency", currency);
    if (factoryId) fd.set("factoryId", factoryId);
    if (brand) fd.set("brand", brand);
    if (category) fd.set("category", category);
    startTransition(async () => {
      const res = await createSample(fd);
      if (res.ok && res.id) {
        toast.success("Sample created");
        setOpen(false);
        router.push(`/samples/${res.id}`);
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New sample
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New sample request</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sample # *</Label>
              <Input name="sampleNumber" required onBlur={(e) => checkDuplicate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>
                  {SAMPLE_BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Color" name="color" />
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {SAMPLE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Season" name="season" />
            <Field label="Style name" name="styleName" />
            <Field label="Style #" name="styleNumber" />
            <Field label="Target customer" name="targetCustomer" />
            <Field label="FOB cost" name="fobCost" type="number" step="0.01" />
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
            <Field label="FOB port" name="fobPort" />
            <Field label="Customer sell price" name="customerSellPrice" type="number" step="0.01" />
            <Field label="Sample ETA" name="sampleEta" type="date" />
            <Field label="Received date" name="sampleReceivedDate" type="date" />
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
            <Textarea name="description" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create sample"}
            </Button>
          </DialogFooter>
          {dupWarning && (
            <p className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-2 text-xs text-[var(--warning)]">
              {dupWarning}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} step={step} />
    </div>
  );
}
