import type { SessionUser } from "@/lib/session";
import { isOwner } from "@/lib/owner";

/**
 * Moving an ETA that already exists.
 *
 * A date on a sample is a commitment other people are working to — the chase
 * list, the overdue badges and the factory conversation all run off it. So
 * moving one is a request: who wants it moved, to when, and why, until an
 * approver takes it live.
 *
 * Three things are deliberately *not* changes, and go straight on:
 *   - the first date a sample ever gets (nothing is being moved yet),
 *   - anything an approver does themselves (their edit is their approval),
 *   - the dates the system sets: an import's default, a factory's sheet, the
 *     clear that follows putting a sample on hold.
 */

/**
 * How far out the system dates a sample it was given no date for: an import,
 * a factory's emailed request sheet, a revision going back to the factory.
 * One number, so the three can't drift apart.
 */
export const DEFAULT_ETA_WEEKS = 8;
export const DEFAULT_ETA_DAYS = DEFAULT_ETA_WEEKS * 7;

/**
 * That date, counted from a day: now, when an email was sent, or the day a
 * sample was asked for. An ETA is a day, so it comes back as one.
 */
export function defaultEta(from: Date = new Date()): Date {
  const eta = new Date(from);
  eta.setUTCDate(eta.getUTCDate() + DEFAULT_ETA_DAYS);
  eta.setUTCHours(12, 0, 0, 0);
  return eta;
}

/** Approvers by default, until someone is switched on or off by hand. */
const DEFAULT_APPROVER_NAMES = ["moshe nahum"];

/**
 * Who can take an ETA change live. The owner and Moshe, as asked; anyone else
 * can be added (or either of them removed) with `notificationPrefs.etaApprover`
 * under Settings › Users & Roles.
 */
export function canApproveEta(
  user: Pick<SessionUser, "email" | "name">,
  prefs: unknown,
): boolean {
  const explicit = (prefs as { etaApprover?: boolean } | null)?.etaApprover;
  if (typeof explicit === "boolean") return explicit;
  if (isOwner(user.email)) return true;
  return DEFAULT_APPROVER_NAMES.includes((user.name ?? "").trim().toLowerCase());
}

/**
 * The day an ETA falls on, which is all an ETA really is. A date typed into a
 * form arrives at midnight; the one the system set carries the time of day it
 * was set at. Comparing those as instants would read every save of an
 * untouched form as a change — and ask a designer to justify it.
 */
const day = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? "invalid" : t.toISOString().slice(0, 10);
};

/** Is this actually a different date? Same day in, same day out is a no-op. */
export function etaDiffers(a: Date | string | null | undefined, b: Date | string | null | undefined): boolean {
  return day(a) !== day(b);
}

/**
 * Does this edit have to wait for a yes? Only when a date that already exists
 * is being moved or cleared by someone who can't approve it themselves.
 */
export function etaChangeNeedsApproval(input: {
  currentEta: Date | string | null | undefined;
  nextEta: Date | string | null | undefined;
  /** Whether the person making the edit can approve ETA changes. */
  canApprove: boolean;
}): boolean {
  if (input.canApprove) return false;
  if (!input.currentEta) return false; // a first date isn't a change
  return etaDiffers(input.currentEta, input.nextEta);
}

/** How a pending change reads in a list: "12 Nov → 3 Dec", or "→ cleared". */
export function describeEtaChange(
  currentEta: Date | string | null | undefined,
  proposedEta: Date | string | null | undefined,
  format: (d: Date) => string,
): string {
  const from = currentEta ? format(new Date(currentEta)) : "no date";
  const to = proposedEta ? format(new Date(proposedEta)) : "cleared";
  return `${from} → ${to}`;
}
