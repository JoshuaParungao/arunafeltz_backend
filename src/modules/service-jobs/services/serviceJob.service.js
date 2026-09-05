const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const cashLinkService = require("../../cash-boxes/services/cashLink.service");
const {
  createReceivableAccount,
  deriveReceivablePaymentState,
} = require("../../credit-accounts/services/receivableAccount.service");
const { createAuditLog } = require("../../../utils/auditLogger");
const { businessDateCode } = require("../../../utils/businessDate");
const {
  assertIdempotencyMatch,
  createIdempotencyFingerprint,
} = require("../../../utils/idempotency");

const SERVICE_REPAIR_TYPES = new Set([
  "ORDINARY_REPAIR",
  "BOARD_LEVEL_REPAIR",
]);

const TECHNICAL_CLASSIFICATIONS = new Set([
  "TECHNICIAN",
  "SENIOR_TECHNICIAN",
]);

const INTERNAL_SERVICE_FINANCIAL_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
]);

const INTERNAL_SERVICE_FINANCIAL_FIELDS = new Set([
  "programRuleVersionId",
  "accountConfigVersionId",
  "repairCostPercentSnapshot",
  "companySharePercentSnapshot",
  "repairCostPoolAmountSnapshot",
  "companyShareAmountSnapshot",
  "repairFeeSnapshot",
  "repairIncentiveRateSnapshot",
  "repairIncentiveAmountSnapshot",
  "unallocatedRepairCostPoolSnapshot",
  "financialSnapshotAt",
]);

const MAX_SERVICE_CHARGE = 9999999999.99;

const CREATE_SERVICE_JOB_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "TECHNICIAN",
  "CASHIER",
]);

const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";

const toMoney = (value) => {
  return Math.round(Number(value) * 100) / 100;
};

const toMoneyString = (value) => {
  return toMoney(value).toFixed(2);
};

const throwServiceJobError = (code, statusCode = 400) => {
  const error = new Error(code);
  error.statusCode = statusCode;
  throw error;
};

const toPercent = (value, code = "INVALID_MARKUP_PERCENT") => {
  const number = Number(value);
  const rounded = Math.round(number * 10000) / 10000;

  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number >= 100 ||
    rounded < 0 ||
    rounded >= 100
  ) {
    throwServiceJobError(code);
  }

  return rounded;
};

const toPercentString = (value) => Number(value).toFixed(4);

const optionalMoneyString = (value) =>
  value === null || value === undefined ? undefined : toMoneyString(value);

const optionalPercentString = (value) =>
  value === null || value === undefined ? undefined : toPercentString(value);

const calculateServicePricing = ({ baseServiceCharge, markupPercent = 0 }) => {
  const rawBaseServiceCharge = Number(baseServiceCharge);

  if (!Number.isFinite(rawBaseServiceCharge) || rawBaseServiceCharge < 0) {
    throwServiceJobError("INVALID_BASE_SERVICE_CHARGE");
  }

  const base = toMoney(rawBaseServiceCharge);
  const markup = toPercent(markupPercent);
  const final = toMoney(base / (1 - markup / 100));

  if (!Number.isFinite(final) || final > MAX_SERVICE_CHARGE) {
    throwServiceJobError("SERVICE_CHARGE_EXCEEDS_LIMIT");
  }

  return {
    baseServiceCharge: toMoneyString(base),
    markupPercent: toPercentString(markup),
    finalServiceCharge: toMoneyString(final),
    serviceMarkupAmount: toMoneyString(final - base),
  };
};

const calculateRepairFinancialAmounts = ({
  baseServiceCharge,
  repairCostPercent,
  repairFee,
  repairIncentiveRate,
}) => {
  const base = toMoney(baseServiceCharge);
  const costPercent = Number(repairCostPercent);
  const fee = toMoney(repairFee);
  const incentiveRate = Number(repairIncentiveRate);

  if (
    !Number.isFinite(base) ||
    base <= 0 ||
    !Number.isFinite(costPercent) ||
    costPercent < 0 ||
    costPercent > 100 ||
    !Number.isFinite(fee) ||
    fee < 0 ||
    !Number.isFinite(incentiveRate) ||
    incentiveRate < 0 ||
    incentiveRate > 100
  ) {
    throwServiceJobError("INVALID_REPAIR_FINANCIAL_CONFIGURATION");
  }

  const companyPercent = toPercentString(100 - costPercent);
  const repairCostPool = toMoney((base * costPercent) / 100);
  const companyShare = toMoney(base - repairCostPool);
  const repairIncentive = toMoney((base * incentiveRate) / 100);
  const unallocatedRepairCostPool = toMoney(
    repairCostPool - fee - repairIncentive
  );

  if (
    [
      repairCostPool,
      companyShare,
      fee,
      repairIncentive,
      unallocatedRepairCostPool,
    ].some((amount) => Math.abs(amount) > MAX_SERVICE_CHARGE)
  ) {
    throwServiceJobError("INVALID_REPAIR_FINANCIAL_CONFIGURATION");
  }

  return {
    repairCostPercentSnapshot: toPercentString(costPercent),
    companySharePercentSnapshot: companyPercent,
    repairCostPoolAmountSnapshot: toMoneyString(repairCostPool),
    companyShareAmountSnapshot: toMoneyString(companyShare),
    repairFeeSnapshot: toMoneyString(fee),
    repairIncentiveRateSnapshot: toPercentString(incentiveRate),
    repairIncentiveAmountSnapshot: toMoneyString(repairIncentive),
    unallocatedRepairCostPoolSnapshot: toMoneyString(
      unallocatedRepairCostPool
    ),
  };
};

const ensureCanCreateServiceJob = (actor) => {
  if (!CREATE_SERVICE_JOB_ROLES.has(actor.role)) {
    const error = new Error("SERVICE_JOB_CREATE_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const generateServiceJobCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `${datePart}`;

  const latestJob = await tx.serviceJob.findFirst({
    where: {
      branchId,
      jobCode: {
        startsWith: prefix,
      },
    },
    orderBy: {
      jobCode: "desc",
    },
    select: {
      jobCode: true,
    },
  });

  let nextNumber = 1;

  if (latestJob) {
    const latestNumberText = latestJob.jobCode.slice(prefix.length);
    const latestNumber = Number(latestNumberText);

    if (Number.isInteger(latestNumber) && latestNumber > 0) {
      nextNumber = latestNumber + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
};




const CREATE_SERVICE_PAYMENT_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "CASHIER",
  "TECHNICIAN",
]);

const CANCEL_SERVICE_PAYMENT_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
]);

const IMMEDIATE_SERVICE_PAYMENT_METHODS = new Set([
  "CASH",
  "GCASH",
  "BANK_TRANSFER",
  "OTHER",
]);

const ensureCanCreateServicePayment = (actor) => {
  if (!CREATE_SERVICE_PAYMENT_ROLES.has(actor.role)) {
    const error = new Error("SERVICE_PAYMENT_CREATE_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const ensureCanCancelServicePayment = (actor) => {
  if (!CANCEL_SERVICE_PAYMENT_ROLES.has(actor.role)) {
    throwServiceJobError("SERVICE_PAYMENT_CANCEL_FORBIDDEN", 403);
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    throwServiceJobError("USER_BRANCH_REQUIRED");
  }
};

const generateServicePaymentCode = async (tx, branchCode, branchId) => {
  const prefix = `SVCPAY-${branchCode}-${businessDateCode()}-`;

  const latestPayment = await tx.servicePayment.findFirst({
    where: {
      branchId,
      paymentCode: {
        startsWith: prefix,
      },
    },
    orderBy: {
      paymentCode: "desc",
    },
    select: {
      paymentCode: true,
    },
  });

  let nextNumber = 1;

  if (latestPayment) {
    const latestNumberText = latestPayment.paymentCode.slice(prefix.length);
    const latestNumber = Number(latestNumberText);

    if (Number.isInteger(latestNumber) && latestNumber > 0) {
      nextNumber = latestNumber + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
};

const VIEW_SERVICE_JOB_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "TECHNICIAN",
  "CASHIER",
]);

const ensureCanViewServiceJobs = (actor) => {
  if (!VIEW_SERVICE_JOB_ROLES.has(actor.role)) {
    const error = new Error("SERVICE_JOB_VIEW_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const UPDATE_SERVICE_JOB_STATUS_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "CASHIER",
  "TECHNICIAN",
]);

const MANAGE_SERVICE_JOB_ASSIGNMENT_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "CASHIER",
]);

const RELEASE_SERVICE_JOB_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "CASHIER",
  "TECHNICIAN",
]);

const COMPLETED_RELEASE_OUTCOMES = new Set([
  "REPAIRED",
  "SERVICE_COMPLETED",
]);

const UNREPAIRED_RELEASE_OUTCOMES = new Set([
  "UNREPAIRED",
  "CUSTOMER_PULL_OUT",
  "NO_FAULT_FOUND",
  "DECLINED",
  "OTHER",
]);

const ACTIVE_SERVICE_JOB_STATUSES = new Set([
  "PENDING",
  "IN_PROGRESS",
  "READY_FOR_RELEASE",
]);

