"use client";

import { ExcelImportDialog } from "@/components/excel-import-dialog";
import { importPiLinesExcel } from "@/app/(app)/import-actions";

export function ImportPiLinesButton({ piId }: { piId: string }) {
  return (
    <ExcelImportDialog
      title="Import PI lines from the factory's Excel"
      description="Upload the factory's .xlsx. Each row needs a quantity and a unit price, plus a UPC (best) or Style # to match against your samples. FOB variances are computed automatically, exactly like manual entry."
      buttonLabel="Import factory Excel"
      onImport={(fd) => importPiLinesExcel(piId, fd)}
    />
  );
}
