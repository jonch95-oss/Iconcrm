import type { SessionUser } from "@/lib/session";
import { isOwner } from "@/lib/owner";

/**
 * Who sees the outstanding-revisions badge in the nav. It's a chase-list for
 * the people who own the factory conversation, not a company-wide counter, so
 * it's off unless someone is opted in.
 *
 * Stored per user in `notificationPrefs.revisionBadge`; the two defaults below
 * cover the people it was asked for, and the checkbox under
 * Settings › Users & Roles changes it for anyone (including them).
 */
const DEFAULT_ON_NAMES = ["moshe nahum"];

export function canSeeRevisionBadge(
  user: Pick<SessionUser, "email" | "name">,
  prefs: unknown,
): boolean {
  const explicit = (prefs as { revisionBadge?: boolean } | null)?.revisionBadge;
  if (typeof explicit === "boolean") return explicit;
  if (isOwner(user.email)) return true;
  return DEFAULT_ON_NAMES.includes((user.name ?? "").trim().toLowerCase());
}
