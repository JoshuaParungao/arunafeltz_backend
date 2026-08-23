/*
  Warnings:

  - A unique constraint covering the columns `[itemRecipientSnapshotId]` on the table `Incentive` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[engineVersion,branchId,programType,startDate,endDate]` on the table `IncentiveCycle` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "IncentiveCycle_startDate_endDate_key";

-- AlterTable
ALTER TABLE "Incentive" ADD COLUMN     "accountConfigVersionId" TEXT,
ADD COLUMN     "engineVersion" TEXT,
ADD COLUMN     "itemCycleRevisionId" TEXT,
ADD COLUMN     "itemRecipientSnapshotId" TEXT,
ADD COLUMN     "programRuleVersionId" TEXT,
ADD COLUMN     "programScheduleVersionId" TEXT,
ADD COLUMN     "programType" "IncentiveProgramType",
ADD COLUMN     "supersedesIncentiveId" TEXT;

-- AlterTable
ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN     "branchIdSnapshot" TEXT;

-- AlterTable
ALTER TABLE "IncentiveCycle" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "engineVersion" TEXT,
ADD COLUMN     "programScheduleVersionId" TEXT,
ADD COLUMN     "programType" "IncentiveProgramType",
ALTER COLUMN "scheduleVersionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "IncentiveItemCycleRevision" (
    "id" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "IncentiveStatus" NOT NULL DEFAULT 'POSTED',
    "cutoffInstant" TIMESTAMP(3) NOT NULL,
    "calculationFingerprint" TEXT NOT NULL,
    "eligiblePriceTiersSnapshot" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "branchBasisAmountSnapshot" DECIMAL(12,2) NOT NULL,
    "materializedAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "cycleId" TEXT NOT NULL,
    "programRuleVersionId" TEXT NOT NULL,
    "createdById" TEXT,
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveItemCycleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveItemBasisSnapshot" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceDate" TIMESTAMP(3),
    "saleStatusSnapshot" TEXT NOT NULL,
    "saleCancelledAtSnapshot" TIMESTAMP(3),
    "inclusionState" TEXT NOT NULL,
    "inclusionReason" TEXT,
    "priceTier" INTEGER,
    "grossQuantitySnapshot" DECIMAL(12,2) NOT NULL,
    "returnedQuantitySnapshot" DECIMAL(12,2) NOT NULL,
    "netQuantitySnapshot" DECIMAL(12,2) NOT NULL,
    "baseUnitPriceSnapshot" DECIMAL(12,2),
    "basisAmount" DECIMAL(12,2) NOT NULL,
    "returnSourcesSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncentiveItemBasisSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveItemRecipientSnapshot" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "branchIdSnapshot" TEXT NOT NULL,
    "roleSnapshot" TEXT NOT NULL,
    "classificationSnapshot" "IncentiveClassification" NOT NULL,
    "enabledSnapshot" BOOLEAN NOT NULL,
    "ratePercentSnapshot" DECIMAL(7,4),
    "amountSnapshot" DECIMAL(12,2) NOT NULL,
    "accountConfigVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncentiveItemRecipientSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncentiveItemCycleRevision_cycleId_status_idx" ON "IncentiveItemCycleRevision"("cycleId", "status");

-- CreateIndex
CREATE INDEX "IncentiveItemCycleRevision_programRuleVersionId_idx" ON "IncentiveItemCycleRevision"("programRuleVersionId");

-- CreateIndex
CREATE INDEX "IncentiveItemCycleRevision_calculationFingerprint_idx" ON "IncentiveItemCycleRevision"("calculationFingerprint");

-- CreateIndex
CREATE INDEX "IncentiveItemCycleRevision_createdById_idx" ON "IncentiveItemCycleRevision"("createdById");

-- CreateIndex
CREATE INDEX "IncentiveItemCycleRevision_reversedById_idx" ON "IncentiveItemCycleRevision"("reversedById");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveItemCycleRevision_cycleId_revisionNumber_key" ON "IncentiveItemCycleRevision"("cycleId", "revisionNumber");

-- CreateIndex
CREATE INDEX "IncentiveItemBasisSnapshot_revisionId_idx" ON "IncentiveItemBasisSnapshot"("revisionId");

-- CreateIndex
CREATE INDEX "IncentiveItemBasisSnapshot_saleId_idx" ON "IncentiveItemBasisSnapshot"("saleId");

-- CreateIndex
CREATE INDEX "IncentiveItemBasisSnapshot_saleItemId_idx" ON "IncentiveItemBasisSnapshot"("saleItemId");

-- CreateIndex
CREATE INDEX "IncentiveItemBasisSnapshot_inclusionState_idx" ON "IncentiveItemBasisSnapshot"("inclusionState");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveItemBasisSnapshot_revisionId_saleItemId_key" ON "IncentiveItemBasisSnapshot"("revisionId", "saleItemId");

-- CreateIndex
CREATE INDEX "IncentiveItemRecipientSnapshot_revisionId_idx" ON "IncentiveItemRecipientSnapshot"("revisionId");

-- CreateIndex
CREATE INDEX "IncentiveItemRecipientSnapshot_staffId_idx" ON "IncentiveItemRecipientSnapshot"("staffId");

-- CreateIndex
CREATE INDEX "IncentiveItemRecipientSnapshot_branchIdSnapshot_idx" ON "IncentiveItemRecipientSnapshot"("branchIdSnapshot");

-- CreateIndex
CREATE INDEX "IncentiveItemRecipientSnapshot_accountConfigVersionId_idx" ON "IncentiveItemRecipientSnapshot"("accountConfigVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveItemRecipientSnapshot_revisionId_staffId_key" ON "IncentiveItemRecipientSnapshot"("revisionId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "Incentive_itemRecipientSnapshotId_key" ON "Incentive"("itemRecipientSnapshotId");

-- CreateIndex
CREATE INDEX "Incentive_engineVersion_programType_idx" ON "Incentive"("engineVersion", "programType");

-- CreateIndex
CREATE INDEX "Incentive_programScheduleVersionId_idx" ON "Incentive"("programScheduleVersionId");

-- CreateIndex
CREATE INDEX "Incentive_programRuleVersionId_idx" ON "Incentive"("programRuleVersionId");

-- CreateIndex
CREATE INDEX "Incentive_accountConfigVersionId_idx" ON "Incentive"("accountConfigVersionId");

-- CreateIndex
CREATE INDEX "Incentive_itemCycleRevisionId_idx" ON "Incentive"("itemCycleRevisionId");

-- CreateIndex
CREATE INDEX "Incentive_supersedesIncentiveId_idx" ON "Incentive"("supersedesIncentiveId");

-- CreateIndex
CREATE INDEX "IncentiveCycle_programScheduleVersionId_idx" ON "IncentiveCycle"("programScheduleVersionId");

-- CreateIndex
CREATE INDEX "IncentiveCycle_branchId_programType_idx" ON "IncentiveCycle"("branchId", "programType");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveCycle_engineVersion_branchId_programType_startDate_key" ON "IncentiveCycle"("engineVersion", "branchId", "programType", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_programScheduleVersionId_fkey" FOREIGN KEY ("programScheduleVersionId") REFERENCES "IncentiveProgramScheduleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_programRuleVersionId_fkey" FOREIGN KEY ("programRuleVersionId") REFERENCES "IncentiveProgramRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_accountConfigVersionId_fkey" FOREIGN KEY ("accountConfigVersionId") REFERENCES "IncentiveAccountConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_itemCycleRevisionId_fkey" FOREIGN KEY ("itemCycleRevisionId") REFERENCES "IncentiveItemCycleRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_itemRecipientSnapshotId_fkey" FOREIGN KEY ("itemRecipientSnapshotId") REFERENCES "IncentiveItemRecipientSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_supersedesIncentiveId_fkey" FOREIGN KEY ("supersedesIncentiveId") REFERENCES "Incentive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveCycle" ADD CONSTRAINT "IncentiveCycle_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveCycle" ADD CONSTRAINT "IncentiveCycle_programScheduleVersionId_fkey" FOREIGN KEY ("programScheduleVersionId") REFERENCES "IncentiveProgramScheduleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveItemCycleRevision" ADD CONSTRAINT "IncentiveItemCycleRevision_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "IncentiveCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveItemCycleRevision" ADD CONSTRAINT "IncentiveItemCycleRevision_programRuleVersionId_fkey" FOREIGN KEY ("programRuleVersionId") REFERENCES "IncentiveProgramRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveItemCycleRevision" ADD CONSTRAINT "IncentiveItemCycleRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveItemCycleRevision" ADD CONSTRAINT "IncentiveItemCycleRevision_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveItemBasisSnapshot" ADD CONSTRAINT "IncentiveItemBasisSnapshot_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "IncentiveItemCycleRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveItemBasisSnapshot" ADD CONSTRAINT "IncentiveItemBasisSnapshot_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveItemBasisSnapshot" ADD CONSTRAINT "IncentiveItemBasisSnapshot_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveItemRecipientSnapshot" ADD CONSTRAINT "IncentiveItemRecipientSnapshot_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "IncentiveItemCycleRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveItemRecipientSnapshot" ADD CONSTRAINT "IncentiveItemRecipientSnapshot_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveItemRecipientSnapshot" ADD CONSTRAINT "IncentiveItemRecipientSnapshot_accountConfigVersionId_fkey" FOREIGN KEY ("accountConfigVersionId") REFERENCES "IncentiveAccountConfigVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- ARUNAFELTZ MANUAL V2 INCENTIVE PERSISTENCE HARDENING
-- =====================================================================
-- The Prisma-generated structural migration above intentionally does
-- not manage PostgreSQL CHECK constraints.
--
-- Legacy rows remain legacy:
--   engineVersion IS NULL
--
-- New V2 rows must carry explicit immutable provenance.
-- No historical incentive is backfilled or reclassified as V2.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Incentive source + provenance
-- ---------------------------------------------------------------------

ALTER TABLE "Incentive"
DROP CONSTRAINT "Incentive_source_link_check";

ALTER TABLE "Incentive"
ADD CONSTRAINT "Incentive_source_link_check"
CHECK (
  (
    -- ===============================================================
    -- LEGACY / PRE-V2 LEDGER
    -- ===============================================================
    "engineVersion" IS NULL

    AND "programType" IS NULL
    AND "programScheduleVersionId" IS NULL
    AND "programRuleVersionId" IS NULL
    AND "accountConfigVersionId" IS NULL
    AND "itemCycleRevisionId" IS NULL
    AND "itemRecipientSnapshotId" IS NULL
    AND "supersedesIncentiveId" IS NULL

    AND (
      (
        "type" IN ('SALE_ITEM', 'QUOTATION_SERVICE')
        AND "saleId" IS NOT NULL
        AND "serviceJobId" IS NULL
      )
      OR
      (
        "type" = 'SERVICE_JOB'
        AND "saleId" IS NULL
        AND "serviceJobId" IS NOT NULL
      )
    )
  )

  OR

  (
    -- ===============================================================
    -- V2 BRANCH-WIDE ITEM INCENTIVE
    -- ===============================================================
    "engineVersion" = 'V2'
    AND "programType" = 'ITEM_SALE'
    AND "type" = 'SALE_ITEM'

    -- A branch-wide award is not attributed to one sale.
    AND "saleId" IS NULL
    AND "serviceJobId" IS NULL

    AND "cycleId" IS NOT NULL
    AND "programScheduleVersionId" IS NOT NULL
    AND "programRuleVersionId" IS NOT NULL
    AND "accountConfigVersionId" IS NOT NULL
    AND "itemCycleRevisionId" IS NOT NULL
    AND "itemRecipientSnapshotId" IS NOT NULL
  )

  OR

  (
    -- ===============================================================
    -- V2 REPAIR INCENTIVE
    -- ===============================================================
    "engineVersion" = 'V2'
    AND "programType" IN (
      'ORDINARY_REPAIR',
      'BOARD_LEVEL_REPAIR'
    )
    AND "type" = 'SERVICE_JOB'

    AND "saleId" IS NULL
    AND "serviceJobId" IS NOT NULL

    AND "cycleId" IS NOT NULL
    AND "programScheduleVersionId" IS NOT NULL
    AND "programRuleVersionId" IS NOT NULL
    AND "accountConfigVersionId" IS NOT NULL

    -- Item-cycle provenance must never leak into a repair award.
    AND "itemCycleRevisionId" IS NULL
    AND "itemRecipientSnapshotId" IS NULL
    AND "supersedesIncentiveId" IS NULL
  )
);


-- ---------------------------------------------------------------------
-- IncentiveCycle legacy/V2 mode integrity
-- ---------------------------------------------------------------------

ALTER TABLE "IncentiveCycle"
ADD CONSTRAINT "IncentiveCycle_engine_provenance_check"
CHECK (
  (
    -- Legacy schedule engine.
    "engineVersion" IS NULL
    AND "programType" IS NULL
    AND "branchId" IS NULL
    AND "programScheduleVersionId" IS NULL
    AND "scheduleVersionId" IS NOT NULL
  )
  OR
  (
    -- V2 branch/program schedule engine.
    "engineVersion" = 'V2'
    AND "programType" IS NOT NULL
    AND "branchId" IS NOT NULL
    AND "programScheduleVersionId" IS NOT NULL
    AND "scheduleVersionId" IS NULL
  )
);


-- ---------------------------------------------------------------------
-- Item-cycle revision immutable financial/state sanity
-- ---------------------------------------------------------------------

ALTER TABLE "IncentiveItemCycleRevision"
ADD CONSTRAINT "IncentiveItemCycleRevision_values_check"
CHECK (
  "revisionNumber" > 0
  AND "branchBasisAmountSnapshot" >= 0
);

ALTER TABLE "IncentiveItemCycleRevision"
ADD CONSTRAINT "IncentiveItemCycleRevision_state_check"
CHECK (
  (
    "status" = 'POSTED'
    AND "reversedAt" IS NULL
    AND "reversalReason" IS NULL
    AND "reversedById" IS NULL
  )
  OR
  (
    "status" = 'REVERSED'
    AND "reversedAt" IS NOT NULL
    AND "reversalReason" IS NOT NULL
  )
);


-- ---------------------------------------------------------------------
-- Item basis snapshot quantity / tier / inclusion integrity
-- ---------------------------------------------------------------------

ALTER TABLE "IncentiveItemBasisSnapshot"
ADD CONSTRAINT "IncentiveItemBasisSnapshot_values_check"
CHECK (
  "grossQuantitySnapshot" > 0

  AND "returnedQuantitySnapshot" >= 0
  AND "returnedQuantitySnapshot" <= "grossQuantitySnapshot"

  AND "netQuantitySnapshot" >= 0
  AND "netQuantitySnapshot"
        = "grossQuantitySnapshot" - "returnedQuantitySnapshot"

  AND "basisAmount" >= 0

  AND (
    "baseUnitPriceSnapshot" IS NULL
    OR "baseUnitPriceSnapshot" >= 0
  )

  AND (
    "priceTier" IS NULL
    OR "priceTier" BETWEEN 1 AND 5
  )

  AND "inclusionState" IN (
    'INCLUDED',
    'EXCLUDED_CANCELLED',
    'EXCLUDED_FULLY_RETURNED'
  )

  AND (
    (
      "inclusionState" = 'INCLUDED'
      AND "netQuantitySnapshot" > 0
      AND "baseUnitPriceSnapshot" IS NOT NULL
    )
    OR
    (
      "inclusionState" = 'EXCLUDED_CANCELLED'
      AND "basisAmount" = 0
    )
    OR
    (
      "inclusionState" = 'EXCLUDED_FULLY_RETURNED'
      AND "netQuantitySnapshot" = 0
      AND "basisAmount" = 0
    )
  )
);


-- ---------------------------------------------------------------------
-- Recipient snapshot OFF/ON decision integrity
-- ---------------------------------------------------------------------

ALTER TABLE "IncentiveItemRecipientSnapshot"
ADD CONSTRAINT "IncentiveItemRecipientSnapshot_values_check"
CHECK (
  "amountSnapshot" >= 0

  AND (
    (
      "enabledSnapshot" = FALSE
      AND "ratePercentSnapshot" IS NULL
      AND "amountSnapshot" = 0
    )
    OR
    (
      "enabledSnapshot" = TRUE
      AND "ratePercentSnapshot" > 0
      AND "ratePercentSnapshot" <= 100
      AND "accountConfigVersionId" IS NOT NULL
    )
  )
);

