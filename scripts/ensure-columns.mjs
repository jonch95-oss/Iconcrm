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
  `ALTER TYPE "SampleStatus" ADD VALUE IF NOT EXISTS 'revisions_requested'`,
  `ALTER TABLE "SkuVariant" ALTER COLUMN "upc" DROP NOT NULL`,
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
await prisma.$disconnect();
console.log(`[ensure-columns] ${ok}/${STATEMENTS.length} ensured.`);
