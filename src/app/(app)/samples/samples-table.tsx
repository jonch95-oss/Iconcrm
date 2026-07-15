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
  Save,
  PackageCheck,
  Trash2,
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
} from "@/components/ui/dropdown-menu";
import { SampleStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { SAMPLE_PIPELINE, SAMPLE_STATUS_LABEL } from "@/lib/status";
import { SAMPLE_CATEGORIES, SAMPLE_BRANDS } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { toDateInputValue } from "@/lib/date";
import { updateSample, bulkReceiveSamples, bulkDeleteSamples } from "./actions";
import { CreateOrderFormButton } from "./create-order-form-dialog";
import { toast } from "sonner";

export interface SampleRow {
  id: string;
  sampleNumber: string;
  imageUrl: string | null;
  brand: string;
  category: string;
  season: string;
  styleName: string;
  styleNumber: string;
  status: (typeof SAMPLE_PIPELINE)[number] | "revisions_requested" | "dropped";
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

function InlineSelect({
  id,
  field,
  value,
  options,
  canEdit,
  allowCustom = false,
}: {
  id: string;
  field: "brand" | "category" | "season";
  value: string;
  options: readonly string[];
  canEdit: boolean;
  allowCustom?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const save = (raw: string) => {
    const next = raw.trim();
    setEditing(false);
    if (next === value) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set(field, next);
    startTransition(async () => {
      const res = await updateSample(fd);
      if (res.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  if (!canEdit) {
    return value ? (
      <Badge variant="secondary">{value}</Badge>
    ) : (
      <span className="text-[var(--muted-foreground)]">—</span>
    );
  }

  if (editing) {
    if (allowCustom) {
      const listId = `dl-${field}-${id}`;
      return (
        <>
          <input
            autoFocus
            list={listId}
            defaultValue={value}
            disabled={pending}
            onBlur={(e) => save(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") setEditing(false);
            }}
            className="h-8 w-28 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
          />
          <datalist id={listId}>
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </>
      );
    }
    return (
      <select
        autoFocus
        defaultValue={value}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        onBlur={() => setEditing(false)}
        className="h-8 w-32 rounded-md border border-[var(--border)] bg-[var(--background)] px-1 text-sm"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={pending}
      className="rounded-full text-left hover:opacity-80"
      title="Click to edit"
    >
      {value ? (
        <Badge variant="secondary">{value}</Badge>
      ) : (
        <span className="text-xs text-[var(--muted-foreground)]">+ add</span>
      )}
    </button>
  );
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
  isAdmin,
  initialOverdue,
  initialStatus,
  initialFactory,
}: {
  rows: SampleRow[];
  factories: { id: string; name: string }[];
  canEdit: boolean;
  isAdmin?: boolean;
  initialOverdue: boolean;
  initialStatus: string;
  initialFactory: string;
}) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState(initialStatus);
  const [factoryFilter, setFactoryFilter] = React.useState(initialFactory);
  const [brandFilter, setBrandFilter] = React.useState("");
  const [seasonFilter, setSeasonFilter] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
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
      if (brandFilter && r.brand !== brandFilter) return false;
      if (seasonFilter && r.season !== seasonFilter) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (overdueOnly && !r.overdue) return false;
      return true;
    });
  }, [rows, statusFilter, factoryFilter, brandFilter, seasonFilter, categoryFilter, overdueOnly]);

  const brandOptions = React.useMemo(() => [...new Set(rows.map((r) => r.brand).filter(Boolean))].sort(), [rows]);
  const seasonOptions = React.useMemo(() => [...new Set(rows.map((r) => r.season).filter(Boolean))].sort(), [rows]);
  const categoryOptions = React.useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(), [rows]);

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
          <span className="flex items-center gap-2">
            {row.original.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.original.imageUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded border border-[var(--border)] bg-white object-contain"
              />
            ) : (
              <span className="h-8 w-8 shrink-0 rounded border border-dashed border-[var(--border)]" />
            )}
            <Link
              href={`/samples/${row.original.id}`}
              className="font-medium text-[var(--primary)] hover:underline"
            >
              {row.original.sampleNumber}
            </Link>
          </span>
        ),
      },
      {
        accessorKey: "brand",
        header: ({ column }) => <SortBtn column={column} label="Brand" />,
        cell: ({ row }) => (
          <InlineSelect id={row.original.id} field="brand" value={row.original.brand} options={SAMPLE_BRANDS} canEdit={canEdit} />
        ),
      },
      {
        accessorKey: "category",
        header: ({ column }) => <SortBtn column={column} label="Category" />,
        cell: ({ row }) => (
          <InlineSelect id={row.original.id} field="category" value={row.original.category} options={SAMPLE_CATEGORIES} canEdit={canEdit} />
        ),
      },
      {
        accessorKey: "season",
        header: ({ column }) => <SortBtn column={column} label="Season" />,
        cell: ({ row }) => (
          <InlineSelect id={row.original.id} field="season" value={row.original.season} options={seasonOptions} canEdit={canEdit} allowCustom />
        ),
      },
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
    [canEdit, seasonOptions],
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
            {[...SAMPLE_PIPELINE, "revisions_requested", "dropped"].map((s) => (
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
        <Select value={brandFilter || "all"} onValueChange={(v) => setBrandFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All brands" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {brandOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter || "all"} onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={seasonFilter || "all"} onValueChange={(v) => setSeasonFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="All seasons" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All seasons</SelectItem>
            {seasonOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const qs = selectedIds.length ? `?ids=${encodeURIComponent(selectedIds.join(","))}` : "";
              window.location.href = `/api/samples/export${qs}`;
            }}
          >
            <Download className="h-4 w-4" /> Export Excel{selectedIds.length ? ` (${selectedIds.length})` : ""}
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
            <CreateOrderFormButton selectedIds={selectedIds} />
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await bulkReceiveSamples(selectedIds);
                  if (res.ok) {
                    toast.success(`${selectedIds.length} marked received`);
                    setRowSelection({});
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              <PackageCheck className="h-4 w-4" /> Mark received
            </Button>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              className="text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
              onClick={() => {
                if (!confirm(`Delete ${selectedIds.length} sample(s)? This can't be undone. Samples used on order forms/PIs will be skipped.`)) return;
                startTransition(async () => {
                  const res = await bulkDeleteSamples(selectedIds);
                  if (res.ok) {
                    toast.success(res.id ?? `${selectedIds.length} deleted`);
                    setRowSelection({});
                    router.refresh();
                  } else toast.error(res.error);
                });
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(`/api/line-sheet?ids=${selectedIds.join(",")}`, "_blank")
            }
          >
            <Download className="h-4 w-4" /> Line sheet PDF
          </Button>
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
