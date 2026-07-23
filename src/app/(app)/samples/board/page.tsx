import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SAMPLE_PIPELINE, SAMPLE_STATUS_LABEL, SAMPLE_STATUS_TONE } from "@/lib/status";
import type { SampleStatus } from "@prisma/client";
import { formatDate, isOverdue } from "@/lib/date";
import { Table as TableIcon, AlertTriangle, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

const COLUMNS: SampleStatus[] = [...SAMPLE_PIPELINE, "revisions_requested", "on_hold", "dropped"];

export default async function SamplesBoardPage() {
  await requireUser();
  const samples = await prisma.sample.findMany({
    orderBy: { requestedAt: "desc" },
    include: { factory: { select: { name: true } } },
  });

  const grouped = new Map<SampleStatus, typeof samples>();
  for (const c of COLUMNS) grouped.set(c, []);
  for (const s of samples) grouped.get(s.status)?.push(s);

  return (
    <div>
      <PageHeader title="Samples — Kanban" description="Grouped by lifecycle status.">
        <Button asChild variant="outline">
          <Link href="/samples"><TableIcon className="h-4 w-4" /> Table view</Link>
        </Button>
      </PageHeader>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const items = grouped.get(col) ?? [];
          return (
            <div key={col} className="w-72 shrink-0">
              <div className="mb-2 flex items-center justify-between">
                <Badge variant={SAMPLE_STATUS_TONE[col]}>{SAMPLE_STATUS_LABEL[col]}</Badge>
                <span className="text-xs text-[var(--muted-foreground)]">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((s) => {
                  const overdue = !s.sampleReceivedDate && isOverdue(s.sampleEta);
                  return (
                    <Link
                      key={s.id}
                      href={`/samples/${s.id}`}
                      className="block rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-sm shadow-sm transition-colors hover:bg-[var(--accent)]"
                    >
                      {s.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.imageUrl}
                          alt={s.sampleNumber}
                          className="mb-2 h-32 w-full rounded-md border border-[var(--border)] bg-white object-contain"
                        />
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{s.sampleNumber}</span>
                        {overdue && (
                          <Badge variant="destructive" className="gap-1 shrink-0">
                            <AlertTriangle className="h-3 w-3" /> OVERDUE
                          </Badge>
                        )}
                      </div>
                      {s.description && (
                        <div className="line-clamp-2 text-xs text-[var(--muted-foreground)]">{s.description}</div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.brand && <Badge variant="secondary">{s.brand}</Badge>}
                        {s.category && <Badge variant="outline">{s.category}</Badge>}
                        {s.color && <Badge variant="outline">{s.color}</Badge>}
                        {s.season && <Badge variant="outline">{s.season}</Badge>}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Req {formatDate(s.requestedAt)}
                        </span>
                        {s.sampleEta && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> ETA {formatDate(s.sampleEta)}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
                {items.length === 0 && (
                  <div className="rounded-md border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--muted-foreground)]">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
