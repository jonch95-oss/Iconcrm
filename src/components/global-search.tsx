"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  type: string;
  label: string;
  sub: string;
  href: string;
}

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  React.useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setActive(0);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (r: SearchResult) => {
    setOpen(false);
    setQ("");
    router.push(r.href);
  };

  return (
    <div className="relative w-full max-w-md" ref={ref}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            if (e.key === "Enter" && results[active]) go(results[active]);
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search sample #, style #, UPC, PI #, PO #, customer PO #…"
          className="pl-8"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--muted-foreground)]" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--popover)] shadow-lg max-h-96 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={`${r.href}-${i}`}
              onClick={() => go(r)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                i === active ? "bg-[var(--accent)]" : ""
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className="shrink-0">
                  {r.type}
                </Badge>
                <span className="font-medium truncate">{r.label}</span>
              </span>
              <span className="text-xs text-[var(--muted-foreground)] truncate">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && q.trim().length >= 2 && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--popover)] p-3 text-sm text-[var(--muted-foreground)] shadow-lg">
          No matches for “{q}”.
        </div>
      )}
    </div>
  );
}
