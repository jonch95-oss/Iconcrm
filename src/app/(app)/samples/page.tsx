import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LayoutGrid } from "lucide-react";
import { SamplesTable, type SampleRow } from "./samples-table";
import { NewSampleDialog } from "./new-sample-dialog";
import { ImportSamplesButton } from "./import-samples-button";
import { FetchEmailedSheetsButton } from "./fetch-emailed-button";
import { requireUser, hasRole } from "@/lib/session";
import { marginPercent } from "@/lib/money";
import { ageInDays, isOverdue } from "@/lib/date";

export const dynamic = "force-dynamic";
// Excel import (parse + compress/upload embedded photos) can take a while;
// give it the full Hobby ceiling instead of the ~10s default.
export const maxDuration = 60;

export default async function SamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ overdue?: string; status?: string; factory?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const [samples, factories, etaCounts] = await Promise.all([
    prisma.sample.findMany({
      orderBy: { requestedAt: "desc" },
      // Newest 2,000 keeps the page fast at high volume; older records remain
      // reachable through global search and direct links.
      take: 2000,
      include: {
        factory: { select: { id: true, name: true } },
        requestedBy: { select: { name: true, email: true } },
        _count: { select: { skuVariants: true } },
      },
    }),
    prisma.factory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.etaRevision.groupBy({
      by: ["parentId"],
      where: { parentType: "sample" },
      _count: { _all: true },
    }),
  ]);
  const etaCountMap = new Map(etaCounts.map((e) => [e.parentId, e._count._all]));

  const rows: SampleRow[] = samples.map((s) => {
    const margin = marginPercent(s.customerSellPrice, s.fobCost);
    return {
      id: s.id,
      sampleNumber: s.sampleNumber,
      imageUrl: s.imageUrl,
      brand: s.brand ?? "",
      category: s.category ?? "",
      styleName: s.styleName ?? "",
      styleNumber: s.styleNumber ?? "",
      status: s.status,
      factoryId: s.factoryId ?? "",
      factoryName: s.factory?.name ?? "",
      sampleEta: s.sampleEta ? s.sampleEta.toISOString() : null,
      etaRevisions: etaCountMap.get(s.id) ?? 0,
      sampleReceivedDate: s.sampleReceivedDate ? s.sampleReceivedDate.toISOString() : null,
      fobCost: s.fobCost ? s.fobCost.toString() : null,
      currency: s.currency,
      customerSellPrice: s.customerSellPrice ? s.customerSellPrice.toString() : null,
      marginPercent: margin ? margin.toFixed(1) : null,
      skuCount: s._count.skuVariants,
      ageDays: ageInDays(s.requestedAt) ?? 0,
      overdue: !s.sampleReceivedDate && isOverdue(s.sampleEta),
      requestedBy: s.requestedBy?.name ?? s.requestedByExternal ?? "—",
    };
  });

  const canEdit = hasRole(user.role, "member");
  const isAdmin = hasRole(user.role, "admin");

  return (
    <div>
      <PageHeader
        title="Samples"
        description={`${rows.length} samples across the pipeline.`}
      >
        <Button asChild variant="outline">
          <Link href="/samples/board"><LayoutGrid className="h-4 w-4" /> Board</Link>
        </Button>
        {canEdit && <FetchEmailedSheetsButton />}
        {canEdit && <ImportSamplesButton />}
        {canEdit && <NewSampleDialog factories={factories} />}
      </PageHeader>
      <SamplesTable
        rows={rows}
        factories={factories}
        canEdit={canEdit}
        isAdmin={isAdmin}
        initialOverdue={sp.overdue === "1"}
        initialStatus={sp.status ?? ""}
        initialFactory={sp.factory ?? ""}
      />
    </div>
  );
}
