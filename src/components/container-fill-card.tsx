import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ContainerFill } from "@/lib/container";
import { CBM_40HQ } from "@/lib/container";
import { Container } from "lucide-react";

/** 40' HQ utilization banner for order forms. */
export function ContainerFillCard({ fill }: { fill: ContainerFill }) {
  const pct = Math.min(100, Math.round((fill.totalCbm / CBM_40HQ) * 100 * 100) / 100);
  const tone =
    fill.verdict === "near_full" || fill.verdict === "full_multiple"
      ? "text-[var(--success)]"
      : fill.verdict === "empty"
        ? "text-[var(--muted-foreground)]"
        : "text-[var(--warning)]";
  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <Container className={cn("h-4 w-4", tone)} />
          <span className="label-luxe text-[var(--muted-foreground)]">40&apos; HQ Container Fill</span>
          <span className="ml-auto font-display text-lg tabular-nums">
            {fill.totalCbm.toLocaleString("en-US", { maximumFractionDigits: 2 })} CBM
            <span className="text-sm text-[var(--muted-foreground)]"> · {fill.totalCartons} cartons · {fill.containers40hq}×</span>
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
          <div
            className={cn(
              "h-full rounded-full",
              fill.verdict === "near_full" || fill.verdict === "full_multiple"
                ? "bg-[var(--success)]"
                : "bg-[var(--bronze)]",
            )}
            style={{ width: `${fill.totalCbm === 0 ? 0 : Math.max(3, pct % 100 === 0 && pct > 0 ? 100 : pct > 100 ? ((fill.totalCbm % CBM_40HQ) / CBM_40HQ) * 100 : pct)}%` }}
          />
        </div>
        <p className={cn("text-sm", tone)}>{fill.message}</p>
        {fill.missingDataLines > 0 && fill.totalCbm > 0 && (
          <p className="text-xs text-[var(--muted-foreground)]">
            {fill.missingDataLines} line{fill.missingDataLines > 1 ? "s" : ""} not counted — missing CBM/carton or case pack on the style.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
