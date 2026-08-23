const fs = require("fs");
const path = require("path");

const root = process.cwd();

const validationPath = path.join(root, "src/modules/reports/validations/report.validation.js");
const servicePath = path.join(root, "src/modules/reports/services/report.service.js");
const controllerPath = path.join(root, "src/modules/reports/controllers/report.controller.js");
const routePath = path.join(root, "src/modules/reports/routes/report.routes.js");

let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("const cashSummarySchema")) {
  const marker = `const warrantySummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(["IN", "CHECKING", "SENT_TO_SUPPLIER", "APPROVED", "REJECTED", "REPAIRED", "REPLACED", "OUT"]).optional(),
    customerId: z.string().trim().min(1, "Customer ID cannot be empty").optional(),
    itemId: z.string().trim().min(1, "Item ID cannot be empty").optional(),
    serialId: z.string().trim().min(1, "Serial ID cannot be empty").optional(),
    supplierName: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`;

  const addition = `${marker}

const cashSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    cashBoxId: z.string().trim().min(1, "Cash box ID cannot be empty").optional(),
    type: z.enum(["CASH_IN", "CASH_OUT", "SALE_PAYMENT", "CREDIT_COLLECTION", "HANDOVER_OUT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "SERVICE_PAYMENT"]).optional(),
    status: z.enum(["POSTED", "CANCELLED"]).optional(),
    source: z.enum(["MANUAL", "SALE", "CREDIT_COLLECTION", "SYSTEM_ADJUSTMENT", "SERVICE_JOB"]).optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`;

  if (!validation.includes(marker)) {
    throw new Error("warrantySummarySchema block not found. Patch stopped.");
  }

  validation = validation.replace(marker, addition);
}

if (!validation.includes("cashSummarySchema,")) {
  validation = validation.replace(
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
};`,
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
};`
  );
}

fs.writeFileSync(validationPath, validation);

let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const buildCashSummaryRecord =")) {
  const cashSummaryCode = `
const CASH_IN_TYPES = new Set([
  "CASH_IN",
  "SALE_PAYMENT",
  "CREDIT_COLLECTION",
  "ADJUSTMENT_IN",
  "SERVICE_PAYMENT",
]);

const CASH_OUT_TYPES = new Set([
  "CASH_OUT",
  "HANDOVER_OUT",
  "ADJUSTMENT_OUT",
]);

const buildCashSummaryRecord = (transaction) => {
  return {
    id: transaction.id,
    transactionCode: transaction.transactionCode,
    type: transaction.type,
    status: transaction.status,
    source: transaction.source,
    amount: toNumber(transaction.amount),
    balanceBefore: toNumber(transaction.balanceBefore),
    balanceAfter: toNumber(transaction.balanceAfter),
    description: transaction.description,
    referenceNo: transaction.referenceNo,
    sourceId: transaction.sourceId,
    sourceCode: transaction.sourceCode,
    transactionDate: transaction.transactionDate,
    cancelledAt: transaction.cancelledAt,
    cancellationReason: transaction.cancellationReason,
    cashBox: transaction.cashBox,
    branch: transaction.branch,
    createdBy: transaction.createdBy,
    cancelledBy: transaction.cancelledBy,
  };
};

const getCashSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const transactionDate = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.cashBoxId ? { cashBoxId: query.cashBoxId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(transactionDate ? { transactionDate } : {}),
  };

  const allTransactions = await prisma.cashTransaction.findMany({
    where,
    orderBy: [
      {
        transactionDate: "desc",
      },
      {
        transactionCode: "desc",
      },
    ],
    select: {
      id: true,
      transactionCode: true,
      type: true,
      status: true,
      source: true,
      amount: true,
      balanceBefore: true,
      balanceAfter: true,
      description: true,
      referenceNo: true,
      sourceId: true,
      sourceCode: true,
      transactionDate: true,
      cancelledAt: true,
      cancellationReason: true,
      cashBox: {
        select: {
          id: true,
          boxCode: true,
          name: true,
          status: true,
          currentBalance: true,
        },
      },
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
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
    },
  });

  const records = allTransactions.map(buildCashSummaryRecord);

  const totals = records.reduce(
    (acc, transaction) => {
      acc.totalTransactions += 1;
      acc.totalAmount += transaction.amount;

      if (transaction.status === "POSTED") {
        acc.totalPosted += 1;
        acc.totalPostedAmount += transaction.amount;

        if (CASH_IN_TYPES.has(transaction.type)) {
          acc.totalCashIn += transaction.amount;
        }

        if (CASH_OUT_TYPES.has(transaction.type)) {
          acc.totalCashOut += transaction.amount;
        }
      }

      if (transaction.status === "CANCELLED") {
        acc.totalCancelled += 1;
        acc.totalCancelledAmount += transaction.amount;
      }

      acc.typeTotals[transaction.type] =
        (acc.typeTotals[transaction.type] || 0) + transaction.amount;

      acc.statusCounts[transaction.status] =
        (acc.statusCounts[transaction.status] || 0) + 1;

      acc.sourceCounts[transaction.source] =
        (acc.sourceCounts[transaction.source] || 0) + 1;

      return acc;
    },
    {
      totalTransactions: 0,
      totalAmount: 0,
      totalPosted: 0,
      totalPostedAmount: 0,
      totalCancelled: 0,
      totalCancelledAmount: 0,
      totalCashIn: 0,
      totalCashOut: 0,
      netCashMovement: 0,
      typeTotals: {},
      statusCounts: {},
      sourceCounts: {},
    }
  );

  totals.netCashMovement = totals.totalCashIn - totals.totalCashOut;

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Cash Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        cashBoxId: query.cashBoxId || null,
        type: query.type || null,
        status: query.status || null,
        source: query.source || null,
        dateFrom: query.dateFrom || null,
        dateTo: query.dateTo || null,
      },
      totals,
    },
    records: paginatedRecords,
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
`;

  const marker = `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
};`;

  if (!service.includes(marker)) {
    throw new Error("Current module.exports block not found. Patch stopped.");
  }

  service = service.replace(
    marker,
    `${cashSummaryCode}
module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
};`
  );
}

fs.writeFileSync(servicePath, service);

let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("const getCashSummary =")) {
  const marker = `const getWarrantySummary = asyncHandler(async (req, res) => {
  const result = await reportService.getWarrantySummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Warranty summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`;

  const addition = `${marker}

const getCashSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getCashSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Cash summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`;

  if (!controller.includes(marker)) {
    throw new Error("getWarrantySummary controller block not found. Patch stopped.");
  }

  controller = controller.replace(marker, addition);
}

if (!controller.includes("getCashSummary,")) {
  controller = controller.replace(
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
};`,
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
};`
  );
}

fs.writeFileSync(controllerPath, controller);

let routes = fs.readFileSync(routePath, "utf8");

if (!routes.includes("cashSummarySchema")) {
  routes = routes.replace(
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
} = require("../validations/report.validation");`,
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
} = require("../validations/report.validation");`
  );
}

if (!routes.includes('"/cash-summary"')) {
  const marker = `router.get(
  "/warranty-summary",
  validate(warrantySummarySchema),
  reportController.getWarrantySummary
);`;

  const addition = `${marker}

router.get(
  "/cash-summary",
  validate(cashSummarySchema),
  reportController.getCashSummary
);`;

  if (!routes.includes(marker)) {
    throw new Error("warranty-summary route block not found. Patch stopped.");
  }

  routes = routes.replace(marker, addition);
}

fs.writeFileSync(routePath, routes);

console.log("DONE: Phase 14H-D cash summary report patched.");
