import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { FileSpreadsheet } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_TONE = { draft: "secondary", sent: "success", superseded: "outline" } as const;

export default async function OrderFormsPage() {
  const orderForms = await prisma.orderForm.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      factory: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  });

  return (
    <div>
      <PageHeader title="Order Forms" description={`${orderForms.length} order forms.`} />
      {orderForms.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No order forms yet"
          description="Select samples on the Samples page and use 'Create Order Form' to start one."
        />
      ) : (
        <div className="rounded-md border border-[var(--border)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order Form #</TableHead>
                <TableHead>Factory</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderForms.map((of) => (
                <TableRow key={of.id}>
                  <TableCell>
                    <Link href={`/order-forms/${of.id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {of.orderFormNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{of.factory.name}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_TONE[of.status]} className="capitalize">
                      {of.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{of._count.lines}</TableCell>
                  <TableCell>{formatDate(of.sentAt)}</TableCell>
                  <TableCell>{formatDate(of.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
