"use client";

import { upload } from "@vercel/blob/client";
import { MAX_COMMENT_IMAGES } from "@/lib/comment-images";

/**
 * Can this browser actually draw the file? Comment photos go straight from the
 * browser to Blob to get past the request body cap, so the server never sees
 * the bytes and can't re-encode them. Decoding here catches the same things
 * that guard catches — a HEIC off a phone, a picture pasted out of Excel —
 * before a photo nobody can see gets stored.
 */
export async function isDrawable(file: File): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(file);
    const ok = bitmap.width > 0 && bitmap.height > 0;
    bitmap.close();
    return ok;
  } catch {
    return false;
  }
}

export type UploadResult = { urls: string[]; rejected: string[] };

/** Upload comment photos, skipping any the browser can't draw. */
export async function uploadCommentImages(prefix: string, files: File[]): Promise<UploadResult> {
  const urls: string[] = [];
  const rejected: string[] = [];
  for (const file of files.slice(0, MAX_COMMENT_IMAGES)) {
    if (!(await isDrawable(file))) {
      rejected.push(file.name);
      continue;
    }
    const blob = await upload(`${prefix}/${Date.now()}-${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/import/blob-upload",
    });
    urls.push(blob.url);
  }
  return { urls, rejected };
}
