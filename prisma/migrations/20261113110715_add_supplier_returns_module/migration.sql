-- CreateEnum
CREATE TYPE "SupplierReturnStatus" AS ENUM ('DRAFT', 'APPROVED', 'OUT_TO_SUPPLIER', 'PARTIALLY_RESOLVED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierReturnSourceType" AS ENUM ('STORE_DEFECT', 'CUSTOMER_WARRANTY', 'CUSTOMER_RETURN', 'MIXED');

-- CreateEnum
CREATE TYPE "SupplierReturnItemSourceType" AS ENUM ('STORE_DEFECT', 'CUSTOMER_WARRANTY', 'CUSTOMER_RETURN');

-- CreateEnum
CREATE TYPE "SupplierReturnResolutionType" AS ENUM ('PENDING', 'REPLACEMENT', 'REPAIRED', 'CREDIT_MEMO', 'REFUND', 'RETURN_TO_CUSTOMER_DEFECTIVE', 'SCRAP_SHRINKAGE', 'MIXED');

-- CreateEnum
CREATE TYPE "SupplierReturnItemResolutionStatus" AS ENUM ('PENDING', 'REPLACED', 'REPAIRED', 'CREDIT_MEMO', 'REFUND', 'RETURNED_DEFECTIVE', 'SCRAPPED');

-- AlterTable
ALTER TABLE "WarrantyClaim" ADD COLUMN     "supplierReturnId" TEXT;

-- CreateTable
CREATE TABLE "SupplierReturn" (
    "id" TEXT NOT NULL,
    "returnCode" TEXT NOT NULL,
    "status" "SupplierReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "SupplierReturnSourceType" NOT NULL DEFAULT 'STORE_DEFECT',
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierRmaNumber" TEXT,
    "supplierNameSnapshot" TEXT,
    "supplierContactSnapshot" TEXT,
    "driverName" TEXT,
    "driverContact" TEXT,
    "vehiclePlate" TEXT,
    "courierName" TEXT,
    "trackingNumber" TEXT,
    "dispatchDate" TIMESTAMP(3),
    "expectedResolutionDate" TIMESTAMP(3),
    "resolvedDate" TIMESTAMP(3),
    "resolutionType" "SupplierReturnResolutionType" NOT NULL DEFAULT 'PENDING',
    "creditMemoNumber" TEXT,
    "creditMemoAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "internalNotes" TEXT,
    "resolutionNotes" TEXT,
    "rejectionReason" TEXT,
    "cancellationReason" TEXT,
    "subtotalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "approvedById" TEXT,
    "dispatchedById" TEXT,
    "resolvedById" TEXT,
    "cancelledById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturnItem" (
    "id" TEXT NOT NULL,
    "supplierReturnId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemSerialId" TEXT,
    "serialNumberSnapshot" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "defectReason" TEXT NOT NULL,
    "defectCategory" TEXT,
    "sourceType" "SupplierReturnItemSourceType" NOT NULL DEFAULT 'STORE_DEFECT',
    "warrantyClaimId" TEXT,
    "returnRequestId" TEXT,
    "resolutionStatus" "SupplierReturnItemResolutionStatus" NOT NULL DEFAULT 'PENDING',
    "resolutionNotes" TEXT,
    "replacementItemId" TEXT,
    "replacementSerialId" TEXT,
    "replacementSerialNumber" TEXT,
    "repairedAt" TIMESTAMP(3),
    "replacedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierReturn_branchId_idx" ON "SupplierReturn"("branchId");

-- CreateIndex
CREATE INDEX "SupplierReturn_supplierId_idx" ON "SupplierReturn"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierReturn_status_idx" ON "SupplierReturn"("status");

-- CreateIndex
CREATE INDEX "SupplierReturn_sourceType_idx" ON "SupplierReturn"("sourceType");

-- CreateIndex
CREATE INDEX "SupplierReturn_resolutionType_idx" ON "SupplierReturn"("resolutionType");

-- CreateIndex
CREATE INDEX "SupplierReturn_dispatchDate_idx" ON "SupplierReturn"("dispatchDate");

-- CreateIndex
CREATE INDEX "SupplierReturn_createdById_idx" ON "SupplierReturn"("createdById");

-- CreateIndex
CREATE INDEX "SupplierReturn_updatedById_idx" ON "SupplierReturn"("updatedById");

-- CreateIndex
CREATE INDEX "SupplierReturn_approvedById_idx" ON "SupplierReturn"("approvedById");

-- CreateIndex
CREATE INDEX "SupplierReturn_dispatchedById_idx" ON "SupplierReturn"("dispatchedById");

-- CreateIndex
CREATE INDEX "SupplierReturn_resolvedById_idx" ON "SupplierReturn"("resolvedById");

-- CreateIndex
CREATE INDEX "SupplierReturn_cancelledById_idx" ON "SupplierReturn"("cancelledById");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReturn_branchId_returnCode_key" ON "SupplierReturn"("branchId", "returnCode");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_supplierReturnId_idx" ON "SupplierReturnItem"("supplierReturnId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_itemId_idx" ON "SupplierReturnItem"("itemId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_itemSerialId_idx" ON "SupplierReturnItem"("itemSerialId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_warrantyClaimId_idx" ON "SupplierReturnItem"("warrantyClaimId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_returnRequestId_idx" ON "SupplierReturnItem"("returnRequestId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_resolutionStatus_idx" ON "SupplierReturnItem"("resolutionStatus");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_sourceType_idx" ON "SupplierReturnItem"("sourceType");

-- CreateIndex
CREATE INDEX "WarrantyClaim_supplierReturnId_idx" ON "WarrantyClaim"("supplierReturnId");

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "SupplierReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_itemSerialId_fkey" FOREIGN KEY ("itemSerialId") REFERENCES "ItemSerial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_warrantyClaimId_fkey" FOREIGN KEY ("warrantyClaimId") REFERENCES "WarrantyClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_replacementItemId_fkey" FOREIGN KEY ("replacementItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_replacementSerialId_fkey" FOREIGN KEY ("replacementSerialId") REFERENCES "ItemSerial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "SupplierReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
