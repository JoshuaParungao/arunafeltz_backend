-- CreateEnum
CREATE TYPE "PurchaseReceivingPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- AlterTable
ALTER TABLE "PurchaseReceiving" ADD COLUMN     "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentStatus" "PurchaseReceivingPaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- CreateTable
CREATE TABLE "PurchaseReceivingPayment" (
    "id" TEXT NOT NULL,
    "purchaseReceivingId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "referenceNo" TEXT,
    "notes" TEXT,
    "cashBoxId" TEXT,
    "cashTransactionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReceivingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseReceivingPayment_purchaseReceivingId_idx" ON "PurchaseReceivingPayment"("purchaseReceivingId");

-- CreateIndex
CREATE INDEX "PurchaseReceivingPayment_branchId_idx" ON "PurchaseReceivingPayment"("branchId");

-- CreateIndex
CREATE INDEX "PurchaseReceivingPayment_supplierId_idx" ON "PurchaseReceivingPayment"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseReceivingPayment_paymentDate_idx" ON "PurchaseReceivingPayment"("paymentDate");

-- CreateIndex
CREATE INDEX "PurchaseReceivingPayment_cashBoxId_idx" ON "PurchaseReceivingPayment"("cashBoxId");

-- CreateIndex
CREATE INDEX "PurchaseReceiving_paymentStatus_idx" ON "PurchaseReceiving"("paymentStatus");

-- AddForeignKey
ALTER TABLE "PurchaseReceivingPayment" ADD CONSTRAINT "PurchaseReceivingPayment_purchaseReceivingId_fkey" FOREIGN KEY ("purchaseReceivingId") REFERENCES "PurchaseReceiving"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceivingPayment" ADD CONSTRAINT "PurchaseReceivingPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceivingPayment" ADD CONSTRAINT "PurchaseReceivingPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceivingPayment" ADD CONSTRAINT "PurchaseReceivingPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
