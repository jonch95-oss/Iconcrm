/**
 * Photos have to survive the round trip to a browser. Excel hands us whatever
 * was pasted into the sheet — often EMF/WMF, which Office renders and browsers
 * don't — and phones hand us HEIC. Storing those bytes leaves a sample with a
 * photo URL that displays as an empty frame: the app thinks it has a picture,
 * the page shows nothing, and there's no error anywhere to explain it.
 *
 * So every photo goes through here first and comes out as PNG or JPEG, or
 * doesn't get stored at all.
 */

export type NormalizedImage = { buffer: Buffer; ext: "png" | "jpeg"; contentType: string };

/** Formats every current browser draws. Used when sharp isn't available. */
function sniff(buffer: Buffer): "png" | "jpeg" | "gif" | "webp" | null {
  if (buffer.length < 12) return null;
  const hex = buffer.subarray(0, 4).toString("hex");
  if (hex === "89504e47") return "png";
  if (hex.startsWith("ffd8ff")) return "jpeg";
  if (buffer.subarray(0, 3).toString("ascii") === "GIF") return "gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP")
    return "webp";
  return null;
}

/**
 * Re-encode a photo for the web, shrinking it to fit a 1000px box (they render
 * as thumbnails; full-resolution originals just cost storage and bandwidth).
 * Transparency is kept as PNG — flattening a cutout would paint a background
 * that isn't in the source — and everything else becomes JPEG.
 *
 * Returns null when the bytes aren't an image a browser could draw, which is
 * the caller's cue to skip it and say so rather than store a dead link.
 */
export async function normalizeImage(buffer: Buffer): Promise<NormalizedImage | null> {
  const sharp = await import("sharp").then((m) => m.default).catch(() => null);
  if (!sharp) {
    // No sharp (it can fail to load on some runtimes): store the original, but
    // only if the bytes are a format browsers can draw.
    const kind = sniff(buffer);
    if (!kind) return null;
    const ext = kind === "png" ? "png" : "jpeg";
    return { buffer, ext, contentType: `image/${kind}` };
  }
  try {
    const meta = await sharp(buffer).metadata();
    const base = sharp(buffer).resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true });
    if (meta.hasAlpha) {
      return { buffer: await base.png({ compressionLevel: 9 }).toBuffer(), ext: "png", contentType: "image/png" };
    }
    return {
      buffer: await base.flatten({ background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer(),
      ext: "jpeg",
      contentType: "image/jpeg",
    };
  } catch {
    return null;
  }
}

/** What to tell someone whose photo couldn't be used. */
export const UNREADABLE_IMAGE_HINT =
  "the image format can't be shown in a browser (Excel saves pasted pictures as EMF/WMF; phones save HEIC). Insert it into the sheet with Insert › Picture › From file, or save it as JPEG/PNG first.";
