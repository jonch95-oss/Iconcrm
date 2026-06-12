"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitMissingInfo } from "./actions";

export function MissingInfoForm({
  token,
  sampleNumber,
  defaults,
}: {
  token: string;
  sampleNumber: string;
  defaults: { brand: string; category: string; styleName: string; styleNumber: string; description: string };
}) {
  const [pending, startTransition] = React.useTransition();
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("token", token);
    startTransition(async () => {
      const res = await submitMissingInfo(fd);
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  };

  if (done) {
    return (
      <div className="rounded-md border border-[var(--success)] bg-[var(--success)]/10 p-4 text-sm">
        Thanks! Details for <strong>{sampleNumber}</strong> have been saved. You can close this page.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Brand</Label>
        <Input name="brand" defaultValue={defaults.brand} />
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Input name="category" defaultValue={defaults.category} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Style name</Label>
          <Input name="styleName" defaultValue={defaults.styleName} />
        </div>
        <div className="space-y-1.5">
          <Label>Style #</Label>
          <Input name="styleNumber" defaultValue={defaults.styleNumber} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea name="description" defaultValue={defaults.description} rows={3} />
      </div>
      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Submit details"}
      </Button>
    </form>
  );
}
