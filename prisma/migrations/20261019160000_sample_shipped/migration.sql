-- When the factory sent a sample, and what it travelled on. The factory's
-- weekly status sheet lists this per color, so the colors carry their own and
-- the sample keeps the earliest of them (and its own, for styles with no
-- color rows at all).
ALTER TABLE "Sample"     ADD COLUMN IF NOT EXISTS "shippedDate" TIMESTAMP(3);
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "shippedDate" TIMESTAMP(3);
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT;
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "trackingCarrier" TEXT;

CREATE INDEX IF NOT EXISTS "Sample_shippedDate_idx" ON "Sample" ("shippedDate");
