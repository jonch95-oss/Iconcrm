/**
 * Idempotent column safeguard. Ensures columns the running app reads always
 * exist, even if a prior P3005 baseline marked migrations "applied" without
 * running their SQL. Safe to run repeatedly. Invoked by migrate-deploy.mjs
 * after migrations. Never fails the build — logs and continues.
 */
import { PrismaClient } from "@prisma/client";

const STATEMENTS = [
  `ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "color" TEXT`,
  `ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "season" TEXT`,
  `ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "size" TEXT`,
  `ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "material" TEXT`,
  `ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "imageHash" TEXT`,
  `ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT`,
  `ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'revisions_requested'`,
  `ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'on_hold'`,
  `ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'produced_without_sample'`,
  `ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'approved_by_image'`,
  `ALTER TABLE "SkuVariant" ALTER COLUMN "upc" DROP NOT NULL`,
  `ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "received" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT`,
  `ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "imageHash" TEXT`,
  `ALTER TABLE "InboundEmail" ADD COLUMN IF NOT EXISTS "mailgunMessageKey" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "InboundEmail_mailgunMessageKey_key" ON "InboundEmail"("mailgunMessageKey")`,
  `CREATE TABLE IF NOT EXISTS "CustomerPoLine" (
    "id" TEXT NOT NULL,
    "customerPoId" TEXT NOT NULL,
    "styleNumber" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "size" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPoLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerPoLine_customerPoId_fkey" FOREIGN KEY ("customerPoId") REFERENCES "CustomerPO"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "CustomerPoLine_customerPoId_idx" ON "CustomerPoLine"("customerPoId")`,
  `CREATE TABLE IF NOT EXISTS "InventoryMovement" (
    "id" TEXT NOT NULL,
    "skuVariantId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT,
    "source" TEXT,
    "refId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "InventoryMovement_skuVariantId_idx" ON "InventoryMovement"("skuVariantId")`,
  `CREATE TABLE IF NOT EXISTS "ColorCode" (
    "id" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ColorCode_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ColorCode_color_key" ON "ColorCode"("color")`,
  `CREATE TABLE IF NOT EXISTS "HtsMapping" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "material" TEXT NOT NULL DEFAULT '',
    "htsCode" TEXT NOT NULL,
    "baseDuty" DECIMAL(8,4),
    "totalTariff" DECIMAL(8,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HtsMapping_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "HtsMapping_category_material_key" ON "HtsMapping"("category","material")`,
  `ALTER TABLE "HtsMapping" ADD COLUMN IF NOT EXISTS "tariff301" DECIMAL(8,4)`,
  `ALTER TABLE "HtsMapping" ADD COLUMN IF NOT EXISTS "tariffIeepa" DECIMAL(8,4)`,
  `ALTER TABLE "HtsMapping" ADD COLUMN IF NOT EXISTS "tariffRecip" DECIMAL(8,4)`,
];

const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DIRECT_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!url) {
  console.warn("[ensure-columns] no database URL — skipping.");
  process.exit(0);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

let ok = 0;
for (const sql of STATEMENTS) {
  try {
    await prisma.$executeRawUnsafe(sql);
    ok++;
  } catch (e) {
    console.warn("[ensure-columns] skipped:", (e?.message ?? String(e)).slice(0, 140));
  }
}
// ---------------------------------------------------------------------------
// SKU casing: SKUs are the sample # + color code, uppercased. Backfill any
// legacy lowercase skuCodes so display is consistent (idempotent).
// ---------------------------------------------------------------------------
try {
  const n = await prisma.$executeRawUnsafe(
    `UPDATE "SkuVariant" SET "skuCode" = upper("skuCode")
       WHERE "skuCode" IS NOT NULL AND "skuCode" <> upper("skuCode")`,
  );
  if (Number(n) > 0) console.log(`[ensure-columns] skuCodes uppercased: ${Number(n)}.`);
} catch (e) {
  console.warn("[ensure-columns] sku casing skipped:", (e?.message ?? String(e)).slice(0, 140));
}

// ---------------------------------------------------------------------------
// Brand hygiene (idempotent, non-destructive). Brands are admin-managed via
// settings.brands. Earlier builds seeded a PLACEHOLDER brand list; repair it to
// the real brands so the dropdown, import normalization and this cleanup all
// key off the correct set. Then merge case/space variants of each approved
// brand into its canonical spelling. We intentionally do NOT blank brands here:
// a wrong/short list would wipe real data. Enforcement happens at the dropdown
// and on import instead.
// ---------------------------------------------------------------------------
const REAL_BRANDS = [
  "Ted Baker", "Champion", "Off White", "Off White L/AB",
  "Palm Angels", "Palm Angels PLAY", "Pink London",
];
const PLACEHOLDER_BRANDS = ["Aurora", "Northwind", "Coastline", "Vertex", "Maple & Co"];
try {
  const norm = (x) => String(x ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const row = await prisma.$queryRawUnsafe(
    `SELECT value FROM "AppSetting" WHERE key = 'app_settings' LIMIT 1`,
  );
  const val = row?.[0]?.value ?? null;
  let brands = Array.isArray(val?.brands) && val.brands.length ? val.brands : REAL_BRANDS;

  // Repair a persisted placeholder list (or a missing/empty one) to the real
  // brands, writing it back so getSettings() serves the correct list.
  const isPlaceholder =
    !Array.isArray(val?.brands) ||
    val.brands.length === 0 ||
    JSON.stringify(brands.map(norm).sort()) === JSON.stringify(PLACEHOLDER_BRANDS.map(norm).sort());
  if (val && isPlaceholder) {
    brands = REAL_BRANDS;
    await prisma.$executeRawUnsafe(
      `UPDATE "AppSetting" SET value = jsonb_set(value, '{brands}', $1::jsonb) WHERE key = 'app_settings'`,
      JSON.stringify(REAL_BRANDS),
    );
    console.log("[ensure-columns] brands: repaired placeholder settings.brands -> real list.");
  }

  // Merge case/space variants into the canonical spelling (safe, no deletions).
  let merged = 0;
  for (const canon of brands) {
    const n = await prisma.$executeRawUnsafe(
      `UPDATE "Sample" SET "brand" = $1
         WHERE "brand" IS NOT NULL
           AND lower(btrim(regexp_replace("brand", '\s+', ' ', 'g'))) = lower(btrim($1))
           AND "brand" <> $1`,
      canon,
    );
    merged += Number(n) || 0;
  }
  console.log(`[ensure-columns] brands: merged ${merged} variant(s) (list of ${brands.length}).`);
} catch (e) {
  console.warn("[ensure-columns] brand cleanup skipped:", (e?.message ?? String(e)).slice(0, 160));
}

await prisma.$disconnect();
console.log(`[ensure-columns] ${ok}/${STATEMENTS.length} ensured.`);
