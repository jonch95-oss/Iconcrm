ALTER TABLE "InboundEmail" ADD COLUMN IF NOT EXISTS "mailgunMessageKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "InboundEmail_mailgunMessageKey_key" ON "InboundEmail"("mailgunMessageKey");
