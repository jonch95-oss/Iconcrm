import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { ContainerFillCard } from "@/components/container-fill-card";
import { computeContainerFill } from "@/lib/container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderFormUploader, DeleteFileButton, OrderFormNoteForm } from "./order-form-activity";
import { OrderFormBuilder, type BuilderLine } from "./builder";
import { DeleteOrderFormButton } from "./delete-order-form-button";
import { getOrderFormBlockers } from "../actions";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/date";

export const dynamic = "force-dynamic";

const STATUS_TONE = { draft: "secondary", sent: "success", superseded: "outline" } as const;

export default async function OrderFormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const of = await prisma.orderForm.findUnique({
    where: { id },
    include: {
      factory: true,
      createdBy: { select: { name: true } },
      lines: { include: { sample: true, skuVariant: true }, orderBy: { createdAt: "asc" } },
      proformaInvoices: { select: { id: true, piNumber: true, status: true } },
    },
  });
  if (!of) notFound();

  const containerFill = computeContainerFill(
    of.lines.map((l) => ({
      quantity: l.quantity,
      unitsPerCarton: l.skuVariant?.unitsPerCarton ?? null,
      casePackDefault: l.sample.casePackDefault,
      cbmPerCarton: l.sample.cbmPerCarton,
    })),
  );

  const blockers = await getOrderFormBlockers(id);
  const canEdit = hasRole(user.role, "member");

  const [files, history] = await Promise.all([
    prisma.attachment.findMany({ where: { parentType: "order_form", parentId: id }, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({
      where: { entityType: "order_form", entityId: id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  const j = (x: unknown) => (x ?? {}) as Record<string, unknown>;
  const describe = (a: (typeof history)[number]): string => {
    const who = a.user?.name ?? a.actorLabel ?? "Someone";
    const b = j(a.before), af = j(a.after);
    switch (a.action) {
      case "line_qty_changed": return `${who} changed ${b.line} quantity ${b.qty} \u2192 ${af.qty}`;
      case "line_removed": return `${who} removed ${b.line} (qty ${b.qty})`;
      case "file_uploaded": return `${who} uploaded ${af.filename} (v${af.version})`;
      case "file_removed": return `${who} removed file ${b.filename}`;
      case "note": return `${who}: ${af.note}`;
      case "sent": return `${who} marked the order form sent`;
      case "status_changed": return `${who} changed status to ${af.status ?? "—"}`;
      case "created": return `${who} created the order form`;
      case "missing_info_requested": return `${who} requested missing info`;
      default: return `${who} — ${a.action.replace(/_/g, " ")}`;
    }
  };

  const lines: BuilderLine[] = of.lines.map((l) => ({
    id: l.id,
    sampleId: l.sampleId,
    sampleNumber: l.sample.sampleNumber,
    styleNumber: l.sample.styleNumber,
    styleName: l.sample.styleName ?? l.sample.sampleNumber,
    size: l.skuVariant?.size ?? null,
    color: l.skuVariant?.color ?? null,
    upc: l.skuVariant?.upc ?? null,
    quantity: l.quantity,
    fob: formatMoney(l.fobCostSnapshot, l.currency),
    cbm: l.sample.cbmPerCarton != null ? String(l.sample.cbmPerCarton) : null,
    casePack: l.skuVariant?.unitsPerCarton ?? l.sample.casePackDefault ?? null,
  }));

  return (
    <div>
      <PageHeader
        title={of.orderFormNumber}
        description={`${of.factory?.name ?? "No factory"} · created by ${of.createdBy?.name ?? "—"} · ${formatDate(of.createdAt)}`}
      >
        <Badge variant={STATUS_TONE[of.status]} className="capitalize">{of.status}</Badge>
        {canEdit && <DeleteOrderFormButton orderFormId={of.id} orderFormNumber={of.orderFormNumber} />}
      </PageHeader>

      <ContainerFillCard fill={containerFill} />

      {of.proformaInvoices.length > 0 && (
        <Card className="mb-4">
          <CardContent className="flex items-center gap-2 pt-6 text-sm">
            <span className="text-[var(--muted-foreground)]">Linked PIs:</span>
            {of.proformaInvoices.map((pi) => (
              <Link key={pi.id} href={`/pis/${pi.id}`} className="text-[var(--primary)] hover:underline">
                {pi.piNumber}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <OrderFormBuilder
        orderFormId={of.id}
        status={of.status}
        lines={lines}
        blockers={blockers}
        canEdit={canEdit}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Order form documents</CardTitle>
            {canEdit && <OrderFormUploader orderFormId={of.id} />}
          </CardHeader>
          <CardContent className="space-y-2">
            {files.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">No documents uploaded yet.</p>
            ) : (
              [...files].reverse().map((f, idx) => {
                const version = files.length - idx; // asc order assigns v1..vN
                return (
                  <div key={f.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <a href={f.blobUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--primary)] hover:underline">
                        {f.filename}
                      </a>
                      <div className="text-xs text-[var(--muted-foreground)]">v{version} · {formatDateTime(f.createdAt)}</div>
                    </div>
                    {canEdit && <DeleteFileButton attachmentId={f.id} orderFormId={of.id} />}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Change history</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {canEdit && <OrderFormNoteForm orderFormId={of.id} />}
            <ol className="space-y-2">
              {history.length === 0 ? (
                <li className="text-sm text-[var(--muted-foreground)]">No changes recorded yet.</li>
              ) : (
                history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-3 border-b border-[var(--border)] pb-2 text-sm last:border-0">
                    <span className="whitespace-pre-wrap">{describe(h)}</span>
                    <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{formatDateTime(h.createdAt)}</span>
                  </li>
                ))
              )}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
