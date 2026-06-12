"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { createFactory } from "./factory-actions";
import { toast } from "sonner";

export function NewFactoryDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createFactory(fd);
      if (res.ok && res.id) {
        toast.success("Factory added");
        setOpen(false);
        router.push(`/factories/${res.id}`);
      } else if (!res.ok) toast.error(res.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> New factory</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New factory</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Factory name *</Label>
            <Input id="name" name="name" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contactName">Contact name</Label>
              <Input id="contactName" name="contactName" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contactEmail">Contact email</Label>
              <Input id="contactEmail" name="contactEmail" type="email" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input id="country" name="country" placeholder="China, Vietnam…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paymentTermsDefault">Default payment terms</Label>
              <Input id="paymentTermsDefault" name="paymentTermsDefault" placeholder="30% deposit / 70% before ship" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add factory"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
