"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RECAP_RANGES, recapFiltersToQuery, type RecapFilters } from "@/lib/revisions";

/** Filter bar for the recap. Pushes the filters into the URL so the page (and
 *  the export and email, which read the same params) stay in step. */
export function RecapFilterBar({
  filters,
  factories,
  brands,
  people,
}: {
  filters: RecapFilters;
  factories: { id: string; name: string }[];
  brands: string[];
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  const go = (next: Partial<RecapFilters>) => {
    const qs = recapFiltersToQuery({ ...filters, ...next });
    router.push(`/revisions${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.factoryId || "all"} onValueChange={(v) => go({ factoryId: v === "all" ? "" : v })}>
        <SelectTrigger className="h-9 w-48"><SelectValue placeholder="All factories" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All factories</SelectItem>
          {factories.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.brand || "all"} onValueChange={(v) => go({ brand: v === "all" ? "" : v })}>
        <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All brands" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All brands</SelectItem>
          {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={String(filters.days)} onValueChange={(v) => go({ days: Number(v) })}>
        <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          {RECAP_RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={filters.assignee || "all"}
        onValueChange={(v) => go({ assignee: v === "all" ? "" : v })}
      >
        <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Anyone" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Assigned to anyone</SelectItem>
          <SelectItem value="me">Assigned to me</SelectItem>
          {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Button
        variant={filters.newOnly ? "default" : "outline"}
        size="sm"
        onClick={() => go({ newOnly: !filters.newOnly })}
      >
        New only
      </Button>
      <Button
        variant={filters.openOnly ? "default" : "outline"}
        size="sm"
        onClick={() => go({ openOnly: !filters.openOnly })}
      >
        Open revisions only
      </Button>
      <Button
        variant={filters.showDismissed ? "default" : "outline"}
        size="sm"
        onClick={() => go({ showDismissed: !filters.showDismissed })}
      >
        Show dismissed
      </Button>
    </div>
  );
}
