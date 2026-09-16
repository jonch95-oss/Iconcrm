"use client";

import * as React from "react";
import Link from "next/link";
import { GroupSamplesDialog } from "./group-samples-dialog";
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
  Trash2,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  X,
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
import {
  SAMPLE_PIPELINE,
  SAMPLE_STATUS_LABEL,
  PARTIAL_RECEIPT,
  PARTIAL_RECEIPT_LABEL,
  sampleDisplayStatus,
} from "@/lib/status";
import { SAMPLE_CATEGORIES, seasonChoices } from "@/lib/catalog";
import {
  EMPTY_SAMPLE_FILTERS,
  SAMPLE_FILTERS_KEY,
  hasActiveFilters,
  sampleFiltersFromQuery,
  sampleFiltersToQuery,
  type SampleFilters,
} from "@/lib/sample-filters";
import type { BadgeTone } from "@/lib/status";

const SEASON_CHOICES = seasonChoices();

// Status filter options, in pipeline order. Partial sits next to Sample
// Received because that's where you go looking for it: "what's half here?"
const STATUS_FILTER_OPTIONS: [string, string][] = [
  ...SAMPLE_PIPELINE.flatMap((s): [string, string][] =>
    s === "sample_received"
      ? [[s, SAMPLE_STATUS_LABEL[s]], [PARTIAL_RECEIPT, PARTIAL_RECEIPT_LABEL]]
      : [[s, SAMPLE_STATUS_LABEL[s]]],
  ),
  ...(["revisions_requested", "on_hold", "produced_without_sample", "approved_by_image", "dropped"] as const).map(
    (s): [string, string] => [s, SAMPLE_STATUS_LABEL[s]],
  ),
];
import { formatMoney } from "@/lib/money";
import { toDateInputValue } from "@/lib/date";
import { updateSample, bulkDeleteSamples, editSkuVariant, toggleSkuReceived, requestVariantRevisions } from "./actions";
import { CreateOrderFormButton } from "./create-order-form-dialog";
import { ReceiveSamplesDialog } from "./receive-samples-dialog";
import { toast } from "sonner";

export interface SampleRow {
  id: string;
  sampleNumber: string;
  imageUrl: string | null;
  brand: string;
  color: string;
  material: string;
  category: string;
  season: string;
  styleName: string;
  styleNumber: string;
  status: (typeof SAMPLE_PIPELINE)[number] | "revisions_requested" | "on_hold" | "produced_without_sample" | "approved_by_image" | "dropped";
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
  commentCount: number;
  sampleRoom: string;
  variants: {
    id: string; color: string; skuCode: string;
    sampleEta: string; received: boolean; revisionsRequested: boolean;
    statusLabel: string; statusTone: BadgeTone;
  }[];
  ageDays: number;
  overdue: boolean;
  requestedBy: string;
}

