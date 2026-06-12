import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardMetrics } from "@/lib/metrics";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/date";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const metrics = await dashboardMetrics();
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
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
      </div>

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
