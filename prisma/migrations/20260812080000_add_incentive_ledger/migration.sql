-- CreateEnum
CREATE TYPE "IncentiveType" AS ENUM ('SALE_ITEM', 'QUOTATION_SERVICE', 'SERVICE_JOB');

-- CreateEnum
CREATE TYPE "IncentiveStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "Incentive" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "type" "IncentiveType" NOT NULL,
    "status" "IncentiveStatus" NOT NULL DEFAULT 'POSTED',
    "sourceCode" TEXT NOT NULL,
    "sourceDate" TIMESTAMP(3) NOT NULL,
    "basisAmount" DECIMAL(12,2) NOT NULL,
    "ratePercent" DECIMAL(7,4) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "branchId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "saleId" TEXT,
    "serviceJobId" TEXT,
    "postedById" TEXT,
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incentive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Incentive_sourceKey_key" ON "Incentive"("sourceKey");

-- CreateIndex
CREATE INDEX "Incentive_branchId_sourceDate_idx" ON "Incentive"("branchId", "sourceDate");

-- CreateIndex
CREATE INDEX "Incentive_staffId_sourceDate_idx" ON "Incentive"("staffId", "sourceDate");

-- CreateIndex
CREATE INDEX "Incentive_type_status_idx" ON "Incentive"("type", "status");

-- CreateIndex
CREATE INDEX "Incentive_saleId_idx" ON "Incentive"("saleId");

-- CreateIndex
CREATE INDEX "Incentive_serviceJobId_idx" ON "Incentive"("serviceJobId");

-- CreateIndex
CREATE INDEX "Incentive_postedById_idx" ON "Incentive"("postedById");

-- CreateIndex
CREATE INDEX "Incentive_reversedById_idx" ON "Incentive"("reversedById");

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_serviceJobId_fkey" FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
