-- CreateEnum
CREATE TYPE "CashHandoverStatus" AS ENUM ('PENDING', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CashHandover" (
    "id" TEXT NOT NULL,
    "handoverCode" TEXT NOT NULL,
    "status" "CashHandoverStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "remarks" TEXT,
    "cancellationReason" TEXT,
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cashBoxId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "createdById" TEXT,
    "receivedById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashHandover_cashBoxId_idx" ON "CashHandover"("cashBoxId");

-- CreateIndex
CREATE INDEX "CashHandover_branchId_idx" ON "CashHandover"("branchId");

-- CreateIndex
CREATE INDEX "CashHandover_status_idx" ON "CashHandover"("status");

-- CreateIndex
CREATE INDEX "CashHandover_fromUserId_idx" ON "CashHandover"("fromUserId");

-- CreateIndex
CREATE INDEX "CashHandover_toUserId_idx" ON "CashHandover"("toUserId");

-- CreateIndex
CREATE INDEX "CashHandover_createdById_idx" ON "CashHandover"("createdById");

-- CreateIndex
CREATE INDEX "CashHandover_receivedById_idx" ON "CashHandover"("receivedById");

-- CreateIndex
CREATE INDEX "CashHandover_cancelledById_idx" ON "CashHandover"("cancelledById");

-- CreateIndex
CREATE UNIQUE INDEX "CashHandover_branchId_handoverCode_key" ON "CashHandover"("branchId", "handoverCode");

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_cashBoxId_fkey" FOREIGN KEY ("cashBoxId") REFERENCES "CashBox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
