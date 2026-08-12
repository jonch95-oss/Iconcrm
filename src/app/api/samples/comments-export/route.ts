import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Export sample comments to Excel — one row per sample, with paired columns per
 * comment: "Comment N Image" (the attached photo, embedded) and "Comment N"
 * (the text). Column count grows to the busiest sample's comment count.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const idsParam = new URL(request.url).searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").map((x) => x.trim()).filter(Boolean) : null;

  const samples = await prisma.sample.findMany({
    where: {
      ...(ids && ids.length ? { id: { in: ids } } : {}),
      comments: { some: {} },
    },
    select: {
      sampleNumber: true,
      styleName: true,
      comments: {
        orderBy: { createdAt: "asc" },
        select: { body: true, imageUrl: true, createdAt: true, user: { select: { name: true } }, authorLabel: true },
      },
    },
    orderBy: { sampleNumber: "asc" },
  });

  const maxComments = samples.reduce((m, s) => Math.max(m, s.comments.length), 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = "ICON LUXURY GROUP";
  const ws = wb.addWorksheet("Comments");

  const header: string[] = ["Sample #", "Style Name"];
  for (let i = 1; i <= maxComments; i++) header.push(`Comment ${i} Image`, `Comment ${i}`);
  ws.addRow(header);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];

  const imageJobs: { rowNumber: number; col: number; url: string }[] = [];

  for (const s of samples) {
    const row: (string | null)[] = [s.sampleNumber, s.styleName ?? ""];
    s.comments.forEach((c) => {
      const who = c.user?.name ?? c.authorLabel ?? "External";
      const when = c.createdAt.toISOString().slice(0, 10);
      row.push("", `${c.body || ""}${c.body ? "\n" : ""}— ${who}, ${when}`);
    });
    const added = ws.addRow(row);
    // Queue each comment's image into its "Comment N Image" column (0-based col
    // index: 2 + i*2 for comment i).
    s.comments.forEach((c, i) => {
      if (c.imageUrl) imageJobs.push({ rowNumber: added.number, col: 2 + i * 2, url: c.imageUrl });
    });
  }

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 26;
  for (let i = 0; i < maxComments; i++) {
    ws.getColumn(3 + i * 2).width = 16; // image
    ws.getColumn(4 + i * 2).width = 44; // text
  }

  const embed = async ({ rowNumber, col, url }: { rowNumber: number; col: number; url: string }) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const ct = res.headers.get("content-type") ?? "";
      const extension = ct.includes("png") ? "png" : ct.includes("gif") ? "gif" : "jpeg";
      const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      const imageId = wb.addImage({ base64, extension });
      if ((ws.getRow(rowNumber).height ?? 0) < 84) ws.getRow(rowNumber).height = 84;
      ws.addImage(imageId, { tl: { col, row: rowNumber - 1 }, ext: { width: 100, height: 100 } });
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
  return new NextResponse(new Uint8Array(Buffer.from(buffer)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sample-comments-${today}.xlsx"`,
    },
  });
}
