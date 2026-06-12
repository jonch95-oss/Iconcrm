"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createPI } from "./actions";
import { toast } from "sonner";

export function NewPiDialog({
  factories,
  orderForms,
}: {
  factories: { id: string; name: string }[];
  orderForms: { id: string; orderFormNumber: string; factoryId: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [factoryId, setFactoryId] = React.useState("");
  const [orderFormId, setOrderFormId] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("factoryId", factoryId);
    if (orderFormId) fd.set("orderFormId", orderFormId);
    fd.set("currency", currency);
    startTransition(async () => {
      const res = await createPI(fd);
      if (res.ok && res.id) {
        toast.success("PI created");
        setOpen(false);
        router.push(`/pis/${res.id}`);
      } else if (!res.ok) toast.error(res.error);
    });
  };

  const relevantOFs = orderForms.filter((o) => !factoryId || o.factoryId === factoryId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> New PI</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New proforma invoice</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="piNumber">PI # (factory&apos;s number) *</Label>
            <Input id="piNumber" name="piNumber" required />
          </div>
          <div className="space-y-1.5">
            <Label>Factory *</Label>
            <Select value={factoryId} onValueChange={setFactoryId}>
              <SelectTrigger><SelectValue placeholder="Select factory" /></SelectTrigger>
              <SelectContent>
                {factories.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Order form (optional)</Label>
            <Select value={orderFormId} onValueChange={setOrderFormId}>
              <SelectTrigger><SelectValue placeholder="Link an order form" /></SelectTrigger>
              <SelectContent>
                {relevantOFs.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderFormNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1.5">
              <Label htmlFor="piDate">PI date</Label>
              <Input id="piDate" name="piDate" type="date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paymentTerms">Payment terms</Label>
            <Input id="paymentTerms" name="paymentTerms" placeholder="30% deposit / 70% before shipment" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !factoryId}>
              {pending ? "Creating…" : "Create PI"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
