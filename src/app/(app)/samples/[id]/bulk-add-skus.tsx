"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { bulkAddVariantsByColor } from "../actions";

export function BulkAddSkus({ sampleId }: { sampleId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [sizes, setSizes] = React.useState("OS");
  const [colors, setColors] = React.useState("");

  const run = () => {
    const sizeArr = sizes.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    const colorArr = colors.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (colorArr.length === 0) {
      toast.error("Add at least one color (one per line).");
      return;
    }
    start(async () => {
      const res = await bulkAddVariantsByColor(sampleId, sizeArr, colorArr);
      if (!res.ok) {
        toast.error(res.error ?? "Failed");
        return;
      }
      const created = res.created ?? 0;
      const skipped = res.skippedExisting ?? 0;
      toast.success(`${created} SKU${created === 1 ? "" : "s"} added${skipped ? `, ${skipped} already existed` : ""}`);
      const missing = res.missingCodes ?? [];
      if (missing.length) {
        toast(`No color code for: ${missing.join(", ")} — SKU left blank. Add codes in Settings → Color Codes.`);
      }
      setColors("");
      router.refresh();
    });
  };

  return (
    <div className="mb-4 rounded-md border border-[var(--border)] p-3">
      <div className="mb-1 text-sm font-medium">Bulk add SKUs by color</div>
      <p className="mb-2 text-xs text-[var(--muted-foreground)]">
        Enter the size(s) once and the colors (one per line). The SKU auto-builds as sample # + color code;
        add UPCs afterward.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="sm:w-40">
          <label className="text-xs text-[var(--muted-foreground)]">Sizes</label>
          <Input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="OS" className="h-9" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-[var(--muted-foreground)]">Colors (one per line)</label>
          <Textarea
            value={colors}
            onChange={(e) => setColors(e.target.value)}
            rows={3}
            placeholder={"BLACK DENIM\nCHERRY BLOSSOM CREAM\nGRAFFITTI"}
          />
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={run} disabled={pending}>
          Add SKUs
        </Button>
      </div>
    </div>
  );
}
