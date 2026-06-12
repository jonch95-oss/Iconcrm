import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChainNode {
  label: string;
  sublabel?: string;
  href?: string;
  state: "done" | "current" | "pending";
}

/** Horizontal pipeline graphic of the linked sample → ... → packing list chain. */
export function PipelineChain({ nodes }: { nodes: ChainNode[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1 overflow-x-auto">
      {nodes.map((n, i) => {
        const body = (
          <div
            className={cn(
              "flex flex-col rounded-md border px-3 py-1.5 text-xs",
              n.state === "done" && "border-[var(--success)] bg-[var(--success)]/10",
              n.state === "current" && "border-[var(--primary)] bg-[var(--primary)]/10 font-medium",
              n.state === "pending" && "border-dashed border-[var(--border)] text-[var(--muted-foreground)]",
            )}
          >
            <span>{n.label}</span>
            {n.sublabel && <span className="text-[10px] opacity-70">{n.sublabel}</span>}
          </div>
        );
        return (
          <div key={i} className="flex items-center gap-1">
            {n.href ? <Link href={n.href}>{body}</Link> : body}
            {i < nodes.length - 1 && (
              <ChevronRight className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
            )}
          </div>
        );
      })}
    </div>
  );
}
