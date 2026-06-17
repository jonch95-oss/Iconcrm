"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adjustInventory } from "./actions";

export function AdjustRow({ skuVariantId }: { skuVariantId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [delta, setDelta] = React.useState("");

  const submit = () => {
    const n = parseInt(delta, 10);
    if (!Number.isFinite(n) || n === 0) {
      toast.error("Enter a non-zero adjustment, e.g. -5 or 12");
      return;
    }
    start(async () => {
      const res = await adjustInventory(skuVariantId, n);
      if (res.ok) {
        toast.success("Stock adjusted");
        setDelta("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Adjustment failed");
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        placeholder="±qty"
        inputMode="numeric"
        className="h-8 w-20 text-right"
      />
      <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={submit}>
        Adjust
      </Button>
    </div>
  );
}
