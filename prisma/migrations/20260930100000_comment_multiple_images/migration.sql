-- A comment can carry several reference photos (front, back, the detail of
-- the fault) instead of one.
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Carry the existing single image across, so nothing already attached
-- disappears. Guarded on empty so re-running can't duplicate it.
UPDATE "Comment"
   SET "imageUrls" = ARRAY["imageUrl"]
 WHERE "imageUrl" IS NOT NULL
   AND cardinality("imageUrls") = 0;
