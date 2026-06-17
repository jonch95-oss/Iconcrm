"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Download, Send, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  updateLineQuantity,
  deleteOrderFormLine,
  markOrderFormSent,
  requestMissingInfo,
  type OrderFormBlocker,
} from "../actions";

export interface BuilderLine {
  id: string;
  sampleId: string;
  sampleNumber: string;
  styleNumber: string | null;
  styleName: string;
  size: string | null;
  color: string | null;
  upc: string | null;
  quantity: number;
  fob: string;
  cbm: string | null;
  casePack: number | null;
}

export function OrderFormBuilder({
  orderFormId,
  status,
  lines,
  blockers,
  canEdit,
}: {
  orderFormId: string;
  status: string;
  lines: BuilderLine[];
  blockers: OrderFormBlocker[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const isSent = status === "sent";
  const blocked = blockers.length > 0;

  const setQty = (lineId: string, q: number) => {
    startTransition(async () => {
      await updateLineQuantity(lineId, orderFormId, q);
      router.refresh();
    });
  };

  const removeLine = (lineId: string) => {
    startTransition(async () => {
      await deleteOrderFormLine(lineId, orderFormId);
      toast.success("Line removed");
      router.refresh();
    });
  };

  const send = () => {
    startTransition(async () => {
      const res = await markOrderFormSent(orderFormId);
      if (res.ok) {
        toast.success("Order form marked sent");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const requestInfo = () => {
    startTransition(async () => {
      const res = await requestMissingInfo(orderFormId);
      if (res.ok) toast.success("Missing-info email sent to assigned users");
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={`/api/order-forms/${orderFormId}/export?format=xlsx`}>
            <Download className="h-4 w-4" /> Export XLSX
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/order-forms/${orderFormId}/export?format=pdf`}>
            <Download className="h-4 w-4" /> Export PDF
          </a>
        </Button>
        {canEdit && !isSent && (
          <>
            <Button size="sm" onClick={send} disabled={pending || blocked}>
              <Send className="h-4 w-4" /> Mark as sent
            </Button>
            {blocked && (
              <Button size="sm" variant="secondary" onClick={requestInfo} disabled={pending}>
                <Mail className="h-4 w-4" /> Request missing info
              </Button>
            )}
          </>
        )}
      </div>

      {blocked && !isSent && (
        <div className="rounded-md border border-[var(--warning)] bg-[var(--warning)]/10 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium text-[var(--warning)]">
            <AlertTriangle className="h-4 w-4" /> {blockers.length} blocker(s) — cannot send
          </div>
          <ul className="list-inside list-disc">
            {blockers.map((b, i) => (
              <li key={i}>
                <Link href={`/samples/${b.sampleId}`} className="text-[var(--primary)] hover:underline">
                  {b.sampleNumber}
                </Link>{" "}
                — {b.issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sample</TableHead>
              <TableHead>Style #</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>UPC</TableHead>
              <TableHead>FOB</TableHead>
              <TableHead>CBM</TableHead>
              <TableHead>Case pack</TableHead>
              <TableHead>Qty</TableHead>
              {canEdit && !isSent && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <Link href={`/samples/${l.sampleId}`} className="text-[var(--primary)] hover:underline">
                    {l.sampleNumber}
                  </Link>
                  <div className="text-xs text-[var(--muted-foreground)]">{l.styleName}</div>
                </TableCell>
                <TableCell>
                  {l.styleNumber ?? <Badge variant="warning">missing</Badge>}
                </TableCell>
                <TableCell>{l.size ?? "—"}</TableCell>
                <TableCell>{l.color ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {l.upc ?? <Badge variant="warning">missing</Badge>}
                </TableCell>
                <TableCell className="tabular-nums">{l.fob}</TableCell>
                <TableCell className="tabular-nums">{l.cbm ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{l.casePack ?? "—"}</TableCell>
                <TableCell>
                  {canEdit && !isSent ? (
                    <Input
                      type="number"
                      defaultValue={l.quantity}
                      className="h-7 w-24 text-xs"
                      onBlur={(e) => {
                        const v = parseInt(e.target.value || "0", 10);
                        if (v !== l.quantity) setQty(l.id, v);
                      }}
                    />
                  ) : (
                    <span className="tabular-nums">{l.quantity}</span>
                  )}
                </TableCell>
                {canEdit && !isSent && (
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeLine(l.id)} disabled={pending}>
                      <Trash2 className="h-4 w-4 text-[var(--destructive)]" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
