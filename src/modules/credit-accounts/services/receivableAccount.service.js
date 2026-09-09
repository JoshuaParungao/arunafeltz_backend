const settingService = require("../../settings/services/setting.service");
const { createAuditLog } = require("../../../utils/auditLogger");
const { businessDateCode } = require("../../../utils/businessDate");

const RECEIVABLE_PROVIDERS = new Set([
  "CREDIT_CARD",
  "DEBIT_CARD",
  "HOMECREDIT",
  "SALMON",
  "SKYRO",
  "KYRO",
  "OTHER_FINANCING",
  "IN_HOUSE_INSTALLMENT",
]);

const RECEIVABLE_SOURCE_TYPES = new Set(["SALE", "SERVICE_JOB"]);

const INSTALLMENT_TERM_MONTHS = {
  CASH_PROMO: 1,
  STRAIGHT: 1,
  MONTH_3: 3,
  MONTH_6: 6,
  MONTH_9: 9,
  MONTH_12: 12,
  MONTH_18: 18,
  MONTH_24: 24,
};

const throwReceivableError = (code, statusCode = 400) => {
  const error = new Error(code);
  error.statusCode = statusCode;
  throw error;
};

const toMoney = (value) => Math.round(Number(value) * 100) / 100;
const toMoneyString = (value) => toMoney(value).toFixed(2);

const parseOptionalDate = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throwReceivableError("INVALID_FIRST_DUE_DATE");
  }

  return parsedDate;
};

const validateSourceCoverage = ({
  sourceTotalAmount,
  initialSettlementAmount = 0,
}) => {
  const sourceTotal = toMoney(sourceTotalAmount);
  const initialSettlement = toMoney(initialSettlementAmount);

  if (!Number.isFinite(sourceTotal) || sourceTotal <= 0) {
    throwReceivableError("INVALID_RECEIVABLE_SOURCE_TOTAL");
  }

  if (!Number.isFinite(initialSettlement) || initialSettlement < 0) {
    throwReceivableError("INVALID_RECEIVABLE_INITIAL_SETTLEMENT");
  }

  if (initialSettlement > sourceTotal) {
    throwReceivableError("RECEIVABLE_INITIAL_SETTLEMENT_EXCEEDS_TOTAL");
  }

  const financedPrincipal = toMoney(sourceTotal - initialSettlement);

  if (financedPrincipal <= 0) {
    throwReceivableError("RECEIVABLE_BALANCE_REQUIRED");
  }

  return {
    sourceTotal,
    initialSettlement,
    financedPrincipal,
  };
};

const calculateExternalReceivableSnapshot = ({
  sourceTotalAmount,
  initialSettlementAmount = 0,
  term = null,
  dueDay = null,
  firstDueDate = null,
}) => {
  const coverage = validateSourceCoverage({
    sourceTotalAmount,
    initialSettlementAmount,
  });

  const parsedFirstDueDate = parseOptionalDate(firstDueDate);

  return {
    sourceTotalAmountSnapshot: toMoneyString(coverage.sourceTotal),
    downpaymentAmount: toMoneyString(coverage.initialSettlement),
    balanceAmount: toMoneyString(coverage.financedPrincipal),
    totalCollected: "0.00",
    remainingBalance: toMoneyString(coverage.financedPrincipal),
    term: term || null,
    termBasis: "1.0000",
    cashPromoTotalAmount: toMoneyString(coverage.sourceTotal),
    regularPriceTotalAmount: toMoneyString(coverage.sourceTotal),
    monthlyDueAmount: toMoneyString(coverage.financedPrincipal),
    dueDay: dueDay ?? null,
    firstDueDate: parsedFirstDueDate,
    nextDueDate: parsedFirstDueDate,
  };
};

