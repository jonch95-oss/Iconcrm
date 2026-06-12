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
import { createCustomerPO } from "./actions";
import { toast } from "sonner";

export function NewCpoDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("currency", "USD");
    startTransition(async () => {
      const res = await createCustomerPO(fd);
      if (res.ok && res.id) {
        toast.success("Customer PO created");
        setOpen(false);
        router.push(`/customer-pos/${res.id}`);
      } else if (!res.ok) toast.error(res.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> New customer PO</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New customer PO</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="customerPoNumber">Customer PO # *</Label>
            <Input id="customerPoNumber" name="customerPoNumber" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customerName">Customer name *</Label>
            <Input id="customerName" name="customerName" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="receivedDate">Received date</Label>
              <Input id="receivedDate" name="receivedDate" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="totalValue">Total value</Label>
              <Input id="totalValue" name="totalValue" type="number" step="0.01" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
