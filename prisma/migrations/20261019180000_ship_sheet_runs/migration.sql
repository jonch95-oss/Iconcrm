-- Every read of the factory's status sheet leaves a line, so "is it picking
-- the sheet up?" is answered on the screen rather than in the server logs.
CREATE TABLE IF NOT EXISTS "ShipSheetRun" (
  "id"         TEXT NOT NULL,
  "source"     TEXT NOT NULL,
  "ok"         BOOLEAN NOT NULL DEFAULT false,
  "sheetRows"  INTEGER NOT NULL DEFAULT 0,
  "matched"    INTEGER NOT NULL DEFAULT 0,
  "written"    INTEGER NOT NULL DEFAULT 0,
  "unmatched"  INTEGER NOT NULL DEFAULT 0,
  "error"      TEXT,
  "ranById"    TEXT,
  "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ShipSheetRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShipSheetRun_startedAt_idx" ON "ShipSheetRun" ("startedAt");

DO $$ BEGIN
  ALTER TABLE "ShipSheetRun" ADD CONSTRAINT "ShipSheetRun_ranById_fkey"
    FOREIGN KEY ("ranById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
