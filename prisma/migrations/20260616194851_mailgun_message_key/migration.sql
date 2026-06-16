-- Add Mailgun stored-message dedup key
ALTER TABLE "InboundEmail" ADD COLUMN "mailgunMessageKey" TEXT;
CREATE UNIQUE INDEX "InboundEmail_mailgunMessageKey_key" ON "InboundEmail"("mailgunMessageKey");
