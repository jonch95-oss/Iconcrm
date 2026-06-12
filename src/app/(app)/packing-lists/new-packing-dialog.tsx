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
import { createPackingList } from "./actions";
import { toast } from "sonner";

export function NewPackingDialog({
  pis,
}: {
  pis: { id: string; label: string; pos: { id: string; poNumber: string }[] }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [piId, setPiId] = React.useState("");
  const [poId, setPoId] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const selectedPi = pis.find((p) => p.id === piId);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("piId", piId);
    if (poId) fd.set("poId", poId);
    startTransition(async () => {
      const res = await createPackingList(fd);
      if (res.ok && res.id) {
        toast.success("Packing list created");
        setOpen(false);
        router.push(`/packing-lists/${res.id}`);
      } else if (!res.ok) toast.error(res.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> New packing list</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New packing list</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>PI *</Label>
            <Select value={piId} onValueChange={(v) => { setPiId(v); setPoId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select PI" /></SelectTrigger>
              <SelectContent>
                {pis.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedPi && selectedPi.pos.length > 0 && (
            <div className="space-y-1.5">
              <Label>PO (optional)</Label>
              <Select value={poId} onValueChange={setPoId}>
                <SelectTrigger><SelectValue placeholder="Link a PO" /></SelectTrigger>
                <SelectContent>
                  {selectedPi.pos.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="shipmentRef">Shipment ref</Label><Input id="shipmentRef" name="shipmentRef" /></div>
            <div className="space-y-1.5"><Label htmlFor="vesselOrAwb">Vessel / AWB</Label><Input id="vesselOrAwb" name="vesselOrAwb" /></div>
            <div className="space-y-1.5"><Label htmlFor="etd">ETD</Label><Input id="etd" name="etd" type="date" /></div>
            <div className="space-y-1.5"><Label htmlFor="eta">ETA</Label><Input id="eta" name="eta" type="date" /></div>
            <div className="space-y-1.5"><Label htmlFor="receivedAt">Received</Label><Input id="receivedAt" name="receivedAt" type="date" /></div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !piId}>{pending ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
