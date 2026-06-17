import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeAts } from "@/lib/inventory";
import { ImportInventoryButton } from "./import-inventory-button";
import { AdjustRow } from "./adjust-row";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const user = await requireUser();
  const canEdit = hasRole(user.role, "member");

  const onHandGroups = await prisma.inventoryMovement
    .groupBy({ by: ["skuVariantId"], _sum: { delta: true } })
    .catch(() => [] as { skuVariantId: string; _sum: { delta: number | null } }[]);
  const onHandBySku = new Map<string, number>();
  for (const g of onHandGroups) onHandBySku.set(g.skuVariantId, g._sum.delta ?? 0);

  const skuIds = [...onHandBySku.keys()];
  const skus = skuIds.length
    ? await prisma.skuVariant.findMany({
        where: { id: { in: skuIds } },
        select: { id: true, size: true, color: true, upc: true, sample: { select: { styleNumber: true, sampleNumber: true } } },
      })
    : [];

  const committed = await prisma.customerPoLine
    .groupBy({ by: ["styleNumber"], _sum: { quantity: true } })
    .catch(() => [] as { styleNumber: string; _sum: { quantity: number | null } }[]);

  const onHandByStyle: { styleNumber: string; quantity: number }[] = [];
  for (const s of skus) {
    if (s.sample?.styleNumber) onHandByStyle.push({ styleNumber: s.sample.styleNumber, quantity: onHandBySku.get(s.id) ?? 0 });
  }
  const ats = computeAts(
    onHandByStyle,
    committed.map((c) => ({ styleNumber: c.styleNumber, quantity: c._sum.quantity ?? 0 })),
  );

  const skuRows = skus
    .map((s) => ({
      id: s.id,
      style: s.sample?.styleNumber ?? s.sample?.sampleNumber ?? "—",
      size: s.size,
      color: s.color,
      upc: s.upc,
      onHand: onHandBySku.get(s.id) ?? 0,
    }))
    .sort((a, b) => a.style.localeCompare(b.style) || a.size.localeCompare(b.size));

  return (
    <div>
      <PageHeader title="Inventory" description="On-hand stock by SKU, and available-to-sell by style.">
        {canEdit && <ImportInventoryButton />}
      </PageHeader>

      <Card className="mb-4">
        <CardHeader><CardTitle>Available to sell (by style)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted-foreground)]">
                <th className="pb-2 font-medium">Style</th>
                <th className="pb-2 text-right font-medium">On hand</th>
                <th className="pb-2 text-right font-medium">Committed</th>
                <th className="pb-2 text-right font-medium">ATS</th>
              </tr>
            </thead>
            <tbody>
              {ats.rows.map((r) => (
                <tr key={r.styleNumber} className="border-t border-[var(--border)]">
                  <td className="py-1.5">{r.styleNumber}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.onHand.toLocaleString()}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.committed.toLocaleString()}</td>
                  <td className={`py-1.5 text-right tabular-nums ${r.ats < 0 ? "text-[var(--destructive)]" : ""}`}>
                    {r.ats.toLocaleString()}
                  </td>
                </tr>
              ))}
              {ats.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-xs text-[var(--muted-foreground)]">
                    No stock recorded yet. Use “Import stock count” to load on-hand by UPC or style.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Stock by SKU ({skuRows.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted-foreground)]">
                <th className="pb-2 font-medium">Style</th>
                <th className="pb-2 font-medium">Size</th>
                <th className="pb-2 font-medium">Color</th>
                <th className="pb-2 font-medium">UPC</th>
                <th className="pb-2 text-right font-medium">On hand</th>
                {canEdit && <th className="pb-2 text-right font-medium">Adjust</th>}
              </tr>
            </thead>
            <tbody>
              {skuRows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="py-1.5">{r.style}</td>
                  <td className="py-1.5">{r.size}</td>
                  <td className="py-1.5">{r.color}</td>
                  <td className="py-1.5 tabular-nums">{r.upc}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.onHand.toLocaleString()}</td>
                  {canEdit && (
                    <td className="py-1.5">
                      <AdjustRow skuVariantId={r.id} />
                    </td>
                  )}
                </tr>
              ))}
              {skuRows.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="py-3 text-center text-xs text-[var(--muted-foreground)]">
                    No SKUs with stock yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
