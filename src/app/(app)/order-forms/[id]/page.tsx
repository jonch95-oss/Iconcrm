import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { ContainerFillCard } from "@/components/container-fill-card";
import { computeContainerFill } from "@/lib/container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { OrderFormBuilder, type BuilderLine } from "./builder";
import { getOrderFormBlockers } from "../actions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/date";

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
  }));

  return (
    <div>
      <PageHeader
        title={of.orderFormNumber}
        description={`${of.factory?.name ?? "No factory"} · created by ${of.createdBy?.name ?? "—"} · ${formatDate(of.createdAt)}`}
      >
        <Badge variant={STATUS_TONE[of.status]} className="capitalize">{of.status}</Badge>
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
    </div>
  );
}
