-- CreateTable
CREATE TABLE "CashCustodianAssignment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashCustodianAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashCustodianAssignment_branchId_idx" ON "CashCustodianAssignment"("branchId");

-- CreateIndex
CREATE INDEX "CashCustodianAssignment_branchId_endedAt_idx" ON "CashCustodianAssignment"("branchId", "endedAt");

-- CreateIndex
CREATE INDEX "CashCustodianAssignment_userId_idx" ON "CashCustodianAssignment"("userId");

-- CreateIndex
CREATE INDEX "CashCustodianAssignment_userId_endedAt_idx" ON "CashCustodianAssignment"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "CashCustodianAssignment_assignedById_idx" ON "CashCustodianAssignment"("assignedById");

-- CreateIndex
CREATE INDEX "CashCustodianAssignment_endedById_idx" ON "CashCustodianAssignment"("endedById");

-- CreateIndex
CREATE INDEX "CashCustodianAssignment_assignedAt_idx" ON "CashCustodianAssignment"("assignedAt");

-- CreateIndex
CREATE INDEX "CashCustodianAssignment_endedAt_idx" ON "CashCustodianAssignment"("endedAt");

-- AddForeignKey
ALTER TABLE "CashCustodianAssignment" ADD CONSTRAINT "CashCustodianAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCustodianAssignment" ADD CONSTRAINT "CashCustodianAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCustodianAssignment" ADD CONSTRAINT "CashCustodianAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCustodianAssignment" ADD CONSTRAINT "CashCustodianAssignment_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exactly one active cash custodian assignment may exist per branch.
-- Historical ended assignments are intentionally preserved.
CREATE UNIQUE INDEX "CashCustodianAssignment_one_active_per_branch"
ON "CashCustodianAssignment" ("branchId")
WHERE "endedAt" IS NULL;
