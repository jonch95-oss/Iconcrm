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
import { createShipment } from "./actions";
import { toast } from "sonner";

export function NewShipmentDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createShipment(fd);
      if (res.ok && res.id) {
        toast.success("Shipment created");
        setOpen(false);
        router.push(`/shipments/${res.id}`);
      } else if (!res.ok) toast.error(res.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> New shipment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New shipment</DialogTitle></DialogHeader>
        <p className="text-sm text-[var(--muted-foreground)]">
          Enter at least one of the three tracking numbers — whichever appears on your booking
          confirmation or bill of lading.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="containerNumber">Container number</Label>
            <Input id="containerNumber" name="containerNumber" placeholder="e.g. MSCU1234567" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mblNumber">Master BOL number</Label>
              <Input id="mblNumber" name="mblNumber" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bookingNumber">Booking number</Label>
              <Input id="bookingNumber" name="bookingNumber" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="carrierScac">Carrier (SCAC)</Label>
              <Input id="carrierScac" name="carrierScac" placeholder="MAEU" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pol">From port</Label>
              <Input id="pol" name="pol" placeholder="CNSHA" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pod">To port</Label>
              <Input id="pod" name="pod" placeholder="USNYC" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="originalEta">Planned arrival (ETA)</Label>
            <Input id="originalEta" name="originalEta" type="date" />
            <p className="text-xs text-[var(--muted-foreground)]">
              This is saved as the original ETA — later changes are tracked against it.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create shipment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
