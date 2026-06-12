-- AlterTable
ALTER TABLE "Sample" ADD COLUMN     "trackingCarrier" TEXT,
ADD COLUMN     "trackingEta" TIMESTAMP(3),
ADD COLUMN     "trackingNumber" TEXT,
ADD COLUMN     "trackingStatus" TEXT;
