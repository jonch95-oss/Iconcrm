import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OFMatchResult, OFMatchStatus } from "@/lib/match";

const TONE: Record<OFMatchStatus, { label: string; variant: "success" | "destructive" | "secondary" | "outline" }> = {
  matched: { label: "Match", variant: "success" },
  short: { label: "Short", variant: "destructive" },
  over: { label: "Over", variant: "destructive" },
  missing_on_pi: { label: "Missing on PI", variant: "destructive" },
  extra_on_pi: { label: "Not on order form", variant: "outline" },
};

/** Read-only reconciliation of a PI's styles/quantities against its order form. */
export function OrderFormMatchCard({
  orderFormId,
  orderFormNumber,
  match,
}: {
  orderFormId: string;
  orderFormNumber: string;
  match: OFMatchResult;
}) {
  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">
          PI vs Order Form{" "}
          <Link href={`/order-forms/${orderFormId}`} className="text-[var(--primary)] hover:underline">
            {orderFormNumber}
          </Link>
        </CardTitle>
        <Badge variant={match.ok ? "success" : "destructive"}>
          {match.ok ? "All styles match" : `${match.issueCount} to review`}
        </Badge>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted-foreground)]">
              <th className="pb-2 font-medium">Style</th>
              <th className="pb-2 text-right font-medium">Order form</th>
              <th className="pb-2 text-right font-medium">PI</th>
              <th className="pb-2 text-right font-medium">Diff</th>
              <th className="pb-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {match.rows.map((r) => {
              const t = TONE[r.status];
              return (
                <tr key={r.sampleId} className="border-t border-[var(--border)]">
                  <td className="py-1.5">
                    {r.sampleNumber}
                    {r.styleNumber && r.styleNumber !== r.sampleNumber && (
                      <span className="ml-1 text-xs text-[var(--muted-foreground)]">{r.styleNumber}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{r.orderFormQty || "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.piQty || "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.diff > 0 ? `+${r.diff}` : r.diff < 0 ? r.diff : "—"}
                  </td>
                  <td className="py-1.5 text-right">
                    <Badge variant={t.variant}>{t.label}</Badge>
                  </td>
                </tr>
              );
            })}
            {match.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2 text-center text-xs text-[var(--muted-foreground)]">
                  The order form has no lines to compare against.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
