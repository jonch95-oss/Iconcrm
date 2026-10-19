import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/date";
import { canApproveEta } from "@/lib/eta-approval";
import { pendingEtaChanges, decidedEtaChanges, type EtaChangeRow } from "@/lib/eta-changes";
import { DecisionButtons, UndoDecision } from "./decision-buttons";

export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? formatDate(d) : "—");

function ChangeLine({ row }: { row: EtaChangeRow }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/samples/${row.sampleId}`} className="font-mono text-sm hover:underline">
          {row.sampleNumber}
        </Link>
        {row.color && <Badge variant="outline">{row.color}</Badge>}
        {row.styleName && <span className="text-sm text-[var(--muted-foreground)]">{row.styleName}</span>}
      </div>
      <p className="mt-1 text-sm">
        <span className="text-[var(--muted-foreground)] line-through">{day(row.currentEta)}</span>
        <span className="mx-2">→</span>
        <span className="font-medium">{row.proposedEta ? day(row.proposedEta) : "no date"}</span>
      </p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        “{row.reason}” — {row.requestedBy}, {formatDate(row.requestedAt)}
        {row.factory && ` · ${row.factory}`}
      </p>
    </div>
  );
}

export default async function EtaChangesPage() {
  const user = await requireUser();
  const prefs = await prisma.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true } });
  const canApprove = canApproveEta(user, prefs?.notificationPrefs);
  const [pending, decided] = await Promise.all([pendingEtaChanges(), decidedEtaChanges()]);

  return (
    <div>
      <PageHeader
        title="ETA changes"
        description={
          canApprove
            ? `${pending.length} date${pending.length === 1 ? "" : "s"} waiting on you. Nothing moves until you say so.`
            : `${pending.length} date${pending.length === 1 ? "" : "s"} waiting on the owner or Moshe. The samples keep their current dates until then.`
        }
      />

      <Card>
        <CardContent className="pt-6">
          {pending.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No date changes waiting. A designer moving an ETA that&apos;s already set lands here.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {pending.map((row) => (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
                  <ChangeLine row={row} />
                  <DecisionButtons requestId={row.id} canApprove={canApprove} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {decided.length > 0 && (
        <>
          <h2 className="mt-8 mb-2 text-sm font-medium text-[var(--muted-foreground)]">Decided lately</h2>
          <Card>
            <CardContent className="pt-6">
              <ul className="divide-y divide-[var(--border)]">
              {decided.map((row) => (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
                  <ChangeLine row={row} />
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={row.status === "approved" ? "success" : row.status === "rejected" ? "destructive" : "secondary"}
                    >
                      {row.status === "approved"
                        ? `Approved by ${row.decidedBy ?? "—"}`
                        : row.status === "rejected"
                          ? `Rejected by ${row.decidedBy ?? "—"}`
                          : "Withdrawn"}
                    </Badge>
                    {canApprove && row.status !== "withdrawn" && <UndoDecision requestId={row.id} />}
                  </div>
                </li>
              ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
