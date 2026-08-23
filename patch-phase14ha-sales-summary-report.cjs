const fs = require("fs");
const path = require("path");

const root = process.cwd();

const validationPath = path.join(root, "src/modules/reports/validations/report.validation.js");
const servicePath = path.join(root, "src/modules/reports/services/report.service.js");
const controllerPath = path.join(root, "src/modules/reports/controllers/report.controller.js");
const routePath = path.join(root, "src/modules/reports/routes/report.routes.js");

let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("const salesSummarySchema")) {
  validation = validation.replace(
    `const inventorySummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    categoryId: z.string().trim().min(1, "Category ID cannot be empty").optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
    search: z.string().trim().optional(),
    lowStockOnly: z.enum(["true", "false"]).optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`,
    `const inventorySummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    categoryId: z.string().trim().min(1, "Category ID cannot be empty").optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
    search: z.string().trim().optional(),
    lowStockOnly: z.enum(["true", "false"]).optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

const salesSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(["COMPLETED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
    paymentStatus: z.enum(["PAID", "PARTIALLY_PAID", "UNPAID", "REFUNDED"]).optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`
  );
}

if (!validation.includes("salesSummarySchema,")) {
  validation = validation.replace(
    `module.exports = {
  inventorySummarySchema,
};`,
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
};`
  );
}

fs.writeFileSync(validationPath, validation);

let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const parseDateRange =")) {
  service = service.replace(
    `const parseBoolean = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "true" || value === true) {
    return true;
  }

  if (value === "false" || value === false) {
    return false;
  }

  throw new AppError(
    "Invalid boolean filter. Use true or false.",
    400,
    "INVALID_BOOLEAN_FILTER"
  );
};`,
    `const parseBoolean = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "true" || value === true) {
    return true;
  }

  if (value === "false" || value === false) {
    return false;
  }

  throw new AppError(
    "Invalid boolean filter. Use true or false.",
    400,
    "INVALID_BOOLEAN_FILTER"
  );
};

const parseDateRange = (query = {}) => {
  const dateFilter = {};

  if (query.dateFrom) {
    const dateFrom = new Date(query.dateFrom);

    if (Number.isNaN(dateFrom.getTime())) {
      throw new AppError("Invalid dateFrom value", 400, "INVALID_DATE_FROM");
    }

    dateFrom.setHours(0, 0, 0, 0);
    dateFilter.gte = dateFrom;
  }

  if (query.dateTo) {
    const dateTo = new Date(query.dateTo);

    if (Number.isNaN(dateTo.getTime())) {
      throw new AppError("Invalid dateTo value", 400, "INVALID_DATE_TO");
    }

    dateTo.setHours(23, 59, 59, 999);
    dateFilter.lte = dateTo;
  }

  return Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
};

const toNumber = (value) => Number(value || 0);`
  );
}

if (!service.includes("const getSalesSummary =")) {
  service = service.replace(
    `module.exports = {
  getInventorySummary,
};`,
    `const buildSalesSummaryRecord = (sale) => {
  return {
    id: sale.id,
    receiptCode: sale.receiptCode,
    status: sale.status,
    paymentStatus: sale.paymentStatus,
    saleDate: sale.saleDate,
    branch: sale.branch,
    customer: sale.customer,
    cashier: sale.cashier,
    subtotal: toNumber(sale.subtotal),
    totalDiscount: toNumber(sale.totalDiscount),
    serviceCharge: toNumber(sale.serviceCharge),
    grandTotal: toNumber(sale.grandTotal),
    amountPaid: toNumber(sale.amountPaid),
    changeAmount: toNumber(sale.changeAmount),
    itemCount: sale.items.length,
    paymentCount: sale.payments.length,
    paymentMethods: sale.payments.reduce((acc, payment) => {
      acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + toNumber(payment.amount);
      return acc;
    }, {}),
  };
};

const getSalesSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const saleDate = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(saleDate ? { saleDate } : {}),
  };

  const allSales = await prisma.sale.findMany({
    where,
    orderBy: [
      {
        saleDate: "desc",
      },
      {
        receiptCode: "desc",
      },
    ],
    select: {
      id: true,
      receiptCode: true,
      status: true,
      paymentStatus: true,
      saleDate: true,
      subtotal: true,
      totalDiscount: true,
      serviceCharge: true,
      grandTotal: true,
      amountPaid: true,
      changeAmount: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
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
      cashier: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      items: {
        select: {
          id: true,
        },
      },
      payments: {
        select: {
          id: true,
          paymentMethod: true,
          amount: true,
        },
      },
    },
  });

  const records = allSales.map(buildSalesSummaryRecord);

  const totals = records.reduce(
    (acc, sale) => {
      acc.totalSales += 1;
      acc.totalSubtotal += sale.subtotal;
      acc.totalDiscount += sale.totalDiscount;
      acc.totalServiceCharge += sale.serviceCharge;
      acc.totalGrandTotal += sale.grandTotal;
      acc.totalAmountPaid += sale.amountPaid;
      acc.totalChangeAmount += sale.changeAmount;
      acc.totalItems += sale.itemCount;

      acc.statusCounts[sale.status] = (acc.statusCounts[sale.status] || 0) + 1;
      acc.paymentStatusCounts[sale.paymentStatus] =
        (acc.paymentStatusCounts[sale.paymentStatus] || 0) + 1;

      for (const [method, amount] of Object.entries(sale.paymentMethods)) {
        acc.paymentMethodTotals[method] =
          (acc.paymentMethodTotals[method] || 0) + amount;
      }

      return acc;
    },
    {
      totalSales: 0,
      totalSubtotal: 0,
      totalDiscount: 0,
      totalServiceCharge: 0,
      totalGrandTotal: 0,
      totalAmountPaid: 0,
      totalChangeAmount: 0,
      totalItems: 0,
      statusCounts: {},
      paymentStatusCounts: {},
      paymentMethodTotals: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Sales Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        status: query.status || null,
        paymentStatus: query.paymentStatus || null,
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

module.exports = {
  getInventorySummary,
  getSalesSummary,
};`
  );
}

fs.writeFileSync(servicePath, service);

let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("const getSalesSummary =")) {
  controller = controller.replace(
    `const getInventorySummary = asyncHandler(async (req, res) => {
  const result = await reportService.getInventorySummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Inventory summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`,
    `const getInventorySummary = asyncHandler(async (req, res) => {
  const result = await reportService.getInventorySummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Inventory summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});

const getSalesSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getSalesSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Sales summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`
  );
}

if (!controller.includes("getSalesSummary,")) {
  controller = controller.replace(
    `module.exports = {
  getInventorySummary,
};`,
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
};`
  );
}

fs.writeFileSync(controllerPath, controller);

let routes = fs.readFileSync(routePath, "utf8");

if (!routes.includes("salesSummarySchema")) {
  routes = routes.replace(
    `const { inventorySummarySchema } = require("../validations/report.validation");`,
    `const {
  inventorySummarySchema,
  salesSummarySchema,
} = require("../validations/report.validation");`
  );
}

if (!routes.includes('"/sales-summary"')) {
  routes = routes.replace(
    `router.get(
  "/inventory-summary",
  validate(inventorySummarySchema),
  reportController.getInventorySummary
);`,
    `router.get(
  "/inventory-summary",
  validate(inventorySummarySchema),
  reportController.getInventorySummary
);

router.get(
  "/sales-summary",
  validate(salesSummarySchema),
  reportController.getSalesSummary
);`
  );
}

fs.writeFileSync(routePath, routes);

console.log("DONE: Phase 14H-A sales summary report patched.");
