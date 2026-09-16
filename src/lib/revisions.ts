import { prisma } from "@/lib/db";
import { SAMPLE_STATUS_LABEL } from "@/lib/status";
import type { Prisma, SampleStatus } from "@prisma/client";

/**
 * The revision / comment recap: everything that was said about a factory's
 * samples in a window, shaped for the dashboard, the Excel export and the
 * email — one query path so all three tell the same story.
 */

export type RecapEntryKind = "revision" | "comment" | "eta" | "version";

export type RecapEntry = {
  id: string;
  kind: RecapEntryKind;
  at: Date;
  body: string;
  author: string;
  /** Set when the entry is about one color rather than the whole sample. */
  color: string | null;
  imageUrl: string | null;
  /**
   * Triage. Only comment-backed entries can be acted on — an ETA change or a
   * color flag is a fact about the sample, not an item in someone's inbox — so
   * `commentId` is null for those and the board renders them read-only.
   */
  commentId: string | null;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  dismissedAt: Date | null;
  dismissedBy: string | null;
  assignee: { id: string; name: string } | null;
};

export type RecapSample = {
  id: string;
  sampleNumber: string;
  styleName: string;
  styleNumber: string;
  brand: string;
  color: string;
  imageUrl: string | null;
  status: SampleStatus;
  statusLabel: string;
  /** Still waiting on a revised sample to come back. */
  open: boolean;
  openColors: string[];
  sampleEta: Date | null;
  /** Days since the revision was asked for (null when nothing is open). */
  openDays: number | null;
  entries: RecapEntry[];
  lastActivity: Date;
};

export type RecapFactory = {
  id: string | null;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  samples: RecapSample[];
  openRevisions: number;
  entryCount: number;
};

export type RecapFilters = {
  factoryId: string;
  brand: string;
  /** Days of history; 0 means everything. */
  days: number;
  openOnly: boolean;
  /** Only notes nobody has acknowledged yet — the inbox view. */
  newOnly: boolean;
  /** Assigned to this user id ("me" is resolved by the page). */
  assignee: string;
  /** Dismissed notes are hidden unless this is on. */
  showDismissed: boolean;
};

export type Recap = {
  filters: RecapFilters;
  since: Date | null;
  factories: RecapFactory[];
  totals: {
    openRevisions: number;
    entries: number;
    samples: number;
    oldestOpenDays: number | null;
    /** Comment-backed notes nobody has acknowledged (the notification count). */
    unacknowledged: number;
    assignedToMe: number;
    /** Dismissed notes in range — surfaced so a mistaken dismiss is findable. */
    dismissed: number;
  };
};

export const RECAP_RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "0", label: "All time" },
];

export const EMPTY_RECAP_FILTERS: RecapFilters = {
  factoryId: "",
  brand: "",
  days: 30,
  openOnly: false,
  newOnly: false,
  assignee: "",
  showDismissed: false,
};

type Param = string | string[] | undefined;
const one = (v: Param) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

export function recapFiltersFromQuery(sp: Record<string, Param>): RecapFilters {
  const days = Number(one(sp.days));
  return {
    factoryId: one(sp.factory),
    brand: one(sp.brand),
    days: Number.isFinite(days) && one(sp.days) !== "" ? Math.max(0, days) : 30,
    openOnly: one(sp.open) === "1",
    newOnly: one(sp.new) === "1",
    assignee: one(sp.assignee),
    showDismissed: one(sp.dismissed) === "1",
  };
}

export function recapFiltersToQuery(f: RecapFilters): string {
  const p = new URLSearchParams();
  if (f.factoryId) p.set("factory", f.factoryId);
  if (f.brand) p.set("brand", f.brand);
  if (f.days !== 30) p.set("days", String(f.days));
  if (f.openOnly) p.set("open", "1");
  if (f.newOnly) p.set("new", "1");
  if (f.assignee) p.set("assignee", f.assignee);
  if (f.showDismissed) p.set("dismissed", "1");
  return p.toString();
}

const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / 86_400_000);

/** Which bucket a stored comment belongs in (see requestRevisions / the version bump). */
function entryKind(tags: string[]): RecapEntryKind {
  if (tags.includes("version")) return "version";
  if (tags.includes("revision")) return "revision";
  return "comment";
}

