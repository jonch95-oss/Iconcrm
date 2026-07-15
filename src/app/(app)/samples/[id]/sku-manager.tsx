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
import { addSkuVariant, deleteSkuVariant, editSkuVariant } from "../actions";
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
                <TableCell><EditableSkuCell id={s.id} sampleId={sampleId} field="size" value={s.size} canEdit={canEdit} /></TableCell>
                <TableCell><EditableSkuCell id={s.id} sampleId={sampleId} field="color" value={s.color} canEdit={canEdit} /></TableCell>
                <TableCell className="font-mono text-xs"><EditableSkuCell id={s.id} sampleId={sampleId} field="upc" value={s.upc} canEdit={canEdit} mono /></TableCell>
                <TableCell className="text-xs"><EditableSkuCell id={s.id} sampleId={sampleId} field="skuCode" value={s.skuCode ?? ""} canEdit={canEdit} /></TableCell>
                <TableCell className="tabular-nums"><EditableSkuCell id={s.id} sampleId={sampleId} field="unitsPerCarton" value={s.unitsPerCarton != null ? String(s.unitsPerCarton) : ""} canEdit={canEdit} numeric /></TableCell>
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

function EditableSkuCell({
  id,
  sampleId,
  field,
  value,
  canEdit,
  mono,
  numeric,
}: {
  id: string;
  sampleId: string;
  field: "size" | "color" | "upc" | "skuCode" | "unitsPerCarton";
  value: string;
  canEdit: boolean;
  mono?: boolean;
  numeric?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  if (!canEdit) {
    return <span className={mono ? "font-mono text-xs" : ""}>{value || "—"}</span>;
  }

  const save = (raw: string) => {
    setEditing(false);
    if (raw.trim() === value.trim()) return;
    startTransition(async () => {
      const res = await editSkuVariant(id, sampleId, field, raw);
      if (res.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  if (editing) {
    return (
      <Input
        autoFocus
        defaultValue={value}
        type={numeric ? "number" : "text"}
        disabled={pending}
        className="h-7 w-24 text-xs"
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`text-left ${mono ? "font-mono text-xs" : ""}`}
      onClick={() => setEditing(true)}
      disabled={pending}
    >
      {value || <span className="text-[var(--muted-foreground)]">—</span>}
    </button>
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
