"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { DollarSign, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { previewFactoryPriceList, applyFactoryPrices, type PriceListPreview } from "@/app/(app)/import-actions";

/**
 * Pricing samples from the factory's own sheet.
 *
 * Factories quote per material, so one style number can carry a dozen prices;
 * and their numbering drifts from ours. Both of those are reasons to show the
 * work before writing it: every price that would move, old → new and why it was
 * picked, next to everything the sheet mentions that we couldn't place. The
 * prices land only when you say so, and only on samples that already exist.
 */
export function PriceListDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<PriceListPreview | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const [reading, startReading] = React.useTransition();
  const [applying, startApplying] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const read = (file: File | undefined | null) => {
    if (!file) return;
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setPreview({ ...EMPTY, error: "Please use an .xlsx file." });
      return;
    }
    setPreview(null);
    setFileName(file.name);
    startReading(async () => {
      try {
        const fd = new FormData();
        // A price list is a few columns of text — kilobytes, not megabytes — so
        // it rides along with the action. Only an unusually fat sheet needs the
        // detour through Blob storage to clear the request-body cap.
        if (file.size <= 4 * 1024 * 1024) {
          fd.set("file", file);
        } else {
          const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/import/blob-upload" });
          fd.set("blobUrl", blob.url);
        }
        setPreview(await previewFactoryPriceList(fd));
      } catch (e) {
        setPreview({ ...EMPTY, error: e instanceof Error ? e.message : "Upload failed. Please try again." });
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  const apply = () => {
    if (!preview?.changes.length) return;
    startApplying(async () => {
      const res = await applyFactoryPrices(preview.changes.map((c) => ({ sampleId: c.sampleId, fob: c.fob })));
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't apply the prices.");
        return;
      }
      toast.success(`${res.updated} FOB price${res.updated === 1 ? "" : "s"} updated.`);
      setOpen(false);
      setPreview(null);
      router.refresh();
    });
  };

  const copyUnpriced = async () => {
    if (!preview?.skipped.length) return;
    const text = preview.skipped
      .map((s) => [s.style, s.styleName, s.reason, s.detail].filter(Boolean).join("\t"))
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied — paste it into an email to the factory.");
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  const money = (v: number | null) => (v == null ? "—" : v.toFixed(2));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setPreview(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <DollarSign className="h-4 w-4" /> Factory prices
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Price samples from a factory price list</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--muted-foreground)]">
          Upload the factory&apos;s own sheet — a style column and an FOB column is all it needs. Nothing is
          written until you&apos;ve seen what moves, and prices only land on samples that already exist here.
        </p>

        <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
        {!preview?.ok && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => !reading && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !reading) inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragging) setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              read(e.dataTransfer.files?.[0]);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
              dragging ? "border-[var(--primary)] bg-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--primary)]"
            } ${reading ? "pointer-events-none opacity-60" : ""}`}
          >
            <FileUp className="h-7 w-7 text-[var(--muted-foreground)]" />
            <p className="text-sm font-medium">
              {reading ? "Matching the price list…" : dragging ? "Drop the price list to check it" : "Drag & drop the price list here"}
            </p>
            {!reading && <p className="text-xs text-[var(--muted-foreground)]">or click to choose · .xlsx</p>}
          </div>
        )}

        {preview?.error && <p className="text-sm text-[var(--destructive)]">{preview.error}</p>}

        {preview?.ok && (
          <div className="space-y-3">
            <div className="rounded-md border border-[var(--border)] p-3 text-sm">
              <p className="font-medium">
                {fileName}: {preview.priceRows} priced rows across {preview.styles} style numbers.
              </p>
              <p className="text-[var(--muted-foreground)]">
                {preview.changes.length} price{preview.changes.length === 1 ? "" : "s"} to apply
                {preview.alreadyCorrect > 0 && `, ${preview.alreadyCorrect} already correct`}
                {preview.skipped.length > 0 && `, ${preview.skipped.length} couldn't be priced`}.
              </p>
            </div>

            {preview.changes.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-md border border-[var(--border)]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--muted)]">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Sample #</th>
                      <th className="px-2 py-1.5 font-medium">Style</th>
                      <th className="px-2 py-1.5 text-right font-medium">Now</th>
                      <th className="px-2 py-1.5 text-right font-medium">New</th>
                      <th className="px-2 py-1.5 font-medium">Why this price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.map((c) => (
                      <tr key={c.sampleId} className="border-t border-[var(--border)]">
                        <td className="px-2 py-1.5 font-mono">{c.sampleNumber}</td>
                        <td className="px-2 py-1.5">{c.styleName}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-[var(--muted-foreground)]">{money(c.fobNow)}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">{money(c.fob)}</td>
                        <td className="px-2 py-1.5 text-[var(--muted-foreground)]">
                          {c.why}
                          {c.matchedOn !== "sample #" && ` · matched on ${c.matchedOn}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {preview.skipped.length > 0 && (
              <details className="rounded-md border border-[var(--border)] p-3 text-xs">
                <summary className="cursor-pointer font-medium">
                  {preview.skipped.length} row{preview.skipped.length === 1 ? "" : "s"} left alone — open to see why
                </summary>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[var(--muted-foreground)]">
                  {preview.skipped.map((s, i) => (
                    <div key={`${s.style}-${i}`}>
                      <span className="font-mono text-[var(--foreground)]">{s.style}</span>
                      {s.styleName && ` ${s.styleName}`} — {s.reason}
                      {s.detail && <span className="opacity-70"> ({s.detail})</span>}
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="mt-2 h-8" onClick={copyUnpriced}>
                  Copy this list
                </Button>
              </details>
            )}
          </div>
        )}

        {preview?.ok && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={applying}>
              Use a different file
            </Button>
            <Button onClick={apply} disabled={applying || preview.changes.length === 0}>
              {applying ? "Applying…" : `Apply ${preview.changes.length} price${preview.changes.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

const EMPTY: PriceListPreview = { ok: false, priceRows: 0, styles: 0, samples: 0, changes: [], alreadyCorrect: 0, skipped: [] };
