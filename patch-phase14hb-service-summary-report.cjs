const fs = require("fs");
const path = require("path");

const root = process.cwd();

const validationPath = path.join(root, "src/modules/reports/validations/report.validation.js");
const servicePath = path.join(root, "src/modules/reports/services/report.service.js");
const controllerPath = path.join(root, "src/modules/reports/controllers/report.controller.js");
const routePath = path.join(root, "src/modules/reports/routes/report.routes.js");

let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("const serviceSummarySchema")) {
  const insertAfter = `const salesSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(["COMPLETED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
    paymentStatus: z.enum(["PAID", "PARTIALLY_PAID", "UNPAID", "REFUNDED"]).optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`;

  const serviceSchema = `${insertAfter}

const serviceSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(["PENDING", "IN_PROGRESS", "READY_FOR_RELEASE", "COMPLETED", "CANCELLED"]).optional(),
    paymentMethod: z.enum(["CASH", "GCASH", "BANK_TRANSFER", "CARD", "OTHER"]).optional(),
    assignedTechnicianId: z.string().trim().min(1, "Assigned technician ID cannot be empty").optional(),
    customerId: z.string().trim().min(1, "Customer ID cannot be empty").optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`;

  if (!validation.includes(insertAfter)) {
    throw new Error("salesSummarySchema block not found. Patch stopped.");
  }

  validation = validation.replace(insertAfter, serviceSchema);
}

if (!validation.includes("serviceSummarySchema,")) {
  validation = validation.replace(
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
};`,
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
};`
  );
}

fs.writeFileSync(validationPath, validation);

let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const buildServiceSummaryRecord =")) {
  const serviceSummaryCode = `
const buildServiceSummaryRecord = (job) => {
  const paymentAmount = job.payment ? toNumber(job.payment.amount) : 0;

  return {
    id: job.id,
    jobCode: job.jobCode,
    status: job.status,
    jobTitle: job.jobTitle,
    receivedAt: job.receivedAt,
    startedAt: job.startedAt,
    readyAt: job.readyAt,
    completedAt: job.completedAt,
    cancelledAt: job.cancelledAt,
    branch: job.branch,
    customer: job.customer,
    assignedTechnician: job.assignedTechnician,
    estimatedServiceCharge: toNumber(job.estimatedServiceCharge),
    finalServiceCharge: toNumber(job.finalServiceCharge),
    isPaid: Boolean(job.payment),
    payment: job.payment
      ? {
          id: job.payment.id,
          paymentCode: job.payment.paymentCode,
          paymentMethod: job.payment.paymentMethod,
          status: job.payment.status,
          amount: paymentAmount,
          paidAt: job.payment.paidAt,
        }
      : null,
  };
};

const getServiceSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const receivedAt = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.assignedTechnicianId
      ? { assignedTechnicianId: query.assignedTechnicianId }
      : {}),
    ...(receivedAt ? { receivedAt } : {}),
    ...(query.paymentMethod
      ? {
          payment: {
            paymentMethod: query.paymentMethod,
          },
        }
      : {}),
  };

  const allJobs = await prisma.serviceJob.findMany({
    where,
    orderBy: [
      {
        receivedAt: "desc",
      },
      {
        jobCode: "desc",
      },
    ],
    select: {
      id: true,
      jobCode: true,
      status: true,
      jobTitle: true,
      estimatedServiceCharge: true,
      finalServiceCharge: true,
      receivedAt: true,
      startedAt: true,
      readyAt: true,
      completedAt: true,
      cancelledAt: true,
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
      assignedTechnician: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      payment: {
        select: {
          id: true,
          paymentCode: true,
          paymentMethod: true,
          status: true,
          amount: true,
          paidAt: true,
        },
      },
    },
  });

  const records = allJobs.map(buildServiceSummaryRecord);

  const totals = records.reduce(
    (acc, job) => {
      acc.totalJobs += 1;
      acc.totalEstimatedServiceCharge += job.estimatedServiceCharge;
      acc.totalFinalServiceCharge += job.finalServiceCharge;

      if (job.isPaid) {
        acc.totalPaidJobs += 1;
        acc.totalPaidAmount += job.payment.amount;
        acc.paymentMethodTotals[job.payment.paymentMethod] =
          (acc.paymentMethodTotals[job.payment.paymentMethod] || 0) +
          job.payment.amount;
      } else {
        acc.totalUnpaidJobs += 1;
      }

      acc.statusCounts[job.status] = (acc.statusCounts[job.status] || 0) + 1;

      return acc;
    },
    {
      totalJobs: 0,
      totalEstimatedServiceCharge: 0,
      totalFinalServiceCharge: 0,
      totalPaidJobs: 0,
      totalUnpaidJobs: 0,
      totalPaidAmount: 0,
      statusCounts: {},
      paymentMethodTotals: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Service Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        status: query.status || null,
        paymentMethod: query.paymentMethod || null,
        assignedTechnicianId: query.assignedTechnicianId || null,
        customerId: query.customerId || null,
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
};`;

  if (!service.includes(marker)) {
    throw new Error("Current module.exports block not found. Patch stopped.");
  }

  service = service.replace(
    marker,
    `${serviceSummaryCode}
module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
};`
  );
}

fs.writeFileSync(servicePath, service);

let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("const getServiceSummary =")) {
  const marker = `const getSalesSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getSalesSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Sales summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`;

  const addition = `${marker}

const getServiceSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getServiceSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Service summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`;

  if (!controller.includes(marker)) {
    throw new Error("getSalesSummary controller block not found. Patch stopped.");
  }

  controller = controller.replace(marker, addition);
}

if (!controller.includes("getServiceSummary,")) {
  controller = controller.replace(
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
};`,
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
};`
  );
}

fs.writeFileSync(controllerPath, controller);

let routes = fs.readFileSync(routePath, "utf8");

if (!routes.includes("serviceSummarySchema")) {
  routes = routes.replace(
    `const {
  inventorySummarySchema,
  salesSummarySchema,
} = require("../validations/report.validation");`,
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
} = require("../validations/report.validation");`
  );
}

if (!routes.includes('"/service-summary"')) {
  const marker = `router.get(
  "/sales-summary",
  validate(salesSummarySchema),
  reportController.getSalesSummary
);`;

  const addition = `${marker}

router.get(
  "/service-summary",
  validate(serviceSummarySchema),
  reportController.getServiceSummary
);`;

  if (!routes.includes(marker)) {
    throw new Error("sales-summary route block not found. Patch stopped.");
  }

  routes = routes.replace(marker, addition);
}

fs.writeFileSync(routePath, routes);

console.log("DONE: Phase 14H-B service summary report patched.");
