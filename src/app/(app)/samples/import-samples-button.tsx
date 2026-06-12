"use client";

import { ExcelImportDialog } from "@/components/excel-import-dialog";
import { importSamplesExcel } from "@/app/(app)/import-actions";

export function ImportSamplesButton() {
  return (
    <ExcelImportDialog
      title="Import samples from Excel"
      description="Upload an .xlsx where each row is a sample (or a size/UPC of one). Rows sharing the same Sample # are grouped — first row sets the details, following rows add sizes and UPCs. Existing sample numbers are updated, not duplicated. Column names are matched loosely, so your existing sheets usually work as-is."
      buttonLabel="Import Excel"
      templateHref="/api/import/template"
      onImport={importSamplesExcel}
    />
  );
}
