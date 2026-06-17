"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteOrderForm } from "../actions";

export function DeleteOrderFormButton({
  orderFormId,
  orderFormNumber,
}: {
  orderFormId: string;
  orderFormNumber: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const onDelete = () => {
    if (!confirm(`Delete order form ${orderFormNumber}? This removes its lines and can't be undone.`)) return;
    start(async () => {
      const res = await deleteOrderForm(orderFormId);
      if (res.ok) {
        toast.success("Order form deleted");
        router.push("/order-forms");
      } else {
        toast.error(res.error ?? "Delete failed");
      }
    });
  };

  return (
    <Button
      variant="outline"
      onClick={onDelete}
      disabled={pending}
      className="text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
    >
      <Trash2 className="h-4 w-4" /> Delete
    </Button>
  );
}
