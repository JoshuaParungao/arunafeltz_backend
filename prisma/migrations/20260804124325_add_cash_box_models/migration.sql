-- CreateEnum
CREATE TYPE "CashBoxStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CashTransactionType" AS ENUM ('CASH_IN', 'CASH_OUT', 'SALE_PAYMENT', 'CREDIT_COLLECTION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateEnum
CREATE TYPE "CashTransactionStatus" AS ENUM ('POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashTransactionSource" AS ENUM ('MANUAL', 'SALE', 'CREDIT_COLLECTION', 'SYSTEM_ADJUSTMENT');

-- CreateTable
CREATE TABLE "CashBox" (
    "id" TEXT NOT NULL,
    "boxCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CashBoxStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTransaction" (
    "id" TEXT NOT NULL,
    "transactionCode" TEXT NOT NULL,
    "type" "CashTransactionType" NOT NULL,
    "status" "CashTransactionStatus" NOT NULL DEFAULT 'POSTED',
    "source" "CashTransactionSource" NOT NULL DEFAULT 'MANUAL',
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceBefore" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "referenceNo" TEXT,
    "sourceId" TEXT,
    "sourceCode" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cashBoxId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashBox_branchId_idx" ON "CashBox"("branchId");

-- CreateIndex
CREATE INDEX "CashBox_status_idx" ON "CashBox"("status");

-- CreateIndex
CREATE INDEX "CashBox_createdById_idx" ON "CashBox"("createdById");

-- CreateIndex
CREATE INDEX "CashBox_updatedById_idx" ON "CashBox"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "CashBox_branchId_boxCode_key" ON "CashBox"("branchId", "boxCode");

-- CreateIndex
CREATE INDEX "CashTransaction_cashBoxId_idx" ON "CashTransaction"("cashBoxId");

-- CreateIndex
CREATE INDEX "CashTransaction_branchId_idx" ON "CashTransaction"("branchId");

-- CreateIndex
CREATE INDEX "CashTransaction_type_idx" ON "CashTransaction"("type");

-- CreateIndex
CREATE INDEX "CashTransaction_status_idx" ON "CashTransaction"("status");

-- CreateIndex
CREATE INDEX "CashTransaction_source_idx" ON "CashTransaction"("source");

-- CreateIndex
CREATE INDEX "CashTransaction_transactionDate_idx" ON "CashTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "CashTransaction_createdById_idx" ON "CashTransaction"("createdById");

-- CreateIndex
CREATE INDEX "CashTransaction_cancelledById_idx" ON "CashTransaction"("cancelledById");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransaction_branchId_transactionCode_key" ON "CashTransaction"("branchId", "transactionCode");

-- AddForeignKey
ALTER TABLE "CashBox" ADD CONSTRAINT "CashBox_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashBox" ADD CONSTRAINT "CashBox_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashBox" ADD CONSTRAINT "CashBox_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_cashBoxId_fkey" FOREIGN KEY ("cashBoxId") REFERENCES "CashBox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
