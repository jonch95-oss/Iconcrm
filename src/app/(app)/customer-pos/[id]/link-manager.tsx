"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Link2, Unlink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkPO, unlinkPO } from "../actions";
import { toast } from "sonner";

export interface LinkRow {
  linkId: string;
  poId: string;
  poNumber: string;
  piNumber: string;
  factoryName: string;
  note: string | null;
}

export interface PoOption {
  id: string;
  poNumber: string;
  piNumber: string;
  factoryName: string;
}

export function LinkManager({
  customerPoId,
  links,
  poOptions,
  canEdit,
}: {
  customerPoId: string;
  links: LinkRow[];
  poOptions: PoOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [query, setQuery] = React.useState("");
  const [note, setNote] = React.useState("");

  const linkedIds = new Set(links.map((l) => l.poId));
  const matches = poOptions
    .filter((p) => !linkedIds.has(p.id))
    .filter(
      (p) =>
        !query ||
        p.poNumber.toLowerCase().includes(query.toLowerCase()) ||
        p.piNumber.toLowerCase().includes(query.toLowerCase()) ||
        p.factoryName.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 8);

  const doLink = (poId: string) => {
    startTransition(async () => {
      const res = await linkPO(customerPoId, poId, note || undefined);
      if (res.ok) {
        toast.success("Linked");
        setNote("");
        setQuery("");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  const doUnlink = (linkId: string) => {
    startTransition(async () => {
      await unlinkPO(linkId, customerPoId);
      toast.success("Unlinked");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[var(--muted-foreground)]">
              <th className="p-2">Internal PO</th>
              <th className="p-2">PI</th>
              <th className="p-2">Factory</th>
              <th className="p-2">Note</th>
              {canEdit && <th className="p-2"></th>}
            </tr>
          </thead>
          <tbody>
            {links.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="p-3 text-center text-[var(--muted-foreground)]">
                  No internal POs linked yet.
                </td>
              </tr>
            ) : (
              links.map((l) => (
                <tr key={l.linkId} className="border-b">
                  <td className="p-2">
                    <Link href={`/pos/${l.poId}`} className="font-medium text-[var(--primary)] hover:underline">
                      {l.poNumber}
                    </Link>
                  </td>
                  <td className="p-2">{l.piNumber}</td>
                  <td className="p-2">{l.factoryName}</td>
                  <td className="p-2 text-xs text-[var(--muted-foreground)]">{l.note ?? "—"}</td>
                  {canEdit && (
                    <td className="p-2">
                      <Button variant="ghost" size="icon" onClick={() => doUnlink(l.linkId)} disabled={pending}>
                        <Unlink className="h-4 w-4 text-[var(--destructive)]" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="rounded-md border border-[var(--border)] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4" /> Link an internal PO (many-to-many)
          </div>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Search PO #, PI #, factory…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-64" />
            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="w-48" />
          </div>
          <div className="mt-2 space-y-1">
            {matches.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded border border-[var(--border)] px-2 py-1.5 text-sm">
                <span>
                  <span className="font-medium">{p.poNumber}</span>{" "}
                  <span className="text-xs text-[var(--muted-foreground)]">· {p.piNumber} · {p.factoryName}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => doLink(p.id)} disabled={pending}>
                  <Plus className="h-4 w-4" /> Link
                </Button>
              </div>
            ))}
            {query && matches.length === 0 && (
              <p className="text-xs text-[var(--muted-foreground)]">No matching unlinked POs.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
