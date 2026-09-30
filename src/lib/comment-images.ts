/**
 * Reference photos on a comment.
 *
 * `imageUrls` is the real store; `imageUrl` is the original single-image field
 * that predates it. Old rows were backfilled by the migration, but reading
 * through here means a row written by anything that still only knows about
 * `imageUrl` can't come out looking empty.
 */
export function commentImages(comment: {
  imageUrls?: string[] | null;
  imageUrl?: string | null;
}): string[] {
  const many = comment.imageUrls ?? [];
  if (many.length > 0) return many;
  return comment.imageUrl ? [comment.imageUrl] : [];
}

/** How many photos one comment may carry. Enough for every view of a style. */
export const MAX_COMMENT_IMAGES = 8;
