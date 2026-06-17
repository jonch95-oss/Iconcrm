import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { PoStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PO_PIPELINE, PO_STATUS_LABEL, poRank } from "@/lib/status";
import { PoControls } from "./po-controls";
import { formatDate, toDateInputValue } from "@/lib/date";
import { ProductionSamples, type ProductionRow } from "./production-samples";
import { PoPnlCard } from "@/components/po-pnl-card";
import { getPoPnl } from "@/lib/pnl";
import { cn } from "@/lib/utils";
import { AttachmentsCard } from "@/components/attachments-card";

export const dynamic = "force-dynamic";

export default async function PoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      issuedBy: { select: { name: true } },
      pi: { select: { id: true, piNumber: true, paymentTerms: true, factory: { select: { id: true, name: true } } } },
      customerPoLinks: { include: { customerPo: true } },
      packingLists: { select: { id: true, shipmentRef: true, receivedAt: true } },
      productionSamples: {
        orderBy: { createdAt: "asc" },
        include: { reviewedBy: { select: { name: true, email: true } } },
      },
      shipments: { select: { id: true, shipmentRef: true, currentEta: true, status: true } },
    },
  });
  if (!po) notFound();

  const pnl = await getPoPnl(id);
  const etaRevisions = await prisma.etaRevision.findMany({
    where: { parentType: "po", parentId: id },
    orderBy: { createdAt: "desc" },
    include: { changedBy: { select: { name: true } } },
  });

  const canEdit = hasRole(user.role, "member");

  const attachments = await prisma.attachment.findMany({
    where: { parentType: "po", parentId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true, blobUrl: true, mimeType: true },
  });
  const currentRank = poRank(po.status);

  const productionRows: ProductionRow[] = po.productionSamples.map((ps) => ({
    id: ps.id,
    stage: ps.stage,
    status: ps.status,
    notes: ps.notes,
    dueDate: ps.dueDate ? formatDate(ps.dueDate) : null,
    reviewedBy: ps.reviewedBy?.name ?? ps.reviewedBy?.email ?? null,
    reviewedAt: ps.reviewedAt ? formatDate(ps.reviewedAt) : null,
  }));

  return (
    <div>
      <PageHeader
        title={po.poNumber}
        description={`Issued by ${po.issuedBy?.name ?? "—"} · ${formatDate(po.issuedAt)}`}
      >
        <PoStatusBadge status={po.status} />
      </PageHeader>

      {/* Production pipeline progress */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-1">
            {PO_PIPELINE.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs",
                  i < currentRank && "border-[var(--success)] bg-[var(--success)]/10",
                  i === currentRank && "border-[var(--primary)] bg-[var(--primary)]/10 font-medium",
                  i > currentRank && "border-dashed text-[var(--muted-foreground)]",
                )}
              >
                {PO_STATUS_LABEL[s]}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="PI" value={<Link href={`/pis/${po.pi.id}`} className="text-[var(--primary)] hover:underline">{po.pi.piNumber}</Link>} />
            <Row label="Factory" value={po.pi.factory ? <Link href={`/factories/${po.pi.factory.id}`} className="text-[var(--primary)] hover:underline">{po.pi.factory.name}</Link> : "—"} />
            <Row label="Payment terms" value={po.pi.paymentTerms ?? "—"} />
            <Row label="Factory ETA" value={formatDate(po.factoryEta)} />
            <Row label="Inspection" value={formatDate(po.inspectionDate)} />
            <Row label="Ship date" value={formatDate(po.shipDate)} />
            <div className="pt-2">
              <div className="text-xs text-[var(--muted-foreground)]">Customer POs</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {po.customerPoLinks.map((l) => (
                  <Link key={l.id} href={`/customer-pos/${l.customerPo.id}`}>
                    <Badge variant="outline">{l.customerPo.customerPoNumber}</Badge>
                  </Link>
                ))}
                {po.customerPoLinks.length === 0 && <span className="text-xs text-[var(--muted-foreground)]">none linked</span>}
              </div>
            </div>
            <div className="pt-2">
              <div className="text-xs text-[var(--muted-foreground)]">Packing lists</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {po.packingLists.map((pl) => (
                  <Link key={pl.id} href={`/packing-lists/${pl.id}`}>
                    <Badge variant="outline">{pl.shipmentRef ?? pl.id.slice(-5)}</Badge>
                  </Link>
                ))}
                {po.packingLists.length === 0 && <span className="text-xs text-[var(--muted-foreground)]">none</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Production controls</CardTitle></CardHeader>
          <CardContent>
            <PoControls
              poId={po.id}
              status={po.status}
              factoryEta={toDateInputValue(po.factoryEta)}
              productionNotes={po.productionNotes ?? ""}
              inspectionDate={toDateInputValue(po.inspectionDate)}
              shipDate={toDateInputValue(po.shipDate)}
              canEdit={canEdit}
            />
            {etaRevisions.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-xs font-medium uppercase text-[var(--muted-foreground)]">ETA revision history</div>
                <ul className="space-y-1 text-sm">
                  {etaRevisions.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded border border-[var(--border)] p-2">
                      <span>
                        {r.oldEta ? <span className="line-through text-[var(--muted-foreground)]">{formatDate(r.oldEta)}</span> : "(none)"} →{" "}
                        <span className="font-medium">{formatDate(r.newEta)}</span>
                        {r.reason && <span className="ml-2 text-xs text-[var(--muted-foreground)]">· {r.reason}</span>}
                      </span>
                      <span className="text-xs text-[var(--muted-foreground)]">{r.changedBy?.name ?? "system"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {pnl && <PoPnlCard pnl={pnl} currency={pnl.currency} />}

      <Card className="mt-4">
        <CardHeader><CardTitle>Production sample approvals (PP / TOP)</CardTitle></CardHeader>
        <CardContent>
          <ProductionSamples poId={po.id} rows={productionRows} canEdit={canEdit} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Shipments</CardTitle></CardHeader>
        <CardContent>
          {po.shipments.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Not on a shipment yet. Link this PO from a shipment&apos;s page to track its
              container ETA against customer PO windows.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {po.shipments.map((sh) => (
                <Link
                  key={sh.id}
                  href={`/shipments/${sh.id}`}
                  className="rounded border border-[var(--border)] px-2 py-1 text-sm text-[var(--primary)] hover:bg-[var(--accent)]"
                >
                  {sh.shipmentRef} · ETA {formatDate(sh.currentEta)}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AttachmentsCard
        parentType="po"
        parentId={po.id}
        attachments={attachments}
        canEdit={canEdit}
        title="PO documents (Excel / PDF)"
      />
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