function InlineStatusSelect({
  id,
  status,
  variants,
  canEdit,
}: {
  id: string;
  status: SampleRow["status"];
  variants: SampleRow["variants"];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  if (!canEdit) return <SampleStatusBadge status={status} variants={variants} />;

  const save = (next: string) => {
    setEditing(false);
    if (next === status) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", next);
    startTransition(async () => {
      const res = await updateSample(fd);
      if (res.ok) {
        toast.success("Status updated");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  if (editing) {
    // Only allow flipping to Requested or On Hold (plus the current value) so
    // no one accidentally sets Sample Received / Revisions Requested here —
    // those are driven by the Received flow and the Request-revisions button.
    const opts = Array.from(new Set<string>([status, "sample_requested", "on_hold"]));
    return (
      <select
        autoFocus
        defaultValue={status}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        onBlur={() => setEditing(false)}
        className="h-8 rounded-md border border-[var(--border)] bg-[var(--background)] px-1 text-xs"
      >
        {opts.map((o) => (
          <option key={o} value={o}>
            {SAMPLE_STATUS_LABEL[o as keyof typeof SAMPLE_STATUS_LABEL]}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} disabled={pending} title="Change status (Requested / On Hold)">
      <SampleStatusBadge status={status} variants={variants} />
    </button>
  );
}

function InlineFactorySelect({
  id,
  factoryId,
  factoryName,
  factories,
  canEdit,
}: {
  id: string;
  factoryId: string;
  factoryName: string;
  factories: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  if (!canEdit) {
    return factoryName ? <Badge variant="secondary">{factoryName}</Badge> : <span className="text-[var(--muted-foreground)]">—</span>;
  }

  const save = (next: string) => {
    setEditing(false);
    if (next === factoryId) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("factoryId", next);
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

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={factoryId}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        onBlur={() => setEditing(false)}
        className="h-8 w-36 rounded-md border border-[var(--border)] bg-[var(--background)] px-1 text-sm"
      >
        <option value="">—</option>
        {factories.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} disabled={pending} className="text-left">
      {factoryName ? (
        <Badge variant="secondary">{factoryName}</Badge>
      ) : (
        <span className="text-xs text-[var(--muted-foreground)]">+ set</span>
      )}
    </button>
  );
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
  field: "sampleEta" | "sampleReceivedDate" | "fobCost" | "sampleRoom";
  value: string;
  type: "date" | "number" | "text";
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
        list={field === "sampleRoom" ? "sample-rooms-inline" : undefined}
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

type ChildVariant = SampleRow["variants"][number];
function SkuChildRow({ sampleId, v, canEdit }: { sampleId: string; v: ChildVariant; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r && r.ok === false) toast.error(r.error);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-[var(--muted-foreground)]">&#9492;</span>
      <Link href={`/samples/${sampleId}`} className="w-40 shrink-0 font-mono text-[var(--primary)] hover:underline">
        {v.skuCode || "(no SKU yet)"}
      </Link>
      <span className="w-28 shrink-0 text-[var(--muted-foreground)]">{v.color || "—"}</span>
      <Badge variant={v.statusTone}>{v.statusLabel}</Badge>
      {canEdit ? (
        <input
          type="date"
          defaultValue={v.sampleEta}
          disabled={pending}
          className="h-6 rounded border border-[var(--border)] bg-transparent px-1 text-xs"
          onChange={(e) => run(() => editSkuVariant(v.id, sampleId, "sampleEta", e.target.value))}
        />
      ) : (
        <span className="text-[var(--muted-foreground)]">{v.sampleEta || "no ETA"}</span>
      )}
      {canEdit && (
        <label className="flex items-center gap-1">
          <Checkbox checked={v.received} disabled={pending} onCheckedChange={(c) => run(() => toggleSkuReceived(v.id, sampleId, !!c))} />
          received
        </label>
      )}
      {canEdit && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2"
          disabled={pending}
          onClick={() => run(() => requestVariantRevisions(v.id, sampleId, !v.revisionsRequested))}
        >
          {v.revisionsRequested ? "Clear revisions" : "Request revisions"}
        </Button>
      )}
    </div>
  );
}

export function SamplesTable({
  rows,
  factories,
  brands,
  canEdit,
  isAdmin,
  initialFilters,
}: {
  rows: SampleRow[];
  factories: { id: string; name: string }[];
  brands: string[];
  canEdit: boolean;
  isAdmin?: boolean;
  initialFilters: SampleFilters;
}) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState(initialFilters.q);
  const [statusFilter, setStatusFilter] = React.useState(initialFilters.status);
  const [factoryFilter, setFactoryFilter] = React.useState(initialFilters.factory);
  const [brandFilter, setBrandFilter] = React.useState(initialFilters.brand);
  const [seasonFilter, setSeasonFilter] = React.useState(initialFilters.season);
  const [categoryFilter, setCategoryFilter] = React.useState(initialFilters.category);
  const [colorFilter, setColorFilter] = React.useState(initialFilters.color);
  const [overdueOnly, setOverdueOnly] = React.useState(initialFilters.overdue);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const applyFilters = React.useCallback((f: SampleFilters) => {
    setGlobalFilter(f.q);
    setStatusFilter(f.status);
    setFactoryFilter(f.factory);
    setBrandFilter(f.brand);
    setSeasonFilter(f.season);
    setCategoryFilter(f.category);
    setColorFilter(f.color);
    setOverdueOnly(f.overdue);
  }, []);

  // Restore the filters you left the page with. Coming back from a sample, the
  // router hands this component back with the props of the *first* render
  // (unfiltered) and a URL stripped of its query, so neither survives the round
  // trip — the last filter set is kept in sessionStorage instead, and a URL
  // that does carry params (a deep link like /samples?overdue=1) wins over it.
  React.useEffect(() => {
    const adopt = () => {
      const fromUrl = sampleFiltersFromQuery(Object.fromEntries(new URLSearchParams(window.location.search)));
      if (hasActiveFilters(fromUrl)) {
        applyFilters(fromUrl);
        return;
      }
      const saved = sessionStorage.getItem(SAMPLE_FILTERS_KEY);
      if (saved === null) return;
      applyFilters(sampleFiltersFromQuery(Object.fromEntries(new URLSearchParams(saved))));
    };
    adopt();
    window.addEventListener("popstate", adopt);
    return () => window.removeEventListener("popstate", adopt);
  }, [applyFilters]);

  const filters = React.useMemo<SampleFilters>(
    () => ({
      q: globalFilter,
      status: statusFilter,
      factory: factoryFilter,
      brand: brandFilter,
      season: seasonFilter,
      category: categoryFilter,
      color: colorFilter,
      overdue: overdueOnly,
    }),
    [globalFilter, statusFilter, factoryFilter, brandFilter, seasonFilter, categoryFilter, colorFilter, overdueOnly],
  );

  // Remember them for the trip back, and keep the URL in step so the view stays
  // shareable while you're on it.
  //
  // The first pass is skipped on purpose: on a restored mount this component
  // starts unfiltered, and writing that would wipe the very filters the effect
  // above is about to restore.
  const settled = React.useRef(false);
  React.useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    const qs = sampleFiltersToQuery(filters);
    sessionStorage.setItem(SAMPLE_FILTERS_KEY, qs);
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`)
      window.history.replaceState(null, "", next);
  }, [filters]);

  // Keep the checked-row selection in sync with what's visible: changing any
  // filter or the search clears the selection, so exports (line sheet, Excel)
  // always match the current view instead of a stale cross-filter selection.
  React.useEffect(() => {
    setRowSelection({});
  }, [statusFilter, factoryFilter, brandFilter, seasonFilter, categoryFilter, colorFilter, globalFilter, overdueOnly]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    styleNumber: false,
    requestedBy: false,
    currency: false,
  });
  const [pending, startTransition] = React.useTransition();

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      // Match what the badge shows, not the stored value: a sample whose
      // colors are all in reads (and filters as) Sample Received, and one
      // that's part-way in filters as Partial.
      if (statusFilter && sampleDisplayStatus(r.status, r.variants) !== statusFilter) return false;
      if (factoryFilter && r.factoryId !== factoryFilter) return false;
      if (brandFilter && r.brand !== brandFilter) return false;
      if (seasonFilter && r.season !== seasonFilter) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (colorFilter) {
        const cf = colorFilter.toUpperCase();
        const hit = (r.color || "").toUpperCase() === cf || r.variants.some((v) => (v.color || "").toUpperCase() === cf);
        if (!hit) return false;
      }
      if (overdueOnly && !r.overdue) return false;
      return true;
    });
  }, [rows, statusFilter, factoryFilter, brandFilter, seasonFilter, categoryFilter, colorFilter, overdueOnly]);

  const brandOptions = React.useMemo(() => [...new Set([...brands, ...rows.map((r) => r.brand)].filter(Boolean))].sort(), [rows, brands]);
  const seasonOptions = React.useMemo(() => [...new Set(rows.map((r) => r.season).filter(Boolean))].sort(), [rows]);
  const categoryOptions = React.useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(), [rows]);
  const colorOptions = React.useMemo(
    () => [...new Set(rows.flatMap((r) => [r.color, ...r.variants.map((v) => v.color)]).filter(Boolean))].sort(),
    [rows],
  );
  // Rooms already recorded, offered as suggestions when receiving.
  const roomOptions = React.useMemo(
    () => [...new Set(rows.map((r) => r.sampleRoom).filter(Boolean))].sort(),
    [rows],
  );

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const toggleExpanded = React.useCallback(
    (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] })),
    [],
  );
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
        cell: ({ row }) => {
          const hasKids = row.original.variants.length > 0;
          const open = !!expanded[row.original.id];
          return (
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => hasKids && toggleExpanded(row.original.id)}
                className={`shrink-0 rounded p-0.5 hover:bg-[var(--accent)] ${hasKids ? "text-[var(--muted-foreground)]" : "invisible"}`}
                aria-label={open ? "Collapse SKUs" : "Expand SKUs"}
              >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
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
              {row.original.commentCount > 0 && (
                // Flags styles with feedback on them so you can spot them
                // without opening every row.
                <Link
                  href={`/samples/${row.original.id}?tab=comments`}
                  className="flex shrink-0 items-center gap-0.5 text-[var(--warning)]"
                  title={`${row.original.commentCount} comment${row.original.commentCount === 1 ? "" : "s"}`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium tabular-nums">{row.original.commentCount}</span>
                </Link>
              )}
            </span>
          );
        },
      },
      {
        accessorKey: "brand",
        header: ({ column }) => <SortBtn column={column} label="Brand" />,
        cell: ({ row }) => (
          <InlineSelect id={row.original.id} field="brand" value={row.original.brand} options={brands} canEdit={canEdit} />
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
          <InlineSelect id={row.original.id} field="season" value={row.original.season} options={SEASON_CHOICES} canEdit={canEdit} />
        ),
      },
      { accessorKey: "styleNumber", header: "Style #" },
      {
        accessorKey: "status",
        header: ({ column }) => <SortBtn column={column} label="Status" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <InlineStatusSelect id={row.original.id} status={row.original.status} variants={row.original.variants} canEdit={canEdit} />
            {row.original.overdue && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> OVERDUE
              </Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: "factoryName",
        header: ({ column }) => <SortBtn column={column} label="Factory" />,
        cell: ({ row }) => (
          <InlineFactorySelect
            id={row.original.id}
            factoryId={row.original.factoryId}
            factoryName={row.original.factoryName}
            factories={factories}
            canEdit={canEdit}
          />
        ),
      },
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
        accessorKey: "sampleRoom",
        header: ({ column }) => <SortBtn column={column} label="Sample room" />,
        cell: ({ row }) => (
          <InlineEdit
            id={row.original.id}
            field="sampleRoom"
            value={row.original.sampleRoom}
            type="text"
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
    [canEdit, factories, brands, isAdmin, expanded, toggleExpanded],
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
      {/* Suggestions for the inline Sample room cells (the receive dialog has
          its own copy of this list). */}
      <datalist id="sample-rooms-inline">
        {roomOptions.map((r) => <option key={r} value={r} />)}
      </datalist>
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
            {STATUS_FILTER_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
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
        <Select value={colorFilter || "all"} onValueChange={(v) => setColorFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="All colors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All colors</SelectItem>
            {colorOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
        {hasActiveFilters(filters) && (
          // Filters stick for the rest of the session, so there has to be one
          // obvious way back to the full list.
          <Button variant="ghost" size="sm" onClick={() => applyFilters(EMPTY_SAMPLE_FILTERS)}>
            <X className="h-4 w-4" /> Clear filters
          </Button>
        )}

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
          <Button
            variant="outline"
            size="sm"
            title="Same columns without embedded photos — small file, fast to re-import for bulk edits"
            onClick={() => {
              const base = selectedIds.length ? `?ids=${encodeURIComponent(selectedIds.join(","))}&photos=0` : "?photos=0";
              window.location.href = `/api/samples/export${base}`;
            }}
          >
            <Download className="h-4 w-4" /> Export (data only){selectedIds.length ? ` (${selectedIds.length})` : ""}
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="Export comments (with attached images) to Excel"
            onClick={() => {
              const qs = selectedIds.length ? `?ids=${encodeURIComponent(selectedIds.join(","))}` : "";
              window.location.href = `/api/samples/comments-export${qs}`;
            }}
          >
            <Download className="h-4 w-4" /> Comments{selectedIds.length ? ` (${selectedIds.length})` : ""}
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
            <GroupSamplesDialog
              selected={selectedRows.map((r) => ({ id: r.id, sampleNumber: r.sampleNumber, color: r.color, material: r.material }))}
              onDone={() => setRowSelection({})}
            />
          )}
          {canEdit && (
            <ReceiveSamplesDialog
              selected={selectedRows.map((r) => ({ id: r.id, sampleNumber: r.sampleNumber, styleName: r.styleName }))}
              rooms={roomOptions}
              onDone={() => setRowSelection({})}
            />
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
                <React.Fragment key={row.id}>
                  <TableRow data-state={row.getIsSelected() && "selected"}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="text-xs">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {expanded[row.original.id] && row.original.variants.length > 0 && (
                    <TableRow className="bg-[var(--muted)]/40 hover:bg-[var(--muted)]/40">
                      <TableCell colSpan={row.getVisibleCells().length} className="py-1.5">
                        <div className="space-y-1 pl-16">
                          {row.original.variants.map((v) => (
                            <SkuChildRow key={v.id} sampleId={row.original.id} v={v} canEdit={canEdit} />
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
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
