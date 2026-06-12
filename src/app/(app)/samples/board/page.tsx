import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SAMPLE_PIPELINE, SAMPLE_STATUS_LABEL, SAMPLE_STATUS_TONE } from "@/lib/status";
import type { SampleStatus } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { formatDate, isOverdue } from "@/lib/date";
import { Table as TableIcon, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const COLUMNS: SampleStatus[] = [...SAMPLE_PIPELINE, "dropped"];

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
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{s.sampleNumber}</span>
                        {overdue && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> OVERDUE
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {[s.brand, s.category].filter(Boolean).join(" · ") || "—"}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                        <span>{s.factory?.name ?? "—"}</span>
                        <span className="tabular-nums">{formatMoney(s.fobCost, s.currency)}</span>
                      </div>
                      {s.sampleEta && (
                        <div className="mt-1 text-xs text-[var(--muted-foreground)]">ETA {formatDate(s.sampleEta)}</div>
                      )}
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
