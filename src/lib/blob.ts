import { put } from "@vercel/blob";

/**
 * Upload a file buffer to Vercel Blob and return its public URL. When no token
 * is configured (local dev), returns a placeholder URL so flows still work.
 */
export async function uploadBlob(
  filename: string,
  data: Buffer | string,
  contentType?: string,
): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return `local://uploads/${Date.now()}-${filename}`;
  }
  const blob = await put(filename, data, {
    access: "public",
    token,
    contentType,
    addRandomSuffix: true,
  });
  return blob.url;
}