const STATUS_TRANSITIONS = {
  PENDING: new Set(["IN_PROGRESS", "CANCELLED"]),
  IN_PROGRESS: new Set(["READY_FOR_RELEASE", "CANCELLED"]),
  READY_FOR_RELEASE: new Set(["CANCELLED"]),
  COMPLETED: new Set([]),
  CANCELLED: new Set([]),
};

const ensureCanUpdateServiceJobStatus = (actor) => {
  if (!UPDATE_SERVICE_JOB_STATUS_ROLES.has(actor.role)) {
    const error = new Error("SERVICE_JOB_STATUS_UPDATE_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const ensureCanReleaseServiceJob = (actor) => {
  if (!RELEASE_SERVICE_JOB_ROLES.has(actor.role)) {
    const error = new Error("SERVICE_JOB_RELEASE_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const lockBranch = async (tx, branchId) => {
  await tx.$queryRaw`
    SELECT "id"
    FROM "Branch"
    WHERE "id" = ${branchId}
    FOR UPDATE
  `;
};

const ensureCanAccessServiceJobBranch = (actor, serviceJob) => {
  if (!isSuperOwner(actor) && serviceJob.branchId !== actor.branchId) {
    const error = new Error("SERVICE_JOB_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }
};

const resolveRepairType = (serviceJob, payload = {}) => {
  if (
    serviceJob.repairType &&
    payload.repairType &&
    serviceJob.repairType !== payload.repairType
  ) {
    throwServiceJobError("REPAIR_TYPE_CHANGE_NOT_ALLOWED");
  }

  const repairType = serviceJob.repairType || payload.repairType;

  if (!SERVICE_REPAIR_TYPES.has(repairType)) {
    throwServiceJobError("REPAIR_TYPE_REQUIRED");
  }

  return repairType;
};

const ensureTechnicianCanActForRepairType = (actor, repairType) => {
  if (actor.role !== "TECHNICIAN") {
    return;
  }

  if (!TECHNICAL_CLASSIFICATIONS.has(actor.incentiveClassification)) {
    throwServiceJobError("SERVICE_TECHNICIAN_CLASSIFICATION_REQUIRED", 403);
  }

  if (
    repairType === "BOARD_LEVEL_REPAIR" &&
    actor.incentiveClassification !== "SENIOR_TECHNICIAN"
  ) {
    throwServiceJobError("BOARD_LEVEL_REQUIRES_SENIOR_TECHNICIAN", 403);
  }
};

const resolveServicePricing = (serviceJob, payload = {}) => {
  const hasPayloadBase = payload.baseServiceCharge !== undefined;
  const hasStoredBase = serviceJob.baseServiceCharge !== null &&
    serviceJob.baseServiceCharge !== undefined;
  const hasPayloadMarkup = payload.markupPercent !== undefined;
  const hasStoredMarkup = serviceJob.markupPercent !== null &&
    serviceJob.markupPercent !== undefined;
  const hasPayloadFinal = payload.finalServiceCharge !== undefined;

  let baseServiceCharge = hasPayloadBase
    ? payload.baseServiceCharge
    : hasStoredBase
      ? serviceJob.baseServiceCharge
      : undefined;
  let markupPercent = hasPayloadMarkup
    ? payload.markupPercent
    : hasStoredMarkup
      ? serviceJob.markupPercent
      : undefined;

  if (baseServiceCharge === undefined) {
    if (markupPercent !== undefined && Number(markupPercent) !== 0) {
      throwServiceJobError("BASE_SERVICE_CHARGE_REQUIRED");
    }

    baseServiceCharge = hasPayloadFinal
      ? payload.finalServiceCharge
      : serviceJob.finalServiceCharge || 0;
    markupPercent = 0;
  }

  const pricing = calculateServicePricing({
    baseServiceCharge,
    markupPercent: markupPercent === undefined ? 0 : markupPercent,
  });

  if (
    hasPayloadFinal &&
    toMoney(payload.finalServiceCharge) !== Number(pricing.finalServiceCharge)
  ) {
    throwServiceJobError("FINAL_SERVICE_CHARGE_MISMATCH");
  }

  return pricing;
};


const SERVICE_PAYMENT_INCLUDE = {
  serviceJob: {
    select: {
      id: true,
      jobCode: true,
      jobTitle: true,
      status: true,
      repairType: true,
      baseServiceCharge: true,
      markupPercent: true,
      finalServiceCharge: true,
      serviceMarkupAmount: true,
    },
  },
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      contactNo: true,
    },
  },
  customer: {
    select: {
      id: true,
      customerCode: true,
      fullName: true,
      mobileNumber: true,
    },
  },
  collectedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  cancelledBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
};

const SERVICE_JOB_INCLUDE = {
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      contactNo: true,
    },
  },
  customer: {
    select: {
      id: true,
      customerCode: true,
      fullName: true,
      mobileNumber: true,
      email: true,
    },
  },
  assignedTechnician: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      status: true,
      incentiveClassification: true,
    },
  },
  serviceDoneBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      status: true,
      incentiveClassification: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  updatedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  cancelledBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  releasedBy: {
    select: {
      id: true,
      fullName: true,
      role: true,
    },
  },
  payments: {
    orderBy: [{ paidAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      paymentCode: true,
      paymentMethod: true,
      status: true,
      amount: true,
      referenceNo: true,
      remarks: true,
      paidAt: true,
      cancelledAt: true,
      cancellationReason: true,
      collectedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      cancelledBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
    },
  },
  creditAccount: {
    select: {
      id: true,
      creditCode: true,
      status: true,
      sourceType: true,
      provider: true,
      sourceTotalAmountSnapshot: true,
      providerReferenceNo: true,
      term: true,
      termBasis: true,
      cashPromoTotalAmount: true,
      regularPriceTotalAmount: true,
      downpaymentAmount: true,
      balanceAmount: true,
      monthlyDueAmount: true,
      totalCollected: true,
      remainingBalance: true,
      dueDay: true,
      firstDueDate: true,
      nextDueDate: true,
      paidAt: true,
      remarks: true,
      collections: {
        orderBy: [{ paidAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          collectionCode: true,
          status: true,
          amount: true,
          paymentMethod: true,
          referenceNo: true,
          remarks: true,
          paidAt: true,
          cancelledAt: true,
          cancellationReason: true,
        },
      },
    },
  },
};

const SAFE_ACTION_METADATA_KEYS = new Set([
  "jobCode",
  "previousStatus",
  "status",
  "previousAssignedTechnicianId",
  "assignedTechnicianId",
  "repairType",
  "serviceDoneById",
  "serviceDoneByClassificationSnapshot",
  "isQuickService",
  "releaseOutcome",
  "releaseNotes",
  "baseServiceCharge",
  "markupPercent",
  "finalServiceCharge",
  "serviceMarkupAmount",
  "programRuleVersionId",
  "accountConfigVersionId",
  "repairCostPercentSnapshot",
  "companySharePercentSnapshot",
  "repairCostPoolAmountSnapshot",
  "companyShareAmountSnapshot",
  "repairFeeSnapshot",
  "repairIncentiveRateSnapshot",
  "repairIncentiveAmountSnapshot",
  "unallocatedRepairCostPoolSnapshot",
  "financialSnapshotAt",
  "cancellationReason",
  "paymentCode",
  "paymentMethod",
  "amount",
  "provider",
  "providerReferenceNo",
  "creditCode",
  "collectionCode",
  "servicePaymentId",
]);

const canViewInternalServiceFinancials = (actor) =>
  INTERNAL_SERVICE_FINANCIAL_ROLES.has(actor?.role);

const stripIdempotencyMetadata = (record) => {
  if (!record) {
    return record;
  }

  const { idempotencyKey, idempotencyFingerprint, ...safeRecord } = record;
  return safeRecord;
};

const sanitizeServiceSettlementResult = (result) => ({
  ...result,
  payment: stripIdempotencyMetadata(result.payment),
  creditAccount: stripIdempotencyMetadata(result.creditAccount),
});

const sanitizeActionMetadata = (metadata, actor) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) =>
        SAFE_ACTION_METADATA_KEYS.has(key) &&
        (canViewInternalServiceFinancials(actor) ||
          !INTERNAL_SERVICE_FINANCIAL_FIELDS.has(key))
    )
  );
};

const formatServiceAction = (entry, actor) => ({
  id: entry.id,
  action: entry.action,
  description: entry.description,
  metadata: sanitizeActionMetadata(entry.metadata, actor),
  createdAt: entry.createdAt,
  actor: entry.actor
    ? {
        id: entry.actor.id,
        fullName: entry.actor.fullName,
        role: entry.actor.role,
      }
    : null,
});

