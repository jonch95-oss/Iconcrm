"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileSpreadsheet, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createOrderFormFromSamples, listVariantsForSamples, type VariantPickSample } from "./actions";

export function CreateOrderFormButton({ selectedIds }: { selectedIds: string[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [samples, setSamples] = React.useState<VariantPickSample[]>([]);
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});

  const openDialog = () => {
    if (selectedIds.length === 0) return;
    setOpen(true);
    setLoading(true);
    listVariantsForSamples(selectedIds)
      .then((data) => {
        setSamples(data);
        const init: Record<string, boolean> = {};
        for (const s of data) for (const v of s.variants) init[v.id] = true;
        setChecked(init);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Couldn't load SKUs");
        setLoading(false);
      });
  };

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const toggleSample = (s: VariantPickSample, on: boolean) =>
    setChecked((c) => {
      const n = { ...c };
      for (const v of s.variants) n[v.id] = on;
      return n;
    });

  const factories = [...new Set(samples.map((s) => s.factoryName).filter(Boolean))];
  const mixed = factories.length > 1;

  const create = () => {
    const variantIds = Object.keys(checked).filter((k) => checked[k]);
    startTransition(async () => {
      const res = await createOrderFormFromSamples(selectedIds, variantIds);
      if (res.ok && res.id) {
        toast.success("Order form created");
        setOpen(false);
        router.push(`/order-forms/${res.id}`);
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });
  };

  return (
    <>
      <Button size="sm" onClick={openDialog}>
        <FileSpreadsheet className="h-4 w-4" /> Create Order Form
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose SKUs for the order form</DialogTitle>
          </DialogHeader>

          {mixed && (
            <div className="flex items-start gap-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-2 text-xs text-[var(--warning)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Order forms are per-factory. You selected {factories.length} factories — only
                &ldquo;{factories[0]}&rdquo; samples will be added.
              </span>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading SKUs…</p>
          ) : (
            <div className="space-y-3">
              {samples.map((s) => {
                const allOn = s.variants.length > 0 && s.variants.every((v) => checked[v.id]);
                return (
                  <div key={s.sampleId} className="rounded-md border border-[var(--border)] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-medium">
                        {s.sampleNumber}
                        {s.factoryName && (
                          <span className="ml-2 text-xs text-[var(--muted-foreground)]">{s.factoryName}</span>
                        )}
                      </div>
                      {s.variants.length > 0 && (
                        <button
                          type="button"
                          className="text-xs text-[var(--primary)] hover:underline"
                          onClick={() => toggleSample(s, !allOn)}
                        >
                          {allOn ? "Clear all" : "Select all"}
                        </button>
                      )}
                    </div>
                    {s.variants.length === 0 ? (
                      <p className="text-xs text-[var(--muted-foreground)]">No SKUs yet — will be added as a single line.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        {s.variants.map((v) => (
                          <label key={v.id} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={!!checked[v.id]} onCheckedChange={() => toggle(v.id)} />
                            <span>
                              {v.color} · {v.size}
                              {v.skuCode ? ` · ${v.skuCode}` : ""}
                              {v.upc ? ` · ${v.upc}` : ""}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {samples.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">No samples selected.</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={create} disabled={pending || loading}>
              Create order form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
