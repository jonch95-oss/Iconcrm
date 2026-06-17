"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileUp, Download } from "lucide-react";
import { upload } from "@vercel/blob/client";
import type { ImportSummary } from "@/app/(app)/import-actions";

/**
 * Shared Excel-import dialog: pick a file, run the action, show a
 * plain-English result with per-row skip reasons.
 */
export function ExcelImportDialog({
  title,
  description,
  buttonLabel,
  templateHref,
  onImport,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  templateHref?: string;
  onImport: (formData: FormData) => Promise<ImportSummary>;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<ImportSummary | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const runFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setResult({ error: "Please use an .xlsx file." } as ImportSummary);
      return;
    }
    setResult(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        // Always upload straight to Vercel Blob from the browser, then import
        // server-side from the Blob URL. Keeping the file off the server-action
        // request path entirely means imports of ANY size — a 600KB sheet or a
        // 60MB one — never hit Vercel's ~4.5MB request-body cap.
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/import/blob-upload",
        });
        fd.set("blobUrl", blob.url);
        const res = await onImport(fd);
        setResult(res);
      } catch (e) {
        setResult({
          error: e instanceof Error ? e.message : "Upload failed. Please try again.",
        } as ImportSummary);
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    runFile(e.target.files?.[0]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    runFile(e.dataTransfer.files?.[0]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileUp className="h-4 w-4" /> {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--muted-foreground)]">{description}</p>

        <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={onPick} />
        <div
          role="button"
          tabIndex={0}
          onClick={() => !pending && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !pending) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
            dragging
              ? "border-[var(--primary)] bg-[var(--accent)]"
              : "border-[var(--border)] hover:border-[var(--primary)]"
          } ${pending ? "pointer-events-none opacity-60" : ""}`}
        >
          <FileUp className="h-7 w-7 text-[var(--muted-foreground)]" />
          <p className="text-sm font-medium">
            {pending ? "Importing…" : dragging ? "Drop the file to import" : "Drag & drop an Excel file here"}
          </p>
          {!pending && (
            <p className="text-xs text-[var(--muted-foreground)]">or click to choose · .xlsx with embedded photos supported</p>
          )}
        </div>
        {templateHref && (
          <div className="flex justify-center">
            <Button variant="outline" className="h-9" asChild>
              <a href={templateHref}>
                <Download className="h-4 w-4" /> Download template
              </a>
            </Button>
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-md border border-[var(--border)] p-3 text-sm">
            {result.error ? (
              <p className="text-[var(--destructive)]">{result.error}</p>
            ) : (
              <>
                <p className="font-medium">
                  Done — {result.created} created
                  {result.updated > 0 && `, ${result.updated} updated`}
                  {result.variantsAdded > 0 && `, ${result.variantsAdded} sizes/UPCs added`}
                  {result.photosAdded > 0 && `, ${result.photosAdded} photos imported`}
                  {result.skipped.length > 0 && `, ${result.skipped.length} skipped`}.
                </p>
                {result.mappedColumns && (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Columns recognized:{" "}
                    {Object.values(result.mappedColumns).join(", ")}
                  </p>
                )}
                {result.skipped.length > 0 && (
                  <div className="max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--muted-foreground)]">
                    {result.skipped.slice(0, 50).map((s, i) => (
                      <div key={i}>
                        Row {s.row}: {s.reason}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
