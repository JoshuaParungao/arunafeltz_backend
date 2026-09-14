-- Relax ServiceJob constraints so any active account (Admin, Super Owner, Technician, Staff) can perform and complete service jobs safely without incentive blockages.

ALTER TABLE "ServiceJob" DROP CONSTRAINT IF EXISTS "ServiceJob_performer_classification_check";
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_performer_classification_check"
  CHECK (
    "serviceDoneByClassificationSnapshot" IS NULL
    OR "serviceDoneById" IS NOT NULL
  );

ALTER TABLE "ServiceJob" DROP CONSTRAINT IF EXISTS "ServiceJob_financial_snapshot_check";
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_financial_snapshot_check"
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
      AND "baseServiceCharge" IS NOT NULL
      AND "baseServiceCharge" >= 0
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
      AND "repairFeeSnapshot" >= 0
      AND "repairIncentiveRateSnapshot" >= 0
      AND "repairIncentiveRateSnapshot" <= 100
      AND "repairIncentiveAmountSnapshot" >= 0
      AND "repairCostPoolAmountSnapshot" >= 0
      AND "companyShareAmountSnapshot" >= 0
      AND ABS("baseServiceCharge" - ("repairCostPoolAmountSnapshot" + "companyShareAmountSnapshot")) < 0.01
      AND ABS("repairCostPoolAmountSnapshot" - ("repairFeeSnapshot" + "repairIncentiveAmountSnapshot" + "unallocatedRepairCostPoolSnapshot")) < 0.01
    )
  );
