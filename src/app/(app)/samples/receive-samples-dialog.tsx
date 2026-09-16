"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { bulkReceiveSamples } from "./actions";
import { toast } from "sonner";

type Sel = { id: string; sampleNumber: string; styleName: string };

/**
 * Receiving a batch: samples come out of a specific sample room at the factory,
 * and that's only known at the moment the box is opened — so ask for it here
 * rather than leaving it to be filled in later (it never is).
 *
 * One room for the whole batch is the common case, so the top field fills every
 * row; each row can still be corrected on its own.
 */
export function ReceiveSamplesDialog({
  selected,
  rooms,
  onDone,
  label,
  disabled,
}: {
  selected: Sel[];
  /** Rooms already used, offered as suggestions. */
  rooms: string[];
  onDone: () => void;
  /** Trigger text (defaults to "Mark received"). */
  label?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [allRooms, setAllRooms] = React.useState("");
  const [perSample, setPerSample] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setAllRooms("");
    setPerSample({});
  }, [open, selected]);

  const applyToAll = (value: string) => {
    setAllRooms(value);
    setPerSample(Object.fromEntries(selected.map((s) => [s.id, value])));
  };

  const submit = () => {
    start(async () => {
      const res = await bulkReceiveSamples(
        selected.map((s) => s.id),
        Object.fromEntries(selected.map((s) => [s.id, (perSample[s.id] ?? "").trim()])),
      );
      if (res.ok) {
        const renamed = res.renamed ?? [];
        const n = res.received ?? selected.length;
        const skipped = selected.length - n;
        toast.success(
          `${n} marked received` +
            (skipped > 0 ? ` (${skipped} already were)` : "") +
            (renamed.length ? ` — revised: ${renamed.join(", ")}` : ""),
        );
        setOpen(false);
        onDone();
        router.refresh();
      } else toast.error(res.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <PackageCheck className="h-4 w-4" /> {label ?? "Mark received"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Receive {selected.length} sample{selected.length === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="room-all">Sample room</Label>
            <Input
              id="room-all"
              list="sample-rooms"
              autoFocus
              value={allRooms}
              onChange={(e) => applyToAll(e.target.value)}
              placeholder="Which sample room did these come from?"
            />
            <datalist id="sample-rooms">
              {rooms.map((r) => <option key={r} value={r} />)}
            </datalist>
            <p className="text-xs text-[var(--muted-foreground)]">
              Fills every row below. Leave blank to skip, or correct any row on its own.
            </p>
          </div>

          <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-md border border-[var(--border)] p-2">
            {selected.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.sampleNumber}</div>
                  {s.styleName && (
                    <div className="truncate text-xs text-[var(--muted-foreground)]">{s.styleName}</div>
                  )}
                </div>
                <Input
                  list="sample-rooms"
                  className="h-8 w-48"
                  value={perSample[s.id] ?? ""}
                  onChange={(e) => setPerSample((m) => ({ ...m, [s.id]: e.target.value }))}
                  placeholder="Sample room"
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            <PackageCheck className="h-4 w-4" /> Mark received
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