const calculateInHouseReceivableSnapshot = ({
  sourceTotalAmount,
  initialSettlementAmount = 0,
  term,
  dueDay,
  firstDueDate,
  installmentComputation,
}) => {
  const coverage = validateSourceCoverage({
    sourceTotalAmount,
    initialSettlementAmount,
  });
  const months = INSTALLMENT_TERM_MONTHS[term];

  if (!months) {
    throwReceivableError("INVALID_INSTALLMENT_TERM");
  }

  const termBasis = Number(installmentComputation?.basisUsed?.termBasis);
  const regularPriceTotalAmount = toMoney(
    installmentComputation?.result?.regularPriceTotalAmount
  );
  const balanceAmount = toMoney(installmentComputation?.result?.balance);

  if (
    !Number.isFinite(termBasis) ||
    termBasis <= 0 ||
    !Number.isFinite(regularPriceTotalAmount) ||
    regularPriceTotalAmount < 0 ||
    !Number.isFinite(balanceAmount) ||
    balanceAmount <= 0
  ) {
    throwReceivableError("INVALID_INSTALLMENT_COMPUTATION", 500);
  }

  const parsedFirstDueDate = parseOptionalDate(firstDueDate);

  return {
    sourceTotalAmountSnapshot: toMoneyString(coverage.sourceTotal),
    downpaymentAmount: toMoneyString(coverage.initialSettlement),
    balanceAmount: toMoneyString(balanceAmount),
    totalCollected: "0.00",
    remainingBalance: toMoneyString(balanceAmount),
    term,
    termBasis: termBasis.toFixed(4),
    cashPromoTotalAmount: toMoneyString(coverage.sourceTotal),
    regularPriceTotalAmount: toMoneyString(regularPriceTotalAmount),
    monthlyDueAmount: toMoneyString(balanceAmount / months),
    dueDay: dueDay ?? null,
    firstDueDate: parsedFirstDueDate,
    nextDueDate: parsedFirstDueDate,
  };
};

const deriveReceivablePaymentState = (account) => {
  if (!account) {
    return null;
  }

  if (["CANCELLED", "DEFAULTED"].includes(account.status)) {
    return account.status;
  }

  if (account.status === "PAID" || Number(account.remainingBalance) <= 0) {
    return "PAID";
  }

  if (Number(account.totalCollected) > 0) {
    return "PARTIALLY_PAID";
  }

  return "UNPAID";
};

const deriveSourcePaymentStatus = ({ account, initialSettlementAmount = 0 }) => {
  if (account?.status === "PAID" || Number(account?.remainingBalance) <= 0) {
    return "PAID";
  }

  if (
    toMoney(initialSettlementAmount) > 0 ||
    Number(account?.totalCollected || 0) > 0
  ) {
    return "PARTIALLY_PAID";
  }

  return "UNPAID";
};

