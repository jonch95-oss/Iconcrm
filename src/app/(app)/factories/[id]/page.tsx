import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SampleStatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { factoryEtaSlipStats, factoryAvgFobVariance } from "@/lib/eta";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function FactoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser();

  const factory = await prisma.factory.findUnique({
    where: { id },
    include: {
      samples: { orderBy: { requestedAt: "desc" }, take: 50 },
      proformaInvoices: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { lines: true, purchaseOrders: true } } },
      },
    },
  });
  if (!factory) notFound();

  const [slip, avgVariance] = await Promise.all([
    factoryEtaSlipStats(id),
    factoryAvgFobVariance(id),
  ]);

  // On-time performance proxy: records without slips / records with revisions.
  const onTimePct =
    slip.recordsWithRevisions > 0
      ? Math.round(((slip.recordsWithRevisions - Math.min(slip.recordsWithRevisions, slip.totalRevisions)) / slip.recordsWithRevisions) * 100)
      : 100;

  return (
    <div>
      <PageHeader
        title={factory.name}
        description={[factory.country, factory.contactName, factory.contactEmail].filter(Boolean).join(" · ")}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Samples" value={factory.samples.length} href={`/samples?factory=${id}`} />
        <StatCard label="PIs" value={factory.proformaInvoices.length} href="/pis" />
        <StatCard
          label="ETA revisions"
          value={slip.totalRevisions}
          href={`/factories/${id}`}
          tone={slip.totalRevisions > 0 ? "warning" : "default"}
          hint={slip.averageSlipDays !== null ? `avg slip ${slip.averageSlipDays}d` : undefined}
        />
        <StatCard
          label="Avg FOB variance"
          value={avgVariance ? formatMoney(avgVariance) : "—"}
          href="/pis?variances=1"
          tone={avgVariance && !avgVariance.isZero() ? "destructive" : "default"}
        />
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle>Performance</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-xs text-[var(--muted-foreground)]">On-time ETA performance</div>
              <div className="text-2xl font-semibold tabular-nums">{onTimePct}%</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)]">Records with ETA slips</div>
              <div className="text-2xl font-semibold tabular-nums">{slip.recordsWithRevisions}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)]">Total days slipped</div>
              <div className="text-2xl font-semibold tabular-nums">{slip.daysSlippedTotal}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)]">Payment terms</div>
              <div className="text-sm">{factory.paymentTermsDefault ?? "—"}</div>
            </div>
          </div>
          {factory.notes && <p className="mt-3 text-[var(--muted-foreground)]">{factory.notes}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Samples</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border border-[var(--border)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sample #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>FOB</TableHead>
                    <TableHead>ETA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {factory.samples.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link href={`/samples/${s.id}`} className="text-[var(--primary)] hover:underline">{s.sampleNumber}</Link>
                      </TableCell>
                      <TableCell><SampleStatusBadge status={s.status} /></TableCell>
                      <TableCell className="tabular-nums">{formatMoney(s.fobCost, s.currency)}</TableCell>
                      <TableCell>{formatDate(s.sampleEta)}</TableCell>
                    </TableRow>
                  ))}
                  {factory.samples.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-[var(--muted-foreground)]">No samples.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Proforma invoices</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border border-[var(--border)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PI #</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead>POs</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {factory.proformaInvoices.map((pi) => (
                    <TableRow key={pi.id}>
                      <TableCell>
                        <Link href={`/pis/${pi.id}`} className="text-[var(--primary)] hover:underline">{pi.piNumber}</Link>
                      </TableCell>
                      <TableCell className="tabular-nums">{pi._count.lines}</TableCell>
                      <TableCell className="tabular-nums">{pi._count.purchaseOrders}</TableCell>
                      <TableCell>{formatDate(pi.piDate)}</TableCell>
                    </TableRow>
                  ))}
                  {factory.proformaInvoices.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-[var(--muted-foreground)]">No PIs.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
