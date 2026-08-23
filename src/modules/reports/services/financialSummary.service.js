const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { businessDateText } = require("../../../utils/businessDate");
const {
  BUSINESS_TIME_ZONE,
  buildFinancialSummary,
} = require("./financialSummaryMath.service");

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MANILA_UTC_OFFSET = "+08:00";

const isSuperOwner = (actor) => actor?.role === "SUPER_OWNER";

const resolveBranchFilter = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) return requestedBranchId || undefined;

  if (!actor?.branchId) {
    throw new AppError(
      "User is not assigned to a branch",
      400,
      "USER_BRANCH_REQUIRED"
    );
  }

  if (requestedBranchId && requestedBranchId !== actor.branchId) {
    throw new AppError(
      "You can only view reports for your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return actor.branchId;
};

const assertBusinessDate = (value, fieldName) => {
  if (!BUSINESS_DATE_PATTERN.test(String(value || ""))) {
    throw new AppError(
      `${fieldName} must use YYYY-MM-DD format`,
      400,
      `INVALID_${fieldName.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`
    );
  }

  const [year, month, day] = String(value).split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new AppError(
      `${fieldName} is not a valid calendar date`,
      400,
      `INVALID_${fieldName.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`
    );
  }
};

const nextCalendarDate = (dateText) => {
  const [year, month, day] = dateText.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

const manilaStartOfDay = (dateText) =>
  new Date(`${dateText}T00:00:00.000${MANILA_UTC_OFFSET}`);

const parseManilaDateRange = (query = {}, now = new Date()) => {
  const today = businessDateText(now);
  if (query.dateFrom) assertBusinessDate(query.dateFrom, "dateFrom");
  if (query.dateTo) assertBusinessDate(query.dateTo, "dateTo");

  if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
    throw new AppError(
      "dateFrom cannot be later than dateTo",
      400,
      "INVALID_DATE_RANGE"
    );
  }

  const endDateInclusiveText = query.dateTo || today;
  const startInclusive = query.dateFrom
    ? manilaStartOfDay(query.dateFrom)
    : null;
  const endExclusive = manilaStartOfDay(nextCalendarDate(endDateInclusiveText));

  if (startInclusive && startInclusive >= endExclusive) {
    throw new AppError(
      "The requested financial report period is empty",
      400,
      "INVALID_DATE_RANGE"
    );
  }

  return {
    startInclusive,
    endExclusive,
    dateFrom: query.dateFrom || null,
    dateTo: endDateInclusiveText,
    timeZone: BUSINESS_TIME_ZONE,
  };
};

const parsePagination = (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
  return { page, limit };
};

const periodFilter = (bounds) => ({
  ...(bounds.startInclusive ? { gte: bounds.startInclusive } : {}),
  lt: bounds.endExclusive,
});

const BRANCH_SELECT = {
  id: true,
  code: true,
  name: true,
};

