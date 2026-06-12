import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  href,
  tone = "default",
  hint,
}: {
  label: string;
  value: number | string;
  href: string;
  tone?: "default" | "warning" | "destructive" | "success";
  hint?: string;
}) {
  const toneClass = {
    default: "",
    warning: "text-[var(--warning)]",
    destructive: "text-[var(--destructive)]",
    success: "text-[var(--success)]",
  }[tone];
  return (
    <Link href={href}>
      <Card className="p-4 transition-colors hover:bg-[var(--accent)]">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {label}
        </div>
        <div className={cn("mt-1 text-3xl font-semibold tabular-nums", toneClass)}>{value}</div>
        {hint && <div className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</div>}
      </Card>
    </Link>
  );
}
