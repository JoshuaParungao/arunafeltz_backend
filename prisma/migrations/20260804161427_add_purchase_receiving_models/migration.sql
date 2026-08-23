-- CreateEnum
CREATE TYPE "PurchaseReceivingStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PurchaseReceiving" (
    "id" TEXT NOT NULL,
    "receivingCode" TEXT NOT NULL,
    "status" "PurchaseReceivingStatus" NOT NULL DEFAULT 'DRAFT',
    "receivingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplierDeliveryNo" TEXT,
    "supplierInvoiceNo" TEXT,
    "referenceNo" TEXT,
    "supplierNameSnapshot" TEXT,
    "supplierContactSnapshot" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "cancellationReason" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "postedById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReceiving_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceivingItem" (
    "id" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantityReceived" DECIMAL(12,2) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "batchCode" TEXT,
    "expiryDate" TIMESTAMP(3),
    "purchaseReceivingId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReceivingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseReceiving_branchId_idx" ON "PurchaseReceiving"("branchId");

-- CreateIndex
CREATE INDEX "PurchaseReceiving_supplierId_idx" ON "PurchaseReceiving"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseReceiving_purchaseOrderId_idx" ON "PurchaseReceiving"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseReceiving_status_idx" ON "PurchaseReceiving"("status");

-- CreateIndex
CREATE INDEX "PurchaseReceiving_receivingDate_idx" ON "PurchaseReceiving"("receivingDate");

-- CreateIndex
CREATE INDEX "PurchaseReceiving_createdById_idx" ON "PurchaseReceiving"("createdById");

-- CreateIndex
CREATE INDEX "PurchaseReceiving_updatedById_idx" ON "PurchaseReceiving"("updatedById");

-- CreateIndex
CREATE INDEX "PurchaseReceiving_postedById_idx" ON "PurchaseReceiving"("postedById");

-- CreateIndex
CREATE INDEX "PurchaseReceiving_cancelledById_idx" ON "PurchaseReceiving"("cancelledById");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceiving_branchId_receivingCode_key" ON "PurchaseReceiving"("branchId", "receivingCode");

-- CreateIndex
CREATE INDEX "PurchaseReceivingItem_purchaseReceivingId_idx" ON "PurchaseReceivingItem"("purchaseReceivingId");

-- CreateIndex
CREATE INDEX "PurchaseReceivingItem_purchaseOrderItemId_idx" ON "PurchaseReceivingItem"("purchaseOrderItemId");

-- CreateIndex
CREATE INDEX "PurchaseReceivingItem_itemId_idx" ON "PurchaseReceivingItem"("itemId");

-- CreateIndex
CREATE INDEX "PurchaseReceivingItem_batchCode_idx" ON "PurchaseReceivingItem"("batchCode");

-- CreateIndex
CREATE INDEX "PurchaseReceivingItem_expiryDate_idx" ON "PurchaseReceivingItem"("expiryDate");

-- AddForeignKey
ALTER TABLE "PurchaseReceiving" ADD CONSTRAINT "PurchaseReceiving_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiving" ADD CONSTRAINT "PurchaseReceiving_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiving" ADD CONSTRAINT "PurchaseReceiving_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiving" ADD CONSTRAINT "PurchaseReceiving_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiving" ADD CONSTRAINT "PurchaseReceiving_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiving" ADD CONSTRAINT "PurchaseReceiving_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiving" ADD CONSTRAINT "PurchaseReceiving_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceivingItem" ADD CONSTRAINT "PurchaseReceivingItem_purchaseReceivingId_fkey" FOREIGN KEY ("purchaseReceivingId") REFERENCES "PurchaseReceiving"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceivingItem" ADD CONSTRAINT "PurchaseReceivingItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceivingItem" ADD CONSTRAINT "PurchaseReceivingItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
