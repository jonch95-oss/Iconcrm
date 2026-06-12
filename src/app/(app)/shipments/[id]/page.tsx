import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { ShipmentStatusBadge, RiskBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/date";
import { SHIPMENT_PIPELINE, SHIPMENT_STATUS_LABEL } from "@/lib/status";
import { ShipmentEditor } from "./shipment-editor";

export const dynamic = "force-dynamic";

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      risks: { include: { customerPo: true } },
      packingLists: { include: { pi: { select: { piNumber: true, id: true } } } },
      purchaseOrders: { select: { id: true, poNumber: true, status: true } },
    },
  });
  if (!shipment) notFound();

  const [revisions, unlinkedPos, unlinkedPackingLists] = await Promise.all([
    prisma.etaRevision.findMany({
      where: { parentType: "shipment", parentId: id },
      orderBy: { createdAt: "desc" },
      include: { changedBy: { select: { name: true, email: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { shipments: { none: { id } }, status: { notIn: ["delivered"] } },
      select: { id: true, poNumber: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.packingList.findMany({
      where: { shipmentId: null },
      include: { pi: { select: { piNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const canEdit = hasRole(user.role, "member");
  const stageIndex =
    shipment.status === "cancelled" ? -1 : SHIPMENT_PIPELINE.indexOf(shipment.status);
  const revised =
    shipment.originalEta &&
    shipment.currentEta &&
    shipment.originalEta.getTime() !== shipment.currentEta.getTime();

  return (
    <div className="space-y-6">
      <PageHeader
        title={shipment.shipmentRef}
        description={`${shipment.containerNumber ?? shipment.mblNumber ?? shipment.bookingNumber ?? ""} · ${shipment.pol ?? "?"} → ${shipment.pod ?? "?"}${shipment.vesselName ? ` · ${shipment.vesselName}` : ""}`}
      >
        <ShipmentStatusBadge status={shipment.status} />
      </PageHeader>

      {/* Journey progress */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--card)] p-4">
        {SHIPMENT_PIPELINE.map((stage, i) => (
          <div key={stage} className="flex min-w-0 flex-1 items-center gap-1">
            <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
              <div
                className={`h-2.5 w-full rounded-full ${
                  i <= stageIndex ? "bg-[var(--primary)]" : "bg-[var(--muted)]"
                }`}
              />
              <span
                className={`truncate text-xs ${
                  i === stageIndex
                    ? "font-semibold text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)]"
                }`}
              >
                {SHIPMENT_STATUS_LABEL[stage]}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Arrival dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--muted-foreground)]">Original ETA (never changes)</span>
              <span className={revised ? "line-through text-[var(--muted-foreground)]" : "font-medium"}>
                {formatDate(shipment.originalEta)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted-foreground)]">Current ETA</span>
              <span className="font-medium">{formatDate(shipment.currentEta)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted-foreground)]">Actually arrived</span>
              <span>{formatDate(shipment.ata)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted-foreground)]">
                Days from port to customer (buffer)
              </span>
              <span className="tabular-nums">{shipment.inlandBufferDays} days</span>
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-2">
              <span className="text-[var(--muted-foreground)]">Projected at customer DC</span>
              <span className="font-semibold">
                {formatDate(shipment.risks[0]?.projectedDeliveryDate)}
              </span>
            </div>
            {canEdit && (
              <ShipmentEditor
                shipmentId={shipment.id}
                status={shipment.status}
                inlandBufferDays={shipment.inlandBufferDays}
                unlinkedPos={unlinkedPos}
                unlinkedPackingLists={unlinkedPackingLists.map((p) => ({
                  id: p.id,
                  label: `${p.pi.piNumber}${p.shipmentRef ? ` · ${p.shipmentRef}` : ""}`,
                }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer PO windows</CardTitle>
          </CardHeader>
          <CardContent>
            {shipment.risks.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No customer POs are linked yet. Link a PO or packing list below and the window
                check runs automatically.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer PO</TableHead>
                    <TableHead>Window (start – cancel)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipment.risks.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          href={`/customer-pos/${r.customerPoId}`}
                          className="font-medium text-[var(--primary)] hover:underline"
                        >
                          {r.customerPo.customerPoNumber}
                        </Link>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {r.customerPo.customerName}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(r.customerPo.startShipDate)} –{" "}
                        {formatDate(r.customerPo.cancelDate)}
                      </TableCell>
                      <TableCell>
                        <RiskBadge status={r.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linked to this shipment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="mb-1 font-medium">Purchase orders</div>
              {shipment.purchaseOrders.length === 0 ? (
                <p className="text-[var(--muted-foreground)]">None linked.</p>
              ) : (
                shipment.purchaseOrders.map((po) => (
                  <div key={po.id}>
                    <Link href={`/pos/${po.id}`} className="text-[var(--primary)] hover:underline">
                      {po.poNumber}
                    </Link>
                  </div>
                ))
              )}
            </div>
            <div>
              <div className="mb-1 font-medium">Packing lists</div>
              {shipment.packingLists.length === 0 ? (
                <p className="text-[var(--muted-foreground)]">None linked.</p>
              ) : (
                shipment.packingLists.map((pl) => (
                  <div key={pl.id}>
                    <Link
                      href={`/packing-lists/${pl.id}`}
                      className="text-[var(--primary)] hover:underline"
                    >
                      Packing list on PI {pl.pi.piNumber}
                    </Link>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ETA change history</CardTitle>
          </CardHeader>
          <CardContent>
            {revisions.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                The ETA hasn&apos;t changed since this shipment was created.
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                {revisions.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-2 last:border-0">
                    <div>
                      <span className="text-[var(--muted-foreground)]">{formatDate(r.oldEta)}</span>
                      {" → "}
                      <span className="font-medium">{formatDate(r.newEta)}</span>
                      {r.reason && (
                        <div className="text-xs text-[var(--muted-foreground)]">{r.reason}</div>
                      )}
                    </div>
                    <div className="text-right text-xs text-[var(--muted-foreground)]">
                      {formatDateTime(r.createdAt)}
                      <div>{r.changedBy?.name ?? r.changedBy?.email ?? "Tracking"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
