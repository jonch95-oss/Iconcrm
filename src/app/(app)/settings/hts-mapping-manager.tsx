"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, AlertTriangle, DownloadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { upsertHtsMapping, deleteHtsMapping, preloadHtsMappings } from "./actions";

export interface HtsRow {
  id: string;
  category: string;
  material: string;
  htsCode: string;
  totalTariff: string;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-[var(--muted-foreground)]">{label}</label>
      {children}
    </div>
  );
}

export function HtsMappingManager({
  rows,
  missing,
}: {
  rows: HtsRow[];
  missing: { category: string; material: string }[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [nc, setNc] = React.useState("");
  const [nm, setNm] = React.useState("");
  const [nh, setNh] = React.useState("");
  const [nt, setNt] = React.useState("");
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const save = (category: string, material: string, hts: string, total?: string) => {
    if (!category.trim() || !hts.trim()) {
      toast.error("Category and HTS code are required.");
      return;
    }
    start(async () => {
      const res = await upsertHtsMapping(category, material, hts, undefined, total?.trim() || undefined);
      if (res.ok) {
        toast.success("Saved");
        setNc("");
        setNm("");
        setNh("");
        setNt("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };
  const remove = (id: string) =>
    start(async () => {
      const r = await deleteHtsMapping(id);
      if (r.ok) {
        toast.success("Removed");
        router.refresh();
      } else toast.error(r.error);
    });
  const preload = () =>
    start(async () => {
      const r = await preloadHtsMappings();
      if (r.ok) {
        toast.success("Loaded starter mappings from the tariff file");
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" disabled={pending} onClick={preload}>
          <DownloadCloud className="h-4 w-4" /> Preload from tariff file
        </Button>
      </div>

      {missing.length > 0 && (
        <div className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--warning)]">
            <AlertTriangle className="h-4 w-4" /> {missing.length} category/material combo
            {missing.length > 1 ? "s" : ""} in use with no HTS
          </div>
          <div className="space-y-1.5">
            {missing.map((m) => {
              const k = `${m.category}|${m.material}`;
              return (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-64 truncate text-sm">
                    {m.category}
                    {m.material ? ` · ${m.material}` : " · (any material)"}
                  </span>
                  <Input
                    placeholder="HTS code"
                    className="h-8 w-40"
                    value={drafts[k] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => save(m.category, m.material, drafts[k] ?? "")}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-end gap-2">
          <Labeled label="Category"><Input className="h-9 w-40" value={nc} onChange={(e) => setNc(e.target.value)} placeholder="Handbag" /></Labeled>
          <Labeled label="Material (blank = any)"><Input className="h-9 w-40" value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Leather" /></Labeled>
          <Labeled label="HTS code"><Input className="h-9 w-40" value={nh} onChange={(e) => setNh(e.target.value)} placeholder="4202.21.9000" /></Labeled>
          <Labeled label="Total tariff (0.44 = 44%)"><Input className="h-9 w-32" value={nt} onChange={(e) => setNt(e.target.value)} placeholder="0.44" /></Labeled>
          <Button size="sm" disabled={pending} onClick={() => save(nc, nm, nh, nt)}>
            <Plus className="h-4 w-4" /> Add / update
          </Button>
        </div>
        <div className="rounded-md border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                <th className="p-2 font-medium">Category</th>
                <th className="p-2 font-medium">Material</th>
                <th className="p-2 font-medium">HTS</th>
                <th className="p-2 text-right font-medium">Total</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-2">{r.category}</td>
                  <td className="p-2">{r.material || <span className="text-[var(--muted-foreground)]">(any)</span>}</td>
                  <td className="p-2 font-mono text-xs">{r.htsCode}</td>
                  <td className="p-2 text-right tabular-nums">{r.totalTariff ? `${(Number(r.totalTariff) * 100).toFixed(1)}%` : "—"}</td>
                  <td className="p-2 text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={pending} onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-xs text-[var(--muted-foreground)]">
                    No HTS mappings yet. Use “Preload from tariff file” or add them above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
