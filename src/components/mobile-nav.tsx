"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/samples", label: "Samples" },
  { href: "/order-forms", label: "Order Forms" },
  { href: "/pis", label: "Proforma Invoices" },
  { href: "/pos", label: "Purchase Orders" },
  { href: "/customer-pos", label: "Customer POs" },
  { href: "/packing-lists", label: "Packing Lists" },
  { href: "/shipments", label: "Shipments" },
  { href: "/receive", label: "Receive Samples" },
  { href: "/needs-review", label: "Needs Review" },
  { href: "/factories", label: "Factories" },
  { href: "/settings", label: "Admin Settings" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs left-4 top-4 translate-x-0 translate-y-0">
        <DialogTitle>Navigation</DialogTitle>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium",
                  active
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "hover:bg-[var(--accent)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
