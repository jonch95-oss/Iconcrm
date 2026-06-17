import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { PiStatusBadge } from "@/components/status-badge";
import { ImportPiLinesButton } from "./import-pi-lines-button";
import { PiDetail, type PiLineView, type PiSampleOption } from "./pi-detail";
import { summarizeFob, compareToOrderForm } from "@/lib/match";
import { OrderFormMatchCard } from "./order-form-match";
import { AttachmentsCard } from "@/components/attachments-card";
import { formatMoney } from "@/lib/money";
import { formatDate, toDateInputValue } from "@/lib/date";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function PiDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const pi = await prisma.proformaInvoice.findUnique({
    where: { id },
    include: {
      factory: true,
      orderForm: {
        select: {
          id: true,
          orderFormNumber: true,
          lines: {
            select: {
              quantity: true,
              fobCostSnapshot: true,
              sample: { select: { id: true, sampleNumber: true, styleNumber: true } },
            },
          },
        },
      },
      purchaseOrders: { select: { id: true, poNumber: true } },
      lines: {
        include: { sample: { select: { id: true, sampleNumber: true, imageUrl: true, styleNumber: true } }, skuVariant: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!pi) notFound();

  // Samples available to add as lines: prefer those on the linked order form,
  // else all samples for this factory.
  const factorySamples = await prisma.sample.findMany({
    where: pi.factoryId ? { factoryId: pi.factoryId } : {},
    include: { skuVariants: true },
    orderBy: { sampleNumber: "asc" },
  });

  const attachments = await prisma.attachment.findMany({
    where: { parentType: "pi", parentId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true, blobUrl: true, mimeType: true },
  });

  const summary = summarizeFob(pi.lines.map((l) => ({ quantity: l.quantity, variance: l.variance })));

  const ofMatch = pi.orderForm
    ? compareToOrderForm(
        pi.orderForm.lines.map((l) => ({
          sampleId: l.sample.id,
          sampleNumber: l.sample.sampleNumber,
          styleNumber: l.sample.styleNumber,
          quantity: l.quantity,
          unitPrice: l.fobCostSnapshot != null ? Number(l.fobCostSnapshot) : null,
        })),
        pi.lines.map((l) => ({
          sampleId: l.sample?.id ?? null,
          sampleNumber: l.sample?.sampleNumber ?? "—",
          styleNumber: l.sample?.styleNumber ?? null,
          quantity: l.quantity,
          unitPrice: l.unitPrice != null ? Number(l.unitPrice) : null,
        })),
      )
    : null;

  const lines: PiLineView[] = pi.lines.map((l) => ({
    id: l.id,
    sampleNumber: l.sample?.sampleNumber ?? "—",
    sampleId: l.sample?.id ?? null,
    imageUrl: l.sample?.imageUrl ?? null,
    sku: l.skuVariant ? `${l.skuVariant.size}/${l.skuVariant.color}` : null,
    quantity: l.quantity,
    unitPrice: formatMoney(l.unitPrice, pi.currency),
    fob: formatMoney(l.fobSnapshot, pi.currency),
    variance: l.variance ? formatMoney(l.variance, pi.currency) : null,
    variancePercent: l.variancePercent ? l.variancePercent.toFixed(1) : null,
    isMatch: l.variance ? l.variance.isZero() : false,
    hasFob: l.fobSnapshot !== null,
    resolution: l.resolution,
  }));

  const samples: PiSampleOption[] = factorySamples.map((s) => ({
    id: s.id,
    sampleNumber: s.sampleNumber,
    skus: s.skuVariants.map((v) => ({ id: v.id, label: `${v.size}/${v.color} · ${v.upc}` })),
  }));

  const canEdit = hasRole(user.role, "member");

  return (
    <div>
      <PageHeader
        title={`PI ${pi.piNumber}`}
        description={`${pi.factory?.name ?? "No factory"} · ${formatDate(pi.piDate)}`}
      >
        {canEdit && <ImportPiLinesButton piId={pi.id} />}
        <PiStatusBadge status={pi.status} />
      </PageHeader>

      {pi.orderForm && (
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          From order form{" "}
          <Link href={`/order-forms/${pi.orderForm.id}`} className="text-[var(--primary)] hover:underline">
            {pi.orderForm.orderFormNumber}
          </Link>
          {pi.purchaseOrders.length > 0 && (
            <>
              {" · PO "}
              {pi.purchaseOrders.map((po) => (
                <Link key={po.id} href={`/pos/${po.id}`} className="text-[var(--primary)] hover:underline">
                  {po.poNumber}
                </Link>
              ))}
            </>
          )}
        </p>
      )}

      {pi.orderForm && ofMatch && (
        <OrderFormMatchCard
          orderFormId={pi.orderForm.id}
          orderFormNumber={pi.orderForm.orderFormNumber}
          match={ofMatch}
        />
      )}

      <PiDetail
        piId={pi.id}
        hasPO={pi.purchaseOrders.length > 0}
        lines={lines}
        summary={{
          total: summary.totalLines,
          matched: summary.matchedLines,
          varianceCount: summary.varianceLines,
          varianceTotal: formatMoney(summary.varianceTotal, pi.currency),
        }}
        samples={samples}
        payment={{
          paymentTerms: pi.paymentTerms ?? "",
          depositPercent: pi.depositPercent?.toString() ?? "",
          depositPaidDate: toDateInputValue(pi.depositPaidDate),
          balancePaidDate: toDateInputValue(pi.balancePaidDate),
          status: pi.status,
        }}
        canEdit={canEdit}
      />

      <AttachmentsCard
        parentType="pi"
        parentId={pi.id}
        attachments={attachments}
        canEdit={canEdit}
        title="PI documents (Excel / PDF)"
      />
    </div>
  );
}
