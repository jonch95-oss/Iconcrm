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
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setResult(null);
    startTransition(async () => {
      const res = await onImport(fd);
      setResult(res);
      if (inputRef.current) inputRef.current.value = "";
    });
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
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => inputRef.current?.click()} className="h-11">
            <FileUp className="h-4 w-4" /> {pending ? "Importing…" : "Choose Excel file"}
          </Button>
          {templateHref && (
            <Button variant="outline" className="h-11" asChild>
              <a href={templateHref}>
                <Download className="h-4 w-4" /> Download template
              </a>
            </Button>
          )}
        </div>

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
