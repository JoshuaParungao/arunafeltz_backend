-- Add the compensation classifications without changing access roles.
CREATE TYPE "IncentiveClassification" AS ENUM ('NONE', 'SALES_AGENT', 'SENIOR_SALES_AGENT', 'TECHNICIAN', 'SENIOR_TECHNICIAN');
CREATE TYPE "IncentiveScheduleType" AS ENUM ('EVERY_N_DAYS', 'WEEKLY', 'MONTHLY', 'MANUAL');
CREATE TYPE "IncentiveCycleStatus" AS ENUM ('EARNING', 'CUT_OFF', 'CLAIMABLE', 'CLOSED');
CREATE TYPE "IncentiveClaimStatus" AS ENUM ('UNCLAIMED', 'CLAIMED', 'APPROVED', 'PAID', 'EXPIRED');
CREATE TYPE "ServiceReleaseOutcome" AS ENUM ('REPAIRED', 'SERVICE_COMPLETED', 'UNREPAIRED', 'CUSTOMER_PULL_OUT', 'NO_FAULT_FOUND', 'DECLINED', 'OTHER');

ALTER TABLE "Incentive"
  ADD COLUMN "classificationSnapshot" "IncentiveClassification",
  ADD COLUMN "cycleId" TEXT,
  ADD COLUMN "rateVersionId" TEXT;

ALTER TABLE "InventoryBatch"
  ADD COLUMN "operationalUnitCost" DECIMAL(12,2),
  ADD COLUMN "originBatchId" TEXT;

ALTER TABLE "SaleItem"
  ADD COLUMN "acquisitionUnitCostSnapshot" DECIMAL(12,2),
  ADD COLUMN "operationalUnitCostSnapshot" DECIMAL(12,2);

ALTER TABLE "ServiceJob"
  ADD COLUMN "accessoriesReceived" TEXT,
  ADD COLUMN "customerContactSnapshot" TEXT,
  ADD COLUMN "customerNameSnapshot" TEXT,
  ADD COLUMN "isQuickService" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "receivingRemarks" TEXT,
  ADD COLUMN "releaseNotes" TEXT,
  ADD COLUMN "releaseOutcome" "ServiceReleaseOutcome",
  ADD COLUMN "releasedAt" TIMESTAMP(3),
  ADD COLUMN "releasedById" TEXT,
  ADD COLUMN "serialNumber" TEXT;

ALTER TABLE "StockTransferItem"
  ADD COLUMN "agreedTransferUnitPrice" DECIMAL(12,2),
  ADD COLUMN "destinationItemId" TEXT,
  ADD COLUMN "priceLockedAt" TIMESTAMP(3),
  ADD COLUMN "priceProposedAt" TIMESTAMP(3),
  ADD COLUMN "priceProposedById" TEXT,
  ADD COLUMN "priceSetAt" TIMESTAMP(3),
  ADD COLUMN "priceSetById" TEXT,
  ADD COLUMN "proposedTransferUnitPrice" DECIMAL(12,2),
  ADD COLUMN "transferAmount" DECIMAL(12,2);

ALTER TABLE "StockTransferSerial" ADD COLUMN "allocationId" TEXT;
ALTER TABLE "User" ADD COLUMN "incentiveClassification" "IncentiveClassification" NOT NULL DEFAULT 'NONE';

