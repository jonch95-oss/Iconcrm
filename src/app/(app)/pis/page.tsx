import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PiStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { NewPiDialog } from "./new-pi-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { ReceiptText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PisPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; variances?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const pis = await prisma.proformaInvoice.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      factory: { select: { name: true } },
      lines: { select: { variance: true, resolution: true } },
      _count: { select: { lines: true, purchaseOrders: true } },
    },
  });

  let rows = pis.map((pi) => {
    const variances = pi.lines.filter((l) => l.variance && !l.variance.isZero());
    const unresolved = variances.filter((l) => l.resolution === "pending").length;
    return { pi, varianceCount: variances.length, unresolved };
  });
  if (sp.status) rows = rows.filter((r) => r.pi.status === sp.status);
  if (sp.variances === "1") rows = rows.filter((r) => r.unresolved > 0);

  const [factories, orderForms] = await Promise.all([
    prisma.factory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.orderForm.findMany({ select: { id: true, orderFormNumber: true, factoryId: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const canEdit = hasRole(user.role, "member");

  return (
    <div>
      <PageHeader title="Proforma Invoices" description={`${rows.length} PIs.`}>
        {canEdit && <NewPiDialog factories={factories} orderForms={orderForms} />}
      </PageHeader>
      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No proforma invoices" description="Create a PI to enter factory lines and run the FOB match engine." />
      ) : (
        <div className="rounded-md border border-[var(--border)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PI #</TableHead>
                <TableHead>Factory</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Variances</TableHead>
                <TableHead>POs</TableHead>
                <TableHead>PI date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ pi, varianceCount, unresolved }) => (
                <TableRow key={pi.id}>
                  <TableCell>
                    <Link href={`/pis/${pi.id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {pi.piNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{pi.factory.name}</TableCell>
                  <TableCell><PiStatusBadge status={pi.status} /></TableCell>
                  <TableCell className="tabular-nums">{pi._count.lines}</TableCell>
                  <TableCell>
                    {varianceCount === 0 ? (
                      <Badge variant="success">match</Badge>
                    ) : (
                      <Badge variant={unresolved > 0 ? "destructive" : "secondary"}>
                        {unresolved > 0 ? `${unresolved} open` : `${varianceCount} resolved`}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{pi._count.purchaseOrders}</TableCell>
                  <TableCell>{formatDate(pi.piDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
