/**
 * Photos must come out as something a browser draws, or not be stored at all.
 * Run with: npx tsx tests/image-normalize.test.ts
 */
import assert from "node:assert";
import sharp from "sharp";
import { normalizeImage } from "../src/lib/image";

(async () => {
  const opaque = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#c83232" } }).jpeg().toBuffer();
  const transparent = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();

  // An opaque photo becomes a JPEG, shrunk into the 1000px box.
  const a = (await normalizeImage(opaque))!;
  assert.equal(a.ext, "jpeg");
  assert.equal(a.contentType, "image/jpeg");
  const am = await sharp(a.buffer).metadata();
  assert.equal(am.format, "jpeg");
  assert.equal(am.width, 1000);

  // Transparency survives as PNG — flattening a cutout would paint a
  // background that isn't in the source.
  const b = (await normalizeImage(transparent))!;
  assert.equal(b.ext, "png");
  assert.equal((await sharp(b.buffer).metadata()).hasAlpha, true);

  // EMF — what Excel writes for a pasted picture. Office draws it, browsers
  // don't, so it must be refused rather than stored as a photo.
  const emf = Buffer.alloc(200);
  emf.writeUInt32LE(1, 0);
  emf.write(" EMF", 0x28, "ascii");
  assert.equal(await normalizeImage(emf), null);

  // Anything else unreadable is refused too.
  assert.equal(await normalizeImage(Buffer.from("not an image at all")), null);
  assert.equal(await normalizeImage(Buffer.alloc(0)), null);

  // A real image is never refused.
  assert.notEqual(await normalizeImage(await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer()), null);

  console.log("image-normalize: all tests passed");
})();
