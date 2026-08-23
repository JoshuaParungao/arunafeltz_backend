-- Every incentive must link to exactly the supported source for its type.
ALTER TABLE "Incentive"
ADD CONSTRAINT "Incentive_source_link_check"
CHECK (
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
);

-- Posted ledger entries always represent a positive, snapshotted earning.
ALTER TABLE "Incentive"
ADD CONSTRAINT "Incentive_amounts_check"
CHECK (
  "basisAmount" > 0
  AND "ratePercent" > 0
  AND "ratePercent" <= 100
  AND "amount" > 0
);

-- A posted entry has no reversal metadata; a reversed entry retains when and why.
ALTER TABLE "Incentive"
ADD CONSTRAINT "Incentive_reversal_state_check"
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
