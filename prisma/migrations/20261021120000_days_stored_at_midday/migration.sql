-- Dates that mean a day, moved from midnight to midday.
--
-- A day stored at midnight UTC reads as the day before once it is shown in
-- New York time — midnight UTC is 7pm the previous evening there — so every
-- ETA, ship date and deadline typed into the app came back out a day early.
-- Midday survives being read anywhere this business works, and still slices
-- back to the same yyyy-mm-dd for comparisons and for date inputs.
--
-- Only values sitting exactly on midnight are moved, which is what a typed
-- day looks like and what a recorded moment never does. Running this twice
-- changes nothing the second time.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('Sample', 'sampleEta'),
      ('Sample', 'sampleReceivedDate'),
      ('Sample', 'shippedDate'),
      ('Sample', 'trackingEta'),
      ('SkuVariant', 'sampleEta'),
      ('SkuVariant', 'sampleReceivedDate'),
      ('SkuVariant', 'shippedDate'),
      ('EtaChangeRequest', 'currentEta'),
      ('EtaChangeRequest', 'proposedEta'),
      ('EtaRevision', 'oldEta'),
      ('EtaRevision', 'newEta'),
      ('ProformaInvoice', 'piDate'),
      ('ProformaInvoice', 'depositPaidDate'),
      ('ProformaInvoice', 'balancePaidDate'),
      ('PurchaseOrder', 'factoryEta'),
      ('PurchaseOrder', 'inspectionDate'),
      ('PurchaseOrder', 'shipDate'),
      ('CustomerPO', 'receivedDate'),
      ('CustomerPO', 'startShipDate'),
      ('CustomerPO', 'cancelDate'),
      ('PackingList', 'etd'),
      ('PackingList', 'eta'),
      ('Shipment', 'originalEtd'),
      ('Shipment', 'originalEta'),
      ('Shipment', 'currentEtd'),
      ('Shipment', 'currentEta'),
      ('Shipment', 'atd'),
      ('Shipment', 'ata'),
      ('ShipmentRisk', 'projectedDeliveryDate'),
      ('ProductionSample', 'dueDate')
    ) AS t(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = target.tbl
        AND column_name = target.col
    ) THEN
      EXECUTE format(
        'UPDATE %I SET %I = %I + interval ''12 hours'' WHERE %I = date_trunc(''day'', %I)',
        target.tbl, target.col, target.col, target.col, target.col
      );
    END IF;
  END LOOP;
END $$;
