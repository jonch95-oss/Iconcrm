/**
 * Reading a comment's photos, old rows and new.
 * Run with: npx tsx tests/comment-images.test.ts
 */
import assert from "node:assert";
import { commentImages } from "../src/lib/comment-images";

// The new field is the truth when it has anything in it.
assert.deepEqual(commentImages({ imageUrls: ["a", "b"], imageUrl: "a" }), ["a", "b"]);
assert.deepEqual(commentImages({ imageUrls: ["a", "b", "c"] }), ["a", "b", "c"]);

// A row written before the change — or by anything that still only sets the
// single field — still shows its photo.
assert.deepEqual(commentImages({ imageUrls: [], imageUrl: "legacy.jpg" }), ["legacy.jpg"]);
assert.deepEqual(commentImages({ imageUrl: "legacy.jpg" }), ["legacy.jpg"]);

// Nothing attached.
assert.deepEqual(commentImages({ imageUrls: [], imageUrl: null }), []);
assert.deepEqual(commentImages({}), []);
assert.deepEqual(commentImages({ imageUrls: null, imageUrl: null }), []);

console.log("comment-images: all tests passed");