export async function getRevisionRecap(filters: RecapFilters, viewerId?: string): Promise<Recap> {
  const now = new Date();
  const since = filters.days > 0 ? new Date(now.getTime() - filters.days * 86_400_000) : null;

  const sampleWhere: Prisma.SampleWhereInput = {
    // Dropped styles are cancelled — recapping them to a factory is noise.
    status: { not: "dropped" },
    ...(filters.factoryId ? { factoryId: filters.factoryId } : {}),
    ...(filters.brand ? { brand: filters.brand } : {}),
  };
  const commentWhere: Prisma.CommentWhereInput = {
    ...(since ? { createdAt: { gte: since } } : {}),
    // Dismissed notes are waved off, not deleted — they come back with the toggle.
    ...(filters.showDismissed ? {} : { dismissedAt: null }),
    ...(filters.newOnly ? { acknowledgedAt: null } : {}),
    ...(filters.assignee ? { assigneeId: filters.assignee } : {}),
  };
  // "Open" = the factory still owes us a revised sample, at sample or color level.
  const openWhere: Prisma.SampleWhereInput = {
    OR: [{ status: "revisions_requested" }, { skuVariants: { some: { revisionsRequestedAt: { not: null } } } }],
  };

  // ETA changes aren't a relation on Sample (they're keyed by parentType/parentId),
  // so they're looked up first and folded in by sample id.
  const etaRevisions = await prisma.etaRevision.findMany({
    where: { parentType: "sample", ...(since ? { createdAt: { gte: since } } : {}) },
    include: { changedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const etaSampleIds = [...new Set(etaRevisions.map((e) => e.parentId))];

  // Counted separately: dismissed notes are filtered out of the query below,
  // but the board still shows how many are waiting under "Show dismissed".
  const dismissedCount = await prisma.comment.count({
    where: {
      ...(since ? { createdAt: { gte: since } } : {}),
      dismissedAt: { not: null },
      sample: sampleWhere,
    },
  });

  const samples = await prisma.sample.findMany({
    where: {
      AND: [
        sampleWhere,
        filters.openOnly
          ? openWhere
          : {
              OR: [
                { comments: { some: commentWhere } },
                ...(etaSampleIds.length ? [{ id: { in: etaSampleIds } }] : []),
                openWhere,
              ],
            },
      ],
    },
    include: {
      factory: { select: { id: true, name: true, contactName: true, contactEmail: true } },
      skuVariants: {
        select: {
          color: true,
          revisionsRequestedAt: true,
          revisionsRequestedBy: { select: { name: true } },
        },
      },
      comments: {
        where: commentWhere,
        include: {
          user: { select: { name: true } },
          skuVariant: { select: { color: true } },
          acknowledgedBy: { select: { name: true } },
          dismissedBy: { select: { name: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { sampleNumber: "asc" },
    take: 500,
  });

  // A sample can be open on something asked for before the window — without its
  // note the recap would say "revision pending" and not what was asked for.
  const missingContext = samples
    .filter((s) => isOpen(s) && !s.comments.some((c) => entryKind(c.tags) === "revision"))
    .map((s) => s.id);
  const olderRevisionNotes = missingContext.length
    ? await prisma.comment.findMany({
        where: {
          sampleId: { in: missingContext },
          tags: { has: "revision" },
          ...(filters.showDismissed ? {} : { dismissedAt: null }),
        },
        include: { user: { select: { name: true } }, skuVariant: { select: { color: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      })
    : [];

  const etaBySample = new Map<string, typeof etaRevisions>();
  for (const e of etaRevisions) {
    const list = etaBySample.get(e.parentId) ?? [];
    list.push(e);
    etaBySample.set(e.parentId, list);
  }
  const olderBySample = new Map<string, (typeof olderRevisionNotes)[number]>();
  for (const c of olderRevisionNotes) if (!olderBySample.has(c.sampleId)) olderBySample.set(c.sampleId, c);

  const byFactory = new Map<string, RecapFactory>();
  let oldestOpenDays: number | null = null;

  for (const s of samples) {
    const entries: RecapEntry[] = s.comments.map((c) => ({
      id: c.id,
      kind: entryKind(c.tags),
      at: c.createdAt,
      body: c.body,
      author: c.user?.name ?? c.authorLabel ?? "—",
      color: c.skuVariant?.color ?? null,
      imageUrl: c.imageUrl,
      commentId: c.id,
      acknowledgedAt: c.acknowledgedAt,
      acknowledgedBy: c.acknowledgedBy?.name ?? null,
      dismissedAt: c.dismissedAt,
      dismissedBy: c.dismissedBy?.name ?? null,
      assignee: c.assignee ? { id: c.assignee.id, name: c.assignee.name ?? "—" } : null,
    }));
    const older = olderBySample.get(s.id);
    if (older)
      entries.push({
        id: older.id,
        kind: "revision",
        at: older.createdAt,
        body: older.body,
        author: older.user?.name ?? older.authorLabel ?? "—",
        color: older.skuVariant?.color ?? null,
        imageUrl: older.imageUrl,
        commentId: older.id,
        acknowledgedAt: older.acknowledgedAt,
        acknowledgedBy: null,
        dismissedAt: older.dismissedAt,
        dismissedBy: null,
        assignee: null,
      });
    // Flagging a color for revision writes a timestamp, not a comment — without
    // this the recap would show the style with nothing asked for on it.
    for (const v of s.skuVariants) {
      // In range, or older but still outstanding — an open request belongs in
      // the recap however long ago it was made.
      if (!v.revisionsRequestedAt) continue;
      if (since && v.revisionsRequestedAt < since && !isOpen(s)) continue;
      entries.push({
        id: `${s.id}-${v.color}-flag`,
        kind: "revision",
        at: v.revisionsRequestedAt,
        body: `Revisions requested for ${v.color}`,
        author: v.revisionsRequestedBy?.name ?? "—",
        color: v.color,
        imageUrl: null,
        commentId: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
        dismissedAt: null,
        dismissedBy: null,
        assignee: null,
      });
    }
    for (const e of etaBySample.get(s.id) ?? [])
      entries.push({
        id: e.id,
        kind: "eta",
        at: e.createdAt,
        body:
          `ETA ${e.oldEta ? e.oldEta.toISOString().slice(0, 10) : "—"} → ` +
          `${e.newEta ? e.newEta.toISOString().slice(0, 10) : "—"}` +
          (e.reason ? ` (${e.reason})` : ""),
        author: e.changedBy?.name ?? "—",
        color: null,
        imageUrl: null,
        commentId: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
        dismissedAt: null,
        dismissedBy: null,
        assignee: null,
      });

    const open = isOpen(s);
    // Nothing recorded and nothing outstanding -> not worth a line in a recap.
    if (entries.length === 0 && !open) continue;
    entries.sort((a, b) => b.at.getTime() - a.at.getTime());

    const openColors = s.skuVariants.filter((v) => v.revisionsRequestedAt).map((v) => v.color);
    const askedAt = open
      ? (s.skuVariants
          .map((v) => v.revisionsRequestedAt)
          .filter((d): d is Date => !!d)
          .sort((a, b) => a.getTime() - b.getTime())[0] ??
        entries.filter((e) => e.kind === "revision").at(-1)?.at ??
        null)
      : null;
    const openDays = askedAt ? daysBetween(askedAt, now) : null;
    if (openDays !== null && (oldestOpenDays === null || openDays > oldestOpenDays)) oldestOpenDays = openDays;

    const key = s.factory?.id ?? "none";
    const bucket = byFactory.get(key) ?? {
      id: s.factory?.id ?? null,
      name: s.factory?.name ?? "No factory assigned",
      contactName: s.factory?.contactName ?? null,
      contactEmail: s.factory?.contactEmail ?? null,
      samples: [],
      openRevisions: 0,
      entryCount: 0,
    };
    bucket.samples.push({
      id: s.id,
      sampleNumber: s.sampleNumber,
      styleName: s.styleName ?? "",
      styleNumber: s.styleNumber ?? "",
      brand: s.brand ?? "",
      color: s.color ?? "",
      imageUrl: s.imageUrl,
      status: s.status,
      statusLabel: SAMPLE_STATUS_LABEL[s.status],
      open,
      openColors,
      sampleEta: s.sampleEta,
      openDays,
      entries,
      lastActivity: entries[0]?.at ?? s.updatedAt,
    });
    bucket.openRevisions += open ? 1 : 0;
    bucket.entryCount += entries.length;
    byFactory.set(key, bucket);
  }

  const factories = [...byFactory.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const f of factories) f.samples.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());

  return {
    filters,
    since,
    factories,
    totals: {
      openRevisions: factories.reduce((n, f) => n + f.openRevisions, 0),
      entries: factories.reduce((n, f) => n + f.entryCount, 0),
      samples: factories.reduce((n, f) => n + f.samples.length, 0),
      oldestOpenDays,
      unacknowledged: countEntries(factories, (e) => !!e.commentId && !e.acknowledgedAt && !e.dismissedAt),
      assignedToMe: viewerId
        ? countEntries(factories, (e) => e.assignee?.id === viewerId && !e.dismissedAt)
        : 0,
      dismissed: dismissedCount,
    },
  };
}

function countEntries(factories: RecapFactory[], match: (e: RecapEntry) => boolean): number {
  return factories.reduce((n, f) => n + f.samples.reduce((m, s) => m + s.entries.filter(match).length, 0), 0);
}

function isOpen(s: { status: SampleStatus; skuVariants: { revisionsRequestedAt: Date | null }[] }): boolean {
  return s.status === "revisions_requested" || s.skuVariants.some((v) => v.revisionsRequestedAt);
}

/** Subject line for the factory email — shared so the preview can't drift. */
export function recapSubject(sampleCount: number, since: Date | null): string {
  return (
    `Sample revisions & comments — ${sampleCount} style${sampleCount === 1 ? "" : "s"}` +
    (since ? ` since ${since.toISOString().slice(0, 10)}` : "")
  );
}

export const RECAP_ENTRY_LABEL: Record<RecapEntryKind, string> = {
  revision: "Revision requested",
  comment: "Comment",
  eta: "ETA change",
  version: "Revised sample received",
};
