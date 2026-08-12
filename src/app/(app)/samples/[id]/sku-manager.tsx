"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wand2, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addSkuVariant, deleteSkuVariant, editSkuVariant, toggleSkuReceived, fillSkuCodesForSample, uploadSkuVariantImage } from "../actions";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";

export interface SkuRow {
  id: string;
  size: string;
  color: string;
  upc: string;
  skuCode: string | null;
  unitsPerCarton: number | null;
  received: boolean;
  imageUrl: string | null;
  sampleEta: string; // yyyy-mm-dd or ""
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
    if (!form.size || !form.color) {
      toast.error("Size and color are required");
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

  const toggleReceived = (id: string, received: boolean) => {
    startTransition(async () => {
      const r = await toggleSkuReceived(id, sampleId, received);
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  };

  const fillCodes = () => {
    startTransition(async () => {
      const r = await fillSkuCodesForSample(sampleId);
      if (!r.ok) { toast.error(r.error); return; }
      if ((r.filled ?? 0) > 0) toast.success(`Filled ${r.filled} SKU code${r.filled === 1 ? "" : "s"}`);
      else toast.info("All SKU codes are already set");
      if (r.created && r.created.length > 0) {
        toast.message(`Auto-generated color codes: ${r.created.map((c) => `${c.color}→${c.code}`).join(", ")}`, {
          description: "Review or rename them under Settings › Color Codes.",
        });
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">Image</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Color</TableHead>
            <TableHead>UPC</TableHead>
            <TableHead>SKU code</TableHead>
            <TableHead>Units/carton</TableHead>
            <TableHead>Sample ETA</TableHead>
            <TableHead>Received</TableHead>
            {canEdit && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {skus.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 9 : 8} className="text-center text-[var(--muted-foreground)]">
                No SKU variants yet. Add size/color/UPC rows below.
              </TableCell>
            </TableRow>
          ) : (
            skus.map((s) => (
              <TableRow key={s.id}>
                <TableCell><VariantImageCell id={s.id} sampleId={sampleId} imageUrl={s.imageUrl} color={s.color} canEdit={canEdit} /></TableCell>
                <TableCell><EditableSkuCell id={s.id} sampleId={sampleId} field="size" value={s.size} canEdit={canEdit} /></TableCell>
                <TableCell><EditableSkuCell id={s.id} sampleId={sampleId} field="color" value={s.color} canEdit={canEdit} /></TableCell>
                <TableCell className="font-mono text-xs"><EditableSkuCell id={s.id} sampleId={sampleId} field="upc" value={s.upc} canEdit={canEdit} mono /></TableCell>
                <TableCell className="text-xs"><EditableSkuCell id={s.id} sampleId={sampleId} field="skuCode" value={s.skuCode ?? ""} canEdit={canEdit} /></TableCell>
                <TableCell className="tabular-nums"><EditableSkuCell id={s.id} sampleId={sampleId} field="unitsPerCarton" value={s.unitsPerCarton != null ? String(s.unitsPerCarton) : ""} canEdit={canEdit} numeric /></TableCell>
                <TableCell><EditableSkuCell id={s.id} sampleId={sampleId} field="sampleEta" value={s.sampleEta} canEdit={canEdit} date /></TableCell>
                <TableCell>
                  <Checkbox checked={s.received} disabled={!canEdit || pending} onCheckedChange={(v) => toggleReceived(s.id, !!v)} />
                </TableCell>
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
          <Button size="sm" variant="outline" onClick={fillCodes} disabled={pending} title="Fill missing SKU codes from sample # + color code">
            <Wand2 className="h-4 w-4" /> Fill SKU codes
          </Button>
        </div>
      )}
    </div>
  );
}

function VariantImageCell({ id, sampleId, imageUrl, color, canEdit }: { id: string; sampleId: string; imageUrl: string | null; color: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const onPick = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      try {
        const blob = await upload(`variants/${id}/${Date.now()}-${file.name}`, file, { access: "public", handleUploadUrl: "/api/import/blob-upload" });
        const fd = new FormData();
        fd.set("variantId", id); fd.set("sampleId", sampleId); fd.set("blobUrl", blob.url);
        const res = await uploadSkuVariantImage(fd);
        if (!res.ok) toast.error(res.error); else { toast.success("Image updated"); router.refresh(); }
      } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
      finally { if (inputRef.current) inputRef.current.value = ""; }
    });
  };
  if (!canEdit) {
    return imageUrl
      ? // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={color} className="h-10 w-10 rounded object-contain bg-white" />
      : <span className="text-[var(--muted-foreground)]">—</span>;
  }
  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={pending} title="Upload color image" className="group relative block h-10 w-10">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={color} className="h-10 w-10 rounded object-contain bg-white" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-[var(--border)] text-[var(--muted-foreground)]"><ImagePlus className="h-4 w-4" /></span>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
    </>
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
  date,
}: {
  id: string;
  sampleId: string;
  field: "size" | "color" | "upc" | "skuCode" | "unitsPerCarton" | "sampleEta";
  value: string;
  canEdit: boolean;
  mono?: boolean;
  numeric?: boolean;
  date?: boolean;
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
        type={date ? "date" : numeric ? "number" : "text"}
        disabled={pending}
        className="h-7 w-32 text-xs"
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
