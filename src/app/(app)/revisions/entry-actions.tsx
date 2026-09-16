"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Check, X, Undo2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  acknowledgeComment,
  dismissComment,
  assignComment,
  acknowledgeAllForFactory,
  unacknowledgeMany,
} from "./actions";

export type Person = { id: string; name: string };

/**
 * Triage controls on one note: acknowledge it, own it (or hand it to someone),
 * or wave it off. Only comment-backed notes get these — an ETA change or a
 * color flag is a fact about the sample, not an item in anyone's inbox.
 */
export function EntryActions({
  commentId,
  acknowledgedAt,
  acknowledgedBy,
  dismissedAt,
  dismissedBy,
  assignee,
  people,
  canEdit,
}: {
  commentId: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  dismissedAt: string | null;
  dismissedBy: string | null;
  assignee: Person | null;
  people: Person[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  /**
   * Every triage action comes back with an Undo in its confirmation. Dismiss
   * especially: it takes the note off the board, so without this the way back
   * is to know that "Show dismissed" exists.
   */
  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done: string,
    undo?: () => Promise<{ ok: boolean; error?: string }>,
  ) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong");
        return;
      }
      router.refresh();
      toast.success(done, {
        duration: 8000,
        action: undo
          ? {
              label: "Undo",
              onClick: () =>
                start(async () => {
                  const back = await undo();
                  if (back.ok) {
                    toast.success("Undone");
                    router.refresh();
                  } else toast.error(back.error ?? "Couldn't undo");
                }),
            }
          : undefined,
      });
    });

  if (!canEdit) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        {assignee && <Badge variant="outline">{assignee.name}</Badge>}
        {acknowledgedAt && <Badge variant="secondary">Acknowledged</Badge>}
      </div>
    );
  }

  if (dismissedAt) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <Badge variant="outline">Dismissed{dismissedBy ? ` · ${dismissedBy}` : ""}</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          disabled={pending}
          onClick={() => run(() => dismissComment(commentId, false), "Back on the board", () => dismissComment(commentId, true))}
        >
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      <Select
        value={assignee?.id ?? "none"}
        onValueChange={(v) => {
          const previous = assignee?.id ?? "";
          const next = v === "none" ? "" : v;
          run(
            () => assignComment(commentId, next),
            next ? `Assigned to ${people.find((p) => p.id === next)?.name ?? "them"}` : "Unassigned",
            () => assignComment(commentId, previous),
          );
        }}
      >
        <SelectTrigger className="h-7 w-36 text-xs">
          <SelectValue placeholder="Assign">
            {assignee ? (
              assignee.name
            ) : (
              <span className="flex items-center gap-1 text-[var(--muted-foreground)]">
                <UserPlus className="h-3.5 w-3.5" /> Assign
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {acknowledgedAt ? (
        <Badge
          variant="success"
          title={`Acknowledged${acknowledgedBy ? ` by ${acknowledgedBy}` : ""} — click to undo`}
          className="cursor-pointer"
          onClick={() => run(() => acknowledgeComment(commentId, false), "Marked unread", () => acknowledgeComment(commentId, true))}
        >
          <Check className="mr-1 h-3 w-3" /> {acknowledgedBy ?? "Acknowledged"}
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={pending}
          onClick={() => run(() => acknowledgeComment(commentId, true), "Acknowledged", () => acknowledgeComment(commentId, false))}
        >
          <Check className="h-3.5 w-3.5" /> Acknowledge
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        title="Dismiss — hides it from the board, kept under Show dismissed"
        disabled={pending}
        onClick={() => run(() => dismissComment(commentId, true), "Dismissed", () => dismissComment(commentId, false))}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** "Acknowledge all" for one factory's visible, unacknowledged notes. */
export function AcknowledgeAll({ commentIds }: { commentIds: string[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  if (commentIds.length === 0) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await acknowledgeAllForFactory(commentIds);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          router.refresh();
          const changed = res.changed;
          toast.success(`${changed.length} acknowledged`, {
            duration: 8000,
            action: changed.length
              ? {
                  label: "Undo",
                  onClick: () =>
                    start(async () => {
                      const back = await unacknowledgeMany(changed);
                      if (back.ok) {
                        toast.success("Undone");
                        router.refresh();
                      } else toast.error(back.error ?? "Couldn't undo");
                    }),
                }
              : undefined,
          });
        })
      }
    >
      <Check className="h-4 w-4" /> Acknowledge {commentIds.length}
    </Button>
  );
}
