"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveSettings } from "./actions";
import { toast } from "sonner";
import type { AppSettings } from "@/lib/settings";

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveSettings(fd);
      if (res.ok) {
        toast.success("Settings saved");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Area name="sampleNumberPatterns" label="Sample # regex patterns (one per line)" value={settings.sampleNumberPatterns.join("\n")} />
        <div className="grid gap-4">
          <Area name="brandPatterns" label="Brand regex patterns" value={settings.brandPatterns.join("\n")} rows={2} />
          <Area name="categoryPatterns" label="Category regex patterns" value={settings.categoryPatterns.join("\n")} rows={2} />
        </div>
        <Area name="missingInfoRecipients" label="Missing-info recipients (emails, one per line)" value={settings.missingInfoRecipients.join("\n")} />
        <Area name="internalPoDistribution" label="Internal PO distribution list (emails)" value={settings.internalPoDistribution.join("\n")} />
        <Area name="brands" label="Brand option list" value={settings.brands.join("\n")} />
        <Area name="categories" label="Category option list" value={settings.categories.join("\n")} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Field name="poNumberPrefix" label="PO number prefix" value={settings.poNumberPrefix} />
        <Field name="poNumberStart" label="PO number start" value={String(settings.poNumberStart)} type="number" />
        <Field name="orderFormPrefix" label="Order form prefix" value={settings.orderFormPrefix} />
        <Field name="followUpCadenceDays" label="Follow-up cadence (days)" value={String(settings.followUpCadenceDays)} type="number" />
        <Field name="inlandBufferDaysDefault" label="Port-to-customer days (default)" value={String(settings.inlandBufferDaysDefault)} type="number" />
        <Field name="riskThresholdDays" label="At-risk warning (days before cancel)" value={String(settings.riskThresholdDays)} type="number" />
      </div>

      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
    </form>
  );
}

function Area({ name, label, value, rows = 4 }: { name: string; label: string; value: string; rows?: number }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} defaultValue={value} rows={rows} className="font-mono text-xs" />
    </div>
  );
}

function Field({ name, label, value, type = "text" }: { name: string; label: string; value: string; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={value} type={type} />
    </div>
  );
}
