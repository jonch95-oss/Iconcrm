"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { SampleStatusBadge } from "@/components/status-badge";
import { toast } from "sonner";
import { findSample, markReceived } from "./actions";
import { CheckCircle2, Search } from "lucide-react";
import type { SampleStatus } from "@prisma/client";

type Found = {
  id: string;
  sampleNumber: string;
  brand: string | null;
  styleName: string | null;
  status: string;
  received: boolean;
};

export function QuickReceive() {
  const [query, setQuery] = React.useState("");
  const [found, setFound] = React.useState<Found | null>(null);
  const [note, setNote] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const search = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDone(false);
    startTransition(async () => {
      const res = await findSample(query);
      if (res.ok) setFound(res.sample);
      else {
        setFound(null);
        toast.error(res.error);
      }
    });
  };

  const receive = () => {
    if (!found) return;
    startTransition(async () => {
      const res = await markReceived(found.id, note);
      if (res.ok) {
        setDone(true);
        setNote("");
        toast.success(`${found.sampleNumber} marked received`);
      } else toast.error(res.error ?? "Something went wrong");
    });
  };

  const reset = () => {
    setQuery("");
    setFound(null);
    setDone(false);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sample number…"
          autoFocus
          inputMode="text"
          autoCapitalize="characters"
          className="h-14 text-lg"
        />
        <Button type="submit" disabled={pending} className="h-14 px-5">
          <Search className="h-5 w-5" />
        </Button>
      </form>

      {found && !done && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <div className="text-xl font-semibold">{found.sampleNumber}</div>
              <div className="text-sm text-[var(--muted-foreground)]">
                {[found.brand, found.styleName].filter(Boolean).join(" · ") || "No details yet"}
              </div>
              <div className="mt-2">
                <SampleStatusBadge status={found.status as SampleStatus} />
              </div>
            </div>
            {found.received ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                This one is already marked received.{" "}
                <Link href={`/samples/${found.id}`} className="text-[var(--primary)] underline">
                  Open it
                </Link>{" "}
                to make changes.
              </p>
            ) : (
              <>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note (condition, missing pieces…)"
                />
                <Button onClick={receive} disabled={pending} className="h-14 w-full text-lg">
                  <CheckCircle2 className="h-5 w-5" /> Mark received today
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {done && found && (
        <Card>
          <CardContent className="space-y-4 pt-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <div className="text-lg font-medium">{found.sampleNumber} received</div>
            <div className="flex justify-center gap-2">
              <Button onClick={reset} className="h-12">Receive another</Button>
              <Button variant="outline" className="h-12" asChild>
                <Link href={`/samples/${found.id}`}>Open sample</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
