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
      <Card className="h-full p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--bronze)] hover:shadow-sm">
        <div className="label-luxe text-[var(--muted-foreground)]">
          {label}
        </div>
        <div className={cn("font-display mt-1.5 text-[2.1rem] leading-none tabular-nums", toneClass)}>{value}</div>
        {hint && <div className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</div>}
      </Card>
    </Link>
  );
}
