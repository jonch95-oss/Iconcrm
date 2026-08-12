"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Boxes, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { groupSamplesIntoMaster, suggestRelatedSamples } from "./actions";
import { toast } from "sonner";

type Sel = { id: string; sampleNumber: string; color: string; material: string };

function commonPrefix(nums: string[]): string {
  if (nums.length === 0) return "";
  let p = nums[0];
  for (const n of nums.slice(1)) {
    let i = 0;
    while (i < p.length && i < n.length && p[i] === n[i]) i++;
    p = p.slice(0, i);
  }
  return p.replace(/[\s\-_]+$/, "").trim();
}

export function GroupSamplesDialog({ selected, onDone }: { selected: Sel[]; onDone: () => void }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [master, setMaster] = React.useState("");
  const [pending, start] = React.useTransition();
  const [suggestions, setSuggestions] = React.useState<Sel[]>([]);
  const [addIds, setAddIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!open) return;
    setMaster(commonPrefix(selected.map((s) => s.sampleNumber)));
    setAddIds(new Set());
    suggestRelatedSamples(selected.map((s) => s.id)).then((r) => {
      if (r.ok) setSuggestions(r.suggestions);
    });
  }, [open, selected]);

  const members = React.useMemo(
    () => [...selected, ...suggestions.filter((s) => addIds.has(s.id))],
    [selected, suggestions, addIds],
  );

  // Call-outs over the final group.
  const dupColors = React.useMemo(() => {
    const c = new Map<string, number>();
    for (const m of members) { const k = (m.color || "").trim().toUpperCase(); if (k) c.set(k, (c.get(k) ?? 0) + 1); }
    return [...c.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  }, [members]);
  const materials = React.useMemo(
    () => [...new Set(members.map((m) => (m.material || "").trim()).filter(Boolean))],
    [members],
  );

  const toggleAdd = (id: string) =>
    setAddIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = () => {
    start(async () => {
      const fd = new FormData();
      fd.set("masterNumber", master);
      fd.set("sampleIds", JSON.stringify(members.map((m) => m.id)));
      const res = await groupSamplesIntoMaster(fd);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Grouped ${res.merged} samples under ${master}`);
      if (res.missing && res.missing.length > 0) {
        toast.warning(`No color code for: ${res.missing.join(", ")}. Add under Settings › Color Codes, then Fill SKU codes.`);
      }
      setOpen(false);
      onDone();
      if (res.id) router.push(`/samples/${res.id}`);
      else router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={selected.length < 2}>
          <Boxes className="h-4 w-4" /> Group into master
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Group {members.length} samples into one master</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <p className="text-[var(--muted-foreground)]">
            Each becomes a color SKU on the master (master&nbsp;# + color code), carrying its image,
            received date and sample ETA. The originals are removed.
          </p>

          {(dupColors.length > 0 || materials.length > 1) && (
            <div className="space-y-1 rounded-md border border-[var(--warning)] bg-[var(--warning)]/10 p-2 text-xs">
              {materials.length > 1 && (
                <div className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Mixed materials: {materials.join(", ")} — usually a family is one material.</div>
              )}
              {dupColors.length > 0 && (
                <div className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Duplicate colors: {dupColors.join(", ")} — fix or drop one.</div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label>Master sample number</Label>
            <Input value={master} onChange={(e) => setMaster(e.target.value)} placeholder="e.g. PA BCLW-2" />
          </div>

          <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-[var(--border)] p-2">
            {members.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3">
                <span className="font-medium">{s.sampleNumber}</span>
                <span className="text-[var(--muted-foreground)]">{s.color || "(no color)"} · {s.material || "(no material)"}</span>
              </div>
            ))}
          </div>

          {suggestions.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Suggested to add (same base &amp; material)</Label>
              <div className="max-h-32 space-y-1 overflow-auto rounded-md border border-dashed border-[var(--border)] p-2">
                {suggestions.map((s) => (
                  <label key={s.id} className="flex items-center gap-2">
                    <Checkbox checked={addIds.has(s.id)} onCheckedChange={() => toggleAdd(s.id)} />
                    <span className="font-medium">{s.sampleNumber}</span>
                    <Badge variant="outline" className="text-[10px]">{s.color || "?"} · {s.material || "?"}</Badge>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !master.trim() || members.length < 2}>
            {pending ? "Grouping…" : `Group ${members.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
