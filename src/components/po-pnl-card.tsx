import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatPercent } from "@/lib/money";
import type { PoPnl } from "@/lib/pnl";

const SEGMENTS = [
  { key: "fob", label: "Factory (FOB)", color: "hsl(202 64% 27%)" },
  { key: "duty", label: "Duty", color: "hsl(202 45% 45%)" },
  { key: "freight", label: "Freight", color: "hsl(202 30% 62%)" },
  { key: "inland", label: "Inland", color: "hsl(202 20% 76%)" },
] as const;

/** PO-level profit & loss: revenue minus the full landed cost stack. */
export function PoPnlCard({ pnl, currency }: { pnl: PoPnl; currency: string }) {
  const revenue = Number(pnl.revenue);
  const profit = Number(pnl.profit);
  const base = Math.max(revenue, Number(pnl.landed)) || 1;
  const pct = (v: unknown) => `${Math.max(0, (Number(v) / base) * 100)}%`;
  const profitable = profit >= 0;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Profit &amp; loss</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Headline label="Revenue" value={formatMoney(pnl.revenue, currency)} />
          <Headline label="Landed cost" value={formatMoney(pnl.landed, currency)} />
          <Headline
            label="Profit"
            value={formatMoney(pnl.profit, currency)}
            tone={profitable ? "good" : "bad"}
          />
          <Headline
            label="Margin"
            value={pnl.marginPct ? formatPercent(pnl.marginPct) : "—"}
            tone={pnl.marginPct === null ? undefined : profitable ? "good" : "bad"}
          />
        </div>

        {/* Waterfall: cost stack vs revenue line */}
        <div className="space-y-1.5">
          <div className="flex h-7 w-full overflow-hidden rounded-md bg-[var(--muted)]">
            {SEGMENTS.map((seg) => (
              <div
                key={seg.key}
                style={{ width: pct(pnl[seg.key]), backgroundColor: seg.color }}
                title={`${seg.label}: ${formatMoney(pnl[seg.key], currency)}`}
              />
            ))}
            {profitable && (
              <div
                style={{ width: pct(pnl.profit), backgroundColor: "var(--success)" }}
                title={`Profit: ${formatMoney(pnl.profit, currency)}`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
            {SEGMENTS.map((seg) => (
              <span key={seg.key} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: seg.color }}
                />
                {seg.label} {formatMoney(pnl[seg.key], currency)}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: profitable ? "var(--success)" : "var(--destructive)" }}
              />
              Profit {formatMoney(pnl.profit, currency)}
            </span>
          </div>
        </div>

        {/* Data-completeness caveats, in plain English */}
        {(pnl.linesMissingSell > 0 || pnl.linesMissingLanded > 0) && (
          <p className="rounded-md bg-[var(--warning)]/10 px-3 py-2 text-xs text-[var(--warning)]">
            This is an estimate:{" "}
            {pnl.linesMissingSell > 0 &&
              `${pnl.linesMissingSell} style${pnl.linesMissingSell > 1 ? "s" : ""} missing a customer sell price`}
            {pnl.linesMissingSell > 0 && pnl.linesMissingLanded > 0 && " and "}
            {pnl.linesMissingLanded > 0 &&
              `${pnl.linesMissingLanded} missing duty/freight inputs`}
            . Add them on the sample page to sharpen these numbers.
          </p>
        )}

        {/* Per-style breakdown */}
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Style</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Landed</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pnl.lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>
                    {l.sampleId ? (
                      <Link
                        href={`/samples/${l.sampleId}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        {l.label}
                      </Link>
                    ) : (
                      l.label
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.units}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(l.landed, currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.missingSell ? (
                      <span className="text-[var(--warning)]">no sell price</span>
                    ) : (
                      formatMoney(l.revenue, currency)
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-medium ${
                      l.missingSell
                        ? "text-[var(--muted-foreground)]"
                        : Number(l.profit) >= 0
                          ? "text-[var(--success)]"
                          : "text-[var(--destructive)]"
                    }`}
                  >
                    {l.missingSell ? "—" : formatMoney(l.profit, currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.marginPct ? formatPercent(l.marginPct) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Headline({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </div>
      <div
        className={`font-display mt-0.5 text-xl font-semibold tabular-nums ${
          tone === "good"
            ? "text-[var(--success)]"
            : tone === "bad"
              ? "text-[var(--destructive)]"
              : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
