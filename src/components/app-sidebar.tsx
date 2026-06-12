"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  FileSpreadsheet,
  ReceiptText,
  ClipboardList,
  Building2,
  Boxes,
  Inbox,
  Factory,
  Settings,
  Ship,
  PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/samples", label: "Samples", icon: Package },
  { href: "/order-forms", label: "Order Forms", icon: FileSpreadsheet },
  { href: "/pis", label: "Proforma Invoices", icon: ReceiptText },
  { href: "/pos", label: "Purchase Orders", icon: ClipboardList },
  { href: "/customer-pos", label: "Customer POs", icon: Building2 },
  { href: "/packing-lists", label: "Packing Lists", icon: Boxes },
  { href: "/shipments", label: "Shipments", icon: Ship },
  { href: "/receive", label: "Receive Samples", icon: PackageCheck },
  { href: "/needs-review", label: "Needs Review", icon: Inbox },
  { href: "/factories", label: "Factories", icon: Factory },
  { href: "/settings", label: "Admin Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r border-[var(--border)] bg-[var(--card)]">
      <div className="flex h-14 items-center gap-2 border-b border-[var(--border)] px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-bold">
          IC
        </div>
        <span className="font-display text-sm font-semibold tracking-tight">Icon CRM</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
