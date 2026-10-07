-- A factory quotes per material, so two colors of one style rarely share a
-- price, a material, or even a style number on the factory's own sheet. Each
-- color can now carry all three; the sample's values stay the fallback.
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "fobCost" DECIMAL(10,2);
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "material" TEXT;
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "styleNumber" TEXT;

CREATE INDEX IF NOT EXISTS "SkuVariant_styleNumber_idx" ON "SkuVariant" ("styleNumber");
