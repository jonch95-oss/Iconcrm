"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { Truck, FileUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  previewShipSheetFromOneDrive,
  previewShipSheetUpload,
  applyShipSheet,
  type ShipPreview,
} from "./ship-actions";

const EMPTY: ShipPreview = { ok: false, source: "", sheetRows: 0, receivedOnSheet: 0, matched: 0, changes: [], alreadyRight: 0, skipped: [] };
const day = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

/**
 * The factory's status sheet, in. It's read from OneDrive on its own every
 * morning; this is for seeing what Monday's update did, running it early, or
 * reading a copy of the sheet someone sent by hand.
 *
 * Same contract as the price list: nothing is written until you've seen what
 * moves, and a style we don't carry is reported, never created.
 */
export function ShipSheetDialog({ oneDriveReady }: { oneDriveReady: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<ShipPreview | null>(null);
  const [reading, startReading] = React.useTransition();
  const [applying, startApplying] = React.useTransition();
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const fromOneDrive = () =>
    startReading(async () => {
      setPreview(null);
      setPreview(await previewShipSheetFromOneDrive());
    });

  const fromFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setPreview({ ...EMPTY, error: "Please use an .xlsx file." });
      return;
    }
    setPreview(null);
    startReading(async () => {
      try {
        const fd = new FormData();
        if (file.size <= 4 * 1024 * 1024) fd.set("file", file);
        else {
          const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/import/blob-upload" });
          fd.set("blobUrl", blob.url);
        }
        setPreview(await previewShipSheetUpload(fd));
      } catch (e) {
        setPreview({ ...EMPTY, error: e instanceof Error ? e.message : "Upload failed." });
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  const apply = () => {
    if (!preview?.changes.length) return;
    startApplying(async () => {
      const res = await applyShipSheet(preview.changes);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't apply those.");
        return;
      }
      toast.success(`${res.updated} ship date${res.updated === 1 ? "" : "s"} recorded.`);
      setOpen(false);
      setPreview(null);
      router.refresh();
    });
  };

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
          <Truck className="h-4 w-4" /> Shipping sheet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ship dates from the factory&apos;s status sheet</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--muted-foreground)]">
          The <strong>Sample Status</strong> tab, columns A–H. Dates land on the colour the row names; a style we don&apos;t
          carry is listed, never created. This runs by itself every morning — use it here to see what Monday&apos;s update did.
        </p>

        {!preview?.ok && (
          <div className="space-y-3">
            <Button onClick={fromOneDrive} disabled={reading || !oneDriveReady} className="w-full">
              <RefreshCw className={`h-4 w-4 ${reading ? "animate-spin" : ""}`} />
              {reading ? "Reading the sheet…" : "Read it from OneDrive now"}
            </Button>
            {!oneDriveReady && (
              <p className="text-xs text-[var(--warning)]">
                No OneDrive link set yet — add <code>ONEDRIVE_SHIP_SHEET_URL</code> in the deployment&apos;s environment
                settings. Until then, drop a copy of the sheet below.
              </p>
            )}
            <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => fromFile(e.target.files?.[0])} />
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
                fromFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
                dragging ? "border-[var(--primary)] bg-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--primary)]"
              } ${reading ? "pointer-events-none opacity-60" : ""}`}
            >
              <FileUp className="h-6 w-6 text-[var(--muted-foreground)]" />
              <p className="text-sm font-medium">{dragging ? "Drop the sheet to read it" : "…or drop a copy of the sheet here"}</p>
            </div>
          </div>
        )}

        {preview?.error && <p className="text-sm text-[var(--destructive)]">{preview.error}</p>}

        {preview?.ok && (
          <div className="space-y-3">
            <div className="rounded-md border border-[var(--border)] p-3 text-sm">
              <p className="font-medium">
                {preview.source}: {preview.sheetRows} dated rows on “{preview.sheet}”.
              </p>
              <p className="text-[var(--muted-foreground)]">
                {preview.changes.length} to record
                {preview.alreadyRight > 0 && `, ${preview.alreadyRight} already right`}
                {preview.skipped.length > 0 && `, ${preview.skipped.length} not matched`}.
              </p>
              {preview.receivedOnSheet > 0 && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  {preview.receivedOnSheet} of those rows are also ticked <strong>Received</strong> on the sheet. Only the
                  ship date is taken from here — receiving still happens in the CRM, where the sample room is captured.
                </p>
              )}
            </div>

            {preview.changes.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-md border border-[var(--border)]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--muted)]">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Sample</th>
                      <th className="px-2 py-1.5 font-medium">Colour</th>
                      <th className="px-2 py-1.5 font-medium">Shipped</th>
                      <th className="px-2 py-1.5 font-medium">Tracking</th>
                      <th className="px-2 py-1.5 font-medium">Matched on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.map((c) => (
                      <tr key={c.variantId ?? c.sampleId} className="border-t border-[var(--border)]">
                        <td className="px-2 py-1.5 font-mono">{c.sampleNumber}</td>
                        <td className="px-2 py-1.5">{c.color ?? "whole style"}</td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {c.shippedNow && <span className="text-[var(--muted-foreground)] line-through">{day(c.shippedNow)} </span>}
                          {day(c.shippedDate)}
                        </td>
                        <td className="px-2 py-1.5 font-mono">{c.tracking || "—"}</td>
                        <td className="px-2 py-1.5 text-[var(--muted-foreground)]">{c.matchedOn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {preview.skipped.length > 0 && (
              <details className="rounded-md border border-[var(--border)] p-3 text-xs">
                <summary className="cursor-pointer font-medium">
                  {preview.skipped.length} row{preview.skipped.length === 1 ? "" : "s"} not matched — open to see why
                </summary>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[var(--muted-foreground)]">
                  {preview.skipped.slice(0, 400).map((s, i) => (
                    <div key={`${s.style}-${i}`}>
                      <span className="font-mono text-[var(--foreground)]">{s.style}</span>
                      {s.color && ` · ${s.color}`} — {s.reason}
                      {s.detail && <span className="opacity-70"> ({s.detail})</span>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {preview?.ok && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={applying}>
              Read it again
            </Button>
            <Button onClick={apply} disabled={applying || preview.changes.length === 0}>
              {applying ? "Recording…" : `Record ${preview.changes.length} ship date${preview.changes.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
