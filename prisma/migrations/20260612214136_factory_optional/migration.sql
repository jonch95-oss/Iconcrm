-- DropForeignKey
ALTER TABLE "OrderForm" DROP CONSTRAINT "OrderForm_factoryId_fkey";

-- DropForeignKey
ALTER TABLE "ProformaInvoice" DROP CONSTRAINT "ProformaInvoice_factoryId_fkey";

-- AlterTable
ALTER TABLE "OrderForm" ALTER COLUMN "factoryId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProformaInvoice" ALTER COLUMN "factoryId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "OrderForm" ADD CONSTRAINT "OrderForm_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
