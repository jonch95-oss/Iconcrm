-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'member', 'viewer');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'RMB', 'EUR');

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('sample_requested', 'eta_set', 'sample_received', 'quoted', 'on_order_form', 'pi_received', 'pi_matched', 'po_issued', 'in_production', 'shipped', 'packing_list_matched', 'closed', 'dropped');

-- CreateEnum
CREATE TYPE "DroppedReason" AS ENUM ('customer_passed', 'price_too_high', 'quality_fail', 'factory_issue', 'other');

-- CreateEnum
CREATE TYPE "OrderFormStatus" AS ENUM ('draft', 'sent', 'superseded');

-- CreateEnum
CREATE TYPE "PIStatus" AS ENUM ('received', 'under_review', 'approved', 'disputed');

-- CreateEnum
CREATE TYPE "LineResolution" AS ENUM ('pending', 'approved', 'disputed');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('issued', 'deposit_paid', 'in_production', 'inspection', 'ready_to_ship', 'shipped', 'delivered');

-- CreateEnum
CREATE TYPE "PackingMatchStatus" AS ENUM ('matched', 'short', 'over');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('parsed', 'needs_review', 'ignored');

-- CreateEnum
CREATE TYPE "EtaParentType" AS ENUM ('sample', 'po');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "role" "Role" NOT NULL DEFAULT 'member',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notificationPrefs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Factory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "country" TEXT,
    "paymentTermsDefault" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Factory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sample" (
    "id" TEXT NOT NULL,
    "sampleNumber" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "styleName" TEXT,
    "styleNumber" TEXT,
    "description" TEXT,
    "status" "SampleStatus" NOT NULL DEFAULT 'sample_requested',
    "requestedById" TEXT,
    "requestedByExternal" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceEmailId" TEXT,
    "sampleEta" TIMESTAMP(3),
    "sampleReceivedDate" TIMESTAMP(3),
    "fobCost" DECIMAL(12,4),
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "fobPort" TEXT,
    "customerSellPrice" DECIMAL(12,4),
    "factoryId" TEXT,
    "targetCustomer" TEXT,
    "droppedReason" "DroppedReason",
    "lastFollowUpAt" TIMESTAMP(3),
    "followUpStopped" BOOLEAN NOT NULL DEFAULT false,
    "followUpCadenceDays" INTEGER NOT NULL DEFAULT 7,
    "snoozeUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuVariant" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "upc" TEXT NOT NULL,
    "skuCode" TEXT,
    "unitsPerCarton" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkuVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "userId" TEXT,
    "authorLabel" TEXT,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtaRevision" (
    "id" TEXT NOT NULL,
    "parentType" "EtaParentType" NOT NULL,
    "parentId" TEXT NOT NULL,
    "oldEta" TIMESTAMP(3),
    "newEta" TIMESTAMP(3),
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EtaRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderForm" (
    "id" TEXT NOT NULL,
    "orderFormNumber" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "status" "OrderFormStatus" NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "sentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFormLine" (
    "id" TEXT NOT NULL,
    "orderFormId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "skuVariantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "fobCostSnapshot" DECIMAL(12,4),
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFormLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProformaInvoice" (
    "id" TEXT NOT NULL,
    "piNumber" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "orderFormId" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "paymentTerms" TEXT,
    "depositPercent" DECIMAL(5,2),
    "depositPaidDate" TIMESTAMP(3),
    "balancePaidDate" TIMESTAMP(3),
    "piDate" TIMESTAMP(3),
    "status" "PIStatus" NOT NULL DEFAULT 'received',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProformaInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PILine" (
    "id" TEXT NOT NULL,
    "piId" TEXT NOT NULL,
    "sampleId" TEXT,
    "skuVariantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "fobSnapshot" DECIMAL(12,4),
    "variance" DECIMAL(12,4),
    "variancePercent" DECIMAL(8,4),
    "resolution" "LineResolution" NOT NULL DEFAULT 'pending',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PILine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "piId" TEXT NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "factoryEta" TIMESTAMP(3),
    "status" "POStatus" NOT NULL DEFAULT 'issued',
    "productionNotes" TEXT,
    "inspectionDate" TIMESTAMP(3),
    "shipDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPO" (
    "id" TEXT NOT NULL,
    "customerPoNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "receivedDate" TIMESTAMP(3),
    "totalValue" DECIMAL(14,2),
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPO_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPoLink" (
    "id" TEXT NOT NULL,
    "customerPoId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPoLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingList" (
    "id" TEXT NOT NULL,
    "piId" TEXT NOT NULL,
    "poId" TEXT,
    "shipmentRef" TEXT,
    "vesselOrAwb" TEXT,
    "etd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingListLine" (
    "id" TEXT NOT NULL,
    "packingListId" TEXT NOT NULL,
    "skuVariantId" TEXT NOT NULL,
    "cartons" INTEGER NOT NULL DEFAULT 0,
    "unitsShipped" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackingListLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT,
    "cc" TEXT,
    "subject" TEXT,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsedSampleId" TEXT,
    "parseStatus" "ParseStatus" NOT NULL DEFAULT 'needs_review',
    "parseNotes" TEXT,
    "rawPayload" JSONB,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorLabel" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "parentType" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Sample_sampleNumber_key" ON "Sample"("sampleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Sample_sourceEmailId_key" ON "Sample"("sourceEmailId");

-- CreateIndex
CREATE INDEX "Sample_status_idx" ON "Sample"("status");

-- CreateIndex
CREATE INDEX "Sample_factoryId_idx" ON "Sample"("factoryId");

-- CreateIndex
CREATE INDEX "Sample_brand_idx" ON "Sample"("brand");

-- CreateIndex
CREATE UNIQUE INDEX "SkuVariant_upc_key" ON "SkuVariant"("upc");

-- CreateIndex
CREATE INDEX "SkuVariant_sampleId_idx" ON "SkuVariant"("sampleId");

-- CreateIndex
CREATE INDEX "Comment_sampleId_idx" ON "Comment"("sampleId");

-- CreateIndex
CREATE INDEX "EtaRevision_parentType_parentId_idx" ON "EtaRevision"("parentType", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderForm_orderFormNumber_key" ON "OrderForm"("orderFormNumber");

-- CreateIndex
CREATE INDEX "OrderFormLine_orderFormId_idx" ON "OrderFormLine"("orderFormId");

-- CreateIndex
CREATE INDEX "OrderFormLine_sampleId_idx" ON "OrderFormLine"("sampleId");

-- CreateIndex
CREATE INDEX "ProformaInvoice_factoryId_idx" ON "ProformaInvoice"("factoryId");

-- CreateIndex
CREATE INDEX "PILine_piId_idx" ON "PILine"("piId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPO_customerPoNumber_key" ON "CustomerPO"("customerPoNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPoLink_customerPoId_purchaseOrderId_key" ON "CustomerPoLink"("customerPoId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "PackingList_piId_idx" ON "PackingList"("piId");

-- CreateIndex
CREATE INDEX "PackingListLine_packingListId_idx" ON "PackingListLine"("packingListId");

-- CreateIndex
CREATE INDEX "InboundEmail_parseStatus_idx" ON "InboundEmail"("parseStatus");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Attachment_parentType_parentId_idx" ON "Attachment"("parentType", "parentId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuVariant" ADD CONSTRAINT "SkuVariant_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtaRevision" ADD CONSTRAINT "EtaRevision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderForm" ADD CONSTRAINT "OrderForm_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderForm" ADD CONSTRAINT "OrderForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFormLine" ADD CONSTRAINT "OrderFormLine_orderFormId_fkey" FOREIGN KEY ("orderFormId") REFERENCES "OrderForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFormLine" ADD CONSTRAINT "OrderFormLine_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFormLine" ADD CONSTRAINT "OrderFormLine_skuVariantId_fkey" FOREIGN KEY ("skuVariantId") REFERENCES "SkuVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_orderFormId_fkey" FOREIGN KEY ("orderFormId") REFERENCES "OrderForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PILine" ADD CONSTRAINT "PILine_piId_fkey" FOREIGN KEY ("piId") REFERENCES "ProformaInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PILine" ADD CONSTRAINT "PILine_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PILine" ADD CONSTRAINT "PILine_skuVariantId_fkey" FOREIGN KEY ("skuVariantId") REFERENCES "SkuVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_piId_fkey" FOREIGN KEY ("piId") REFERENCES "ProformaInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPoLink" ADD CONSTRAINT "CustomerPoLink_customerPoId_fkey" FOREIGN KEY ("customerPoId") REFERENCES "CustomerPO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPoLink" ADD CONSTRAINT "CustomerPoLink_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_piId_fkey" FOREIGN KEY ("piId") REFERENCES "ProformaInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingListLine" ADD CONSTRAINT "PackingListLine_packingListId_fkey" FOREIGN KEY ("packingListId") REFERENCES "PackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingListLine" ADD CONSTRAINT "PackingListLine_skuVariantId_fkey" FOREIGN KEY ("skuVariantId") REFERENCES "SkuVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
