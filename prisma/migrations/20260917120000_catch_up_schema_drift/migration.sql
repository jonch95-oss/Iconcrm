-- Catch-up migration.
--
-- Parts of the schema were applied to the running database with `prisma db
-- push`, which changes the database but leaves no migration behind. The result:
-- a database built from prisma/migrations alone came out missing four enum
-- values, ten columns and four tables, so a fresh environment (a new staging
-- copy, a restore, a developer's machine) couldn't run the app. This adds the
-- missing pieces.
--
-- Every statement is guarded, because the live database already has all of it:
-- there it is a no-op, and it is safe to run twice. Nothing here drops a table,
-- a column or a row — the only DROP relaxes a NOT NULL, which removes a rule,
-- not data.
--
-- Postgres 12+ is required for ALTER TYPE ... ADD VALUE IF NOT EXISTS inside a
-- transaction (Neon is well past that).

-- Sample statuses added after the initial migration.
ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'revisions_requested';
ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'on_hold';
ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'produced_without_sample';
ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'approved_by_image';

-- Per-color comments and their images.
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "skuVariantId" TEXT;

-- Grouping, photo hashing, and the sample-level size/material fields.
ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "excludeFromGrouping" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "imageHash" TEXT;
ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "material" TEXT;
ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "size" TEXT;

-- Per-color photos, receipts and revision flags.
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "imageHash" TEXT;
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "received" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "revisionsRequestedAt" TIMESTAMP(3);
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "sampleEta" TIMESTAMP(3);
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "sampleReceivedDate" TIMESTAMP(3);
-- UPCs are issued after the SKU exists, so the column can't be required.
-- Dropping a NOT NULL that is already gone is itself a no-op.
ALTER TABLE "SkuVariant" ALTER COLUMN "upc" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "CustomerPoLine" (
    "id" TEXT NOT NULL,
    "customerPoId" TEXT NOT NULL,
    "styleNumber" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "size" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPoLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryMovement" (
    "id" TEXT NOT NULL,
    "skuVariantId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT,
    "source" TEXT,
    "refId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ColorCode" (
    "id" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ColorCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HtsMapping" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "htsCode" TEXT NOT NULL,
    "baseDuty" DECIMAL(8,4),
    "tariff301" DECIMAL(8,4),
    "tariffIeepa" DECIMAL(8,4),
    "tariffRecip" DECIMAL(8,4),
    "totalTariff" DECIMAL(8,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HtsMapping_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerPoLine_customerPoId_idx" ON "CustomerPoLine"("customerPoId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_skuVariantId_idx" ON "InventoryMovement"("skuVariantId");
CREATE UNIQUE INDEX IF NOT EXISTS "ColorCode_color_key" ON "ColorCode"("color");
CREATE UNIQUE INDEX IF NOT EXISTS "HtsMapping_category_material_key" ON "HtsMapping"("category", "material");
CREATE INDEX IF NOT EXISTS "Comment_skuVariantId_idx" ON "Comment"("skuVariantId");

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each one swallows the
-- "already there" error and moves on.
DO $$ BEGIN
  ALTER TABLE "Comment" ADD CONSTRAINT "Comment_skuVariantId_fkey" FOREIGN KEY ("skuVariantId") REFERENCES "SkuVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerPoLine" ADD CONSTRAINT "CustomerPoLine_customerPoId_fkey" FOREIGN KEY ("customerPoId") REFERENCES "CustomerPO"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
