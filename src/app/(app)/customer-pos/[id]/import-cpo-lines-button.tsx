"use client";

import { ExcelImportDialog } from "@/components/excel-import-dialog";
import { importCustomerPoLines } from "@/app/(app)/import-actions";

export function ImportCustomerPoLinesButton({ customerPoId }: { customerPoId: string }) {
  return (
    <ExcelImportDialog
      title="Import customer PO lines from Excel"
      description="Upload the customer's PO sheet. Each row needs a Style # and a Quantity (Color, Size, Description, Price optional). Lines are matched against your linked internal PO by style number. Re-uploading replaces the lines."
      buttonLabel="Import customer PO"
      onImport={(fd) => importCustomerPoLines(customerPoId, fd)}
    />
  );
}
