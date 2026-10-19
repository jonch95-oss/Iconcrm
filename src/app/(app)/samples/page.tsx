import { prisma } from "@/lib/db";
import { canApproveEta } from "@/lib/eta-approval";
import { SHIP_SHEET_URL_VAR } from "@/lib/ship-sync";
import { pendingEtaBySample } from "@/lib/eta-changes";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Boxes } from "lucide-react";
import { SamplesTable, type SampleRow } from "./samples-table";
import { NewSampleDialog } from "./new-sample-dialog";
import { ImportSamplesButton } from "./import-samples-button";
import { PriceListDialog } from "./price-list-dialog";
import { ShipSheetDialog } from "./ship-sheet-dialog";
import { FetchEmailedSheetsButton } from "./fetch-emailed-button";
import { requireUser, hasRole } from "@/lib/session";
import { marginPercent } from "@/lib/money";
import { ageInDays } from "@/lib/date";
import { variantSampleStatus, isSampleOverdue, type BadgeTone } from "@/lib/status";
import { getSettings } from "@/lib/settings";
import { sampleFiltersFromQuery } from "@/lib/sample-filters";

export const dynamic = "force-dynamic";
// Excel import (parse + compress/upload embedded photos) can take a while;
// give it the full Hobby ceiling instead of the ~10s default.
export const maxDuration = 60;

export default async function SamplesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const settings = await getSettings();

  const [samples, factories, etaCounts] = await Promise.all([
    prisma.sample.findMany({
      orderBy: { requestedAt: "desc" },
      // Newest 2,000 keeps the page fast at high volume; older records remain
      // reachable through global search and direct links.
      take: 2000,
      include: {
        factory: { select: { id: true, name: true } },
        requestedBy: { select: { name: true, email: true } },
        _count: { select: { skuVariants: true, comments: true } },
        skuVariants: { orderBy: [{ color: "asc" }], select: { id: true, color: true, skuCode: true, sampleEta: true, received: true, revisionsRequestedAt: true } },
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
  // Dates someone has asked to move: the list marks those rather than showing
  // the old date as though nothing had been asked.
  const etaPending = await pendingEtaBySample(samples.map((s) => s.id));

  const rows: SampleRow[] = samples.map((s) => {
    const margin = marginPercent(s.customerSellPrice, s.fobCost);
    return {
      id: s.id,
      sampleNumber: s.sampleNumber,
      imageUrl: s.imageUrl,
      brand: s.brand ?? "",
      color: s.color ?? "",
      material: s.material ?? "",
      category: s.category ?? "",
      season: s.season ?? "",
      styleName: s.styleName ?? "",
      styleNumber: s.styleNumber ?? "",
      status: s.status,
      factoryId: s.factoryId ?? "",
      factoryName: s.factory?.name ?? "",
      sampleEta: s.sampleEta ? s.sampleEta.toISOString() : null,
      shippedDate: s.shippedDate ? s.shippedDate.toISOString() : null,
      trackingNumber: s.trackingNumber,
      etaPending: etaPending.get(s.id)
        ? {
            proposedEta: etaPending.get(s.id)!.proposedEta?.toISOString().slice(0, 10) ?? null,
            requestedBy: etaPending.get(s.id)!.requestedBy,
          }
        : null,
      etaRevisions: etaCountMap.get(s.id) ?? 0,
      sampleReceivedDate: s.sampleReceivedDate ? s.sampleReceivedDate.toISOString() : null,
      sampleRoom: s.sampleRoom ?? "",
      fobCost: s.fobCost ? s.fobCost.toString() : null,
      currency: s.currency,
      customerSellPrice: s.customerSellPrice ? s.customerSellPrice.toString() : null,
      marginPercent: margin ? margin.toFixed(1) : null,
      skuCount: s._count.skuVariants,
      commentCount: s._count.comments,
      variants: s.skuVariants.map((v) => {
        const vs = variantSampleStatus({ received: v.received, revisionsRequestedAt: v.revisionsRequestedAt, sampleEta: v.sampleEta });
        return {
          id: v.id,
          color: v.color ?? "",
          skuCode: v.skuCode ?? "",
          sampleEta: v.sampleEta ? v.sampleEta.toISOString().slice(0, 10) : "",
          received: v.received,
          revisionsRequested: !!v.revisionsRequestedAt,
          statusLabel: vs.label,
          statusTone: vs.tone,
        };
      }),
      ageDays: ageInDays(s.requestedAt) ?? 0,
      overdue: isSampleOverdue(s),
      requestedBy: s.requestedBy?.name ?? s.requestedByExternal ?? "—",
    };
  });

  const canEdit = hasRole(user.role, "member");
  // Whether this viewer's ETA edits land, or go to the owner and Moshe first.
  const prefs = await prisma.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true } });
  const viewerApprovesEta = canApproveEta(user, prefs?.notificationPrefs);
  // Whether the factory's sheet can be read without someone uploading a copy.
  const shipSheetReady = Boolean(process.env[SHIP_SHEET_URL_VAR]);
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
        {isAdmin && (
          <Button asChild variant="outline">
            <Link href="/samples/groups"><Boxes className="h-4 w-4" /> Suggested groups</Link>
          </Button>
        )}
        {canEdit && <FetchEmailedSheetsButton />}
        {canEdit && <ImportSamplesButton />}
        {canEdit && <PriceListDialog />}
        {canEdit && <ShipSheetDialog oneDriveReady={shipSheetReady} />}
        {canEdit && <NewSampleDialog factories={factories} brands={settings.brands} />}
      </PageHeader>
      <SamplesTable
        rows={rows}
        factories={factories}
        brands={settings.brands}
        canEdit={canEdit}
        canApproveEta={viewerApprovesEta}
        isAdmin={isAdmin}
        initialFilters={sampleFiltersFromQuery(sp)}
      />
    </div>
  );
}
