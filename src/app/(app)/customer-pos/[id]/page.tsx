import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkManager, type LinkRow, type PoOption } from "./link-manager";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { RiskBadge } from "@/components/status-badge";
import { WindowEditor } from "./window-editor";

export const dynamic = "force-dynamic";

export default async function CustomerPoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const cpo = await prisma.customerPO.findUnique({
    where: { id },
    include: {
      shipmentRisks: { include: { shipment: { select: { id: true, shipmentRef: true, currentEta: true } } } },
      links: {
        include: {
          purchaseOrder: {
            include: {
              pi: {
                select: {
                  piNumber: true,
                  factory: { select: { name: true } },
                  lines: { select: { sample: { select: { id: true, sampleNumber: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!cpo) notFound();

  const allPos = await prisma.purchaseOrder.findMany({
    include: { pi: { select: { piNumber: true, factory: { select: { name: true } } } } },
    orderBy: { issuedAt: "desc" },
  });

  const canEdit = hasRole(user.role, "member");

  const links: LinkRow[] = cpo.links.map((l) => ({
    linkId: l.id,
    poId: l.purchaseOrderId,
    poNumber: l.purchaseOrder.poNumber,
    piNumber: l.purchaseOrder.pi.piNumber,
    factoryName: l.purchaseOrder.pi.factory?.name ?? "—",
    note: l.note,
  }));

  const poOptions: PoOption[] = allPos.map((p) => ({
    id: p.id,
    poNumber: p.poNumber,
    piNumber: p.pi.piNumber,
    factoryName: p.pi.factory?.name ?? "—",
  }));

  // Originating samples across all linked POs.
  const sampleMap = new Map<string, string>();
  for (const l of cpo.links) {
    for (const line of l.purchaseOrder.pi.lines) {
      if (line.sample) sampleMap.set(line.sample.id, line.sample.sampleNumber);
    }
  }

  return (
    <div>
      <PageHeader title={cpo.customerPoNumber} description={cpo.customerName} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Customer" value={cpo.customerName} />
            <Row label="Total value" value={formatMoney(cpo.totalValue, cpo.currency)} />
            <Row label="Received" value={formatDate(cpo.receivedDate)} />
            <Row label="Created" value={formatDate(cpo.createdAt)} />
            <Row label="Deliver to" value={cpo.deliveryLocation ?? "—"} />
            <Row label="Window start" value={formatDate(cpo.startShipDate)} />
            <Row label="Cancel date" value={formatDate(cpo.cancelDate)} />
            {canEdit && (
              <WindowEditor
                customerPoId={cpo.id}
                startShipDate={cpo.startShipDate?.toISOString().slice(0, 10) ?? ""}
                cancelDate={cpo.cancelDate?.toISOString().slice(0, 10) ?? ""}
                deliveryLocation={cpo.deliveryLocation ?? ""}
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Shipments carrying this PO</CardTitle></CardHeader>
          <CardContent>
            {cpo.shipmentRisks.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No shipments are linked yet. When a shipment carrying this PO is tracked, its
                arrival is checked against the window above automatically.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {cpo.shipmentRisks.map((r) => (
                  <Link
                    key={r.id}
                    href={`/shipments/${r.shipment.id}`}
                    className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--accent)]"
                  >
                    <span className="font-medium text-[var(--primary)]">{r.shipment.shipmentRef}</span>
                    <span className="text-[var(--muted-foreground)]">
                      arrives {formatDate(r.projectedDeliveryDate)}
                    </span>
                    <RiskBadge status={r.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Linked internal POs</CardTitle></CardHeader>
          <CardContent>
            <LinkManager customerPoId={cpo.id} links={links} poOptions={poOptions} canEdit={canEdit} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Originating samples ({sampleMap.size})</CardTitle></CardHeader>
        <CardContent>
          {sampleMap.size === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Link internal POs to trace originating samples.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {[...sampleMap.entries()].map(([sid, num]) => (
                <Link key={sid} href={`/samples/${sid}`} className="rounded border border-[var(--border)] px-2 py-1 text-sm text-[var(--primary)] hover:bg-[var(--accent)]">
                  {num}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
