import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { NewPackingDialog } from "./new-packing-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { Boxes } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PackingListsPage() {
  const user = await requireUser();
  const [lists, pis] = await Promise.all([
    prisma.packingList.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        pi: { select: { id: true, piNumber: true, factory: { select: { name: true } } } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.proformaInvoice.findMany({
      orderBy: { createdAt: "desc" },
      include: { factory: { select: { name: true } }, purchaseOrders: { select: { id: true, poNumber: true } } },
    }),
  ]);
  const canEdit = hasRole(user.role, "member");

  const piOptions = pis.map((p) => ({
    id: p.id,
    label: `${p.piNumber} · ${p.factory.name}`,
    pos: p.purchaseOrders,
  }));

  return (
    <div>
      <PageHeader title="Packing Lists" description={`${lists.length} packing lists.`}>
        {canEdit && <NewPackingDialog pis={piOptions} />}
      </PageHeader>
      {lists.length === 0 ? (
        <EmptyState icon={Boxes} title="No packing lists" description="Create a packing list against a PI and enter shipped lines to run the 3-way match." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shipment</TableHead>
                <TableHead>PI</TableHead>
                <TableHead>Factory</TableHead>
                <TableHead>Vessel / AWB</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((pl) => (
                <TableRow key={pl.id}>
                  <TableCell>
                    <Link href={`/packing-lists/${pl.id}`} className="font-medium text-[var(--primary)] hover:underline">
                      {pl.shipmentRef ?? pl.id.slice(-6)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/pis/${pl.pi.id}`} className="text-[var(--primary)] hover:underline">
                      {pl.pi.piNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{pl.pi.factory.name}</TableCell>
                  <TableCell className="text-xs">{pl.vesselOrAwb ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{pl._count.lines}</TableCell>
                  <TableCell>{formatDate(pl.eta)}</TableCell>
                  <TableCell>{formatDate(pl.receivedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
