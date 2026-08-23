-- Add legacy-safe service repair classification, pricing, performer, and
-- transaction-time financial snapshots. Existing ServiceJob rows remain NULL
-- for every new nullable field and are not reclassified or recalculated.

CREATE TYPE "ServiceRepairType" AS ENUM (
  'ORDINARY_REPAIR',
  'BOARD_LEVEL_REPAIR'
);

ALTER TABLE "ServiceJob"
  ADD COLUMN "repairType" "ServiceRepairType",
  ADD COLUMN "baseServiceCharge" DECIMAL(12,2),
  ADD COLUMN "markupPercent" DECIMAL(7,4),
  ADD COLUMN "serviceMarkupAmount" DECIMAL(12,2),
  ADD COLUMN "serviceDoneById" TEXT,
  ADD COLUMN "serviceDoneByClassificationSnapshot" "IncentiveClassification",
  ADD COLUMN "programRuleVersionId" TEXT,
  ADD COLUMN "accountConfigVersionId" TEXT,
  ADD COLUMN "repairCostPercentSnapshot" DECIMAL(7,4),
  ADD COLUMN "companySharePercentSnapshot" DECIMAL(7,4),
  ADD COLUMN "repairCostPoolAmountSnapshot" DECIMAL(12,2),
  ADD COLUMN "companyShareAmountSnapshot" DECIMAL(12,2),
  ADD COLUMN "repairFeeSnapshot" DECIMAL(12,2),
  ADD COLUMN "repairIncentiveRateSnapshot" DECIMAL(7,4),
  ADD COLUMN "repairIncentiveAmountSnapshot" DECIMAL(12,2),
  ADD COLUMN "unallocatedRepairCostPoolSnapshot" DECIMAL(12,2),
  ADD COLUMN "financialSnapshotAt" TIMESTAMP(3);

CREATE INDEX "ServiceJob_serviceDoneById_idx"
  ON "ServiceJob"("serviceDoneById");

CREATE INDEX "ServiceJob_programRuleVersionId_idx"
  ON "ServiceJob"("programRuleVersionId");

CREATE INDEX "ServiceJob_accountConfigVersionId_idx"
  ON "ServiceJob"("accountConfigVersionId");

CREATE INDEX "ServiceJob_repairType_idx"
  ON "ServiceJob"("repairType");

ALTER TABLE "ServiceJob"
  ADD CONSTRAINT "ServiceJob_serviceDoneById_fkey"
  FOREIGN KEY ("serviceDoneById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceJob"
  ADD CONSTRAINT "ServiceJob_programRuleVersionId_fkey"
  FOREIGN KEY ("programRuleVersionId") REFERENCES "IncentiveProgramRuleVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceJob"
  ADD CONSTRAINT "ServiceJob_accountConfigVersionId_fkey"
  FOREIGN KEY ("accountConfigVersionId") REFERENCES "IncentiveAccountConfigVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceJob"
  ADD CONSTRAINT "ServiceJob_service_pricing_check"
  CHECK (
    "estimatedServiceCharge" >= 0
    AND "finalServiceCharge" >= 0
    AND (
      (
        "baseServiceCharge" IS NULL
        AND "markupPercent" IS NULL
        AND "serviceMarkupAmount" IS NULL
      )
      OR (
        "baseServiceCharge" IS NOT NULL
        AND "markupPercent" IS NOT NULL
        AND "serviceMarkupAmount" IS NOT NULL
        AND "baseServiceCharge" >= 0
        AND "markupPercent" >= 0
        AND "markupPercent" < 100
        AND "serviceMarkupAmount" >= 0
        -- Retain the existing product-markup JavaScript money convention.
        -- Binary floating-point boundary cases can differ from PostgreSQL
        -- NUMERIC half-up rounding by one cent, so constrain the saved result
        -- to less than one cent from the authoritative formula instead of
        -- imposing a different rounding convention at the database layer.
        AND ABS(
          "finalServiceCharge"
          - (
            "baseServiceCharge"
            / NULLIF(1 - ("markupPercent" / 100), 0)
          )
        ) < 0.01
        AND "serviceMarkupAmount" = "finalServiceCharge" - "baseServiceCharge"
      )
    )
  );

ALTER TABLE "ServiceJob"
  ADD CONSTRAINT "ServiceJob_performer_classification_check"
  CHECK (
    "serviceDoneByClassificationSnapshot" IS NULL
    OR (
      "serviceDoneById" IS NOT NULL
      AND "serviceDoneByClassificationSnapshot" IN (
        'TECHNICIAN'::"IncentiveClassification",
        'SENIOR_TECHNICIAN'::"IncentiveClassification"
      )
    )
  );

ALTER TABLE "ServiceJob"
  ADD CONSTRAINT "ServiceJob_financial_snapshot_check"
  CHECK (
    (
      "financialSnapshotAt" IS NULL
      AND "programRuleVersionId" IS NULL
      AND "accountConfigVersionId" IS NULL
      AND "repairCostPercentSnapshot" IS NULL
      AND "companySharePercentSnapshot" IS NULL
      AND "repairCostPoolAmountSnapshot" IS NULL
      AND "companyShareAmountSnapshot" IS NULL
      AND "repairFeeSnapshot" IS NULL
      AND "repairIncentiveRateSnapshot" IS NULL
      AND "repairIncentiveAmountSnapshot" IS NULL
      AND "unallocatedRepairCostPoolSnapshot" IS NULL
    )
    OR
    (
      "financialSnapshotAt" IS NOT NULL
      AND "repairType" IS NOT NULL
      AND "serviceDoneById" IS NOT NULL
      AND "serviceDoneByClassificationSnapshot" IS NOT NULL
      AND "programRuleVersionId" IS NOT NULL
      AND "baseServiceCharge" IS NOT NULL
      AND "baseServiceCharge" > 0
      AND "markupPercent" IS NOT NULL
      AND "serviceMarkupAmount" IS NOT NULL
      AND "repairCostPercentSnapshot" IS NOT NULL
      AND "companySharePercentSnapshot" IS NOT NULL
      AND "repairCostPoolAmountSnapshot" IS NOT NULL
      AND "companyShareAmountSnapshot" IS NOT NULL
      AND "repairFeeSnapshot" IS NOT NULL
      AND "repairIncentiveRateSnapshot" IS NOT NULL
      AND "repairIncentiveAmountSnapshot" IS NOT NULL
      AND "unallocatedRepairCostPoolSnapshot" IS NOT NULL
      AND "repairCostPercentSnapshot" >= 0
      AND "repairCostPercentSnapshot" <= 100
      AND "companySharePercentSnapshot" >= 0
      AND "companySharePercentSnapshot" <= 100
      AND "repairCostPercentSnapshot" + "companySharePercentSnapshot" = 100
      AND "repairIncentiveRateSnapshot" >= 0
      AND "repairIncentiveRateSnapshot" <= 100
      AND "repairCostPoolAmountSnapshot" >= 0
      AND "companyShareAmountSnapshot" >= 0
      AND "repairFeeSnapshot" >= 0
      AND "repairIncentiveAmountSnapshot" >= 0
      AND "repairCostPoolAmountSnapshot" + "companyShareAmountSnapshot" = "baseServiceCharge"
      AND "unallocatedRepairCostPoolSnapshot" + "repairFeeSnapshot" + "repairIncentiveAmountSnapshot" = "repairCostPoolAmountSnapshot"
    )
  );