const getServiceJobActionHistory = async (
  serviceJob,
  client = prisma,
  actor = null
) => {
  const entityFilters = [
    {
      entityType: "ServiceJob",
      entityId: serviceJob.id,
    },
  ];

  for (const payment of serviceJob.payments || []) {
    entityFilters.push({
      entityType: "ServicePayment",
      entityId: payment.id,
    });
  }

  if (serviceJob.creditAccount?.id) {
    entityFilters.push({
      entityType: "CreditAccount",
      entityId: serviceJob.creditAccount.id,
    });

    for (const collection of serviceJob.creditAccount.collections || []) {
      entityFilters.push({
        entityType: "CreditCollection",
        entityId: collection.id,
      });
    }
  }

  const entries = await client.auditLog.findMany({
    where: {
      branchId: serviceJob.branchId,
      OR: entityFilters,
    },
    select: {
      id: true,
      action: true,
      description: true,
      metadata: true,
      createdAt: true,
      actor: {
        select: {
          id: true,
          fullName: true,
          role: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });

  return entries.map((entry) => formatServiceAction(entry, actor));
};

const calculateServiceSettlementSnapshot = (serviceJob) => {
  const finalCharge = toMoney(Number(serviceJob.finalServiceCharge));
  const postedPayments = (serviceJob.payments || []).filter(
    (payment) => payment.status === "POSTED"
  );
  const directCollectedAmount = toMoney(
    postedPayments.reduce((total, payment) => total + Number(payment.amount), 0)
  );
  const receivableCollectedAmount = toMoney(
    Number(serviceJob.creditAccount?.totalCollected || 0)
  );
  const collectedAmount = toMoney(
    directCollectedAmount + receivableCollectedAmount
  );
  const isTerminal = ["COMPLETED", "CANCELLED"].includes(serviceJob.status);
  const isFormallyReleased =
    Boolean(serviceJob.releasedAt) || serviceJob.status === "COMPLETED";

  if (!isTerminal || !isFormallyReleased) {
    return {
      paymentState: "NOT_DUE",
      directCollectedAmount,
      receivableCollectedAmount,
      collectedAmount,
      remainingBalance: finalCharge,
    };
  }

  if (finalCharge <= 0) {
    return {
      paymentState: "NO_CHARGE",
      directCollectedAmount,
      receivableCollectedAmount,
      collectedAmount,
      remainingBalance: 0,
    };
  }

  if (serviceJob.creditAccount) {
    const receivableState = deriveReceivablePaymentState(
      serviceJob.creditAccount
    );

    return {
      paymentState:
        receivableState === "PAID"
          ? "PAID"
          : collectedAmount > 0
            ? "PARTIALLY_PAID"
            : "UNPAID",
      directCollectedAmount,
      receivableCollectedAmount,
      collectedAmount,
      remainingBalance: toMoney(
        Number(serviceJob.creditAccount.remainingBalance)
      ),
    };
  }

  const remainingBalance = toMoney(
    Math.max(finalCharge - directCollectedAmount, 0)
  );

  return {
    paymentState:
      remainingBalance <= 0
        ? "PAID"
        : directCollectedAmount > 0
          ? "PARTIALLY_PAID"
          : "UNPAID",
    directCollectedAmount,
    receivableCollectedAmount,
    collectedAmount,
    remainingBalance,
  };
};

const formatServiceJob = (serviceJob, actionHistory, actor = null) => {
  const customerContact = [
    serviceJob.customer?.mobileNumber,
    serviceJob.customer?.email,
  ]
    .filter(Boolean)
    .join(" / ");
  const settlement = calculateServiceSettlementSnapshot(serviceJob);
  const safePayments = (serviceJob.payments || []).map(
    stripIdempotencyMetadata
  );
  const safeCreditAccount = stripIdempotencyMetadata(
    serviceJob.creditAccount
  );

  if (Array.isArray(safeCreditAccount?.collections)) {
    safeCreditAccount.collections = safeCreditAccount.collections.map(
      stripIdempotencyMetadata
    );
  }

  const formatted = {
    ...serviceJob,
    payments: safePayments,
    creditAccount: safeCreditAccount,
    customerNameSnapshot:
      serviceJob.customerNameSnapshot || serviceJob.customer?.fullName || null,
    customerContactSnapshot:
      serviceJob.customerContactSnapshot || customerContact || null,
    receivedBy: serviceJob.createdBy || null,
    ...settlement,
  };

  if (actionHistory) {
    formatted.actionHistory = actionHistory;
    formatted.lastAction = actionHistory[0] || null;
  }

  if (!canViewInternalServiceFinancials(actor)) {
    for (const field of INTERNAL_SERVICE_FINANCIAL_FIELDS) {
      delete formatted[field];
    }
  }

  return formatted;
};

const resolveBranchForCreate = async (tx, actor, payload) => {
  if (isSuperOwner(actor)) {
    if (!payload.branchId) {
      const error = new Error("BRANCH_ID_REQUIRED");
      error.statusCode = 400;
      throw error;
    }

    const branch = await tx.branch.findUnique({
      where: {
        id: payload.branchId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
    });

    if (!branch || branch.status !== "ACTIVE") {
      const error = new Error("BRANCH_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    return branch;
  }

  const branch = await tx.branch.findUnique({
    where: {
      id: actor.branchId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  if (!branch || branch.status !== "ACTIVE") {
    const error = new Error("BRANCH_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return branch;
};

const validateCustomer = async (tx, branchId, customerId) => {
  if (!customerId) {
    return null;
  }

  const customer = await tx.customer.findUnique({
    where: {
      id: customerId,
    },
    select: {
      id: true,
      branchId: true,
      status: true,
      fullName: true,
      mobileNumber: true,
      email: true,
    },
  });

  if (!customer || customer.status !== "ACTIVE" || customer.branchId !== branchId) {
    const error = new Error("CUSTOMER_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return customer;
};

const validateAssignedTechnician = async (
  tx,
  branchId,
  assignedTechnicianId,
  repairType
) => {
  if (!assignedTechnicianId) {
    return null;
  }

  const technician = await tx.user.findUnique({
    where: {
      id: assignedTechnicianId,
    },
    select: {
      id: true,
      branchId: true,
      role: true,
      status: true,
      incentiveClassification: true,
    },
  });

  if (
    !technician ||
    technician.status !== "ACTIVE" ||
    (technician.branchId && technician.branchId !== branchId && technician.role !== "SUPER_OWNER")
  ) {
    const error = new Error("ASSIGNED_TECHNICIAN_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return technician;
};

const validateServiceDoneBy = async (
  tx,
  actor,
  branchId,
  serviceDoneById,
  repairType
) => {
  if (!serviceDoneById) {
    throwServiceJobError("SERVICE_DONE_BY_REQUIRED");
  }

  if (actor.role === "TECHNICIAN" && serviceDoneById !== actor.id) {
    throwServiceJobError("TECHNICIAN_SERVICE_DONE_BY_SELF_ONLY", 403);
  }

  const technician = await tx.user.findFirst({
    where: {
      id: serviceDoneById,
      status: "ACTIVE",
      ...(branchId ? { OR: [{ branchId }, { role: "SUPER_OWNER" }] } : {}),
    },
    select: {
      id: true,
      branchId: true,
      role: true,
      status: true,
      incentiveClassification: true,
    },
  });

  if (!technician) {
    throwServiceJobError("SERVICE_DONE_BY_NOT_ELIGIBLE");
  }

  return technician;
};

const buildCompletedFinancialSnapshot = async (
  tx,
  { branchId, repairType, performer, pricing, snapshotAt }
) => {
  const baseServiceCharge = Number(pricing.baseServiceCharge);

  if (baseServiceCharge <= 0) {
    return null;
  }

  const programRuleVersion = await tx.incentiveProgramRuleVersion.findFirst({
    where: {
      branchId,
      programType: repairType,
      effectiveFrom: {
        lte: snapshotAt,
      },
    },
    orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
    select: {
      id: true,
      repairCostPercent: true,
    },
  });

  if (
    !programRuleVersion ||
    programRuleVersion.repairCostPercent === null
  ) {
    throwServiceJobError("REPAIR_COST_PERCENT_NOT_CONFIGURED");
  }

  const latestAccountConfig =
    await tx.incentiveAccountConfigVersion.findFirst({
      where: {
        accountId: performer.id,
        effectiveFrom: {
          lte: snapshotAt,
        },
      },
      orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
      select: {
        id: true,
        classificationSnapshot: true,
        ordinaryRepairEnabled: true,
        ordinaryRepairRatePercent: true,
        boardRepairEnabled: true,
        boardRepairRatePercent: true,
        repairFee: true,
      },
    });

  const effectiveAccountConfig =
    latestAccountConfig?.classificationSnapshot ===
    performer.incentiveClassification
      ? latestAccountConfig
      : null;
  const incentiveEnabled = effectiveAccountConfig
    ? repairType === "BOARD_LEVEL_REPAIR"
      ? effectiveAccountConfig.boardRepairEnabled
      : effectiveAccountConfig.ordinaryRepairEnabled
    : false;
  const configuredRate = effectiveAccountConfig
    ? repairType === "BOARD_LEVEL_REPAIR"
      ? effectiveAccountConfig.boardRepairRatePercent
      : effectiveAccountConfig.ordinaryRepairRatePercent
    : null;

  if (incentiveEnabled && configuredRate === null) {
    throwServiceJobError("INVALID_REPAIR_FINANCIAL_CONFIGURATION");
  }

  const amounts = calculateRepairFinancialAmounts({
    baseServiceCharge,
    repairCostPercent: programRuleVersion.repairCostPercent,
    repairFee: effectiveAccountConfig?.repairFee || 0,
    repairIncentiveRate: incentiveEnabled ? configuredRate : 0,
  });

  return {
    ...amounts,
    programRuleVersionId: programRuleVersion.id,
    accountConfigVersionId: effectiveAccountConfig?.id || null,
    financialSnapshotAt: snapshotAt,
  };
};

const createServiceJob = async (actor, payload, database = prisma) => {
  ensureCanCreateServiceJob(actor);

  if (!SERVICE_REPAIR_TYPES.has(payload.repairType)) {
    throwServiceJobError("REPAIR_TYPE_REQUIRED");
  }

  ensureTechnicianCanActForRepairType(actor, payload.repairType);

  if (
    payload.baseServiceCharge === undefined &&
    payload.markupPercent !== undefined
  ) {
    throwServiceJobError("BASE_SERVICE_CHARGE_REQUIRED");
  }

  const pricing =
    payload.baseServiceCharge === undefined
      ? null
      : calculateServicePricing({
          baseServiceCharge: payload.baseServiceCharge,
          markupPercent: payload.markupPercent || 0,
        });

  return database.$transaction(async (tx) => {
    const branch = await resolveBranchForCreate(tx, actor, payload);
    await lockBranch(tx, branch.id);

    const customer = await validateCustomer(tx, branch.id, payload.customerId);
    const assignedTechnician = await validateAssignedTechnician(
      tx,
      branch.id,
      payload.assignedTechnicianId,
      payload.repairType
    );

    if (
      actor.role === "TECHNICIAN" &&
      assignedTechnician &&
      assignedTechnician.id !== actor.id
    ) {
      const error = new Error("TECHNICIAN_CREATE_ASSIGNMENT_FORBIDDEN");
      error.statusCode = 403;
      throw error;
    }

    const jobCode = await generateServiceJobCode(tx, branch.code, branch.id);
    const estimatedServiceCharge = toMoney(payload.estimatedServiceCharge || 0);
    const linkedCustomerContact = customer
      ? [customer.mobileNumber, customer.email].filter(Boolean).join(" / ")
      : "";

    const serviceJob = await tx.serviceJob.create({
      data: {
        jobCode,
        status: "PENDING",
        repairType: payload.repairType,
        jobTitle: payload.jobTitle,
        deviceDescription: payload.deviceDescription || null,
        problemDescription: payload.problemDescription || null,
        diagnosis: payload.diagnosis || null,
        serviceNotes: payload.serviceNotes || null,
        customerNameSnapshot: customer
          ? customer.fullName
          : payload.customerNameSnapshot || null,
        customerContactSnapshot: customer
          ? linkedCustomerContact || null
          : payload.customerContactSnapshot || null,
        serialNumber: payload.serialNumber || null,
        accessoriesReceived: payload.accessoriesReceived || null,
        receivingRemarks: payload.receivingRemarks || null,
        isQuickService: Boolean(payload.isQuickService),
        estimatedServiceCharge: toMoneyString(estimatedServiceCharge),
        baseServiceCharge: pricing?.baseServiceCharge || null,
        markupPercent: pricing?.markupPercent || null,
        finalServiceCharge: pricing?.finalServiceCharge || "0.00",
        serviceMarkupAmount: pricing?.serviceMarkupAmount || null,
        branchId: branch.id,
        customerId: customer ? customer.id : null,
        assignedTechnicianId: assignedTechnician ? assignedTechnician.id : null,
        createdById: actor.id,
        updatedById: actor.id,
      },
      include: SERVICE_JOB_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: serviceJob.branchId,
        action: "SERVICE_JOB_CREATED",
        entityType: "ServiceJob",
        entityId: serviceJob.id,
        description: `Service job ${serviceJob.jobCode} created`,
        metadata: {
          jobCode: serviceJob.jobCode,
          status: serviceJob.status,
          repairType: serviceJob.repairType,
          customerId: serviceJob.customerId,
          assignedTechnicianId: serviceJob.assignedTechnicianId,
          isQuickService: serviceJob.isQuickService,
          baseServiceCharge: serviceJob.baseServiceCharge
            ? toMoneyString(serviceJob.baseServiceCharge)
            : undefined,
          markupPercent: serviceJob.markupPercent
            ? toPercentString(serviceJob.markupPercent)
            : undefined,
          finalServiceCharge: toMoneyString(serviceJob.finalServiceCharge),
          serviceMarkupAmount: serviceJob.serviceMarkupAmount
            ? toMoneyString(serviceJob.serviceMarkupAmount)
            : undefined,
        },
      },
      tx
    );

    return formatServiceJob(serviceJob, null, actor);
  });
};

const getServiceTechnicians = async (actor, query = {}) => {
  ensureCanViewServiceJobs(actor);

  const branchId = isSuperOwner(actor) ? query.branchId : actor.branchId;
  const where = {
    status: "ACTIVE",
    role: { in: ["TECHNICIAN", "CASHIER", "ADMIN", "BRANCH_OWNER", "SUPER_OWNER"] },
    ...(branchId ? { OR: [{ branchId }, { role: "SUPER_OWNER" }] } : {}),
  };

  if (query.search) {
    where.AND = [
      {
        OR: [
          { fullName: { contains: query.search, mode: "insensitive" } },
          { username: { contains: query.search, mode: "insensitive" } },
        ],
      },
    ];
  }

  return prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      branchId: true,
      incentiveClassification: true,
    },
    orderBy: [{ fullName: "asc" }, { username: "asc" }],
  });
};



const buildServiceJobWhere = (actor, query = {}) => {
  const where = {};

  if (isSuperOwner(actor)) {
    if (query.branchId) {
      where.branchId = query.branchId;
    }
  } else {
    where.branchId = actor.branchId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.releaseOutcome) {
    where.releaseOutcome = query.releaseOutcome;
  }

  if (query.isQuickService !== undefined) {
    where.isQuickService = query.isQuickService;
  }

  if (query.customerId) {
    where.customerId = query.customerId;
  }

  if (query.assignedTechnicianId) {
    where.assignedTechnicianId = query.assignedTechnicianId;
  }

  if (query.serviceDoneById) {
    where.serviceDoneById = query.serviceDoneById;
  }

  if (query.repairType) {
    where.repairType = query.repairType;
  }

  if (query.dateFrom || query.dateTo) {
    where.receivedAt = {};

    if (query.dateFrom) {
      const dateFrom = new Date(query.dateFrom);
      dateFrom.setHours(0, 0, 0, 0);
      where.receivedAt.gte = dateFrom;
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      where.receivedAt.lte = dateTo;
    }
  }

  if (query.search) {
    where.OR = [
      {
        jobCode: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        jobTitle: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        deviceDescription: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        serialNumber: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        customerNameSnapshot: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        customer: {
          fullName: {
            contains: query.search,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  return where;
};

const getServiceJobs = async (actor, query = {}) => {
  ensureCanViewServiceJobs(actor);

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const where = buildServiceJobWhere(actor, query);

  const [data, total] = await prisma.$transaction([
    prisma.serviceJob.findMany({
      where,
      include: SERVICE_JOB_INCLUDE,
      orderBy: {
        receivedAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.serviceJob.count({
      where,
    }),
  ]);

  return {
    data: data.map((serviceJob) => formatServiceJob(serviceJob, null, actor)),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getServiceJobById = async (actor, serviceJobId) => {
  ensureCanViewServiceJobs(actor);

  const serviceJob = await prisma.serviceJob.findUnique({
    where: {
      id: serviceJobId,
    },
    include: SERVICE_JOB_INCLUDE,
  });

  if (!serviceJob) {
    const error = new Error("SERVICE_JOB_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  ensureCanAccessServiceJobBranch(actor, serviceJob);

  const actionHistory = await getServiceJobActionHistory(
    serviceJob,
    prisma,
    actor
  );

  return formatServiceJob(serviceJob, actionHistory, actor);
};


const createServicePayment = async (
  actor,
  serviceJobId,
  payload,
  database = prisma
) => {
  ensureCanCreateServicePayment(actor);

  const amount =
    payload.amount === null || payload.amount === undefined
      ? 0
      : toMoney(payload.amount);

  if (!Number.isFinite(amount) || amount < 0) {
    throwServiceJobError("INVALID_SERVICE_PAYMENT_AMOUNT");
  }

  if (
    amount > 0 &&
    !IMMEDIATE_SERVICE_PAYMENT_METHODS.has(payload.paymentMethod)
  ) {
    throwServiceJobError("INVALID_SERVICE_SETTLEMENT_METHOD");
  }

  if (amount <= 0 && !payload.receivable) {
    throwServiceJobError("SERVICE_PAYMENT_AMOUNT_REQUIRED");
  }

  const idempotencyFingerprint = payload.idempotencyKey
    ? createIdempotencyFingerprint({ serviceJobId, ...payload })
    : null;

  try {
    return await database.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "ServiceJob"
        WHERE "id" = ${serviceJobId}
        FOR UPDATE
      `;

      const serviceJob = await tx.serviceJob.findUnique({
        where: {
          id: serviceJobId,
        },
        include: {
          branch: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
            },
          },
          customer: {
            select: {
              id: true,
            },
          },
          payments: true,
          creditAccount: true,
        },
      });

      if (!serviceJob) {
        throwServiceJobError("SERVICE_JOB_NOT_FOUND", 404);
      }

      ensureCanAccessServiceJobBranch(actor, serviceJob);

      // Serialize branch-scoped replay keys and payment-code generation after
      // locking the source job, matching the source-first settlement order.
      await lockBranch(tx, serviceJob.branchId);

      const isPayableReleasedJob =
        serviceJob.status === "COMPLETED" ||
        (serviceJob.status === "CANCELLED" && Boolean(serviceJob.releasedAt));

      if (!isPayableReleasedJob) {
        throwServiceJobError("SERVICE_JOB_NOT_COMPLETED");
      }

      if (payload.idempotencyKey) {
        const existingPayment = await tx.servicePayment.findUnique({
          where: {
            branchId_idempotencyKey: {
              branchId: serviceJob.branchId,
              idempotencyKey: payload.idempotencyKey,
            },
          },
          include: SERVICE_PAYMENT_INCLUDE,
        });

        if (existingPayment) {
          assertIdempotencyMatch(
            existingPayment,
            idempotencyFingerprint,
            "SERVICE_PAYMENT_IDEMPOTENCY_CONFLICT"
          );

          return {
            ...sanitizeServiceSettlementResult({
              payment: existingPayment,
              creditAccount: serviceJob.creditAccount,
            }),
            replayed: true,
          };
        }

        const existingAccount = await tx.creditAccount.findUnique({
          where: {
            branchId_idempotencyKey: {
              branchId: serviceJob.branchId,
              idempotencyKey: payload.idempotencyKey,
            },
          },
        });

        if (existingAccount) {
          assertIdempotencyMatch(
            existingAccount,
            idempotencyFingerprint,
            "SERVICE_PAYMENT_IDEMPOTENCY_CONFLICT"
          );

          return {
            ...sanitizeServiceSettlementResult({
              payment: null,
              creditAccount: existingAccount,
            }),
            replayed: true,
          };
        }
      }

      if (serviceJob.creditAccount) {
        throwServiceJobError("SERVICE_RECEIVABLE_COLLECTION_REQUIRED");
      }

      const finalServiceCharge = toMoney(
        Number(serviceJob.finalServiceCharge)
      );
      const postedTotal = toMoney(
        serviceJob.payments
          .filter((payment) => payment.status === "POSTED")
          .reduce((total, payment) => total + Number(payment.amount), 0)
      );
      const outstandingAmount = toMoney(finalServiceCharge - postedTotal);

      if (outstandingAmount <= 0) {
        throwServiceJobError("SERVICE_JOB_ALREADY_PAID");
      }

      if (amount > outstandingAmount) {
        throwServiceJobError("SERVICE_PAYMENT_EXCEEDS_BALANCE");
      }

      if (payload.receivable && amount === outstandingAmount) {
        throwServiceJobError("RECEIVABLE_BALANCE_REQUIRED");
      }

      let payment = null;

      if (amount > 0) {
        const paymentCode = await generateServicePaymentCode(
          tx,
          serviceJob.branch.code,
          serviceJob.branch.id
        );

        payment = await tx.servicePayment.create({
          data: {
            paymentCode,
            paymentMethod: payload.paymentMethod,
            status: "POSTED",
            amount: toMoneyString(amount),
            referenceNo: payload.referenceNo || null,
            remarks: payload.remarks || null,
            paidAt: payload.paidAt || undefined,
            idempotencyKey: payload.idempotencyKey || null,
            idempotencyFingerprint,
            serviceJobId: serviceJob.id,
            branchId: serviceJob.branchId,
            customerId: serviceJob.customerId || null,
            collectedById: actor.id,
            createdById: actor.id,
          },
          include: SERVICE_PAYMENT_INCLUDE,
        });

        if (payload.paymentMethod === "CASH") {
          await cashLinkService.postSystemCashIn(tx, actor, serviceJob.branch, {
            type: "SERVICE_PAYMENT",
            source: "SERVICE_JOB",
            amount,
            description: `Cash payment from service job ${serviceJob.jobCode}.`,
            referenceNo: payload.referenceNo || null,
            sourceId: payment.id,
            sourceCode: payment.paymentCode,
            transactionDate: payment.paidAt,
          });
        }

        await createAuditLog(
          {
            actor,
            branchId: serviceJob.branchId,
            action: "SERVICE_PAYMENT_POSTED",
            entityType: "ServicePayment",
            entityId: payment.id,
            description: `Payment ${payment.paymentCode} posted for ${serviceJob.jobCode}`,
            metadata: {
              serviceJobId: serviceJob.id,
              serviceJobCode: serviceJob.jobCode,
              paymentCode: payment.paymentCode,
              paymentMethod: payment.paymentMethod,
              amount: toMoneyString(amount),
            },
          },
          tx
        );
      }

      const creditAccount = payload.receivable
        ? await createReceivableAccount(tx, actor, {
            branch: serviceJob.branch,
            sourceType: "SERVICE_JOB",
            sourceId: serviceJob.id,
            sourceCode: serviceJob.jobCode,
            sourceTotalAmount: finalServiceCharge,
            initialSettlementAmount: toMoney(postedTotal + amount),
            customerId: serviceJob.customerId,
            idempotencyKey: payment ? null : payload.idempotencyKey || null,
            idempotencyFingerprint: payment ? null : idempotencyFingerprint,
            receivable: payload.receivable,
          })
        : null;

      return sanitizeServiceSettlementResult({
        payment,
        creditAccount,
        replayed: false,
      });
    });
  } catch (error) {
    if (error?.code === "P2002") {
      const duplicateError = new Error("SERVICE_SETTLEMENT_CONFLICT");
      duplicateError.statusCode = 409;
      throw duplicateError;
    }

    throw error;
  }
};

const cancelServicePayment = async (
  actor,
  servicePaymentId,
  payload,
  database = prisma
) => {
  ensureCanCancelServicePayment(actor);

  return database.$transaction(async (tx) => {
    const paymentReference = await tx.servicePayment.findUnique({
      where: {
        id: servicePaymentId,
      },
      select: {
        id: true,
        serviceJobId: true,
        branchId: true,
      },
    });

    if (!paymentReference) {
      throwServiceJobError("SERVICE_PAYMENT_NOT_FOUND", 404);
    }

    // Both posting and cancellation lock the source job first. This prevents
    // AR origination from snapshotting a payment while that payment is being
    // cancelled, then uses Branch -> ServicePayment for the remaining locks.
    await tx.$queryRaw`
      SELECT "id"
      FROM "ServiceJob"
      WHERE "id" = ${paymentReference.serviceJobId}
      FOR UPDATE
    `;

    const sourceJob = await tx.serviceJob.findUnique({
      where: {
        id: paymentReference.serviceJobId,
      },
      select: {
        id: true,
        branchId: true,
      },
    });

    if (!sourceJob) {
      throwServiceJobError("SERVICE_JOB_NOT_FOUND", 404);
    }

    ensureCanAccessServiceJobBranch(actor, sourceJob);
    await lockBranch(tx, sourceJob.branchId);

    await tx.$queryRaw`
      SELECT "id"
      FROM "ServicePayment"
      WHERE "id" = ${servicePaymentId}
      FOR UPDATE
    `;

    const payment = await tx.servicePayment.findUnique({
      where: {
        id: servicePaymentId,
      },
      include: {
        branch: true,
        serviceJob: {
          include: {
            creditAccount: {
              select: {
                id: true,
                creditCode: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throwServiceJobError("SERVICE_PAYMENT_NOT_FOUND", 404);
    }

    if (
      payment.serviceJobId !== sourceJob.id ||
      payment.branchId !== sourceJob.branchId ||
      paymentReference.branchId !== sourceJob.branchId
    ) {
      throwServiceJobError("SERVICE_PAYMENT_SOURCE_MISMATCH", 409);
    }

    ensureCanAccessServiceJobBranch(actor, payment.serviceJob);

    if (payment.status !== "POSTED") {
      throwServiceJobError("SERVICE_PAYMENT_ALREADY_CANCELLED");
    }

    if (payment.serviceJob.creditAccount) {
      throwServiceJobError(
        "SERVICE_PAYMENT_LINKED_RECEIVABLE_REVERSAL_FORBIDDEN"
      );
    }

    if (payment.paymentMethod === "CASH") {
      let reversedCash = await cashLinkService.reverseSystemCashIn(
        tx,
        actor,
        {
          source: "SERVICE_JOB",
          type: "SERVICE_PAYMENT",
          sourceId: payment.id,
          cancellationReason: payload.cancellationReason,
        }
      );

      if (!reversedCash) {
        const legacyCandidates = await tx.cashTransaction.findMany({
          where: {
            source: "SERVICE_JOB",
            type: "SERVICE_PAYMENT",
            sourceId: payment.serviceJobId,
            status: "POSTED",
          },
          select: {
            id: true,
            amount: true,
            sourceCode: true,
          },
          take: 2,
        });
        const legacyCandidate = legacyCandidates[0];
        const isUnambiguousLegacyLink =
          legacyCandidates.length === 1 &&
          toMoney(Number(legacyCandidate.amount)) ===
            toMoney(Number(payment.amount)) &&
          (!legacyCandidate.sourceCode ||
            legacyCandidate.sourceCode === payment.serviceJob.jobCode);

        if (!isUnambiguousLegacyLink) {
          throwServiceJobError("SERVICE_PAYMENT_CASH_LINK_NOT_FOUND", 409);
        }

        reversedCash = await cashLinkService.reverseSystemCashIn(
          tx,
          actor,
          {
            source: "SERVICE_JOB",
            type: "SERVICE_PAYMENT",
            sourceId: payment.serviceJobId,
            cancellationReason: payload.cancellationReason,
          }
        );
      }

      if (!reversedCash) {
        throwServiceJobError("SERVICE_PAYMENT_CASH_LINK_NOT_FOUND", 409);
      }
    }

    const cancelledPayment = await tx.servicePayment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: payload.cancellationReason,
        cancelledById: actor.id,
      },
      include: SERVICE_PAYMENT_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: payment.branchId,
        action: "SERVICE_PAYMENT_CANCELLED",
        entityType: "ServicePayment",
        entityId: payment.id,
        description: `Payment ${payment.paymentCode} cancelled for ${payment.serviceJob.jobCode}`,
        metadata: {
          serviceJobId: payment.serviceJobId,
          serviceJobCode: payment.serviceJob.jobCode,
          servicePaymentId: payment.id,
          paymentCode: payment.paymentCode,
          paymentMethod: payment.paymentMethod,
          amount: toMoneyString(payment.amount),
          cancellationReason: payload.cancellationReason,
        },
      },
      tx
    );

    return stripIdempotencyMetadata(cancelledPayment);
  });
};

const updateServiceJobAssignment = async (
  actor,
  serviceJobId,
  payload,
  database = prisma
) => {
  ensureCanViewServiceJobs(actor);

  return database.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "ServiceJob"
      WHERE "id" = ${serviceJobId}
      FOR UPDATE
    `;

    const serviceJob = await tx.serviceJob.findUnique({
      where: { id: serviceJobId },
      include: SERVICE_JOB_INCLUDE,
    });

    if (!serviceJob) {
      const error = new Error("SERVICE_JOB_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessServiceJobBranch(actor, serviceJob);

    if (!serviceJob.repairType) {
      throwServiceJobError("REPAIR_TYPE_REQUIRED");
    }

    if (serviceJob.repairType) {
      ensureTechnicianCanActForRepairType(actor, serviceJob.repairType);
    }

    if (!ACTIVE_SERVICE_JOB_STATUSES.has(serviceJob.status)) {
      const error = new Error("SERVICE_JOB_ASSIGNMENT_LOCKED");
      error.statusCode = 400;
      throw error;
    }

    const requestedTechnicianId = payload.assignedTechnicianId || null;
    const isManager = MANAGE_SERVICE_JOB_ASSIGNMENT_ROLES.has(actor.role);
    const isSafeTechnicianSelfClaim =
      actor.role === "TECHNICIAN" &&
      !serviceJob.assignedTechnicianId &&
      requestedTechnicianId === actor.id;

    if (!isManager && !isSafeTechnicianSelfClaim) {
      const error = new Error(
        actor.role === "TECHNICIAN"
          ? "TECHNICIAN_SELF_ASSIGNMENT_ONLY"
          : "SERVICE_JOB_ASSIGNMENT_UPDATE_FORBIDDEN"
      );
      error.statusCode = 403;
      throw error;
    }

    const technician = await validateAssignedTechnician(
      tx,
      serviceJob.branchId,
      requestedTechnicianId,
      serviceJob.repairType
    );
    const nextTechnicianId = technician?.id || null;

    if (serviceJob.assignedTechnicianId === nextTechnicianId) {
      return formatServiceJob(serviceJob, null, actor);
    }

    const updatedServiceJob = await tx.serviceJob.update({
      where: { id: serviceJob.id },
      data: {
        assignedTechnicianId: nextTechnicianId,
        updatedById: actor.id,
      },
      include: SERVICE_JOB_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: updatedServiceJob.branchId,
        action: "SERVICE_JOB_ASSIGNMENT_UPDATED",
        entityType: "ServiceJob",
        entityId: updatedServiceJob.id,
        description: nextTechnicianId
          ? `Service job ${updatedServiceJob.jobCode} assigned to ${updatedServiceJob.assignedTechnician?.fullName || "technician"}`
          : `Service job ${updatedServiceJob.jobCode} assignment cleared`,
        metadata: {
          jobCode: updatedServiceJob.jobCode,
          status: updatedServiceJob.status,
          previousAssignedTechnicianId: serviceJob.assignedTechnicianId,
          assignedTechnicianId: nextTechnicianId,
        },
      },
      tx
    );

    return formatServiceJob(updatedServiceJob, null, actor);
  });
};

const releaseServiceJob = async (
  actor,
  serviceJobId,
  payload,
  database = prisma
) => {
  ensureCanReleaseServiceJob(actor);

  return database.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "ServiceJob"
      WHERE "id" = ${serviceJobId}
      FOR UPDATE
    `;

    const serviceJob = await tx.serviceJob.findUnique({
      where: { id: serviceJobId },
      include: SERVICE_JOB_INCLUDE,
    });

    if (!serviceJob) {
      const error = new Error("SERVICE_JOB_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessServiceJobBranch(actor, serviceJob);

    if (serviceJob.releasedAt) {
      const error = new Error("SERVICE_JOB_ALREADY_RELEASED");
      error.statusCode = 400;
      throw error;
    }

    const isCompletedOutcome = COMPLETED_RELEASE_OUTCOMES.has(
      payload.releaseOutcome
    );
    const isUnrepairedOutcome = UNREPAIRED_RELEASE_OUTCOMES.has(
      payload.releaseOutcome
    );

    if (
      (!isCompletedOutcome && !isUnrepairedOutcome) ||
      (isCompletedOutcome && serviceJob.status !== "READY_FOR_RELEASE") ||
      (isUnrepairedOutcome && !ACTIVE_SERVICE_JOB_STATUSES.has(serviceJob.status))
    ) {
      throwServiceJobError("INVALID_SERVICE_JOB_RELEASE");
    }

    const repairType =
      isUnrepairedOutcome &&
      !serviceJob.repairType &&
      !payload.repairType
        ? null
        : resolveRepairType(serviceJob, payload);

    if (repairType) {
      ensureTechnicianCanActForRepairType(actor, repairType);
    }

    if (
      actor.role === "TECHNICIAN" &&
      (!serviceJob.assignedTechnicianId ||
        serviceJob.assignedTechnicianId !== actor.id)
    ) {
      const error = new Error("TECHNICIAN_ASSIGNED_JOB_ONLY");
      error.statusCode = 403;
      throw error;
    }

    const requestedServiceDoneById =
      payload.serviceDoneById || serviceJob.serviceDoneById;
    const serviceDoneBy =
      isCompletedOutcome || payload.serviceDoneById
        ? await validateServiceDoneBy(
            tx,
            actor,
            serviceJob.branchId,
            requestedServiceDoneById,
            repairType
          )
        : null;
    const isLegacyUnrepairedFinalOnly =
      isUnrepairedOutcome &&
      payload.finalServiceCharge !== undefined &&
      payload.baseServiceCharge === undefined &&
      payload.markupPercent === undefined;
    const pricing = isLegacyUnrepairedFinalOnly
      ? calculateServicePricing({
          baseServiceCharge: payload.finalServiceCharge,
          markupPercent: 0,
        })
      : resolveServicePricing(serviceJob, payload);

    const releasedAt = new Date();
    const nextStatus = isCompletedOutcome ? "COMPLETED" : "CANCELLED";
    const financialSnapshot = isCompletedOutcome
      ? await buildCompletedFinancialSnapshot(tx, {
          branchId: serviceJob.branchId,
          repairType,
          performer: serviceDoneBy,
          pricing,
          snapshotAt: releasedAt,
        })
      : null;
    const updateData = {
      status: nextStatus,
      repairType,
      baseServiceCharge: pricing.baseServiceCharge,
      markupPercent: pricing.markupPercent,
      finalServiceCharge: pricing.finalServiceCharge,
      serviceMarkupAmount: pricing.serviceMarkupAmount,
      serviceDoneById: serviceDoneBy?.id || serviceJob.serviceDoneById || null,
      releasedAt,
      releasedById: actor.id,
      releaseOutcome: payload.releaseOutcome,
      releaseNotes: payload.releaseNotes || null,
      updatedById: actor.id,
    };

    if (payload.diagnosis !== undefined) {
      updateData.diagnosis = payload.diagnosis || null;
    }

    if (payload.serviceNotes !== undefined) {
      updateData.serviceNotes = payload.serviceNotes || null;
    }

    if (isCompletedOutcome) {
      updateData.completedAt = releasedAt;
      updateData.serviceDoneByClassificationSnapshot =
        serviceDoneBy.incentiveClassification;

      if (financialSnapshot) {
        Object.assign(updateData, financialSnapshot);
      }
    } else {
      updateData.cancelledAt = releasedAt;
      updateData.cancelledById = actor.id;
      updateData.cancellationReason =
        payload.releaseNotes || payload.releaseOutcome.replaceAll("_", " ");
    }

    const updateResult = await tx.serviceJob.updateMany({
      where: {
        id: serviceJob.id,
        status: serviceJob.status,
        releasedAt: null,
      },
      data: updateData,
    });

    if (updateResult.count !== 1) {
      const error = new Error("INVALID_SERVICE_JOB_RELEASE");
      error.statusCode = 409;
      throw error;
    }

    const updatedServiceJob = await tx.serviceJob.findUnique({
      where: { id: serviceJob.id },
      include: SERVICE_JOB_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: updatedServiceJob.branchId,
        action: "SERVICE_JOB_RELEASED",
        entityType: "ServiceJob",
        entityId: updatedServiceJob.id,
        description: `Service job ${updatedServiceJob.jobCode} released with ${updatedServiceJob.releaseOutcome} outcome`,
        metadata: {
          jobCode: updatedServiceJob.jobCode,
          previousStatus: serviceJob.status,
          status: updatedServiceJob.status,
          releaseOutcome: updatedServiceJob.releaseOutcome,
          releaseNotes: updatedServiceJob.releaseNotes,
          repairType: updatedServiceJob.repairType,
          serviceDoneById: updatedServiceJob.serviceDoneById,
          serviceDoneByClassificationSnapshot:
            updatedServiceJob.serviceDoneByClassificationSnapshot,
          baseServiceCharge: optionalMoneyString(
            updatedServiceJob.baseServiceCharge
          ),
          markupPercent: optionalPercentString(
            updatedServiceJob.markupPercent
          ),
          finalServiceCharge: optionalMoneyString(
            updatedServiceJob.finalServiceCharge
          ),
          serviceMarkupAmount: optionalMoneyString(
            updatedServiceJob.serviceMarkupAmount
          ),
          programRuleVersionId: updatedServiceJob.programRuleVersionId,
          accountConfigVersionId: updatedServiceJob.accountConfigVersionId,
          repairCostPercentSnapshot: optionalPercentString(
            updatedServiceJob.repairCostPercentSnapshot
          ),
          companySharePercentSnapshot: optionalPercentString(
            updatedServiceJob.companySharePercentSnapshot
          ),
          repairCostPoolAmountSnapshot: optionalMoneyString(
            updatedServiceJob.repairCostPoolAmountSnapshot
          ),
          companyShareAmountSnapshot: optionalMoneyString(
            updatedServiceJob.companyShareAmountSnapshot
          ),
          repairFeeSnapshot: optionalMoneyString(
            updatedServiceJob.repairFeeSnapshot
          ),
          repairIncentiveRateSnapshot: optionalPercentString(
            updatedServiceJob.repairIncentiveRateSnapshot
          ),
          repairIncentiveAmountSnapshot: optionalMoneyString(
            updatedServiceJob.repairIncentiveAmountSnapshot
          ),
          unallocatedRepairCostPoolSnapshot: optionalMoneyString(
            updatedServiceJob.unallocatedRepairCostPoolSnapshot
          ),
          financialSnapshotAt:
            updatedServiceJob.financialSnapshotAt?.toISOString(),
        },
      },
      tx
    );

    return formatServiceJob(updatedServiceJob, null, actor);
  });
};

const updateServiceJobStatus = async (
  actor,
  serviceJobId,
  payload,
  database = prisma
) => {
  ensureCanUpdateServiceJobStatus(actor);

  return database.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "ServiceJob"
      WHERE "id" = ${serviceJobId}
      FOR UPDATE
    `;

    const serviceJob = await tx.serviceJob.findUnique({
      where: {
        id: serviceJobId,
      },
      include: SERVICE_JOB_INCLUDE,
    });

    if (!serviceJob) {
      const error = new Error("SERVICE_JOB_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessServiceJobBranch(actor, serviceJob);

    const targetStatus = payload.status || serviceJob.status;
    const isSameStatusUpdate = targetStatus === serviceJob.status;

    const allowedNextStatuses = new Set(
      STATUS_TRANSITIONS[serviceJob.status] || []
    );

    if (serviceJob.isQuickService && serviceJob.status === "PENDING") {
      allowedNextStatuses.add("READY_FOR_RELEASE");
    }

    if (targetStatus === "COMPLETED") {
      throwServiceJobError("SERVICE_JOB_COMPLETION_REQUIRES_RELEASE");
    }

    if (!isSameStatusUpdate && !allowedNextStatuses.has(targetStatus)) {
      const error = new Error("INVALID_SERVICE_JOB_STATUS_TRANSITION");
      error.statusCode = 400;
      throw error;
    }

    const repairType =
      targetStatus === "CANCELLED" &&
      !serviceJob.repairType &&
      !payload.repairType
        ? null
        : resolveRepairType(serviceJob, payload);

    if (repairType) {
      ensureTechnicianCanActForRepairType(actor, repairType);
    }

    if (
      actor.role === "TECHNICIAN" &&
      ["IN_PROGRESS", "READY_FOR_RELEASE"].includes(targetStatus) &&
      serviceJob.assignedTechnicianId !== actor.id
    ) {
      throwServiceJobError("TECHNICIAN_ASSIGNED_JOB_ONLY", 403);
    }

    const updateData = {
      status: targetStatus,
      updatedById: actor.id,
    };

    if (repairType) {
      updateData.repairType = repairType;
    }

    if (payload.diagnosis !== undefined) {
      updateData.diagnosis = payload.diagnosis || null;
    }

    if (payload.serviceNotes !== undefined) {
      updateData.serviceNotes = payload.serviceNotes || null;
    }

    const hasPricingPayload = [
      payload.baseServiceCharge,
      payload.markupPercent,
      payload.finalServiceCharge,
    ].some((value) => value !== undefined);

    if (hasPricingPayload && targetStatus !== "CANCELLED") {
      Object.assign(updateData, resolveServicePricing(serviceJob, payload));
    }

    let serviceDoneBy = null;
    const mustResolveServiceDoneBy = targetStatus === "READY_FOR_RELEASE";

    if (
      repairType &&
      targetStatus !== "CANCELLED" &&
      (mustResolveServiceDoneBy || payload.serviceDoneById)
    ) {
      serviceDoneBy = await validateServiceDoneBy(
        tx,
        actor,
        serviceJob.branchId,
        payload.serviceDoneById || serviceJob.serviceDoneById,
        repairType
      );
      updateData.serviceDoneById = serviceDoneBy.id;
    }

    if (!isSameStatusUpdate && targetStatus === "IN_PROGRESS") {
      updateData.startedAt = new Date();
    }

    if (!isSameStatusUpdate && targetStatus === "READY_FOR_RELEASE") {
      updateData.readyAt = new Date();
    }

    if (targetStatus === "CANCELLED") {
      if (!payload.cancellationReason) {
        const error = new Error("CANCELLATION_REASON_REQUIRED");
        error.statusCode = 400;
        throw error;
      }

      updateData.cancellationReason = payload.cancellationReason;
      updateData.cancelledAt = new Date();
      updateData.cancelledById = actor.id;
    }

    const updateResult = await tx.serviceJob.updateMany({
      where: {
        id: serviceJob.id,
        status: serviceJob.status,
      },
      data: updateData,
    });

    if (updateResult.count !== 1) {
      const error = new Error("INVALID_SERVICE_JOB_STATUS_TRANSITION");
      error.statusCode = 409;
      throw error;
    }

    const updatedServiceJob = await tx.serviceJob.findUnique({
      where: {
        id: serviceJob.id,
      },
      include: SERVICE_JOB_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: updatedServiceJob.branchId,
        action: "SERVICE_JOB_STATUS_UPDATED",
        entityType: "ServiceJob",
        entityId: updatedServiceJob.id,
        description: isSameStatusUpdate
          ? `Service job ${updatedServiceJob.jobCode} details updated`
          : `Service job ${updatedServiceJob.jobCode} moved from ${serviceJob.status} to ${updatedServiceJob.status}`,
        metadata: {
          jobCode: updatedServiceJob.jobCode,
          previousStatus: serviceJob.status,
          status: updatedServiceJob.status,
          repairType: updatedServiceJob.repairType,
          serviceDoneById: updatedServiceJob.serviceDoneById,
          serviceDoneByClassificationSnapshot:
            updatedServiceJob.serviceDoneByClassificationSnapshot,
          baseServiceCharge: optionalMoneyString(
            updatedServiceJob.baseServiceCharge
          ),
          markupPercent: optionalPercentString(
            updatedServiceJob.markupPercent
          ),
          finalServiceCharge: optionalMoneyString(
            updatedServiceJob.finalServiceCharge
          ),
          serviceMarkupAmount: optionalMoneyString(
            updatedServiceJob.serviceMarkupAmount
          ),
          programRuleVersionId: updatedServiceJob.programRuleVersionId,
          accountConfigVersionId: updatedServiceJob.accountConfigVersionId,
          repairCostPercentSnapshot: optionalPercentString(
            updatedServiceJob.repairCostPercentSnapshot
          ),
          companySharePercentSnapshot: optionalPercentString(
            updatedServiceJob.companySharePercentSnapshot
          ),
          repairCostPoolAmountSnapshot: optionalMoneyString(
            updatedServiceJob.repairCostPoolAmountSnapshot
          ),
          companyShareAmountSnapshot: optionalMoneyString(
            updatedServiceJob.companyShareAmountSnapshot
          ),
          repairFeeSnapshot: optionalMoneyString(
            updatedServiceJob.repairFeeSnapshot
          ),
          repairIncentiveRateSnapshot: optionalPercentString(
            updatedServiceJob.repairIncentiveRateSnapshot
          ),
          repairIncentiveAmountSnapshot: optionalMoneyString(
            updatedServiceJob.repairIncentiveAmountSnapshot
          ),
          unallocatedRepairCostPoolSnapshot: optionalMoneyString(
            updatedServiceJob.unallocatedRepairCostPoolSnapshot
          ),
          financialSnapshotAt:
            updatedServiceJob.financialSnapshotAt?.toISOString(),
          cancellationReason: updatedServiceJob.cancellationReason,
          releaseOutcome: updatedServiceJob.releaseOutcome,
          releaseNotes: updatedServiceJob.releaseNotes,
        },
      },
      tx
    );

    return formatServiceJob(updatedServiceJob, null, actor);
  });
};

const DEFAULT_SERVICE_CATALOG = [
  {
    id: "sc-clean-laptop",
    name: "Laptop Deep Cleaning & Thermal Repaste",
    deviceType: "Laptop",
    repairType: "ORDINARY_REPAIR",
    basePrice: 500,
    markupPercent: 0,
    description: "Complete disassembly, dust blower, fan lubrication, and high-performance thermal paste re-application.",
    isQuickService: true,
    isActive: true,
  },
  {
    id: "sc-format-os",
    name: "OS Reformatting & Basic Software Setup",
    deviceType: "Laptop / Desktop",
    repairType: "ORDINARY_REPAIR",
    basePrice: 450,
    markupPercent: 0,
    description: "Clean OS installation (Windows/Linux), updated drivers, essential productivity software, and system optimization.",
    isQuickService: true,
    isActive: true,
  },
  {
    id: "sc-screen-laptop",
    name: "Laptop LCD / Screen Replacement Labor",
    deviceType: "Laptop",
    repairType: "ORDINARY_REPAIR",
    basePrice: 800,
    markupPercent: 0,
    description: "Bezel and hinge inspection, LCD/eDP cable testing, and replacement screen installation.",
    isQuickService: false,
    isActive: true,
  },
  {
    id: "sc-board-power",
    name: "Motherboard Shorted Line / Power IC Repair",
    deviceType: "Laptop / Desktop",
    repairType: "BOARD_LEVEL_REPAIR",
    basePrice: 2500,
    markupPercent: 0,
    description: "Component-level micro-soldering, shorted capacitor/MOSFET tracing, power rail diagnosis, and IC replacement.",
    isQuickService: false,
    isActive: true,
  },
  {
    id: "sc-macbook-liquid",
    name: "MacBook Liquid Damage & Component Repair",
    deviceType: "MacBook",
    repairType: "BOARD_LEVEL_REPAIR",
    basePrice: 4500,
    markupPercent: 0,
    description: "Ultrasonic cleaning, corrosion removal, SMC/T2/PMIC circuit repair, and board trace restoration.",
    isQuickService: false,
    isActive: true,
  },
];

const SERVICE_CATALOG_SCOPE_KEY = "GLOBAL:service.catalog";

const getServiceCatalog = async (actor) => {
  let setting = await prisma.businessSetting.findUnique({
    where: { scopeKey: SERVICE_CATALOG_SCOPE_KEY },
  });

  if (!setting) {
    try {
      setting = await prisma.businessSetting.create({
        data: {
          scopeKey: SERVICE_CATALOG_SCOPE_KEY,
          key: "service.catalog",
          category: "OPERATION",
          valueType: "JSON",
          value: DEFAULT_SERVICE_CATALOG,
          label: "Service & Repair Rates Catalog",
          description: "Predefined list of standard service rates, repair classifications, and pricing.",
          isEditable: true,
          isActive: true,
        },
      });
    } catch {
      setting = await prisma.businessSetting.findUnique({
        where: { scopeKey: SERVICE_CATALOG_SCOPE_KEY },
      });
    }
  }

  const items = Array.isArray(setting?.value) ? setting.value : DEFAULT_SERVICE_CATALOG;
  return items;
};

const createServiceCatalogItem = async (payload, actor) => {
  if (!INTERNAL_SERVICE_FINANCIAL_ROLES.has(actor.role)) {
    throw new AppError("You are not authorized to manage the service catalog", 403);
  }

  const currentItems = await getServiceCatalog(actor);
  const newItem = {
    id: `sc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    name: payload.name.trim(),
    deviceType: payload.deviceType.trim(),
    repairType: payload.repairType,
    basePrice: Number(payload.basePrice) || 0,
    markupPercent: Number(payload.markupPercent) || 0,
    description: payload.description ? payload.description.trim() : "",
    isQuickService: Boolean(payload.isQuickService),
    isActive: payload.isActive !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const updatedItems = [newItem, ...currentItems];

  await prisma.businessSetting.upsert({
    where: { scopeKey: SERVICE_CATALOG_SCOPE_KEY },
    create: {
      scopeKey: SERVICE_CATALOG_SCOPE_KEY,
      key: "service.catalog",
      category: "OPERATION",
      valueType: "JSON",
      value: updatedItems,
      label: "Service & Repair Rates Catalog",
      description: "Predefined list of standard service rates, repair classifications, and pricing.",
      isEditable: true,
      isActive: true,
      updatedById: actor.id,
    },
    update: {
      value: updatedItems,
      updatedById: actor.id,
    },
  });

  await createAuditLog({
    action: "CREATE",
    entity: "ServiceCatalog",
    entityId: newItem.id,
    details: { name: newItem.name, repairType: newItem.repairType, basePrice: newItem.basePrice },
    actor,
    branchId: actor.branchId || null,
  });

  return newItem;
};

const updateServiceCatalogItem = async (id, payload, actor) => {
  if (!INTERNAL_SERVICE_FINANCIAL_ROLES.has(actor.role)) {
    throw new AppError("You are not authorized to manage the service catalog", 403);
  }

  const currentItems = await getServiceCatalog(actor);
  const index = currentItems.findIndex((item) => item.id === id);

  if (index === -1) {
    throw new AppError("Service catalog item not found", 404);
  }

  const existingItem = currentItems[index];
  const updatedItem = {
    ...existingItem,
    name: payload.name !== undefined ? payload.name.trim() : existingItem.name,
    deviceType: payload.deviceType !== undefined ? payload.deviceType.trim() : existingItem.deviceType,
    repairType: payload.repairType !== undefined ? payload.repairType : existingItem.repairType,
    basePrice: payload.basePrice !== undefined ? Number(payload.basePrice) : existingItem.basePrice,
    markupPercent: payload.markupPercent !== undefined ? Number(payload.markupPercent) : existingItem.markupPercent,
    description: payload.description !== undefined ? (payload.description ? payload.description.trim() : "") : existingItem.description,
    isQuickService: payload.isQuickService !== undefined ? Boolean(payload.isQuickService) : existingItem.isQuickService,
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : existingItem.isActive,
    updatedAt: new Date().toISOString(),
  };

  currentItems[index] = updatedItem;

  await prisma.businessSetting.upsert({
    where: { scopeKey: SERVICE_CATALOG_SCOPE_KEY },
    create: {
      scopeKey: SERVICE_CATALOG_SCOPE_KEY,
      key: "service.catalog",
      category: "OPERATION",
      valueType: "JSON",
      value: currentItems,
      label: "Service & Repair Rates Catalog",
      description: "Predefined list of standard service rates, repair classifications, and pricing.",
      isEditable: true,
      isActive: true,
      updatedById: actor.id,
    },
    update: {
      value: currentItems,
      updatedById: actor.id,
    },
  });

  await createAuditLog({
    action: "UPDATE",
    entity: "ServiceCatalog",
    entityId: id,
    details: { changes: payload },
    actor,
    branchId: actor.branchId || null,
  });

  return updatedItem;
};

const deleteServiceCatalogItem = async (id, actor) => {
  if (!INTERNAL_SERVICE_FINANCIAL_ROLES.has(actor.role)) {
    throw new AppError("You are not authorized to manage the service catalog", 403);
  }

  const currentItems = await getServiceCatalog(actor);
  const filteredItems = currentItems.filter((item) => item.id !== id);

  if (filteredItems.length === currentItems.length) {
    throw new AppError("Service catalog item not found", 404);
  }

  await prisma.businessSetting.upsert({
    where: { scopeKey: SERVICE_CATALOG_SCOPE_KEY },
    create: {
      scopeKey: SERVICE_CATALOG_SCOPE_KEY,
      key: "service.catalog",
      category: "OPERATION",
      valueType: "JSON",
      value: filteredItems,
      label: "Service & Repair Rates Catalog",
      description: "Predefined list of standard service rates, repair classifications, and pricing.",
      isEditable: true,
      isActive: true,
      updatedById: actor.id,
    },
    update: {
      value: filteredItems,
      updatedById: actor.id,
    },
  });

  await createAuditLog({
    action: "DELETE",
    entity: "ServiceCatalog",
    entityId: id,
    details: { deletedId: id },
    actor,
    branchId: actor.branchId || null,
  });

  return { success: true, message: "Service catalog item deleted successfully" };
};

module.exports = {
  cancelServicePayment,
  createServiceCatalogItem,
  createServiceJob,
  createServicePayment,
  deleteServiceCatalogItem,
  getServiceCatalog,
  getServiceJobs,
  getServiceTechnicians,
  getServiceJobById,
  releaseServiceJob,
  updateServiceCatalogItem,
  updateServiceJobAssignment,
  updateServiceJobStatus,
  testInternals: Object.freeze({
    calculateRepairFinancialAmounts,
    calculateServicePricing,
    calculateServiceSettlementSnapshot,
    ensureTechnicianCanActForRepairType,
    formatServiceJob,
    resolveServicePricing,
  }),
};
