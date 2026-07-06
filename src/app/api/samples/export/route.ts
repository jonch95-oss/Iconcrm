import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
// Fetching + embedding sample photos can take a bit on a large catalog.
export const maxDuration = 60;

/**
 * Mass export of all samples + variants, in exactly the columns the Excel
 * importer understands — download, bulk-edit, re-upload to apply changes.
 * The Sample # repeats on every row so variant rows always re-attach. Each
 * sample's photo is embedded in column A (round-trips with the importer).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Optional ?ids=a,b,c — export only those samples (from the table's checkboxes).
  const idsParam = new URL(request.url).searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").map((x) => x.trim()).filter(Boolean) : null;

  const samples = await prisma.sample.findMany({
    where: ids && ids.length ? { id: { in: ids } } : undefined,
    include: { factory: { select: { name: true } }, skuVariants: { orderBy: { upc: "asc" } } },
    orderBy: { sampleNumber: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "ICON LUXURY GROUP";
  const ws = wb.addWorksheet("Samples");
  const header = [
    "Image", "Sample #", "Brand", "Category", "Style #", "Style Name", "Description",
    "FOB", "Sell Price", "Duty %", "Freight/Unit", "Inland/Unit",
    "HTS Code", "Composition", "CBM/Carton", "Case Pack",
    "Factory", "Target Customer", "Status", "Size", "Color", "UPC", "SKU Code",
  ];
  ws.addRow(header);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const num = (d: unknown) => (d == null ? "" : Number(d));
  const imageJobs: { rowNumber: number; url: string }[] = [];

  for (const s of samples) {
    const base = [
      "", // image column A (photo embedded separately)
      s.sampleNumber, s.brand ?? "", s.category ?? "", s.styleNumber ?? "",
      s.styleName ?? "", s.description ?? "",
      num(s.fobCost), num(s.customerSellPrice), num(s.dutyRatePercent),
      num(s.freightPerUnit), num(s.inlandPerUnit),
      s.htsCode ?? "", s.composition ?? "", num(s.cbmPerCarton), s.casePackDefault ?? "",
      s.factory?.name ?? "", s.targetCustomer ?? "", s.status,
    ];
    let firstRow = 0;
    if (s.skuVariants.length === 0) {
      firstRow = ws.addRow([...base, s.size ?? "", "", "", ""]).number;
    } else {
      s.skuVariants.forEach((v, i) => {
        const r = ws.addRow([...base, v.size, v.color, v.upc, v.skuCode ?? ""]).number;
        if (i === 0) firstRow = r;
      });
    }
    if (s.imageUrl && firstRow) imageJobs.push({ rowNumber: firstRow, url: s.imageUrl });
  }

  // Fetch + embed photos with bounded concurrency so a big catalog stays fast.
  const embed = async ({ rowNumber, url }: { rowNumber: number; url: string }) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const ct = res.headers.get("content-type") ?? "";
      const extension = ct.includes("png") ? "png" : ct.includes("gif") ? "gif" : "jpeg";
      // Pass base64 (string) rather than a Buffer: newer @types/node's
      // Buffer<ArrayBuffer> isn't assignable to ExcelJS's expected buffer type.
      const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      const imageId = wb.addImage({ base64, extension });
      ws.getRow(rowNumber).height = 72;
      // tl.row is 0-based (row 1 = index 0), so worksheet row N anchors at N-1.
      ws.addImage(imageId, { tl: { col: 0, row: rowNumber - 1 }, ext: { width: 92, height: 92 } });
    } catch {
      // Skip images that can't be fetched; the export still succeeds.
    }
  };
  const CONCURRENCY = 8;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, imageJobs.length) }, async () => {
      while (cursor < imageJobs.length) await embed(imageJobs[cursor++]);
    }),
  );

  ws.columns.forEach((c, i) => (c.width = i === 0 ? 14 : i === 6 ? 28 : 15));

  const buffer = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(Buffer.from(buffer)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="samples-export-${today}.xlsx"`,
    },
  });
}
