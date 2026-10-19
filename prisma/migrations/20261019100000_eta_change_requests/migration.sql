-- Moving an ETA that already exists is a request now: who wants it moved, to
-- when, and why — until the owner or Moshe takes it live. First dates and the
-- ones the system sets itself are not changes and go straight on as before.
DO $$ BEGIN
  CREATE TYPE "EtaChangeStatus" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EtaChangeRequest" (
  "id"            TEXT NOT NULL,
  "sampleId"      TEXT NOT NULL,
  "skuVariantId"  TEXT,
  "currentEta"    TIMESTAMP(3),
  "proposedEta"   TIMESTAMP(3),
  "reason"        TEXT NOT NULL,
  "status"        "EtaChangeStatus" NOT NULL DEFAULT 'pending',
  "requestedById" TEXT,
  "decidedById"   TEXT,
  "decidedAt"     TIMESTAMP(3),
  "decisionNote"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EtaChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EtaChangeRequest_status_createdAt_idx" ON "EtaChangeRequest" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "EtaChangeRequest_sampleId_idx" ON "EtaChangeRequest" ("sampleId");
CREATE INDEX IF NOT EXISTS "EtaChangeRequest_skuVariantId_idx" ON "EtaChangeRequest" ("skuVariantId");

DO $$ BEGIN
  ALTER TABLE "EtaChangeRequest" ADD CONSTRAINT "EtaChangeRequest_sampleId_fkey"
    FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EtaChangeRequest" ADD CONSTRAINT "EtaChangeRequest_skuVariantId_fkey"
    FOREIGN KEY ("skuVariantId") REFERENCES "SkuVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EtaChangeRequest" ADD CONSTRAINT "EtaChangeRequest_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EtaChangeRequest" ADD CONSTRAINT "EtaChangeRequest_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
