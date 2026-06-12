import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardMetrics } from "@/lib/metrics";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { RiskBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const metrics = await dashboardMetrics();
  const windowRisks = await prisma.shipmentRisk.findMany({
    where: { status: { in: ["late_for_window", "at_risk", "early_for_window"] } },
    include: {
      customerPo: { select: { customerPoNumber: true, customerName: true, cancelDate: true } },
      shipment: { select: { id: true, shipmentRef: true } },
    },
    orderBy: { projectedDeliveryDate: "asc" },
    take: 8,
  });
  const activity = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    include: { user: { select: { name: true, email: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Wholesale production pipeline at a glance."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Open samples" value={metrics.openSamples} href="/samples" />
        <StatCard
          label="Overdue ETAs"
          value={metrics.overdueSamples}
          href="/samples?overdue=1"
          tone={metrics.overdueSamples > 0 ? "destructive" : "default"}
        />
        <StatCard
          label="PIs awaiting review"
          value={metrics.pisAwaiting}
          href="/pis?status=under_review"
          tone={metrics.pisAwaiting > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Unresolved variances"
          value={metrics.unresolvedVariances}
          href="/pis?variances=1"
          tone={metrics.unresolvedVariances > 0 ? "destructive" : "default"}
        />
        <StatCard label="POs in production" value={metrics.posInProduction} href="/pos" />
        <StatCard
          label="Unmatched packing"
          value={metrics.unmatchedPacking}
          href="/packing-lists"
          tone={metrics.unmatchedPacking > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Shipments late"
          value={metrics.shipmentsLate}
          href="/shipments"
          tone={metrics.shipmentsLate > 0 ? "destructive" : "default"}
        />
        <StatCard
          label="Shipments at risk"
          value={metrics.shipmentsAtRisk}
          href="/shipments"
          tone={metrics.shipmentsAtRisk > 0 ? "warning" : "default"}
        />
      </div>

      {windowRisks.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Customer PO windows at risk</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {windowRisks.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <RiskBadge status={r.status} />
                    <span className="font-medium">{r.customerPo.customerPoNumber}</span>
                    <span className="truncate text-[var(--muted-foreground)]">
                      {r.customerPo.customerName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                    <span>
                      Arrives {formatDate(r.projectedDeliveryDate)} · cancel{" "}
                      {formatDate(r.customerPo.cancelDate)}
                    </span>
                    <Link
                      href={`/shipments/${r.shipment.id}`}
                      className="text-[var(--primary)] hover:underline"
                    >
                      {r.shipment.shipmentRef}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {a.action.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-[var(--muted-foreground)] truncate">
                      {a.entityType} · {a.user?.name ?? a.actorLabel ?? "system"}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                    {formatDateTime(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
