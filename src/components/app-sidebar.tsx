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
    <aside className="hidden md:flex md:w-60 md:flex-col bg-[hsl(30_8%_10%)] text-[hsl(40_25%_92%)]">
      <div className="flex h-16 flex-col items-start justify-center border-b border-[hsl(30_8%_18%)] px-5">
        <span className="font-display text-lg leading-none tracking-wide text-[hsl(40_30%_96%)]">
          ICON
        </span>
        <span className="label-luxe mt-1 text-[hsl(33_30%_62%)]">Luxury Group</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
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
                "flex items-center gap-3 border-l-2 px-3 py-2 text-[13px] transition-colors",
                active
                  ? "border-[var(--bronze)] bg-[hsl(30_8%_15%)] text-[hsl(40_30%_96%)]"
                  : "border-transparent text-[hsl(35_10%_62%)] hover:bg-[hsl(30_8%_14%)] hover:text-[hsl(40_25%_90%)]",
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
