import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { computeAllocation, type AllocStatus } from "@/lib/allocation";

export const dynamic = "force-dynamic";

const TONE: Record<AllocStatus, { label: string; variant: "success" | "destructive" | "secondary" | "outline" }> = {
  balanced: { label: "Balanced", variant: "success" },
  open: { label: "Open to sell", variant: "secondary" },
  uncommitted: { label: "Uncommitted", variant: "outline" },
  oversold: { label: "Oversold", variant: "destructive" },
};

export default async function AllocationPage() {
  await requireUser();

  const piLines = await prisma.pILine.findMany({
    where: { sample: { styleNumber: { not: null } } },
    select: { quantity: true, sample: { select: { styleNumber: true } } },
  });
  const custLines = await prisma.customerPoLine
    .findMany({ select: { styleNumber: true, quantity: true } })
    .catch(() => [] as { styleNumber: string; quantity: number }[]);

  const alloc = computeAllocation(
    piLines.map((l) => ({ styleNumber: l.sample?.styleNumber ?? "", quantity: l.quantity })),
    custLines.map((l) => ({ styleNumber: l.styleNumber, quantity: l.quantity })),
  );

  return (
    <div>
      <PageHeader
        title="Allocation"
        description="Units on order from factories vs units committed to customers, by style."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Styles" value={alloc.rows.length} />
        <Stat label="On order" value={alloc.totalOnOrder} />
        <Stat label="Committed" value={alloc.totalCommitted} />
        <Stat label="Oversold styles" value={alloc.oversoldCount} bad={alloc.oversoldCount > 0} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted-foreground)]">
                <th className="pb-2 font-medium">Style</th>
                <th className="pb-2 text-right font-medium">On order</th>
                <th className="pb-2 text-right font-medium">Committed</th>
                <th className="pb-2 text-right font-medium">Free</th>
                <th className="pb-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {alloc.rows.map((r) => {
                const t = TONE[r.status];
                return (
                  <tr key={r.styleNumber} className="border-t border-[var(--border)]">
                    <td className="py-1.5">{r.styleNumber}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.onOrder.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.committed.toLocaleString()}</td>
                    <td className={`py-1.5 text-right tabular-nums ${r.free < 0 ? "text-[var(--destructive)]" : ""}`}>
                      {r.free.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right">
                      <Badge variant={t.variant}>{t.label}</Badge>
                    </td>
                  </tr>
                );
              })}
              {alloc.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-xs text-[var(--muted-foreground)]">
                    No production on order or customer demand yet. Import PI lines and customer PO lines to populate this.
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

function Stat({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
        <div className={`text-2xl font-semibold tabular-nums ${bad ? "text-[var(--destructive)]" : ""}`}>
          {value.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}
