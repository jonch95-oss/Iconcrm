"use client";

import { ExcelImportDialog } from "@/components/excel-import-dialog";
import { importInventoryCounts } from "@/app/(app)/import-actions";

export function ImportInventoryButton() {
  return (
    <ExcelImportDialog
      title="Import stock counts from Excel"
      description="Upload a stock sheet. Each row needs an on-hand Quantity plus a UPC (best) or Style # (+ optional Size/Color) to match the SKU. On-hand is set to the counted number; re-uploading just books the difference."
      buttonLabel="Import stock count"
      onImport={importInventoryCounts}
    />
  );
}
