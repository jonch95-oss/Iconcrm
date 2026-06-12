"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateCustomerPoWindow } from "../actions";

export function WindowEditor({
  customerPoId,
  startShipDate,
  cancelDate,
  deliveryLocation,
}: {
  customerPoId: string;
  startShipDate: string;
  cancelDate: string;
  deliveryLocation: string;
}) {
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateCustomerPoWindow(customerPoId, fd);
      if (res.ok) toast.success("Window saved — shipment checks re-run");
      else toast.error(res.error);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-[var(--border)] pt-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="startShipDate" className="text-xs">Window start</Label>
          <Input id="startShipDate" name="startShipDate" type="date" defaultValue={startShipDate} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cancelDate" className="text-xs">Cancel date</Label>
          <Input id="cancelDate" name="cancelDate" type="date" defaultValue={cancelDate} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="deliveryLocation" className="text-xs">Deliver to (customer DC)</Label>
        <Input id="deliveryLocation" name="deliveryLocation" defaultValue={deliveryLocation} />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save window"}
      </Button>
    </form>
  );
}
