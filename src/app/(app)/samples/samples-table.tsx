"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  Download,
  Columns3,
  AlertTriangle,
  FileSpreadsheet,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { SampleStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { SAMPLE_PIPELINE, SAMPLE_STATUS_LABEL } from "@/lib/status";
import { formatMoney } from "@/lib/money";
import { formatDate, toDateInputValue } from "@/lib/date";
import { updateSample, createOrderFormFromSamples } from "./actions";
import { toast } from "sonner";

export interface SampleRow {
  id: string;
  sampleNumber: string;
  brand: string;
  category: string;
  styleName: string;
  styleNumber: string;
  status: (typeof SAMPLE_PIPELINE)[number] | "dropped";
  factoryId: string;
  factoryName: string;
  sampleEta: string | null;
  etaRevisions: number;
  sampleReceivedDate: string | null;
  fobCost: string | null;
  currency: string;
  customerSellPrice: string | null;
  marginPercent: string | null;
  skuCount: number;
  ageDays: number;
  overdue: boolean;
  requestedBy: string;
}

function InlineEdit({
  id,
  field,
  value,
  type,
  canEdit,
}: {
  id: string;
  field: "sampleEta" | "sampleReceivedDate" | "fobCost";
  value: string;
  type: "date" | "number";
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(value);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => setVal(value), [value]);

  if (!canEdit) {
    return <span className="tabular-nums">{value || "—"}</span>;
  }

  const save = () => {
    setEditing(false);
    if (val === value) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set(field, val);
    if (field === "sampleEta") fd.set("etaReason", "Inline edit");
    startTransition(async () => {
      const res = await updateSample(fd);
      if (res.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        toast.error(res.error);
        setVal(value);
      }
    });
  };

  if (editing) {
    return (
      <Input
        autoFocus
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={val}
        disabled={pending}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setVal(value);
            setEditing(false);
          }
        }}
        className="h-7 w-28 px-1.5 text-xs"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="rounded px-1 py-0.5 text-left tabular-nums hover:bg-[var(--accent)]"
    >
      {value || <span className="text-[var(--muted-foreground)]">—</span>}
    </button>
  );
}

