import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { NewCpoDialog } from "./new-cpo-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CustomerPosPage() {
  const user = await requireUser();
  const cpos = await prisma.customerPO.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { links: true } } },
  });
  const canEdit = hasRole(user.role, "member");

  return (
    <div>
      <PageHeader title="Customer POs" description={`${cpos.length} customer POs. Use the top search to trace a customer PO to its internal POs, PIs, and samples.`}>
        {canEdit && <NewCpoDialog />}
      </PageHeader>
      {cpos.length === 0 ? (
        <EmptyState icon={Building2} title="No customer POs" description="Add a customer PO and link it to one or more internal POs." />
      ) : (
        <div className="rounded-md border border-[var(--border)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer PO #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total value</TableHead>
                <TableHead>Linked POs</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cpos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/customer-pos/${c.id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {c.customerPoNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{c.customerName}</TableCell>
                  <TableCell className="tabular-nums">{formatMoney(c.totalValue, c.currency)}</TableCell>
                  <TableCell className="tabular-nums">{c._count.links}</TableCell>
                  <TableCell>{formatDate(c.receivedDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
