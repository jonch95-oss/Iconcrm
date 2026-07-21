"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteFactory } from "./factory-actions";

export function FactoryRowActions({
  id,
  name,
  samples,
  pis,
}: {
  id: string;
  name: string;
  samples: number;
  pis: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const onDelete = () => {
    const used = samples + pis;
    const detail = used > 0 ? ` It will be unlinked from ${samples} sample(s) and ${pis} PI(s).` : "";
    if (!confirm(`Delete factory "${name}"?${detail} This can't be undone.`)) return;
    startTransition(async () => {
      const res = await deleteFactory(id);
      if (res.ok) {
        toast.success(`Deleted "${name}"`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      disabled={pending}
      onClick={onDelete}
      title="Delete factory"
    >
      <Trash2 className="h-4 w-4 text-[var(--destructive)]" />
    </Button>
  );
}
