"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addSkuVariant, deleteSkuVariant } from "../actions";
import { toast } from "sonner";

export interface SkuRow {
  id: string;
  size: string;
  color: string;
  upc: string;
  skuCode: string | null;
  unitsPerCarton: number | null;
}

export function SkuManager({
  sampleId,
  skus,
  canEdit,
}: {
  sampleId: string;
  skus: SkuRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [form, setForm] = React.useState({ size: "", color: "", upc: "", skuCode: "", unitsPerCarton: "" });

  const add = () => {
    if (!form.size || !form.color || !form.upc) {
      toast.error("Size, color, and UPC are required");
      return;
    }
    const fd = new FormData();
    fd.set("sampleId", sampleId);
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      const res = await addSkuVariant(fd);
      if (res.ok) {
        setForm({ size: "", color: "", upc: "", skuCode: "", unitsPerCarton: "" });
        toast.success("SKU added");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      await deleteSkuVariant(id, sampleId);
      toast.success("SKU removed");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Size</TableHead>
            <TableHead>Color</TableHead>
            <TableHead>UPC</TableHead>
            <TableHead>SKU code</TableHead>
            <TableHead>Units/carton</TableHead>
            {canEdit && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {skus.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 6 : 5} className="text-center text-[var(--muted-foreground)]">
                No SKU variants yet. Add size/color/UPC rows below.
              </TableCell>
            </TableRow>
          ) : (
            skus.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.size}</TableCell>
                <TableCell>{s.color}</TableCell>
                <TableCell className="font-mono text-xs">{s.upc}</TableCell>
                <TableCell className="text-xs">{s.skuCode ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{s.unitsPerCarton ?? "—"}</TableCell>
                {canEdit && (
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => remove(s.id)} disabled={pending}>
                      <Trash2 className="h-4 w-4 text-[var(--destructive)]" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <SmallField label="Size" value={form.size} onChange={(v) => setForm((f) => ({ ...f, size: v }))} />
          <SmallField label="Color" value={form.color} onChange={(v) => setForm((f) => ({ ...f, color: v }))} />
          <SmallField label="UPC" value={form.upc} onChange={(v) => setForm((f) => ({ ...f, upc: v }))} />
          <SmallField label="SKU code" value={form.skuCode} onChange={(v) => setForm((f) => ({ ...f, skuCode: v }))} />
          <SmallField label="Units/carton" value={form.unitsPerCarton} onChange={(v) => setForm((f) => ({ ...f, unitsPerCarton: v }))} type="number" />
          <Button size="sm" onClick={add} disabled={pending}>
            <Plus className="h-4 w-4" /> Add SKU
          </Button>
        </div>
      )}
    </div>
  );
}

function SmallField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-[var(--muted-foreground)]">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} type={type} className="h-8 w-28 text-xs" />
    </div>
  );
}
