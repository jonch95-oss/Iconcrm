"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { groupSamplesIntoMaster } from "./actions";
import { toast } from "sonner";

type Sel = { id: string; sampleNumber: string; color: string };

/** Longest common prefix of the selected sample numbers, tidied. */
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

  React.useEffect(() => {
    if (open) setMaster(commonPrefix(selected.map((s) => s.sampleNumber)));
  }, [open, selected]);

  const submit = () => {
    start(async () => {
      const fd = new FormData();
      fd.set("masterNumber", master);
      fd.set("sampleIds", JSON.stringify(selected.map((s) => s.id)));
      const res = await groupSamplesIntoMaster(fd);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Grouped ${res.merged} samples under ${master}`);
      if (res.missing && res.missing.length > 0) {
        toast.warning(`No color code for: ${res.missing.join(", ")}. Add them under Settings › Color Codes, then Fill SKU codes.`);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group {selected.length} samples into one master</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <p className="text-[var(--muted-foreground)]">
            Each selected sample becomes a color SKU on the master (master&nbsp;# + color code),
            carrying its image, received date and sample ETA. The originals are removed.
          </p>
          <div className="space-y-1">
            <Label>Master sample number</Label>
            <Input value={master} onChange={(e) => setMaster(e.target.value)} placeholder="e.g. PA BCLW-2" />
          </div>
          <div className="max-h-48 space-y-1 overflow-auto rounded-md border border-[var(--border)] p-2">
            {selected.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3">
                <span className="font-medium">{s.sampleNumber}</span>
                <span className="text-[var(--muted-foreground)]">{s.color || "(no color set)"}</span>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !master.trim() || selected.length < 2}>
            {pending ? "Grouping…" : "Group samples"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
