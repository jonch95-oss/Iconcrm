import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date";
import { getSettings } from "@/lib/settings";
import {
  RECAP_ENTRY_LABEL,
  getRevisionRecap,
  recapFiltersFromQuery,
  recapFiltersToQuery,
  recapSubject,
  type RecapEntryKind,
  type RecapFactory,
} from "@/lib/revisions";
import { RecapFilterBar } from "./recap-filters";
import { RecapActions } from "./recap-actions";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ENTRY_TONE: Record<RecapEntryKind, "warning" | "secondary" | "outline" | "success"> = {
  revision: "warning",
  comment: "secondary",
  eta: "outline",
  version: "success",
};

/** The plain-text recap behind the "Copy text" button — paste-ready for email. */
function recapText(f: RecapFactory, since: Date | null): string {
  const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
  const lines = [
    `Sample revisions & comments — ${f.name}${since ? ` (since ${day(since)})` : ""}`,
    `${f.samples.length} styles · ${f.openRevisions} awaiting a revised sample`,
    "",
  ];
  for (const s of f.samples) {
    lines.push(
      `${s.sampleNumber}${s.styleName ? ` · ${s.styleName}` : ""}${s.color ? ` · ${s.color}` : ""}` +
        ` — ${s.statusLabel}${s.open ? ` · AWAITING REVISED SAMPLE${s.openDays != null ? ` (${s.openDays}d)` : ""}` : ""}` +
        ` · ETA ${day(s.sampleEta)}`,
    );
    if (s.entries.length === 0) lines.push("  - Flagged for revision — no note recorded.");
    for (const e of s.entries)
      lines.push(`  - ${day(e.at)} ${RECAP_ENTRY_LABEL[e.kind]}${e.color ? ` (${e.color})` : ""}: ${e.body}`);
    lines.push("");
  }
  return lines.join("\n");
}

export default async function RevisionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const sp = await searchParams;
  const filters = recapFiltersFromQuery(sp);
  const query = recapFiltersToQuery(filters);

  const [recap, factories, settings] = await Promise.all([
    getRevisionRecap(filters),
    prisma.factory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(),
  ]);

  return (
    <div>
      <PageHeader
        title="Revisions & Comments"
        description="Everything said about your samples, grouped by factory — pull it as a recap and send it on."
      >
        <Button variant="outline" asChild>
          <a href={`/api/revisions/export${query ? `?${query}` : ""}`}>
            <Download className="h-4 w-4" /> Export all
          </a>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Awaiting revised samples" value={recap.totals.openRevisions} tone={recap.totals.openRevisions > 0 ? "warning" : "default"} />
        <Tile label="Styles with activity" value={recap.totals.samples} />
        <Tile label="Notes in range" value={recap.totals.entries} />
        <Tile
          label="Longest wait"
          value={recap.totals.oldestOpenDays == null ? "—" : `${recap.totals.oldestOpenDays}d`}
          tone={(recap.totals.oldestOpenDays ?? 0) > 42 ? "destructive" : "default"}
        />
      </div>

      <div className="mt-4">
        <RecapFilterBar filters={filters} factories={factories} brands={settings.brands} />
      </div>

      {recap.factories.length === 0 && (
        <Card className="mt-4">
          <CardContent className="py-10 text-center text-[var(--muted-foreground)]">
            Nothing in this range. Widen the date range, or clear the filters.
          </CardContent>
        </Card>
      )}

      {recap.factories.map((f) => (
        <Card key={f.id ?? "none"} className="mt-4">
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
              <div>
                <h2 className="font-display text-lg leading-tight">{f.name}</h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {f.samples.length} style{f.samples.length === 1 ? "" : "s"} · {f.entryCount} note
                  {f.entryCount === 1 ? "" : "s"}
                  {f.openRevisions > 0 ? ` · ${f.openRevisions} awaiting a revised sample` : ""}
                  {f.contactEmail ? ` · ${f.contactEmail}` : ""}
                </p>
              </div>
              <RecapActions
                factoryId={f.id}
                factoryName={f.name}
                contactEmail={f.contactEmail}
                contactName={f.contactName}
                query={query}
                text={recapText(f, recap.since)}
                subject={recapSubject(f.samples.length, recap.since)}
              />
            </div>

            <div className="divide-y divide-[var(--border)]">
              {f.samples.map((s) => (
                <div key={s.id} className="flex gap-3 py-3">
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.imageUrl}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded border border-[var(--border)] bg-white object-contain"
                    />
                  ) : (
                    <span className="h-16 w-16 shrink-0 rounded border border-dashed border-[var(--border)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/samples/${s.id}?tab=comments`} className="font-medium text-[var(--primary)] hover:underline">
                        {s.sampleNumber}
                      </Link>
                      {s.styleName && <span className="text-sm text-[var(--muted-foreground)]">{s.styleName}</span>}
                      <Badge variant={s.open ? "warning" : "secondary"}>
                        {s.open ? `Awaiting revised sample${s.openDays != null ? ` · ${s.openDays}d` : ""}` : s.statusLabel}
                      </Badge>
                      {s.openColors.length > 0 && (
                        <span className="text-xs text-[var(--muted-foreground)]">colors: {s.openColors.join(", ")}</span>
                      )}
                      <span className="text-xs text-[var(--muted-foreground)]">ETA {formatDate(s.sampleEta)}</span>
                    </div>

                    {s.entries.length === 0 && (
                      <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
                        Flagged for revision — no note recorded.
                      </p>
                    )}
                    <ul className="mt-1.5 space-y-1.5">
                      {s.entries.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-start gap-2 text-sm">
                          <Badge variant={ENTRY_TONE[e.kind]} className="mt-0.5 shrink-0">
                            {RECAP_ENTRY_LABEL[e.kind]}
                          </Badge>
                          {e.color && <span className="text-xs text-[var(--muted-foreground)]">{e.color}</span>}
                          <span className="min-w-0 flex-1">{e.body}</span>
                          {e.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.imageUrl} alt="" className="h-10 w-10 rounded border border-[var(--border)] bg-white object-contain" />
                          )}
                          <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                            {formatDate(e.at)} · {e.author}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning" | "destructive";
}) {
  const toneClass = { default: "", warning: "text-[var(--warning)]", destructive: "text-[var(--destructive)]" }[tone];
  return (
    <Card className="h-full p-4">
      <div className="label-luxe text-[var(--muted-foreground)]">{label}</div>
      <div className={`font-display mt-1.5 text-[2.1rem] leading-none tabular-nums ${toneClass}`}>{value}</div>
    </Card>
  );
}
