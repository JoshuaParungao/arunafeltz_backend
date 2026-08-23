-- CreateEnum
CREATE TYPE "ReceivableSourceType" AS ENUM ('SALE', 'SERVICE_JOB');

-- CreateEnum
CREATE TYPE "ReceivableProvider" AS ENUM (
    'CREDIT_CARD',
    'DEBIT_CARD',
    'HOMECREDIT',
    'SALMON',
    'KYRO',
    'OTHER_FINANCING',
    'IN_HOUSE_INSTALLMENT'
);

-- Existing service-payment rows are preserved. Removing only this uniqueness
-- index permits multiple settlement events for the same service job.
DROP INDEX "ServicePayment_serviceJobId_key";

-- Add generic receivable identity/snapshot fields as nullable first so the
-- legacy in-house installment rows can be backfilled safely.
ALTER TABLE "CreditAccount"
ADD COLUMN "sourceType" "ReceivableSourceType",
ADD COLUMN "provider" "ReceivableProvider",
ADD COLUMN "sourceTotalAmountSnapshot" DECIMAL(12,2),
ADD COLUMN "providerReferenceNo" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "idempotencyFingerprint" TEXT,
ADD COLUMN "serviceJobId" TEXT,
ALTER COLUMN "term" DROP NOT NULL,
ALTER COLUMN "termBasis" DROP NOT NULL,
ALTER COLUMN "cashPromoTotalAmount" DROP NOT NULL,
ALTER COLUMN "regularPriceTotalAmount" DROP NOT NULL,
ALTER COLUMN "customerId" DROP NOT NULL;

-- All 25 existing accounts were created by the legacy sale/installment flow.
-- Read-only verification confirmed cashPromoTotalAmount equals the linked
-- sale grandTotal for every row.
UPDATE "CreditAccount"
SET
    "sourceType" = 'SALE',
    "provider" = 'IN_HOUSE_INSTALLMENT',
    "sourceTotalAmountSnapshot" = "cashPromoTotalAmount";

ALTER TABLE "CreditAccount"
ALTER COLUMN "sourceType" SET NOT NULL,
ALTER COLUMN "provider" SET NOT NULL,
ALTER COLUMN "sourceTotalAmountSnapshot" SET NOT NULL;

ALTER TABLE "CreditCollection"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "idempotencyFingerprint" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

ALTER TABLE "ServicePayment"
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "cancelledById" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "idempotencyFingerprint" TEXT;

ALTER TABLE "Sale"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "idempotencyFingerprint" TEXT;

-- Receivable sources are permanent audit links.
ALTER TABLE "CreditAccount"
DROP CONSTRAINT "CreditAccount_saleId_fkey";

ALTER TABLE "ServicePayment"
DROP CONSTRAINT "ServicePayment_serviceJobId_fkey";