const loadFinancialInputs = async (database, branchId, bounds) => {
  const eventPeriod = periodFilter(bounds);
  const branchWhere = branchId ? { branchId } : {};

  return Promise.all([
    database.sale.findMany({
      where: {
        ...branchWhere,
        OR: [
          { saleDate: eventPeriod },
          { cancelledAt: eventPeriod },
          { payments: { some: { paidAt: eventPeriod } } },
          {
            returnRequests: {
              some: { status: "COMPLETED", completedAt: eventPeriod },
            },
          },
        ],
      },
      select: {
        id: true,
        receiptCode: true,
        status: true,
        saleDate: true,
        cancelledAt: true,
        subtotal: true,
        totalDiscount: true,
        serviceCharge: true,
        grandTotal: true,
        amountPaid: true,
        changeAmount: true,
        quotationId: true,
        quotation: {
          select: {
            id: true,
            quotationCode: true,
          },
        },
        branch: { select: BRANCH_SELECT },
        items: {
          orderBy: { lineNo: "asc" },
          select: {
            id: true,
            lineNo: true,
            description: true,
            itemId: true,
            priceTier: true,
            quantity: true,
            baseUnitPriceSnapshot: true,
            markupPercent: true,
            unitPrice: true,
            discountAmount: true,
            lineTotal: true,
            operationalUnitCostSnapshot: true,
            acquisitionUnitCostSnapshot: true,
          },
        },
        payments: {
          orderBy: [{ paidAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            paymentMethod: true,
            amount: true,
            referenceNo: true,
            paidAt: true,
          },
        },
        returnRequests: {
          where: { status: "COMPLETED" },
          orderBy: [{ completedAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            returnCode: true,
            status: true,
            refundMethod: true,
            totalRefundAmount: true,
            completedAt: true,
            items: {
              select: {
                id: true,
                saleItemId: true,
                quantity: true,
                lineRefundAmount: true,
              },
            },
          },
        },
      },
    }),
    database.serviceJob.findMany({
      where: {
        ...branchWhere,
        OR: [
          { financialSnapshotAt: eventPeriod },
          { releasedAt: eventPeriod },
          { completedAt: eventPeriod },
          { payments: { some: { paidAt: eventPeriod } } },
          { payments: { some: { cancelledAt: eventPeriod } } },
        ],
      },
      select: {
        id: true,
        jobCode: true,
        status: true,
        repairType: true,
        releaseOutcome: true,
        releasedAt: true,
        completedAt: true,
        financialSnapshotAt: true,
        baseServiceCharge: true,
        markupPercent: true,
        finalServiceCharge: true,
        serviceMarkupAmount: true,
        repairCostPercentSnapshot: true,
        companySharePercentSnapshot: true,
        repairCostPoolAmountSnapshot: true,
        companyShareAmountSnapshot: true,
        repairFeeSnapshot: true,
        repairIncentiveRateSnapshot: true,
        repairIncentiveAmountSnapshot: true,
        unallocatedRepairCostPoolSnapshot: true,
        branch: { select: BRANCH_SELECT },
        serviceDoneBy: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            incentiveClassification: true,
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
            paidAt: true,
            cancelledAt: true,
          },
        },
      },
    }),
    database.creditAccount.findMany({
      where: {
        ...branchWhere,
        createdAt: { lt: bounds.endExclusive },
      },
      select: {
        id: true,
        creditCode: true,
        status: true,
        sourceType: true,
        provider: true,
        sourceTotalAmountSnapshot: true,
        providerReferenceNo: true,
        balanceAmount: true,
        downpaymentAmount: true,
        totalCollected: true,
        remainingBalance: true,
        paidAt: true,
        cancelledAt: true,
        saleId: true,
        serviceJobId: true,
        createdAt: true,
        branch: { select: BRANCH_SELECT },
        collections: {
          orderBy: [{ paidAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            collectionCode: true,
            status: true,
            amount: true,
            previousBalance: true,
            newBalance: true,
            paymentMethod: true,
            referenceNo: true,
            paidAt: true,
            cancelledAt: true,
          },
        },
      },
    }),
  ]);
};

const getFinancialSummary = async (
  actor,
  query = {},
  database = prisma,
  now = new Date()
) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const bounds = parseManilaDateRange(query, now);
  const { page, limit } = parsePagination(query);
  const [sales, serviceJobs, creditAccounts] = await loadFinancialInputs(
    database,
    branchId,
    bounds
  );
  const result = buildFinancialSummary({ sales, serviceJobs, creditAccounts, bounds });
  const totalItems = result.events.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;
  const skip = (page - 1) * limit;

  return {
    report: {
      name: "Unified Financial Summary",
      generatedAt: now,
      timeZone: BUSINESS_TIME_ZONE,
      period: {
        dateFrom: bounds.dateFrom,
        dateTo: bounds.dateTo,
        startInclusive: bounds.startInclusive,
        endExclusive: bounds.endExclusive,
      },
      filters: {
        branchId: branchId || null,
        dateFrom: bounds.dateFrom,
        dateTo: bounds.dateTo,
      },
      sections: result.sections,
    },
    records: result.events.slice(skip, skip + limit),
    meta: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

module.exports = {
  getFinancialSummary,
  loadFinancialInputs,
  parseManilaDateRange,
  resolveBranchFilter,
};
