-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('IN', 'CHECKING', 'SENT_TO_SUPPLIER', 'APPROVED', 'REJECTED', 'REPAIRED', 'REPLACED', 'OUT');

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL,
    "claimCode" TEXT NOT NULL,
    "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'IN',
    "issueDescription" TEXT NOT NULL,
    "customerComplaint" TEXT,
    "diagnosis" TEXT,
    "actionTaken" TEXT,
    "supplierName" TEXT,
    "supplierReferenceNo" TEXT,
    "remarks" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkingAt" TIMESTAMP(3),
    "sentToSupplierAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "repairedAt" TIMESTAMP(3),
    "replacedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "itemId" TEXT,
    "serialId" TEXT,
    "saleId" TEXT,
    "saleItemId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "statusUpdatedById" TEXT,
    "releasedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarrantyClaim_branchId_idx" ON "WarrantyClaim"("branchId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_customerId_idx" ON "WarrantyClaim"("customerId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_itemId_idx" ON "WarrantyClaim"("itemId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_serialId_idx" ON "WarrantyClaim"("serialId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_saleId_idx" ON "WarrantyClaim"("saleId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_saleItemId_idx" ON "WarrantyClaim"("saleItemId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_status_idx" ON "WarrantyClaim"("status");

-- CreateIndex
CREATE INDEX "WarrantyClaim_receivedAt_idx" ON "WarrantyClaim"("receivedAt");

-- CreateIndex
CREATE INDEX "WarrantyClaim_createdById_idx" ON "WarrantyClaim"("createdById");

-- CreateIndex
CREATE INDEX "WarrantyClaim_updatedById_idx" ON "WarrantyClaim"("updatedById");

-- CreateIndex
CREATE INDEX "WarrantyClaim_statusUpdatedById_idx" ON "WarrantyClaim"("statusUpdatedById");

-- CreateIndex
CREATE INDEX "WarrantyClaim_releasedById_idx" ON "WarrantyClaim"("releasedById");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_branchId_claimCode_key" ON "WarrantyClaim"("branchId", "claimCode");

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "ItemSerial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_statusUpdatedById_fkey" FOREIGN KEY ("statusUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
