"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { upsertColorCode, deleteColorCode } from "./actions";

export interface ColorCodeRow {
  id: string;
  color: string;
  code: string;
}

export function ColorCodeManager({
  codes,
  missing,
}: {
  codes: ColorCodeRow[];
  missing: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [newColor, setNewColor] = React.useState("");
  const [newCode, setNewCode] = React.useState("");
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const save = (color: string, code: string) => {
    if (!color.trim() || !code.trim()) {
      toast.error("Enter both a color and a code.");
      return;
    }
    startTransition(async () => {
      const res = await upsertColorCode(color, code);
      if (res.ok) {
        toast.success("Saved");
        setNewColor("");
        setNewCode("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const res = await deleteColorCode(id);
      if (res.ok) {
        toast.success("Removed");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      {missing.length > 0 && (
        <div className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--warning)]">
            <AlertTriangle className="h-4 w-4" /> {missing.length} color{missing.length > 1 ? "s" : ""} in use with no code
          </div>
          <p className="mb-3 text-xs text-[var(--muted-foreground)]">
            SKU numbers can&apos;t be auto-generated for these until you give them a code.
          </p>
          <div className="space-y-1.5">
            {missing.map((color) => (
              <div key={color} className="flex items-center gap-2">
                <span className="w-56 truncate text-sm">{color}</span>
                <Input
                  placeholder="CODE"
                  className="h-8 w-24 uppercase"
                  value={drafts[color] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [color]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save(color, drafts[color] ?? "");
                  }}
                />
                <Button size="sm" variant="outline" disabled={pending} onClick={() => save(color, drafts[color] ?? "")}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-[var(--muted-foreground)]">Color</label>
            <Input placeholder="e.g. BLACK DENIM" className="h-9 w-56" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--muted-foreground)]">Code</label>
            <Input placeholder="BLK" className="h-9 w-24 uppercase" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          </div>
          <Button size="sm" disabled={pending} onClick={() => save(newColor, newCode)}>
            <Plus className="h-4 w-4" /> Add / update
          </Button>
        </div>

        <div className="mt-3 rounded-md border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                <th className="p-2 font-medium">Color</th>
                <th className="p-2 font-medium">Code</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-2">{c.color}</td>
                  <td className="p-2">
                    <Badge variant="secondary">{c.code}</Badge>
                  </td>
                  <td className="p-2 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={pending}
                      onClick={() => remove(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {codes.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-3 text-center text-xs text-[var(--muted-foreground)]">
                    No color codes yet. Add colors + abbreviations above; SKUs are built as sample # + code.
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
