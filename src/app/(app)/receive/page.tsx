import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { QuickReceive } from "./quick-receive";
import { IncomingList, type IncomingRow } from "./incoming-list";
import { trackingUrl, carrierLabel } from "@/lib/parcel";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  exception: "Delivery issue",
};

export default async function ReceivePage() {
  await requireUser();

  const incoming = await prisma.sample.findMany({
    where: {
      sampleReceivedDate: null,
      OR: [{ trackingNumber: { not: null } }, { status: { in: ["sample_requested", "eta_set"] } }],
    },
    select: {
      id: true,
      sampleNumber: true,
      styleName: true,
      trackingNumber: true,
      trackingCarrier: true,
      trackingEta: true,
      trackingStatus: true,
    },
    orderBy: [{ trackingEta: { sort: "asc", nulls: "last" } }, { sampleNumber: "asc" }],
    take: 100,
  });

  const rows: IncomingRow[] = incoming.map((s) => ({
    id: s.id,
    sampleNumber: s.sampleNumber,
    styleName: s.styleName,
    trackingNumber: s.trackingNumber,
    trackingUrl: s.trackingNumber ? trackingUrl(s.trackingCarrier, s.trackingNumber) : null,
    carrierLabel: carrierLabel(s.trackingCarrier),
    etaLabel: s.trackingEta
      ? `Expected ${s.trackingEta.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
      : null,
    statusLabel: s.trackingStatus ? (STATUS_LABEL[s.trackingStatus] ?? null) : null,
  }));

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Receive samples"
        description="A box just arrived? Type the sample number and tap once — or tick everything in the box below."
      />
      <QuickReceive />
      <IncomingList rows={rows} />
    </div>
  );
}
