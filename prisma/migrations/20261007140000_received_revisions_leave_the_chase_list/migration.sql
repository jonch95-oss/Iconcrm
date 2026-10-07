-- A revised sample received from the samples table kept its "Revisions
-- Requested" status, so it stayed on the chase list for good while the
-- dashboard tile (which looked at the received date instead) dropped it —
-- the two disagreeing about the same sample. Receiving now advances the
-- status; these are the rows that were already stuck.
--
-- Safe to read as "received after the revision was asked for": requesting
-- revisions clears the received date, so a row carrying both can only have
-- been received afterwards.
UPDATE "Sample"
   SET "status" = 'sample_received'
 WHERE "status" = 'revisions_requested'
   AND "sampleReceivedDate" IS NOT NULL;
