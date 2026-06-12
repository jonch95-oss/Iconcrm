"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  updateShipmentEta,
  updateShipment,
  linkPoToShipment,
  linkPackingListToShipment,
} from "../actions";
import { SHIPMENT_STATUS_LABEL } from "@/lib/status";
import type { ShipmentStatus } from "@prisma/client";

const STATUSES: ShipmentStatus[] = [
  "booked",
  "in_transit",
  "arrived_port",
  "inland",
  "delivered",
  "cancelled",
];

export function ShipmentEditor({
  shipmentId,
  status,
  inlandBufferDays,
  unlinkedPos,
  unlinkedPackingLists,
}: {
  shipmentId: string;
  status: ShipmentStatus;
  inlandBufferDays: number;
  unlinkedPos: { id: string; poNumber: string }[];
  unlinkedPackingLists: { id: string; label: string }[];
}) {
  const [pending, startTransition] = React.useTransition();
  const [eta, setEta] = React.useState("");
  const [buffer, setBuffer] = React.useState(String(inlandBufferDays));
  const [poId, setPoId] = React.useState("");
  const [plId, setPlId] = React.useState("");

  const saveEta = () => {
    if (!eta) return toast.error("Pick a date first.");
    startTransition(async () => {
      const res = await updateShipmentEta(shipmentId, eta);
      if (res.ok) {
        toast.success("ETA updated — window check re-run");
        setEta("");
      } else toast.error(res.error);
    });
  };

  const saveStatusOrBuffer = (next: Partial<{ status: string; buffer: string }>) => {
    const fd = new FormData();
    if (next.status) fd.set("status", next.status);
    if (next.buffer) fd.set("inlandBufferDays", next.buffer);
    startTransition(async () => {
      const res = await updateShipment(shipmentId, fd);
      if (res.ok) toast.success("Saved");
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-3">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="eta">Update the arrival date (ETA)</Label>
          <Input id="eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
        </div>
        <Button onClick={saveEta} disabled={pending}>
          Save ETA
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>Stage</Label>
          <Select defaultValue={status} onValueChange={(v) => saveStatusOrBuffer({ status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SHIPMENT_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="buffer">Port-to-customer days</Label>
          <Input
            id="buffer"
            type="number"
            min={0}
            max={60}
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            onBlur={() => saveStatusOrBuffer({ buffer })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>Link a purchase order</Label>
          <Select
            value={poId}
            onValueChange={(v) => {
              setPoId("");
              startTransition(async () => {
                const res = await linkPoToShipment(shipmentId, v);
                if (res.ok) toast.success("PO linked");
                else toast.error(res.error);
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={unlinkedPos.length ? "Choose a PO…" : "All POs linked"} />
            </SelectTrigger>
            <SelectContent>
              {unlinkedPos.map((po) => (
                <SelectItem key={po.id} value={po.id}>
                  {po.poNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Link a packing list</Label>
          <Select
            value={plId}
            onValueChange={(v) => {
              setPlId("");
              startTransition(async () => {
                const res = await linkPackingListToShipment(shipmentId, v);
                if (res.ok) toast.success("Packing list linked");
                else toast.error(res.error);
              });
            }}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={unlinkedPackingLists.length ? "Choose…" : "None available"}
              />
            </SelectTrigger>
            <SelectContent>
              {unlinkedPackingLists.map((pl) => (
                <SelectItem key={pl.id} value={pl.id}>
                  {pl.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