ALTER TABLE "CreditAccount"
ADD CONSTRAINT "CreditAccount_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditAccount"
ADD CONSTRAINT "CreditAccount_serviceJobId_fkey"
FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServicePayment"
ADD CONSTRAINT "ServicePayment_serviceJobId_fkey"
FOREIGN KEY ("serviceJobId") REFERENCES "ServiceJob"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServicePayment"
ADD CONSTRAINT "ServicePayment_cancelledById_fkey"
FOREIGN KEY ("cancelledById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CreditAccount_serviceJobId_key"
ON "CreditAccount"("serviceJobId");

CREATE UNIQUE INDEX "CreditAccount_branchId_idempotencyKey_key"
ON "CreditAccount"("branchId", "idempotencyKey");

CREATE UNIQUE INDEX "CreditCollection_branchId_idempotencyKey_key"
ON "CreditCollection"("branchId", "idempotencyKey");

CREATE UNIQUE INDEX "ServicePayment_branchId_idempotencyKey_key"
ON "ServicePayment"("branchId", "idempotencyKey");

CREATE UNIQUE INDEX "Sale_branchId_idempotencyKey_key"
ON "Sale"("branchId", "idempotencyKey");

-- A posted customer settlement source owns exactly one cash event. Manual and
-- operational adjustments remain unconstrained by this customer-source guard.
CREATE UNIQUE INDEX "CashTransaction_customer_source_event_key"
ON "CashTransaction"("source", "type", "sourceId")
WHERE "sourceId" IS NOT NULL
  AND "source" IN ('SALE', 'CREDIT_COLLECTION', 'SERVICE_JOB');

CREATE INDEX "CreditAccount_serviceJobId_idx"
ON "CreditAccount"("serviceJobId");

CREATE INDEX "CreditAccount_sourceType_idx"
ON "CreditAccount"("sourceType");

CREATE INDEX "CreditAccount_provider_idx"
ON "CreditAccount"("provider");

CREATE INDEX "ServicePayment_cancelledById_idx"
ON "ServicePayment"("cancelledById");

-- Add checks without an immediate full-table lock, then validate them after
-- all existing rows have been backfilled and verified.
ALTER TABLE "CreditAccount"
ADD CONSTRAINT "CreditAccount_source_identity_check" CHECK (
    (
        "sourceType" = 'SALE'
        AND "saleId" IS NOT NULL
        AND "serviceJobId" IS NULL
    )
    OR
    (
        "sourceType" = 'SERVICE_JOB'
        AND "serviceJobId" IS NOT NULL
        AND "saleId" IS NULL
    )
) NOT VALID;

ALTER TABLE "CreditAccount"
ADD CONSTRAINT "CreditAccount_provider_terms_check" CHECK (
    (
        "provider" = 'IN_HOUSE_INSTALLMENT'
        AND "customerId" IS NOT NULL
        AND "term" IS NOT NULL
        AND "termBasis" IS NOT NULL
        AND "cashPromoTotalAmount" IS NOT NULL
        AND "regularPriceTotalAmount" IS NOT NULL
        AND "cashPromoTotalAmount" = "sourceTotalAmountSnapshot"
    )
    OR
    (
        "provider" <> 'IN_HOUSE_INSTALLMENT'
        AND "term" IS NULL
        AND "termBasis" IS NULL
        AND "cashPromoTotalAmount" IS NULL
        AND "regularPriceTotalAmount" IS NULL
        AND "monthlyDueAmount" IS NULL
        AND "dueDay" IS NULL
        AND "firstDueDate" IS NULL
        AND "nextDueDate" IS NULL
        AND "balanceAmount" + "downpaymentAmount" = "sourceTotalAmountSnapshot"
    )
) NOT VALID;

ALTER TABLE "CreditAccount"
ADD CONSTRAINT "CreditAccount_amount_integrity_check" CHECK (
    "sourceTotalAmountSnapshot" > 0
    AND "downpaymentAmount" >= 0
    AND "downpaymentAmount" <= "sourceTotalAmountSnapshot"
    AND "balanceAmount" >= 0
    AND "totalCollected" >= 0
    AND "remainingBalance" >= 0
    AND "totalCollected" <= "balanceAmount"
    AND "remainingBalance" = "balanceAmount" - "totalCollected"
    AND ("termBasis" IS NULL OR "termBasis" > 0)
    AND ("cashPromoTotalAmount" IS NULL OR "cashPromoTotalAmount" > 0)
    AND ("regularPriceTotalAmount" IS NULL OR "regularPriceTotalAmount" > 0)
    AND ("monthlyDueAmount" IS NULL OR "monthlyDueAmount" >= 0)
    AND ("dueDay" IS NULL OR "dueDay" BETWEEN 1 AND 31)
) NOT VALID;

ALTER TABLE "CreditAccount"
ADD CONSTRAINT "CreditAccount_status_lifecycle_check" CHECK (
    (
        "status" IN ('ACTIVE', 'DEFAULTED')
        AND "remainingBalance" > 0
        AND "paidAt" IS NULL
        AND "cancelledAt" IS NULL
        AND "cancellationReason" IS NULL
        AND "cancelledById" IS NULL
    )
    OR
    (
        "status" = 'PAID'
        AND "remainingBalance" = 0
        AND "paidAt" IS NOT NULL
        AND "cancelledAt" IS NULL
        AND "cancellationReason" IS NULL
        AND "cancelledById" IS NULL
    )
    OR
    (
        "status" = 'CANCELLED'
        AND "cancelledAt" IS NOT NULL
        AND NULLIF(BTRIM("cancellationReason"), '') IS NOT NULL
        AND "cancelledById" IS NOT NULL
    )
) NOT VALID;

ALTER TABLE "CreditCollection"
ADD CONSTRAINT "CreditCollection_amount_integrity_check" CHECK (
    "amount" > 0
    AND "previousBalance" >= 0
    AND "newBalance" >= 0
    AND "newBalance" = "previousBalance" - "amount"
) NOT VALID;

ALTER TABLE "CreditCollection"
ADD CONSTRAINT "CreditCollection_status_lifecycle_check" CHECK (
    (
        "status" = 'POSTED'
        AND "cancelledAt" IS NULL
        AND "cancellationReason" IS NULL
        AND "cancelledById" IS NULL
    )
    OR
    (
        "status" = 'CANCELLED'
        AND "cancelledAt" IS NOT NULL
        AND NULLIF(BTRIM("cancellationReason"), '') IS NOT NULL
        AND "cancelledById" IS NOT NULL
    )
) NOT VALID;

ALTER TABLE "ServicePayment"
ADD CONSTRAINT "ServicePayment_lifecycle_check" CHECK (
    "amount" > 0
    AND (
        (
            "status" = 'POSTED'
            AND "cancelledAt" IS NULL
            AND "cancellationReason" IS NULL
            AND "cancelledById" IS NULL
        )
        OR
        (
            "status" = 'CANCELLED'
            AND "cancelledAt" IS NOT NULL
            AND NULLIF(BTRIM("cancellationReason"), '') IS NOT NULL
            AND "cancelledById" IS NOT NULL
        )
    )
) NOT VALID;

ALTER TABLE "Sale"
ADD CONSTRAINT "Sale_idempotency_check" CHECK (
    ("idempotencyKey" IS NULL AND "idempotencyFingerprint" IS NULL)
    OR (
        NULLIF(BTRIM("idempotencyKey"), '') IS NOT NULL
        AND "idempotencyFingerprint" IS NOT NULL
        AND "idempotencyFingerprint" ~ '^[0-9a-f]{64}$'
    )
) NOT VALID;

ALTER TABLE "CreditAccount"
ADD CONSTRAINT "CreditAccount_idempotency_check" CHECK (
    ("idempotencyKey" IS NULL AND "idempotencyFingerprint" IS NULL)
    OR (
        NULLIF(BTRIM("idempotencyKey"), '') IS NOT NULL
        AND "idempotencyFingerprint" IS NOT NULL
        AND "idempotencyFingerprint" ~ '^[0-9a-f]{64}$'
    )
) NOT VALID;

ALTER TABLE "CreditCollection"
ADD CONSTRAINT "CreditCollection_idempotency_check" CHECK (
    ("idempotencyKey" IS NULL AND "idempotencyFingerprint" IS NULL)
    OR (
        NULLIF(BTRIM("idempotencyKey"), '') IS NOT NULL
        AND "idempotencyFingerprint" IS NOT NULL
        AND "idempotencyFingerprint" ~ '^[0-9a-f]{64}$'
    )
) NOT VALID;

ALTER TABLE "ServicePayment"
ADD CONSTRAINT "ServicePayment_idempotency_check" CHECK (
    ("idempotencyKey" IS NULL AND "idempotencyFingerprint" IS NULL)
    OR (
        NULLIF(BTRIM("idempotencyKey"), '') IS NOT NULL
        AND "idempotencyFingerprint" IS NOT NULL
        AND "idempotencyFingerprint" ~ '^[0-9a-f]{64}$'
    )
) NOT VALID;

ALTER TABLE "CreditAccount"
VALIDATE CONSTRAINT "CreditAccount_source_identity_check";

ALTER TABLE "CreditAccount"
VALIDATE CONSTRAINT "CreditAccount_provider_terms_check";

ALTER TABLE "CreditAccount"
VALIDATE CONSTRAINT "CreditAccount_amount_integrity_check";

ALTER TABLE "CreditAccount"
VALIDATE CONSTRAINT "CreditAccount_status_lifecycle_check";

ALTER TABLE "CreditCollection"
VALIDATE CONSTRAINT "CreditCollection_amount_integrity_check";

ALTER TABLE "CreditCollection"
VALIDATE CONSTRAINT "CreditCollection_status_lifecycle_check";

ALTER TABLE "ServicePayment"
VALIDATE CONSTRAINT "ServicePayment_lifecycle_check";

ALTER TABLE "Sale"
VALIDATE CONSTRAINT "Sale_idempotency_check";

ALTER TABLE "CreditAccount"
VALIDATE CONSTRAINT "CreditAccount_idempotency_check";

ALTER TABLE "CreditCollection"
VALIDATE CONSTRAINT "CreditCollection_idempotency_check";

ALTER TABLE "ServicePayment"
VALIDATE CONSTRAINT "ServicePayment_idempotency_check";
