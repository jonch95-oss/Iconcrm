"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExcelImportDialog } from "@/components/excel-import-dialog";
import { importSkusForSample } from "@/app/(app)/import-actions";

export function SkuIoButtons({ sampleId }: { sampleId: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <a href={`/api/samples/${sampleId}/skus`}>
          <Download className="h-4 w-4" /> Export SKUs
        </a>
      </Button>
      <ExcelImportDialog
        title="Import SKUs for this sample"
        description="Upload a sheet with Size, Color, UPC, SKU Code, Units/Carton. Rows match on UPC (or size + color) and update in place; new rows are added. UPC can be blank."
        buttonLabel="Import SKUs"
        onImport={(fd) => importSkusForSample(sampleId, fd)}
      />
    </div>
  );
}
