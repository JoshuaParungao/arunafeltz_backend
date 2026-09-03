-- Drop old check constraint on CreditAccount provider terms
ALTER TABLE "CreditAccount" DROP CONSTRAINT IF EXISTS "CreditAccount_provider_terms_check";

-- Re-create CreditAccount_provider_terms_check to support installment terms on all providers
ALTER TABLE "CreditAccount"
ADD CONSTRAINT "CreditAccount_provider_terms_check" CHECK (
    (
        "term" IS NOT NULL
        AND "termBasis" IS NOT NULL
        AND "cashPromoTotalAmount" IS NOT NULL
        AND "regularPriceTotalAmount" IS NOT NULL
        AND "cashPromoTotalAmount" = "sourceTotalAmountSnapshot"
    )
    OR
    (
        "term" IS NULL
        AND "termBasis" IS NULL
        AND "cashPromoTotalAmount" IS NULL
        AND "regularPriceTotalAmount" IS NULL
        AND "monthlyDueAmount" IS NULL
        AND "dueDay" IS NULL
        AND "firstDueDate" IS NULL
        AND "nextDueDate" IS NULL
        AND "balanceAmount" + "downpaymentAmount" = "sourceTotalAmountSnapshot"
    )
);
