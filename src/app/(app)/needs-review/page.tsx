import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ReviewCard, type ReviewEmail } from "./review-card";
import { formatDateTime } from "@/lib/date";
import { Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NeedsReviewPage() {
  await requireUser();
  const [emails, samples] = await Promise.all([
    prisma.inboundEmail.findMany({
      where: { parseStatus: "needs_review" },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.sample.findMany({ select: { id: true, sampleNumber: true }, orderBy: { sampleNumber: "asc" } }),
  ]);

  const rows: ReviewEmail[] = emails.map((e) => ({
    id: e.id,
    from: e.fromEmail,
    subject: e.subject ?? "",
    body: e.bodyText ?? "",
    receivedAt: formatDateTime(e.receivedAt),
    notes: e.parseNotes,
  }));

  return (
    <div>
      <PageHeader
        title="Needs Review"
        description="Inbound emails that failed to parse cleanly. Create or merge each one."
      />
      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title="Inbox zero" description="No emails awaiting review." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((e) => (
            <ReviewCard key={e.id} email={e} samples={samples} />
          ))}
        </div>
      )}
    </div>
  );
}