export function SamplesTable({
  rows,
  factories,
  canEdit,
  initialOverdue,
  initialStatus,
  initialFactory,
}: {
  rows: SampleRow[];
  factories: { id: string; name: string }[];
  canEdit: boolean;
  initialOverdue: boolean;
  initialStatus: string;
  initialFactory: string;
}) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState(initialStatus);
  const [factoryFilter, setFactoryFilter] = React.useState(initialFactory);
  const [overdueOnly, setOverdueOnly] = React.useState(initialOverdue);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    styleNumber: false,
    requestedBy: false,
    currency: false,
  });
  const [pending, startTransition] = React.useTransition();

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (factoryFilter && r.factoryId !== factoryFilter) return false;
      if (overdueOnly && !r.overdue) return false;
      return true;
    });
  }, [rows, statusFilter, factoryFilter, overdueOnly]);

  const columns = React.useMemo<ColumnDef<SampleRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "sampleNumber",
        header: ({ column }) => <SortBtn column={column} label="Sample #" />,
        cell: ({ row }) => (
          <Link
            href={`/samples/${row.original.id}`}
            className="font-medium text-[var(--primary)] hover:underline"
          >
            {row.original.sampleNumber}
          </Link>
        ),
      },
      { accessorKey: "brand", header: ({ column }) => <SortBtn column={column} label="Brand" /> },
      { accessorKey: "category", header: ({ column }) => <SortBtn column={column} label="Category" /> },
      { accessorKey: "styleNumber", header: "Style #" },
      {
        accessorKey: "status",
        header: ({ column }) => <SortBtn column={column} label="Status" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <SampleStatusBadge status={row.original.status} />
            {row.original.overdue && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> OVERDUE
              </Badge>
            )}
          </div>
        ),
      },
      { accessorKey: "factoryName", header: ({ column }) => <SortBtn column={column} label="Factory" /> },
      {
        accessorKey: "sampleEta",
        header: ({ column }) => <SortBtn column={column} label="ETA" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <InlineEdit
              id={row.original.id}
              field="sampleEta"
              value={toDateInputValue(row.original.sampleEta)}
              type="date"
              canEdit={canEdit}
            />
            {row.original.etaRevisions > 0 && (
              <Badge variant="outline" className="text-[10px]">
                ×{row.original.etaRevisions}
              </Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: "sampleReceivedDate",
        header: ({ column }) => <SortBtn column={column} label="Received" />,
        cell: ({ row }) => (
          <InlineEdit
            id={row.original.id}
            field="sampleReceivedDate"
            value={toDateInputValue(row.original.sampleReceivedDate)}
            type="date"
            canEdit={canEdit}
          />
        ),
      },
      {
        accessorKey: "fobCost",
        header: ({ column }) => <SortBtn column={column} label="FOB" />,
        cell: ({ row }) =>
          canEdit ? (
            <InlineEdit
              id={row.original.id}
              field="fobCost"
              value={row.original.fobCost ?? ""}
              type="number"
              canEdit={canEdit}
            />
          ) : (
            <span className="tabular-nums">
              {formatMoney(row.original.fobCost, row.original.currency)}
            </span>
          ),
      },
      { accessorKey: "currency", header: "Cur" },
      {
        accessorKey: "marginPercent",
        header: "Margin",
        cell: ({ row }) =>
          row.original.marginPercent ? (
            <span className="tabular-nums">{row.original.marginPercent}%</span>
          ) : (
            <span className="text-[var(--muted-foreground)]">—</span>
          ),
      },
      {
        accessorKey: "skuCount",
        header: "SKUs",
        cell: ({ row }) => <span className="tabular-nums">{row.original.skuCount}</span>,
      },
      {
        accessorKey: "ageDays",
        header: ({ column }) => <SortBtn column={column} label="Age" />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.ageDays}d</span>,
      },
      { accessorKey: "requestedBy", header: "Requested by" },
    ],
    [canEdit],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedRows = filtered.filter((r) => selectedIds.includes(r.id));
  const selectedFactories = [...new Set(selectedRows.map((r) => r.factoryId).filter(Boolean))];
  const mixedFactories = selectedFactories.length > 1;

  const exportCsv = () => {
    const visibleCols = table
      .getVisibleLeafColumns()
      .filter((c) => c.id !== "select");
    const header = visibleCols.map((c) => c.id).join(",");
    const lines = table.getFilteredRowModel().rows.map((r) =>
      visibleCols
        .map((c) => {
          const v = r.getValue(c.id);
          const s = v == null ? "" : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(","),
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `samples-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const createOrderForm = () => {
    if (mixedFactories) {
      const ok = window.confirm(
        `You selected samples from ${selectedFactories.length} factories. Order forms are per-factory; only "${selectedRows.find((r) => r.factoryId === selectedFactories[0])?.factoryName}" samples will be included. Continue?`,
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await createOrderFormFromSamples(selectedIds);
      if (res.ok && res.id) {
        toast.success("Order form created");
        router.push(`/order-forms/${res.id}`);
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });
  };

  // Saved filter views (localStorage).
  const [savedViews, setSavedViews] = React.useState<
    { name: string; status: string; factory: string; overdue: boolean }[]
  >([]);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("sampleViews");
      if (raw) setSavedViews(JSON.parse(raw));
    } catch {}
  }, []);
  const saveView = () => {
    const name = window.prompt("Name this filter view:");
    if (!name) return;
    const next = [
      ...savedViews.filter((v) => v.name !== name),
      { name, status: statusFilter, factory: factoryFilter, overdue: overdueOnly },
    ];
    setSavedViews(next);
    localStorage.setItem("sampleViews", JSON.stringify(next));
    toast.success(`Saved view “${name}”`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search all columns…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="h-9 w-56"
        />
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {[...SAMPLE_PIPELINE, "dropped"].map((s) => (
              <SelectItem key={s} value={s}>
                {SAMPLE_STATUS_LABEL[s as keyof typeof SAMPLE_STATUS_LABEL]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={factoryFilter || "all"} onValueChange={(v) => setFactoryFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="All factories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All factories</SelectItem>
            {factories.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={overdueOnly ? "destructive" : "outline"}
          size="sm"
          onClick={() => setOverdueOnly((v) => !v)}
        >
          <AlertTriangle className="h-4 w-4" /> Overdue
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {savedViews.length > 0 && (
            <Select
              onValueChange={(name) => {
                const v = savedViews.find((x) => x.name === name);
                if (v) {
                  setStatusFilter(v.status);
                  setFactoryFilter(v.factory);
                  setOverdueOnly(v.overdue);
                }
              }}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="Saved views" />
              </SelectTrigger>
              <SelectContent>
                {savedViews.map((v) => (
                  <SelectItem key={v.name} value={v.name}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={saveView}>
            <Save className="h-4 w-4" /> Save view
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="h-4 w-4" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllLeafColumns()
                .filter((c) => c.id !== "select" && c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={c.getIsVisible()}
                    onCheckedChange={(v) => c.toggleVisibility(!!v)}
                    onSelect={(e) => e.preventDefault()}
                    className="capitalize"
                  >
                    {c.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--accent)] px-3 py-2 text-sm">
          <span className="font-medium">{selectedIds.length} selected</span>
          {mixedFactories && (
            <Badge variant="warning" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {selectedFactories.length} factories
            </Badge>
          )}
          {canEdit && (
            <Button size="sm" onClick={createOrderForm} disabled={pending}>
              <FileSpreadsheet className="h-4 w-4" /> Create Order Form
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
            Clear
          </Button>
        </div>
      )}

      <div className="rounded-md border border-[var(--border)]">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-[var(--muted-foreground)]">
                  No samples match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-xs">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Showing {table.getRowModel().rows.length} of {rows.length} samples · Tip: click ETA / Received / FOB cells to edit inline.
      </p>
    </div>
  );
}

function SortBtn({
  column,
  label,
}: {
  column: { toggleSorting: (d?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  label: string;
}) {
  return (
    <button
      className="flex items-center gap-1 font-medium hover:text-[var(--foreground)]"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );
}
