"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceiveSamplesDialog } from "@/app/(app)/samples/receive-samples-dialog";
import { ExternalLink } from "lucide-react";

export interface IncomingRow {
  id: string;
  sampleNumber: string;
  styleName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrierLabel: string;
  etaLabel: string | null; // "Expected Wed, Jun 17"
  statusLabel: string | null;
}

/** Samples on their way in — tick the ones in the box, receive them all at once. */
export function IncomingList({ rows, rooms }: { rows: IncomingRow[]; rooms: string[] }) {
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  const ids = Object.keys(checked).filter((k) => checked[k]);
  const selected = rows
    .filter((r) => checked[r.id])
    .map((r) => ({ id: r.id, sampleNumber: r.sampleNumber, styleName: r.styleName ?? "" }));

  if (rows.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">On the way ({rows.length})</CardTitle>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const all: Record<string, boolean> = {};
              for (const r of rows) all[r.id] = true;
              setChecked(ids.length === rows.length ? {} : all);
            }}
          >
            {ids.length === rows.length ? "Clear" : "Select all"}
          </Button>
          <ReceiveSamplesDialog
            selected={selected}
            rooms={rooms}
            disabled={!ids.length}
            label={`Receive ${ids.length || ""}`.trim()}
            onDone={() => setChecked({})}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-1 p-3 pt-0">
        {rows.map((r) => (
          <label
            key={r.id}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent p-2 hover:border-[var(--border)] hover:bg-[var(--accent)]"
          >
            <input
              type="checkbox"
              checked={!!checked[r.id]}
              onChange={(e) => setChecked((c) => ({ ...c, [r.id]: e.target.checked }))}
              className="h-5 w-5 accent-[var(--foreground)]"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <Link href={`/samples/${r.id}`} className="font-medium hover:underline">
                  {r.sampleNumber}
                </Link>
                {r.statusLabel && (
                  <Badge variant="outline" className="text-[10px]">{r.statusLabel}</Badge>
                )}
              </span>
              <span className="block truncate text-xs text-[var(--muted-foreground)]">
                {r.styleName ?? ""}
                {r.trackingNumber && (
                  <>
                    {r.styleName ? " · " : ""}
                    {r.carrierLabel} {r.trackingNumber}
                  </>
                )}
              </span>
            </span>
            <span className="shrink-0 text-right">
              {r.etaLabel && <span className="block text-sm font-medium">{r.etaLabel}</span>}
              {r.trackingUrl && (
                <a
                  href={r.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  Track <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
