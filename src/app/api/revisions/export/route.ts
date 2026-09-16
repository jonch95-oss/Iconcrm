import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/session";
import { RECAP_ENTRY_LABEL, getRevisionRecap, recapFiltersFromQuery } from "@/lib/revisions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The revision recap as Excel — one row per note, with the sample's photo on
 * its first row, ready to send to a factory. Takes the same query params as the
 * dashboard, so the file matches what's on screen.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const filters = recapFiltersFromQuery(Object.fromEntries(sp));
  const recap = await getRevisionRecap(filters);

  const wb = new ExcelJS.Workbook();
  wb.creator = "ICON LUXURY GROUP";
  const ws = wb.addWorksheet("Revisions");

  ws.addRow([
    "Image", "Factory", "Sample #", "Style Name", "Brand", "Color",
    "Status", "Awaiting revised", "Days waiting", "Sample ETA",
    "Date", "Type", "Color (note)", "Note", "By",
  ]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const imageJobs: { rowNumber: number; url: string }[] = [];

  for (const f of recap.factories) {
    for (const s of f.samples) {
      // A style can be flagged for revision with nothing written down; it still
      // belongs in the recap, as a row with empty note columns.
      const entries = s.entries.length
        ? s.entries
        : [{ id: s.id, kind: "revision" as const, at: null, body: "", author: "", color: null }];
      entries.forEach((e, i) => {
        const row = ws.addRow([
          "",
          f.name,
          s.sampleNumber,
          s.styleName,
          s.brand,
          s.color,
          s.statusLabel,
          s.open ? "YES" : "",
          s.openDays ?? "",
          day(s.sampleEta),
          e.at ? day(e.at) : "",
          e.body ? RECAP_ENTRY_LABEL[e.kind] : "",
          e.color ?? "",
          e.body,
          e.author,
        ]);
        // The photo goes on the style's first note row only — repeating it down
        // every note would bloat the file for no gain.
        if (i === 0 && s.imageUrl) imageJobs.push({ rowNumber: row.number, url: s.imageUrl });
        if (s.open) row.getCell(8).font = { bold: true, color: { argb: "FFB45309" } };
      });
    }
  }

  const widths = [16, 20, 18, 22, 16, 14, 16, 14, 12, 12, 12, 22, 14, 60, 16];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getColumn(14).alignment = { wrapText: true, vertical: "top" };

  const embed = async ({ rowNumber, url }: { rowNumber: number; url: string }) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const ct = res.headers.get("content-type") ?? "";
      const extension = ct.includes("png") ? "png" : ct.includes("gif") ? "gif" : "jpeg";
      const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      const imageId = wb.addImage({ base64, extension });
      if ((ws.getRow(rowNumber).height ?? 0) < 76) ws.getRow(rowNumber).height = 76;
      ws.addImage(imageId, { tl: { col: 0, row: rowNumber - 1 }, ext: { width: 92, height: 92 } });
    } catch {
      // best-effort; skip unreadable images
    }
  };
  const CONCURRENCY = 8;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, imageJobs.length) }, async () => {
      while (cursor < imageJobs.length) await embed(imageJobs[cursor++]);
    }),
  );

  const buffer = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  const who = recap.factories.length === 1 ? `-${recap.factories[0].name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : "";
  return new NextResponse(new Uint8Array(Buffer.from(buffer)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sample-revisions${who}-${today}.xlsx"`,
    },
  });
}
