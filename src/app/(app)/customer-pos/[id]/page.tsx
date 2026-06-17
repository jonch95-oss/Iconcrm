import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkManager, type LinkRow, type PoOption } from "./link-manager";
import { formatMoney } from "@/lib/money";
import { landedCost } from "@/lib/landed";
import { formatDate } from "@/lib/date";
import { RiskBadge } from "@/components/status-badge";
import { WindowEditor } from "./window-editor";
import { ImportCustomerPoLinesButton } from "./import-cpo-lines-button";
import { Badge } from "@/components/ui/badge";
import { compareCustomerPoToPo, type StyleMatchStatus } from "@/lib/match";

export const dynamic = "force-dynamic";

const STYLE_TONE: Record<StyleMatchStatus, { label: string; variant: "success" | "destructive" | "secondary" | "outline" }> = {
  matched: { label: "Match", variant: "success" },
  short: { label: "Short", variant: "destructive" },
  over: { label: "Over", variant: "destructive" },
  missing_on_po: { label: "Not in our PO", variant: "destructive" },
  extra_on_po: { label: "Extra in our PO", variant: "outline" },
};

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
                  lines: { select: { quantity: true, sample: { select: { id: true, sampleNumber: true, styleNumber: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!cpo) notFound();

  // Customer PO line items (style # + qty). Defensive: the table is created by
  // the schema self-heal on deploy; tolerate its brief absence.
  const cpoLines = await prisma.customerPoLine
    .findMany({ where: { customerPoId: id }, orderBy: { styleNumber: "asc" } })
    .catch(() => [] as { id: string; styleNumber: string; description: string | null; color: string | null; size: string | null; quantity: number; unitPrice: import("@prisma/client").Prisma.Decimal | null }[]);

  // What our linked internal PO(s) actually ordered, by style number.
  const ourPoStyleLines: { styleNumber: string; quantity: number }[] = [];
  for (const l of cpo.links) {
    for (const line of l.purchaseOrder.pi.lines) {
      if (line.sample?.styleNumber) ourPoStyleLines.push({ styleNumber: line.sample.styleNumber, quantity: line.quantity });
    }
  }
  const styleMatch = compareCustomerPoToPo(
    cpoLines.map((l) => ({ styleNumber: l.styleNumber, quantity: l.quantity })),
    ourPoStyleLines,
  );

  // Profitability: customer revenue (their unit price) vs our landed cost.
  const styleStrings = [...new Set(cpoLines.map((l) => l.styleNumber.trim()))];
  const samplesForStyles = styleStrings.length
    ? await prisma.sample.findMany({
        where: { styleNumber: { in: styleStrings } },
        select: { styleNumber: true, fobCost: true, dutyRatePercent: true, freightPerUnit: true, inlandPerUnit: true, currency: true },
      })
    : [];
  const sampleByStyle = new Map<string, (typeof samplesForStyles)[number]>();
  for (const sm of samplesForStyles) if (sm.styleNumber) sampleByStyle.set(sm.styleNumber.trim().toUpperCase(), sm);

  let revenue = 0;
  let cost = 0;
  let costComplete = cpoLines.length > 0;
  let currencyMismatch = false;
  for (const l of cpoLines) {
    if (l.unitPrice != null) revenue += Number(l.unitPrice) * l.quantity;
    else costComplete = false;
    const sm = sampleByStyle.get(l.styleNumber.trim().toUpperCase());
    if (!sm) { costComplete = false; continue; }
    if (sm.currency !== cpo.currency) { currencyMismatch = true; costComplete = false; continue; }
    const landed = landedCost(sm);
    if (landed == null) { costComplete = false; continue; }
    cost += Number(landed) * l.quantity;
  }
  const grossMargin = revenue - cost;
  const marginPct = revenue > 0 ? (grossMargin / revenue) * 100 : null;

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
      <PageHeader title={cpo.customerPoNumber} description={cpo.customerName}>
        {canEdit && <ImportCustomerPoLinesButton customerPoId={cpo.id} />}
      </PageHeader>

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

      {cpoLines.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Profitability</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Revenue (customer price)" value={formatMoney(revenue, cpo.currency)} />
            <Row label="Landed cost" value={formatMoney(cost, cpo.currency)} />
            <Row label="Gross margin" value={formatMoney(grossMargin, cpo.currency)} />
            <Row label="Margin %" value={marginPct != null ? `${marginPct.toFixed(1)}%` : "—"} />
            {(!costComplete || currencyMismatch) && (
              <p className="text-xs text-[var(--muted-foreground)]">
                {currencyMismatch ? "Some styles are costed in a different currency (no FX applied), so margin is approximate. " : ""}
                {!costComplete ? "Some styles are missing a landed cost or customer price — margin may understate true profit." : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {cpoLines.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>Customer PO vs our PO ({styleMatch.rows.length} styles)</CardTitle>
            <Badge variant={cpo.links.length === 0 ? "secondary" : styleMatch.ok ? "success" : "destructive"}>
              {cpo.links.length === 0 ? "Link a PO to compare" : styleMatch.ok ? "All styles match" : `${styleMatch.issueCount} to review`}
            </Badge>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted-foreground)]">
                  <th className="pb-2 font-medium">Style</th>
                  <th className="pb-2 text-right font-medium">Customer</th>
                  <th className="pb-2 text-right font-medium">Our PO</th>
                  <th className="pb-2 text-right font-medium">Diff</th>
                  <th className="pb-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {styleMatch.rows.map((r) => {
                  const t = STYLE_TONE[r.status];
                  return (
                    <tr key={r.styleNumber} className="border-t border-[var(--border)]">
                      <td className="py-1.5">{r.styleNumber}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.customerQty || "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.poQty || "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.diff > 0 ? `+${r.diff}` : r.diff < 0 ? r.diff : "—"}
                      </td>
                      <td className="py-1.5 text-right"><Badge variant={t.variant}>{t.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {cpoLines.length === 0 && canEdit && (
        <Card className="mt-4">
          <CardContent className="pt-6 text-sm text-[var(--muted-foreground)]">
            No customer PO lines yet. Use “Import customer PO” above to upload the style/quantity sheet, then link your internal PO to match.
          </CardContent>
        </Card>
      )}

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
