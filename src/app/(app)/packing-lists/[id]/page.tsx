import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MatchStatusBadge } from "@/components/status-badge";
import { PackingEditor, type PackingLineView, type SkuOption } from "./packing-editor";
import { computeThreeWay } from "@/lib/match";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function PackingListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const pl = await prisma.packingList.findUnique({
    where: { id },
    include: {
      lines: { include: { skuVariant: true } },
      pi: {
        include: {
          factory: { select: { name: true } },
          lines: { include: { skuVariant: true, sample: { select: { sampleNumber: true } } } },
          packingLists: { include: { lines: true } },
        },
      },
      po: { select: { id: true, poNumber: true } },
    },
  });
  if (!pl) notFound();

  // Cumulative 3-way match across ALL packing lists on this PI.
  const allPackingLines = pl.pi.packingLists.flatMap((p) => p.lines);
  const result = computeThreeWay(
    pl.pi.lines.map((l) => ({ skuVariantId: l.skuVariantId, quantity: l.quantity })),
    allPackingLines.map((l) => ({ skuVariantId: l.skuVariantId, unitsShipped: l.unitsShipped })),
  );

  // SKU label lookup.
  const skuLabel = new Map<string, string>();
  for (const l of pl.pi.lines) {
    if (l.skuVariant) skuLabel.set(l.skuVariant.id, `${l.sample?.sampleNumber ?? ""} ${l.skuVariant.size}/${l.skuVariant.color}`.trim());
  }
  for (const l of pl.lines) {
    if (l.skuVariant) skuLabel.set(l.skuVariant.id, `${l.skuVariant.size}/${l.skuVariant.color} · ${l.skuVariant.upc}`);
  }

  const progressPct = result.totalPi > 0 ? Math.min(100, Math.round((result.totalShipped / result.totalPi) * 100)) : 0;

  const lines: PackingLineView[] = pl.lines.map((l) => ({
    id: l.id,
    sku: l.skuVariant ? `${l.skuVariant.size}/${l.skuVariant.color}` : "—",
    upc: l.skuVariant?.upc ?? "—",
    cartons: l.cartons,
    unitsShipped: l.unitsShipped,
  }));

  // SKU options for adding lines = all SKUs that appear on the PI.
  const skuOptions: SkuOption[] = pl.pi.lines
    .filter((l) => l.skuVariant)
    .map((l) => ({ id: l.skuVariant!.id, label: `${l.sample?.sampleNumber ?? ""} ${l.skuVariant!.size}/${l.skuVariant!.color} · ${l.skuVariant!.upc}` }));

  const canEdit = hasRole(user.role, "member");

  return (
    <div>
      <PageHeader
        title={pl.shipmentRef ?? `Packing list ${pl.id.slice(-6)}`}
        description={`PI ${pl.pi.piNumber} · ${pl.pi.factory.name}${pl.vesselOrAwb ? ` · ${pl.vesselOrAwb}` : ""}`}
      />

      {/* PI-level progress */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">
              Shipped {result.totalShipped.toLocaleString()} / {result.totalPi.toLocaleString()} units
            </span>
            <span className={result.openLines > 0 ? "text-[var(--warning)]" : "text-[var(--success)]"}>
              {result.openLines} open line{result.openLines === 1 ? "" : "s"}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
            <div
              className="h-full bg-[var(--success)] transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
            Cumulative across {pl.pi.packingLists.length} packing list(s) on this PI · ETA {formatDate(pl.eta)} · received {formatDate(pl.receivedAt)}
            {pl.po && (
              <> · PO <Link href={`/pos/${pl.po.id}`} className="text-[var(--primary)] hover:underline">{pl.po.poNumber}</Link></>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>3-way match (PI-level)</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border border-[var(--border)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>PI qty</TableHead>
                    <TableHead>Shipped</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-[var(--muted-foreground)]">
                        No PI lines to match against.
                      </TableCell>
                    </TableRow>
                  ) : (
                    result.lines.map((l) => (
                      <TableRow key={l.skuVariantId}>
                        <TableCell className="text-xs">{skuLabel.get(l.skuVariantId) ?? l.skuVariantId.slice(-6)}</TableCell>
                        <TableCell className="tabular-nums">{l.piQuantity}</TableCell>
                        <TableCell className="tabular-nums">{l.shippedQuantity}</TableCell>
                        <TableCell className="tabular-nums">
                          {l.status === "short" ? l.remaining : l.status === "over" ? l.remaining : 0}
                        </TableCell>
                        <TableCell><MatchStatusBadge status={l.status} /></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>This packing list&apos;s lines</CardTitle></CardHeader>
          <CardContent>
            <PackingEditor
              packingListId={pl.id}
              piId={pl.piId}
              lines={lines}
              skuOptions={skuOptions}
              canEdit={canEdit}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
