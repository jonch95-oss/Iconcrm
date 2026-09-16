-- Triage state for the Revisions & Comments board.
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "acknowledgedById" TEXT;
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMP(3);
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "dismissedById" TEXT;
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "assigneeId" TEXT;
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "assignedById" TEXT;

-- Who did it: per-color flags and receipts.
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "receivedById" TEXT;
ALTER TABLE "SkuVariant" ADD COLUMN IF NOT EXISTS "revisionsRequestedById" TEXT;
ALTER TABLE "Sample" ADD COLUMN IF NOT EXISTS "receivedById" TEXT;

CREATE INDEX IF NOT EXISTS "Comment_assigneeId_idx" ON "Comment"("assigneeId");
CREATE INDEX IF NOT EXISTS "Comment_acknowledgedAt_idx" ON "Comment"("acknowledgedAt");

DO $$ BEGIN
  ALTER TABLE "Comment" ADD CONSTRAINT "Comment_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Comment" ADD CONSTRAINT "Comment_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Comment" ADD CONSTRAINT "Comment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Comment" ADD CONSTRAINT "Comment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SkuVariant" ADD CONSTRAINT "SkuVariant_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SkuVariant" ADD CONSTRAINT "SkuVariant_revisionsRequestedById_fkey" FOREIGN KEY ("revisionsRequestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Sample" ADD CONSTRAINT "Sample_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
