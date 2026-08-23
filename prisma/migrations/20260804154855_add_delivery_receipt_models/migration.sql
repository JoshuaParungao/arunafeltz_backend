-- CreateEnum
CREATE TYPE "DeliveryReceiptStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DeliveryReceipt" (
    "id" TEXT NOT NULL,
    "drCode" TEXT NOT NULL,
    "status" "DeliveryReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "drDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT,
    "customerAddress" TEXT,
    "customerContactNo" TEXT,
    "preparedByName" TEXT,
    "receivedByName" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "issuedById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryReceiptItem" (
    "id" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemCodeSnapshot" TEXT,
    "itemDescription" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "cashDiscountedPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deliveryReceiptId" TEXT NOT NULL,
    "saleItemId" TEXT,
    "itemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryReceipt_saleId_key" ON "DeliveryReceipt"("saleId");

-- CreateIndex
CREATE INDEX "DeliveryReceipt_branchId_idx" ON "DeliveryReceipt"("branchId");

-- CreateIndex
CREATE INDEX "DeliveryReceipt_saleId_idx" ON "DeliveryReceipt"("saleId");

-- CreateIndex
CREATE INDEX "DeliveryReceipt_status_idx" ON "DeliveryReceipt"("status");

-- CreateIndex
CREATE INDEX "DeliveryReceipt_drDate_idx" ON "DeliveryReceipt"("drDate");

-- CreateIndex
CREATE INDEX "DeliveryReceipt_createdById_idx" ON "DeliveryReceipt"("createdById");

-- CreateIndex
CREATE INDEX "DeliveryReceipt_updatedById_idx" ON "DeliveryReceipt"("updatedById");

-- CreateIndex
CREATE INDEX "DeliveryReceipt_issuedById_idx" ON "DeliveryReceipt"("issuedById");

-- CreateIndex
CREATE INDEX "DeliveryReceipt_cancelledById_idx" ON "DeliveryReceipt"("cancelledById");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryReceipt_branchId_drCode_key" ON "DeliveryReceipt"("branchId", "drCode");

-- CreateIndex
CREATE INDEX "DeliveryReceiptItem_deliveryReceiptId_idx" ON "DeliveryReceiptItem"("deliveryReceiptId");

-- CreateIndex
CREATE INDEX "DeliveryReceiptItem_saleItemId_idx" ON "DeliveryReceiptItem"("saleItemId");

-- CreateIndex
CREATE INDEX "DeliveryReceiptItem_itemId_idx" ON "DeliveryReceiptItem"("itemId");

-- AddForeignKey
ALTER TABLE "DeliveryReceipt" ADD CONSTRAINT "DeliveryReceipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceipt" ADD CONSTRAINT "DeliveryReceipt_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceipt" ADD CONSTRAINT "DeliveryReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceipt" ADD CONSTRAINT "DeliveryReceipt_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceipt" ADD CONSTRAINT "DeliveryReceipt_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceipt" ADD CONSTRAINT "DeliveryReceipt_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceiptItem" ADD CONSTRAINT "DeliveryReceiptItem_deliveryReceiptId_fkey" FOREIGN KEY ("deliveryReceiptId") REFERENCES "DeliveryReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceiptItem" ADD CONSTRAINT "DeliveryReceiptItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReceiptItem" ADD CONSTRAINT "DeliveryReceiptItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