CREATE TABLE "StockTransferAllocation" (
  "id" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "acquisitionUnitCostSnapshot" DECIMAL(12,2) NOT NULL,
  "sourceOperationalUnitCostSnapshot" DECIMAL(12,2) NOT NULL,
  "destinationOperationalUnitCostSnapshot" DECIMAL(12,2) NOT NULL,
  "transferAmount" DECIMAL(12,2) NOT NULL,
  "stockTransferItemId" TEXT NOT NULL,
  "sourceBatchId" TEXT NOT NULL,
  "destinationBatchId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockTransferAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncentiveRateVersion" (
  "id" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncentiveRateVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncentiveRate" (
  "id" TEXT NOT NULL,
  "classification" "IncentiveClassification" NOT NULL,
  "productRate" DECIMAL(7,4) NOT NULL,
  "serviceRate" DECIMAL(7,4) NOT NULL,
  "rateVersionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncentiveRate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncentiveScheduleVersion" (
  "id" TEXT NOT NULL,
  "scheduleType" "IncentiveScheduleType" NOT NULL,
  "anchorDate" TIMESTAMP(3) NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "everyNDays" INTEGER,
  "claimOpenAfterDays" INTEGER NOT NULL,
  "claimWindowDays" INTEGER NOT NULL,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncentiveScheduleVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncentiveCycle" (
  "id" TEXT NOT NULL,
  "periodCode" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "cutoffDate" TIMESTAMP(3) NOT NULL,
  "claimOpenDate" TIMESTAMP(3) NOT NULL,
  "claimCloseDate" TIMESTAMP(3) NOT NULL,
  "status" "IncentiveCycleStatus" NOT NULL DEFAULT 'EARNING',
  "closedAt" TIMESTAMP(3),
  "scheduleVersionId" TEXT NOT NULL,
  "closedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncentiveCycle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncentiveClaim" (
  "id" TEXT NOT NULL,
  "status" "IncentiveClaimStatus" NOT NULL DEFAULT 'UNCLAIMED',
  "classificationSnapshot" "IncentiveClassification",
  "productBasis" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "productRate" DECIMAL(7,4),
  "productIncentive" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "serviceBasis" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "serviceRate" DECIMAL(7,4),
  "serviceIncentive" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalIncentive" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "claimedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "payoutReference" TEXT,
  "notes" TEXT,
  "cycleId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "claimedById" TEXT,
  "approvedById" TEXT,
  "paidById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncentiveClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncentiveClaimLine" (
  "id" TEXT NOT NULL,
  "type" "IncentiveType" NOT NULL,
  "sourceCode" TEXT NOT NULL,
  "sourceDate" TIMESTAMP(3) NOT NULL,
  "classificationSnapshot" "IncentiveClassification",
  "basisAmount" DECIMAL(12,2) NOT NULL,
  "ratePercent" DECIMAL(7,4) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "claimId" TEXT NOT NULL,
  "incentiveId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncentiveClaimLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockTransferAllocation_stockTransferItemId_idx" ON "StockTransferAllocation"("stockTransferItemId");
CREATE INDEX "StockTransferAllocation_sourceBatchId_idx" ON "StockTransferAllocation"("sourceBatchId");
CREATE INDEX "StockTransferAllocation_destinationBatchId_idx" ON "StockTransferAllocation"("destinationBatchId");
CREATE UNIQUE INDEX "StockTransferAllocation_stockTransferItemId_sourceBatchId_key" ON "StockTransferAllocation"("stockTransferItemId", "sourceBatchId");
CREATE UNIQUE INDEX "IncentiveRateVersion_effectiveFrom_key" ON "IncentiveRateVersion"("effectiveFrom");
CREATE INDEX "IncentiveRateVersion_effectiveFrom_idx" ON "IncentiveRateVersion"("effectiveFrom");
CREATE INDEX "IncentiveRateVersion_createdById_idx" ON "IncentiveRateVersion"("createdById");
CREATE INDEX "IncentiveRate_classification_idx" ON "IncentiveRate"("classification");
CREATE UNIQUE INDEX "IncentiveRate_rateVersionId_classification_key" ON "IncentiveRate"("rateVersionId", "classification");
CREATE UNIQUE INDEX "IncentiveScheduleVersion_effectiveFrom_key" ON "IncentiveScheduleVersion"("effectiveFrom");
CREATE INDEX "IncentiveScheduleVersion_effectiveFrom_idx" ON "IncentiveScheduleVersion"("effectiveFrom");
CREATE INDEX "IncentiveScheduleVersion_createdById_idx" ON "IncentiveScheduleVersion"("createdById");
CREATE UNIQUE INDEX "IncentiveCycle_periodCode_key" ON "IncentiveCycle"("periodCode");
CREATE INDEX "IncentiveCycle_scheduleVersionId_idx" ON "IncentiveCycle"("scheduleVersionId");
CREATE INDEX "IncentiveCycle_status_idx" ON "IncentiveCycle"("status");
CREATE INDEX "IncentiveCycle_claimOpenDate_claimCloseDate_idx" ON "IncentiveCycle"("claimOpenDate", "claimCloseDate");
CREATE INDEX "IncentiveCycle_closedById_idx" ON "IncentiveCycle"("closedById");
CREATE UNIQUE INDEX "IncentiveCycle_startDate_endDate_key" ON "IncentiveCycle"("startDate", "endDate");
CREATE INDEX "IncentiveClaim_branchId_status_idx" ON "IncentiveClaim"("branchId", "status");
CREATE INDEX "IncentiveClaim_staffId_status_idx" ON "IncentiveClaim"("staffId", "status");
CREATE INDEX "IncentiveClaim_claimedById_idx" ON "IncentiveClaim"("claimedById");
CREATE INDEX "IncentiveClaim_approvedById_idx" ON "IncentiveClaim"("approvedById");
CREATE INDEX "IncentiveClaim_paidById_idx" ON "IncentiveClaim"("paidById");
CREATE UNIQUE INDEX "IncentiveClaim_cycleId_staffId_key" ON "IncentiveClaim"("cycleId", "staffId");
CREATE INDEX "IncentiveClaimLine_claimId_idx" ON "IncentiveClaimLine"("claimId");
CREATE INDEX "IncentiveClaimLine_incentiveId_idx" ON "IncentiveClaimLine"("incentiveId");
CREATE INDEX "IncentiveClaimLine_type_idx" ON "IncentiveClaimLine"("type");
CREATE UNIQUE INDEX "IncentiveClaimLine_claimId_incentiveId_key" ON "IncentiveClaimLine"("claimId", "incentiveId");
CREATE INDEX "Incentive_rateVersionId_idx" ON "Incentive"("rateVersionId");
CREATE INDEX "Incentive_cycleId_idx" ON "Incentive"("cycleId");
CREATE INDEX "Incentive_classificationSnapshot_idx" ON "Incentive"("classificationSnapshot");
CREATE INDEX "InventoryBatch_originBatchId_idx" ON "InventoryBatch"("originBatchId");
CREATE INDEX "ServiceJob_releasedById_idx" ON "ServiceJob"("releasedById");
CREATE INDEX "ServiceJob_releasedAt_idx" ON "ServiceJob"("releasedAt");
CREATE INDEX "ServiceJob_releaseOutcome_idx" ON "ServiceJob"("releaseOutcome");
CREATE INDEX "ServiceJob_isQuickService_idx" ON "ServiceJob"("isQuickService");
CREATE INDEX "StockTransferItem_destinationItemId_idx" ON "StockTransferItem"("destinationItemId");
CREATE INDEX "StockTransferItem_priceProposedById_idx" ON "StockTransferItem"("priceProposedById");
CREATE INDEX "StockTransferItem_priceSetById_idx" ON "StockTransferItem"("priceSetById");
CREATE INDEX "StockTransferSerial_allocationId_idx" ON "StockTransferSerial"("allocationId");
CREATE INDEX "User_incentiveClassification_idx" ON "User"("incentiveClassification");

ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_destinationItemId_fkey" FOREIGN KEY ("destinationItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_priceProposedById_fkey" FOREIGN KEY ("priceProposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_priceSetById_fkey" FOREIGN KEY ("priceSetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransferAllocation" ADD CONSTRAINT "StockTransferAllocation_stockTransferItemId_fkey" FOREIGN KEY ("stockTransferItemId") REFERENCES "StockTransferItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransferAllocation" ADD CONSTRAINT "StockTransferAllocation_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferAllocation" ADD CONSTRAINT "StockTransferAllocation_destinationBatchId_fkey" FOREIGN KEY ("destinationBatchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferSerial" ADD CONSTRAINT "StockTransferSerial_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "StockTransferAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_originBatchId_fkey" FOREIGN KEY ("originBatchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_rateVersionId_fkey" FOREIGN KEY ("rateVersionId") REFERENCES "IncentiveRateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "IncentiveCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncentiveRateVersion" ADD CONSTRAINT "IncentiveRateVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncentiveRate" ADD CONSTRAINT "IncentiveRate_rateVersionId_fkey" FOREIGN KEY ("rateVersionId") REFERENCES "IncentiveRateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncentiveScheduleVersion" ADD CONSTRAINT "IncentiveScheduleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncentiveCycle" ADD CONSTRAINT "IncentiveCycle_scheduleVersionId_fkey" FOREIGN KEY ("scheduleVersionId") REFERENCES "IncentiveScheduleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncentiveCycle" ADD CONSTRAINT "IncentiveCycle_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "IncentiveCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncentiveClaimLine" ADD CONSTRAINT "IncentiveClaimLine_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "IncentiveClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncentiveClaimLine" ADD CONSTRAINT "IncentiveClaimLine_incentiveId_fkey" FOREIGN KEY ("incentiveId") REFERENCES "Incentive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replace the prior strictly-positive earning check so a configured 0% rate can
-- retain eligible basis without creating a payable amount.
ALTER TABLE "Incentive" DROP CONSTRAINT "Incentive_amounts_check";
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_amounts_check" CHECK (
  "basisAmount" > 0 AND "ratePercent" >= 0 AND "ratePercent" <= 100 AND "amount" >= 0
);

ALTER TABLE "IncentiveRate" ADD CONSTRAINT "IncentiveRate_percent_check" CHECK (
  "productRate" >= 0 AND "productRate" <= 100 AND "serviceRate" >= 0 AND "serviceRate" <= 100
);
ALTER TABLE "IncentiveScheduleVersion" ADD CONSTRAINT "IncentiveScheduleVersion_values_check" CHECK (
  "claimOpenAfterDays" >= 0 AND "claimWindowDays" > 0 AND
  (("scheduleType" = 'EVERY_N_DAYS' AND "everyNDays" IS NOT NULL AND "everyNDays" > 0) OR
   ("scheduleType" <> 'EVERY_N_DAYS' AND "everyNDays" IS NULL))
);
ALTER TABLE "IncentiveCycle" ADD CONSTRAINT "IncentiveCycle_dates_check" CHECK (
  "startDate" <= "endDate" AND "cutoffDate" = "endDate" AND
  "claimOpenDate" > "cutoffDate" AND "claimCloseDate" >= "claimOpenDate"
);
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_amounts_check" CHECK (
  "productBasis" >= 0 AND "productIncentive" >= 0 AND "serviceBasis" >= 0 AND
  "serviceIncentive" >= 0 AND "totalIncentive" >= 0 AND
  ("productRate" IS NULL OR ("productRate" >= 0 AND "productRate" <= 100)) AND
  ("serviceRate" IS NULL OR ("serviceRate" >= 0 AND "serviceRate" <= 100))
);
ALTER TABLE "IncentiveClaimLine" ADD CONSTRAINT "IncentiveClaimLine_amounts_check" CHECK (
  "basisAmount" > 0 AND "ratePercent" >= 0 AND "ratePercent" <= 100 AND "amount" >= 0
);
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_price_check" CHECK (
  ("proposedTransferUnitPrice" IS NULL OR "proposedTransferUnitPrice" >= 0) AND
  ("agreedTransferUnitPrice" IS NULL OR "agreedTransferUnitPrice" >= 0) AND
  ("transferAmount" IS NULL OR "transferAmount" >= 0)
);
ALTER TABLE "StockTransferAllocation" ADD CONSTRAINT "StockTransferAllocation_values_check" CHECK (
  "quantity" > 0 AND "acquisitionUnitCostSnapshot" >= 0 AND
  "sourceOperationalUnitCostSnapshot" >= 0 AND
  "destinationOperationalUnitCostSnapshot" >= 0 AND "transferAmount" >= 0
);
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_operational_cost_check" CHECK (
  "operationalUnitCost" IS NULL OR "operationalUnitCost" >= 0
);
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_cost_snapshot_check" CHECK (
  ("operationalUnitCostSnapshot" IS NULL OR "operationalUnitCostSnapshot" >= 0) AND
  ("acquisitionUnitCostSnapshot" IS NULL OR "acquisitionUnitCostSnapshot" >= 0)
);
