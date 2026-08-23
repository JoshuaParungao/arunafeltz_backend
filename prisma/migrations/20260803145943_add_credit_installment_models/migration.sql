-- CreateEnum
CREATE TYPE "InstallmentTerm" AS ENUM ('STRAIGHT', 'MONTH_3', 'MONTH_6', 'MONTH_9', 'MONTH_12', 'MONTH_18', 'MONTH_24');

-- CreateEnum
CREATE TYPE "CreditAccountStatus" AS ENUM ('ACTIVE', 'PAID', 'CANCELLED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "CreditCollectionStatus" AS ENUM ('POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "creditCode" TEXT NOT NULL,
    "status" "CreditAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "term" "InstallmentTerm" NOT NULL,
    "termBasis" DECIMAL(8,4) NOT NULL,
    "cashPromoTotalAmount" DECIMAL(12,2) NOT NULL,
    "regularPriceTotalAmount" DECIMAL(12,2) NOT NULL,
    "downpaymentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balanceAmount" DECIMAL(12,2) NOT NULL,
    "monthlyDueAmount" DECIMAL(12,2),
    "totalCollected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remainingBalance" DECIMAL(12,2) NOT NULL,
    "dueDay" INTEGER,
    "firstDueDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "remarks" TEXT,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCollection" (
    "id" TEXT NOT NULL,
    "collectionCode" TEXT NOT NULL,
    "status" "CreditCollectionStatus" NOT NULL DEFAULT 'POSTED',
    "amount" DECIMAL(12,2) NOT NULL,
    "previousBalance" DECIMAL(12,2) NOT NULL,
    "newBalance" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "SalePaymentMethod" NOT NULL DEFAULT 'CASH',
    "referenceNo" TEXT,
    "remarks" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "creditAccountId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "collectedById" TEXT,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_saleId_key" ON "CreditAccount"("saleId");

-- CreateIndex
CREATE INDEX "CreditAccount_branchId_idx" ON "CreditAccount"("branchId");

-- CreateIndex
CREATE INDEX "CreditAccount_customerId_idx" ON "CreditAccount"("customerId");

-- CreateIndex
CREATE INDEX "CreditAccount_saleId_idx" ON "CreditAccount"("saleId");

-- CreateIndex
CREATE INDEX "CreditAccount_status_idx" ON "CreditAccount"("status");

-- CreateIndex
CREATE INDEX "CreditAccount_term_idx" ON "CreditAccount"("term");

-- CreateIndex
CREATE INDEX "CreditAccount_nextDueDate_idx" ON "CreditAccount"("nextDueDate");

-- CreateIndex
CREATE INDEX "CreditAccount_createdById_idx" ON "CreditAccount"("createdById");

-- CreateIndex
CREATE INDEX "CreditAccount_updatedById_idx" ON "CreditAccount"("updatedById");

-- CreateIndex
CREATE INDEX "CreditAccount_cancelledById_idx" ON "CreditAccount"("cancelledById");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_branchId_creditCode_key" ON "CreditAccount"("branchId", "creditCode");

-- CreateIndex
CREATE INDEX "CreditCollection_creditAccountId_idx" ON "CreditCollection"("creditAccountId");

-- CreateIndex
CREATE INDEX "CreditCollection_branchId_idx" ON "CreditCollection"("branchId");

-- CreateIndex
CREATE INDEX "CreditCollection_customerId_idx" ON "CreditCollection"("customerId");

-- CreateIndex
CREATE INDEX "CreditCollection_status_idx" ON "CreditCollection"("status");

-- CreateIndex
CREATE INDEX "CreditCollection_paymentMethod_idx" ON "CreditCollection"("paymentMethod");

-- CreateIndex
CREATE INDEX "CreditCollection_paidAt_idx" ON "CreditCollection"("paidAt");

-- CreateIndex
CREATE INDEX "CreditCollection_collectedById_idx" ON "CreditCollection"("collectedById");

-- CreateIndex
CREATE INDEX "CreditCollection_createdById_idx" ON "CreditCollection"("createdById");

-- CreateIndex
CREATE INDEX "CreditCollection_cancelledById_idx" ON "CreditCollection"("cancelledById");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCollection_branchId_collectionCode_key" ON "CreditCollection"("branchId", "collectionCode");

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCollection" ADD CONSTRAINT "CreditCollection_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCollection" ADD CONSTRAINT "CreditCollection_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCollection" ADD CONSTRAINT "CreditCollection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCollection" ADD CONSTRAINT "CreditCollection_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCollection" ADD CONSTRAINT "CreditCollection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCollection" ADD CONSTRAINT "CreditCollection_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
