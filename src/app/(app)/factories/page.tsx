import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { NewFactoryDialog } from "./new-factory-dialog";
import { FactoryRowActions } from "./factory-row-actions";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Factory } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FactoriesPage() {
  const factories = await prisma.factory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { samples: true, proformaInvoices: true } } },
  });

  return (
    <div>
      <PageHeader title="Factories" description={`${factories.length} factories.`} >
        <NewFactoryDialog />
      </PageHeader>
      {factories.length === 0 ? (
        <EmptyState icon={Factory} title="No factories" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Samples</TableHead>
                <TableHead>PIs</TableHead>
                <TableHead>Payment terms</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {factories.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <Link href={`/factories/${f.id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {f.name}
                    </Link>
                  </TableCell>
                  <TableCell>{f.country ?? "—"}</TableCell>
                  <TableCell className="text-xs">{f.contactName ?? "—"}{f.contactEmail ? ` · ${f.contactEmail}` : ""}</TableCell>
                  <TableCell className="tabular-nums">{f._count.samples}</TableCell>
                  <TableCell className="tabular-nums">{f._count.proformaInvoices}</TableCell>
                  <TableCell className="text-xs">{f.paymentTermsDefault ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <FactoryRowActions id={f.id} name={f.name} samples={f._count.samples} pis={f._count.proformaInvoices} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
