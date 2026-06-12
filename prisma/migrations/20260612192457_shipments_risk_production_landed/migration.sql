-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('booked', 'in_transit', 'arrived_port', 'inland', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('on_track', 'at_risk', 'late_for_window', 'early_for_window', 'no_window');

-- CreateEnum
CREATE TYPE "ProductionStage" AS ENUM ('pp', 'top');

-- CreateEnum
CREATE TYPE "ProductionApproval" AS ENUM ('pending', 'approved', 'rejected');

-- AlterEnum
ALTER TYPE "EtaParentType" ADD VALUE 'shipment';

-- AlterTable
ALTER TABLE "CustomerPO" ADD COLUMN     "cancelDate" TIMESTAMP(3),
ADD COLUMN     "deliveryLocation" TEXT,
ADD COLUMN     "startShipDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PackingList" ADD COLUMN     "shipmentId" TEXT;

-- AlterTable
ALTER TABLE "Sample" ADD COLUMN     "dutyRatePercent" DECIMAL(6,3),
ADD COLUMN     "freightPerUnit" DECIMAL(12,4),
ADD COLUMN     "inlandPerUnit" DECIMAL(12,4);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "shipmentRef" TEXT NOT NULL,
    "containerNumber" TEXT,
    "mblNumber" TEXT,
    "bookingNumber" TEXT,
    "carrierScac" TEXT,
    "vesselName" TEXT,
    "voyage" TEXT,
    "pol" TEXT,
    "pod" TEXT,
    "finalDestination" TEXT,
    "originalEtd" TIMESTAMP(3),
    "originalEta" TIMESTAMP(3),
    "currentEtd" TIMESTAMP(3),
    "currentEta" TIMESTAMP(3),
    "atd" TIMESTAMP(3),
    "ata" TIMESTAMP(3),
    "inlandBufferDays" INTEGER NOT NULL DEFAULT 5,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'booked',
    "trackingProvider" TEXT,
    "trackingSubscriptionId" TEXT,
    "lastTrackingSyncAt" TIMESTAMP(3),
    "milestones" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentRisk" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "customerPoId" TEXT NOT NULL,
    "status" "RiskStatus" NOT NULL,
    "projectedDeliveryDate" TIMESTAMP(3),
    "slipDays" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionSample" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "stage" "ProductionStage" NOT NULL,
    "status" "ProductionApproval" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ShipmentPOs" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ShipmentPOs_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shipmentRef_key" ON "Shipment"("shipmentRef");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_containerNumber_idx" ON "Shipment"("containerNumber");

-- CreateIndex
CREATE INDEX "ShipmentRisk_status_idx" ON "ShipmentRisk"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentRisk_shipmentId_customerPoId_key" ON "ShipmentRisk"("shipmentId", "customerPoId");

-- CreateIndex
CREATE INDEX "ProductionSample_poId_idx" ON "ProductionSample"("poId");

-- CreateIndex
CREATE INDEX "_ShipmentPOs_B_index" ON "_ShipmentPOs"("B");

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentRisk" ADD CONSTRAINT "ShipmentRisk_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentRisk" ADD CONSTRAINT "ShipmentRisk_customerPoId_fkey" FOREIGN KEY ("customerPoId") REFERENCES "CustomerPO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionSample" ADD CONSTRAINT "ProductionSample_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionSample" ADD CONSTRAINT "ProductionSample_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShipmentPOs" ADD CONSTRAINT "_ShipmentPOs_A_fkey" FOREIGN KEY ("A") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShipmentPOs" ADD CONSTRAINT "_ShipmentPOs_B_fkey" FOREIGN KEY ("B") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
