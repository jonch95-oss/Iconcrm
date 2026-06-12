import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { NewShipmentDialog } from "./new-shipment-dialog";
import { ShipmentStatusBadge, RiskBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { worstRisk } from "@/lib/status";
import { Ship } from "lucide-react";

export const dynamic = "force-dynamic";

function SlipBadge({ slip }: { slip: number | null }) {
  if (slip === null || slip === 0) return null;
  const late = slip > 0;
  return (
    <span
      className={`ml-2 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
        late ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
      }`}
      title={`Compared to the original ETA`}
    >
      {late ? `+${slip}d` : `${slip}d`}
    </span>
  );
}

export default async function ShipmentsPage() {
  const user = await requireUser();
  const shipments = await prisma.shipment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      risks: true,
      _count: { select: { packingLists: true, purchaseOrders: true } },
    },
  });
  const canEdit = hasRole(user.role, "member");

  return (
    <div>
      <PageHeader
        title="Shipments"
        description="Every container, with its live ETA against each customer PO's delivery window. Red means it will miss a cancel date."
      >
        {canEdit && <NewShipmentDialog />}
      </PageHeader>
      {shipments.length === 0 ? (
        <EmptyState
          icon={Ship}
          title="No shipments yet"
          description="Add a shipment with its container, BOL, or booking number to start tracking its ETA against your customer PO windows."
        />
      ) : (
        <div className="rounded-md border border-[var(--border)] overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shipment</TableHead>
                <TableHead>Container</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Original ETA</TableHead>
                <TableHead>Current ETA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Window risk</TableHead>
                <TableHead>Linked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.map((s) => {
                const worst = worstRisk(s.risks.map((r) => r.status));
                const slip =
                  s.originalEta && s.currentEta
                    ? Math.round(
                        (s.currentEta.getTime() - s.originalEta.getTime()) / 86400000,
                      )
                    : null;
                const revised =
                  s.originalEta &&
                  s.currentEta &&
                  s.originalEta.getTime() !== s.currentEta.getTime();
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/shipments/${s.id}`}
                        className="font-medium text-[var(--primary)] hover:underline"
                      >
                        {s.shipmentRef}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.containerNumber ?? s.mblNumber ?? s.bookingNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-[var(--muted-foreground)]">
                      {s.pol ?? "?"} → {s.pod ?? "?"}
                    </TableCell>
                    <TableCell className={revised ? "line-through text-[var(--muted-foreground)]" : ""}>
                      {formatDate(s.originalEta)}
                    </TableCell>
                    <TableCell>
                      {formatDate(s.currentEta)}
                      <SlipBadge slip={slip} />
                    </TableCell>
                    <TableCell>
                      <ShipmentStatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>{worst ? <RiskBadge status={worst} /> : <span className="text-[var(--muted-foreground)] text-sm">No customer POs</span>}</TableCell>
                    <TableCell className="text-sm tabular-nums text-[var(--muted-foreground)]">
                      {s._count.packingLists} packing lists · {s._count.purchaseOrders} POs
                    </TableCell>
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
