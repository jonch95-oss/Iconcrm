"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boxes, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { groupSamplesIntoMaster, updateSampleColor, updateSampleMaterial, deleteSample } from "../actions";
import type { GroupCluster } from "@/lib/grouping";
import { SAMPLE_STATUS_LABEL } from "@/lib/status";
import type { SampleStatus } from "@prisma/client";
import { toast } from "sonner";

export function GroupSuggestions({ clusters }: { clusters: GroupCluster[] }) {
  const [done, setDone] = React.useState<Set<string>>(new Set());
  const visible = clusters.filter((c) => !done.has(c.base));
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted-foreground)]">
        {visible.length} candidate {visible.length === 1 ? "family" : "families"} found by matching look-alike sample
        numbers. Review each, adjust the master number or unpick any that don&apos;t belong, then group.
        Grouping merges the selected samples into one master with a color SKU each and removes the originals.
      </p>
      {visible.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">Nothing left to group.</p>
      )}
      {visible.map((c) => (
        <ClusterCard key={c.base} cluster={c} onDone={() => setDone((d) => new Set(d).add(c.base))} />
      ))}
    </div>
  );
}

function ClusterCard({ cluster, onDone }: { cluster: GroupCluster; onDone: () => void }) {
  const router = useRouter();
  const [master, setMaster] = React.useState(cluster.suggestedMaster);
  const [members, setMembers] = React.useState(cluster.members);
  const [picked, setPicked] = React.useState<Set<string>>(new Set(cluster.members.map((m) => m.id)));
  const [pending, start] = React.useTransition();

  // Live duplicate-color detection over the picked members.
  const dupColors = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      if (!picked.has(m.id)) continue;
      const c = (m.color || "").trim().toUpperCase();
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  }, [members, picked]);

  const setColor = (id: string, color: string) => {
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, color } : m)));
  };
  const saveColor = (id: string, color: string) => {
    start(async () => {
      const res = await updateSampleColor(id, color);
      if (!res.ok) toast.error(res.error);
    });
  };
  const setMaterial = (id: string, material: string) => {
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, material } : m)));
  };
  const saveMaterial = (id: string, material: string) => {
    start(async () => {
      const res = await updateSampleMaterial(id, material);
      if (!res.ok) toast.error(res.error);
      else router.refresh(); // material change may re-split/merge the group
    });
  };
  const removeMember = (id: string) => {
    if (!confirm("Delete this sample? This can't be undone.")) return;
    start(async () => {
      const res = await deleteSample(id);
      if (!res.ok) { toast.error(res.error); return; }
      setMembers((ms) => ms.filter((m) => m.id !== id));
      setPicked((p) => { const n = new Set(p); n.delete(id); return n; });
      toast.success("Sample deleted");
      router.refresh();
    });
  };

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const group = () => {
    const ids = [...picked];
    if (ids.length < 2) { toast.error("Pick at least two samples."); return; }
    start(async () => {
      const fd = new FormData();
      fd.set("masterNumber", master);
      fd.set("sampleIds", JSON.stringify(ids));
      const res = await groupSamplesIntoMaster(fd);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Grouped ${res.merged} under ${master}`);
      if (res.missing && res.missing.length) {
        toast.warning(`No color code for: ${res.missing.join(", ")}. Add under Settings > Color Codes, then Fill SKU codes.`);
      }
      onDone();
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {cluster.brand || "—"} · {cluster.material || "(no material)"} · {members.length} samples
          {dupColors.length > 0 && (
            <Badge variant="warning" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> dup color: {dupColors.join(", ")}
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted-foreground)]">Master #</span>
          <Input value={master} onChange={(e) => setMaster(e.target.value)} className="h-8 w-48" />
          <Button size="sm" onClick={group} disabled={pending || picked.size < 2 || !master.trim()}>
            <Boxes className="h-4 w-4" /> {pending ? "Grouping..." : "Group"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {members.map((m) => {
          const isDup = dupColors.includes((m.color || "").trim().toUpperCase());
          return (
            <div key={m.id} className="flex items-center gap-3 rounded px-1 py-1 text-sm hover:bg-[var(--accent)]">
              <Checkbox checked={picked.has(m.id)} onCheckedChange={() => toggle(m.id)} />
              <Link href={`/samples/${m.id}`} className="w-52 shrink-0 truncate font-medium text-[var(--primary)] hover:underline" target="_blank">
                {m.sampleNumber}
              </Link>
              <Input
                value={m.color}
                placeholder="color"
                onChange={(e) => setColor(m.id, e.target.value)}
                onBlur={(e) => saveColor(m.id, e.target.value)}
                className={`h-7 w-36 text-xs ${isDup ? "border-[var(--warning)]" : ""}`}
              />
              <Input
                value={m.material}
                placeholder="material"
                onChange={(e) => setMaterial(m.id, e.target.value)}
                onBlur={(e) => saveMaterial(m.id, e.target.value)}
                className="h-7 w-36 text-xs"
              />
              <span className="text-xs text-[var(--muted-foreground)]">
                {SAMPLE_STATUS_LABEL[m.status as SampleStatus] ?? m.status}
              </span>
              <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={() => removeMember(m.id)} disabled={pending} title="Delete duplicate sample">
                <Trash2 className="h-4 w-4 text-[var(--destructive)]" />
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
