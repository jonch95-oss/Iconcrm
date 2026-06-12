import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PoStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, isOverdue } from "@/lib/date";
import { formatPercent } from "@/lib/money";
import { computePoPnl } from "@/lib/pnl";
import { ClipboardList, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const [pos, etaCounts] = await Promise.all([
    prisma.purchaseOrder.findMany({
      orderBy: { issuedAt: "desc" },
      include: {
        pi: {
          select: {
            id: true,
            piNumber: true,
            factory: { select: { name: true } },
            lines: {
              select: {
                quantity: true,
                unitPrice: true,
                sample: {
                  select: {
                    id: true,
                    styleNumber: true,
                    styleName: true,
                    sampleNumber: true,
                    currency: true,
                    dutyRatePercent: true,
                    freightPerUnit: true,
                    inlandPerUnit: true,
                    customerSellPrice: true,
                  },
                },
              },
            },
          },
        },
        customerPoLinks: { include: { customerPo: { select: { id: true, customerPoNumber: true } } } },
      },
    }),
    prisma.etaRevision.groupBy({
      by: ["parentId"],
      where: { parentType: "po" },
      _count: { _all: true },
    }),
  ]);
  const etaCountMap = new Map(etaCounts.map((e) => [e.parentId, e._count._all]));
  const marginMap = new Map(
    pos.map((po) => {
      if (po.pi.lines.length === 0) return [po.id, null] as const;
      const pnl = computePoPnl(po.pi.lines);
      return [po.id, pnl.marginPct] as const;
    }),
  );

  return (
    <div>
      <PageHeader title="Purchase Orders" description={`${pos.length} POs.`} />
      {pos.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No purchase orders" description="Issue a PO from a PI detail page." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Production status</TableHead>
                <TableHead>PI</TableHead>
                <TableHead>Factory</TableHead>
                <TableHead>Factory ETA</TableHead>
                <TableHead>Customer POs</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead>Issued</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pos.map((po) => {
                const overdue = po.status !== "delivered" && po.status !== "shipped" && isOverdue(po.factoryEta);
                const revs = etaCountMap.get(po.id) ?? 0;
                return (
                  <TableRow key={po.id}>
                    <TableCell>
                      <Link href={`/pos/${po.id}`} className="font-medium text-[var(--primary)] hover:underline">
                        {po.poNumber}
                      </Link>
                    </TableCell>
                    <TableCell><PoStatusBadge status={po.status} /></TableCell>
                    <TableCell>
                      <Link href={`/pis/${po.pi.id}`} className="text-[var(--primary)] hover:underline">
                        {po.pi.piNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{po.pi.factory.name}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        {formatDate(po.factoryEta)}
                        {revs > 0 && <Badge variant="outline" className="text-[10px]">×{revs}</Badge>}
                        {overdue && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> OVERDUE
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {po.customerPoLinks.map((l) => (
                          <Link key={l.id} href={`/customer-pos/${l.customerPo.id}`} className="text-xs text-[var(--primary)] hover:underline">
                            {l.customerPo.customerPoNumber}
                          </Link>
                        ))}
                        {po.customerPoLinks.length === 0 && <span className="text-xs text-[var(--muted-foreground)]">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(() => {
                        const m = marginMap.get(po.id);
                        if (!m) return <span className="text-[var(--muted-foreground)]">—</span>;
                        const bad = Number(m) < 0;
                        return (
                          <span className={bad ? "font-medium text-[var(--destructive)]" : "font-medium text-[var(--success)]"}>
                            {formatPercent(m)}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>{formatDate(po.issuedAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
