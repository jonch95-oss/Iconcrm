"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, ClipboardPaste, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addPackingLine, bulkPastePackingLines, deletePackingLine } from "../actions";
import { toast } from "sonner";

export interface PackingLineView {
  id: string;
  sku: string;
  upc: string;
  cartons: number;
  unitsShipped: number;
}

export interface SkuOption {
  id: string;
  label: string;
}

export function PackingEditor({
  packingListId,
  piId,
  lines,
  skuOptions,
  canEdit,
}: {
  packingListId: string;
  piId: string;
  lines: PackingLineView[];
  skuOptions: SkuOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [skuId, setSkuId] = React.useState("");
  const [cartons, setCartons] = React.useState("");
  const [units, setUnits] = React.useState("");
  const [paste, setPaste] = React.useState("");

  const add = () => {
    if (!skuId) {
      toast.error("Select a SKU");
      return;
    }
    const fd = new FormData();
    fd.set("packingListId", packingListId);
    fd.set("skuVariantId", skuId);
    fd.set("cartons", cartons || "0");
    fd.set("unitsShipped", units || "0");
    startTransition(async () => {
      const res = await addPackingLine(fd);
      if (res.ok) {
        setSkuId(""); setCartons(""); setUnits("");
        toast.success("Line added");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const doPaste = () => {
    startTransition(async () => {
      const res = await bulkPastePackingLines(packingListId, paste);
      if (res.ok) {
        toast.success(`Imported ${res.id} line(s)`);
        setPaste("");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const remove = (lineId: string) => {
    startTransition(async () => {
      await deletePackingLine(lineId, packingListId, piId);
      toast.success("Line removed");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>UPC</TableHead>
              <TableHead>Cartons</TableHead>
              <TableHead>Units shipped</TableHead>
              {canEdit && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 5 : 4} className="text-center text-[var(--muted-foreground)]">
                  No lines on this packing list.
                </TableCell>
              </TableRow>
            ) : (
              lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.sku}</TableCell>
                  <TableCell className="font-mono text-xs">{l.upc}</TableCell>
                  <TableCell className="tabular-nums">{l.cartons}</TableCell>
                  <TableCell className="tabular-nums">{l.unitsShipped}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => remove(l.id)} disabled={pending}>
                        <Trash2 className="h-4 w-4 text-[var(--destructive)]" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {canEdit && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs">SKU</label>
              <Select value={skuId} onValueChange={setSkuId}>
                <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Select SKU" /></SelectTrigger>
                <SelectContent>
                  {skuOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs">Cartons</label>
              <Input value={cartons} onChange={(e) => setCartons(e.target.value)} type="number" className="h-8 w-24 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs">Units shipped</label>
              <Input value={units} onChange={(e) => setUnits(e.target.value)} type="number" className="h-8 w-28 text-xs" />
            </div>
            <Button size="sm" onClick={add} disabled={pending}><Plus className="h-4 w-4" /> Add</Button>
          </div>

          <div>
            <Label className="mb-2 block text-xs uppercase text-[var(--muted-foreground)]">
              Paste from Excel (UPC, cartons, units — one row per line)
            </Label>
            <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder={"012345678905\t10\t240"} className="font-mono text-xs" />
            <Button size="sm" variant="secondary" className="mt-2" onClick={doPaste} disabled={pending || !paste.trim()}>
              <ClipboardPaste className="h-4 w-4" /> Import rows
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
