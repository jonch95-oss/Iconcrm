/**
 * Turning a thrown client-side error into something worth reading.
 *
 * A button on a Next page is wired to the build that served it. Deploy a new
 * build while someone has the page open and their next click goes to an
 * address that no longer exists — the browser reports "Failed to fetch",
 * which sounds like the file, the network or the server, and is none of them.
 * It's a stale tab, and a refresh is the whole fix.
 */
export function describeActionError(e: unknown, fallback = "That didn't work."): string {
  const message = e instanceof Error ? e.message : "";
  if (/failed to fetch|load failed|networkerror|connection closed|fetch failed/i.test(message)) {
    return "The app was updated while this page was open, so the button pointed at the old version. Refresh the page and try again.";
  }
  return message || fallback;
}