const generateReceivableCode = async (tx, branchCode, branchId, now = new Date()) => {
  const prefix = `CRD-${branchCode}-${businessDateCode(now)}-`;
  const latestAccount = await tx.creditAccount.findFirst({
    where: {
      branchId,
      creditCode: {
        startsWith: prefix,
      },
    },
    orderBy: {
      creditCode: "desc",
    },
    select: {
      creditCode: true,
    },
  });

  let nextNumber = 1;

  if (latestAccount) {
    const latestNumber = Number(latestAccount.creditCode.slice(prefix.length));

    if (Number.isInteger(latestNumber) && latestNumber > 0) {
      nextNumber = latestNumber + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
};

const normalizeSettingsError = (error) => {
  if (error?.code && error.code !== "INTERNAL_SERVER_ERROR") {
    throwReceivableError(error.code, error.statusCode || 400);
  }

  throw error;
};

const createReceivableAccount = async (
  tx,
  actor,
  {
    branch,
    sourceType,
    sourceId,
    sourceCode,
    sourceTotalAmount,
    initialSettlementAmount = 0,
    customerId = null,
    idempotencyKey = null,
    idempotencyFingerprint = null,
    receivable,
  }
) => {
  if (!RECEIVABLE_SOURCE_TYPES.has(sourceType) || !sourceId) {
    throwReceivableError("INVALID_RECEIVABLE_SOURCE");
  }

  const provider = receivable?.provider;

  if (!RECEIVABLE_PROVIDERS.has(provider)) {
    throwReceivableError("INVALID_RECEIVABLE_PROVIDER");
  }

  let financialSnapshot;

  if (provider === "IN_HOUSE_INSTALLMENT") {
    if (!customerId) {
      throwReceivableError("IN_HOUSE_CUSTOMER_REQUIRED");
    }

    if (!receivable?.term) {
      throwReceivableError("IN_HOUSE_TERM_REQUIRED");
    }
  }

  if (receivable?.term && receivable.term !== "STRAIGHT") {
    let installmentComputation;

    try {
      installmentComputation = await settingService.computeInstallmentTest({
        cashPromoTotalAmount: toMoney(sourceTotalAmount),
        cashDownpayment: toMoney(initialSettlementAmount),
        term: receivable.term,
        provider,
      });
    } catch (error) {
      normalizeSettingsError(error);
    }

    financialSnapshot = calculateInHouseReceivableSnapshot({
      sourceTotalAmount,
      initialSettlementAmount,
      term: receivable.term,
      dueDay: receivable.dueDay,
      firstDueDate: receivable.firstDueDate,
      installmentComputation,
    });
  } else {
    financialSnapshot = calculateExternalReceivableSnapshot({
      sourceTotalAmount,
      initialSettlementAmount,
      term: receivable?.term || null,
      dueDay: receivable?.dueDay || null,
      firstDueDate: receivable?.firstDueDate || null,
    });
  }

  const creditCode = await generateReceivableCode(
    tx,
    branch.code,
    branch.id
  );

  const account = await tx.creditAccount.create({
    data: {
      creditCode,
      status: "ACTIVE",
      sourceType,
      provider,
      providerReferenceNo: receivable.providerReferenceNo || null,
      idempotencyKey,
      idempotencyFingerprint,
      ...financialSnapshot,
      paidAt: null,
      remarks: receivable.remarks || null,
      branchId: branch.id,
      customerId: customerId || null,
      ...(sourceType === "SALE"
        ? { saleId: sourceId }
        : { serviceJobId: sourceId }),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await createAuditLog(
    {
      actor,
      branchId: branch.id,
      action: "RECEIVABLE_ACCOUNT_CREATED",
      entityType: "CreditAccount",
      entityId: account.id,
      description: `Receivable ${account.creditCode} created for ${sourceCode}`,
      metadata: {
        creditCode: account.creditCode,
        sourceType,
        sourceId,
        sourceCode,
        provider,
        sourceTotalAmountSnapshot: account.sourceTotalAmountSnapshot.toString(),
        initialSettlementAmount: account.downpaymentAmount.toString(),
        openingBalance: account.balanceAmount.toString(),
      },
    },
    tx
  );

  return account;
};

const recalculateReceivableForSale = async (
  tx,
  actor,
  {
    creditAccountId,
    addedCashPromoAmount,
    addedDownpaymentAmount = 0,
    term = null,
  }
) => {
  await tx.$queryRaw`SELECT "id" FROM "CreditAccount" WHERE "id" = ${creditAccountId} FOR UPDATE`;

  const creditAccount = await tx.creditAccount.findUnique({
    where: { id: creditAccountId },
    include: {
      collections: {
        where: { status: "POSTED" },
      },
    },
  });

  if (!creditAccount) {
    const error = new Error("CREDIT_ACCOUNT_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (["CANCELLED", "DEFAULTED"].includes(creditAccount.status)) {
    const error = new Error("CANNOT_APPEND_TO_INACTIVE_CREDIT_ACCOUNT");
    error.statusCode = 400;
    throw error;
  }

  const effectiveTerm = term || creditAccount.term;

  const previousCashPromo = Number(
    creditAccount.cashPromoTotalAmount || creditAccount.sourceTotalAmountSnapshot
  );
  const newCashPromoTotal = toMoney(previousCashPromo + Number(addedCashPromoAmount));
  const newDownpaymentAmount = toMoney(
    Number(creditAccount.downpaymentAmount || 0) + Number(addedDownpaymentAmount)
  );

  if (newDownpaymentAmount > newCashPromoTotal) {
    throwReceivableError("RECEIVABLE_INITIAL_SETTLEMENT_EXCEEDS_TOTAL");
  }

  let termBasis = Number(creditAccount.termBasis || 1);
  const months = INSTALLMENT_TERM_MONTHS[effectiveTerm] || 1;

  if (effectiveTerm && effectiveTerm !== "STRAIGHT" && effectiveTerm !== "CASH_PROMO") {
    try {
      const installmentComputation = await settingService.computeInstallmentTest({
        cashPromoTotalAmount: toMoney(addedCashPromoAmount),
        cashDownpayment: toMoney(addedDownpaymentAmount),
        term: effectiveTerm,
        provider: creditAccount.provider,
      });
      termBasis = Number(installmentComputation?.basisUsed?.termBasis || 1);
    } catch (error) {
      normalizeSettingsError(error);
    }
  } else if (effectiveTerm === "STRAIGHT") {
    termBasis = 0.96;
  } else {
    termBasis = 1.0;
  }

  const isCreditCard = creditAccount.provider === "CREDIT_CARD";
  let addedFinancedAmount;

  if (isCreditCard && Number(addedDownpaymentAmount) > 0) {
    const remainingCash = Math.max(Number(addedCashPromoAmount) - Number(addedDownpaymentAmount), 0);
    const swipeAmount = toMoney(remainingCash / termBasis);
    addedFinancedAmount = toMoney(Number(addedDownpaymentAmount) + swipeAmount);
  } else if (termBasis > 0 && termBasis !== 1) {
    addedFinancedAmount = toMoney(Number(addedCashPromoAmount) / termBasis);
  } else {
    addedFinancedAmount = toMoney(addedCashPromoAmount);
  }

  const netAddedToBalance = toMoney(Math.max(addedFinancedAmount - Number(addedDownpaymentAmount), 0));

  const prevRegularPrice = Number(creditAccount.regularPriceTotalAmount || creditAccount.balanceAmount || 0);
  const newRegularPriceTotalAmount = toMoney(prevRegularPrice + addedFinancedAmount);

  const prevBalance = Number(creditAccount.balanceAmount || 0);
  const newBalanceAmount = toMoney(prevBalance + netAddedToBalance);

  const prevRemaining = Number(creditAccount.remainingBalance || 0);
  const newRemainingBalance = toMoney(Math.max(prevRemaining + netAddedToBalance, 0));

  const newMonthlyDueAmount = toMoney(newRemainingBalance / months);

  const totalCollected = toMoney(
    (creditAccount.collections || []).reduce(
      (sum, col) => sum + Number(col.amountPaid || 0),
      0
    )
  );

  const newStatus = newRemainingBalance <= 0 ? "PAID" : "ACTIVE";
  const paidAt = newRemainingBalance <= 0 ? (creditAccount.paidAt || new Date()) : null;

  const updatedCreditAccount = await tx.creditAccount.update({
    where: { id: creditAccountId },
    data: {
      sourceTotalAmountSnapshot: toMoneyString(newCashPromoTotal),
      cashPromoTotalAmount: toMoneyString(newCashPromoTotal),
      regularPriceTotalAmount: toMoneyString(newRegularPriceTotalAmount),
      downpaymentAmount: toMoneyString(newDownpaymentAmount),
      balanceAmount: toMoneyString(newBalanceAmount),
      totalCollected: toMoneyString(totalCollected),
      remainingBalance: toMoneyString(newRemainingBalance),
      term: effectiveTerm,
      termBasis: termBasis.toFixed(4),
      monthlyDueAmount: toMoneyString(newMonthlyDueAmount),
      status: newStatus,
      paidAt,
      updatedById: actor.id,
    },
  });

  await createAuditLog(
    {
      actor,
      branchId: creditAccount.branchId,
      action: "RECEIVABLE_ACCOUNT_UPDATED",
      entityType: "CreditAccount",
      entityId: creditAccount.id,
      description: `Credit account ${creditAccount.creditCode} recalculated with appended sale items`,
      metadata: {
        creditCode: creditAccount.creditCode,
        term: effectiveTerm,
        previousBalanceAmount: creditAccount.balanceAmount.toString(),
        newBalanceAmount: toMoneyString(balanceAmount),
        addedCashPromoAmount: toMoneyString(addedCashPromoAmount),
        addedDownpaymentAmount: toMoneyString(addedDownpaymentAmount),
        remainingBalance: toMoneyString(remainingBalance),
      },
    },
    tx
  );

  return updatedCreditAccount;
};

module.exports = {
  RECEIVABLE_PROVIDERS,
  RECEIVABLE_SOURCE_TYPES,
  createReceivableAccount,
  recalculateReceivableForSale,
  deriveReceivablePaymentState,
  deriveSourcePaymentStatus,
  testInternals: {
    calculateExternalReceivableSnapshot,
    calculateInHouseReceivableSnapshot,
    validateSourceCoverage,
  },
};
