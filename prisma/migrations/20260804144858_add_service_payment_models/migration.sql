-- CreateEnum
CREATE TYPE "ServicePaymentMethod" AS ENUM ('CASH', 'GCASH', 'BANK_TRANSFER', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "ServicePaymentStatus" AS ENUM ('POSTED');

-- AlterEnum
ALTER TYPE "CashTransactionSource" ADD VALUE 'SERVICE_JOB';

-- AlterEnum
ALTER TYPE "CashTransactionType" ADD VALUE 'SERVICE_PAYMENT';

-- CreateTable
CREATE TABLE "ServicePayment" (
    "id" TEXT NOT NULL,
    "paymentCode" TEXT NOT NULL,
    "paymentMethod" "ServicePaymentMethod" NOT NULL,
    "status" "ServicePaymentStatus" NOT NULL DEFAULT 'POSTED',
    "amount" DECIMAL(12,2) NOT NULL,
    "referenceNo" TEXT,
    "remarks" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceJobId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "collectedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServicePayment_serviceJobId_key" ON "ServicePayment"("serviceJobId");

-- CreateIndex
CREATE INDEX "ServicePayment_serviceJobId_idx" ON "ServicePayment"("serviceJobId");

-- CreateIndex
CREATE INDEX "ServicePayment_branchId_idx" ON "ServicePayment"("branchId");

-- CreateIndex
CREATE INDEX "ServicePayment_customerId_idx" ON "ServicePayment"("customerId");

-- CreateIndex
CREATE INDEX "ServicePayment_paymentMethod_idx" ON "ServicePayment"("paymentMethod");

-- CreateIndex
CREATE INDEX "ServicePayment_status_idx" ON "ServicePayment"("status");

-- CreateIndex
CREATE INDEX "ServicePayment_paidAt_idx" ON "ServicePayment"("paidAt");

-- CreateIndex
CREATE INDEX "ServicePayment_collectedById_idx" ON "ServicePayment"("collectedById");

-- CreateIndex
CREATE INDEX "ServicePayment_createdById_idx" ON "ServicePayment"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePayment_branchId_paymentCode_key" ON "ServicePayment"("branchId", "paymentCode");

-- AddForeignKey
ALTER TABLE "ServicePayment" ADD CONSTRAINT "ServicePayment_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePayment" ADD CONSTRAINT "ServicePayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePayment" ADD CONSTRAINT "ServicePayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePayment" ADD CONSTRAINT "ServicePayment_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePayment" ADD CONSTRAINT "ServicePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
