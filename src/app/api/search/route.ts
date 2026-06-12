import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * Global search across sample #, style #, UPC, PI #, PO #, and customer PO #.
 * Returns grouped, link-ready results for the top-nav search bar.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const [samples, skus, pis, pos, customerPos] = await Promise.all([
    prisma.sample.findMany({
      where: {
        OR: [
          { sampleNumber: { contains: q, mode: "insensitive" } },
          { styleNumber: { contains: q, mode: "insensitive" } },
          { styleName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, sampleNumber: true, styleName: true, status: true },
      take: 6,
    }),
    prisma.skuVariant.findMany({
      where: { OR: [{ upc: { contains: q } }, { skuCode: { contains: q, mode: "insensitive" } }] },
      select: { id: true, upc: true, sampleId: true, sample: { select: { sampleNumber: true } } },
      take: 6,
    }),
    prisma.proformaInvoice.findMany({
      where: { piNumber: { contains: q, mode: "insensitive" } },
      select: { id: true, piNumber: true, factory: { select: { name: true } } },
      take: 6,
    }),
    prisma.purchaseOrder.findMany({
      where: { poNumber: { contains: q, mode: "insensitive" } },
      select: { id: true, poNumber: true, status: true },
      take: 6,
    }),
    prisma.customerPO.findMany({
      where: {
        OR: [
          { customerPoNumber: { contains: q, mode: "insensitive" } },
          { customerName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, customerPoNumber: true, customerName: true },
      take: 6,
    }),
  ]);

  const results = [
    ...samples.map((s) => ({
      type: "Sample",
      label: s.sampleNumber,
      sub: s.styleName ?? s.status,
      href: `/samples/${s.id}`,
    })),
    ...skus.map((s) => ({
      type: "UPC",
      label: s.upc,
      sub: s.sample?.sampleNumber ?? "",
      href: `/samples/${s.sampleId}`,
    })),
    ...pis.map((p) => ({
      type: "PI",
      label: p.piNumber,
      sub: p.factory?.name ?? "",
      href: `/pis/${p.id}`,
    })),
    ...pos.map((p) => ({
      type: "PO",
      label: p.poNumber,
      sub: p.status,
      href: `/pos/${p.id}`,
    })),
    ...customerPos.map((c) => ({
      type: "Customer PO",
      label: c.customerPoNumber,
      sub: c.customerName,
      href: `/customer-pos/${c.id}`,
    })),
  ];

  return NextResponse.json({ results });
}
