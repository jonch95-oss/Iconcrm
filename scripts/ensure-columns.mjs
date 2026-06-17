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
