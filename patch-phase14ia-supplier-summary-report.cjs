const fs = require("fs");
const path = require("path");

const root = process.cwd();

const validationPath = path.join(root, "src/modules/reports/validations/report.validation.js");
const servicePath = path.join(root, "src/modules/reports/services/report.service.js");
const controllerPath = path.join(root, "src/modules/reports/controllers/report.controller.js");
const routePath = path.join(root, "src/modules/reports/routes/report.routes.js");

let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("const supplierSummarySchema")) {
  const marker = `const cashSummarySchema = z.object({
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

  const addition = `${marker}

const supplierSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    search: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`;

  if (!validation.includes(marker)) {
    throw new Error("cashSummarySchema block not found. Patch stopped.");
  }

  validation = validation.replace(marker, addition);
}

if (!validation.includes("supplierSummarySchema,")) {
  validation = validation.replace(
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
};`,
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
};`
  );
}

fs.writeFileSync(validationPath, validation);

let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const buildSupplierSummaryRecord =")) {
  const supplierSummaryCode = `
const buildSupplierSummaryRecord = (supplier) => {
  const purchaseOrderTotals = supplier.purchaseOrders.reduce(
    (acc, order) => {
      acc.totalPurchaseOrders += 1;
      acc.totalPoSubtotal += toNumber(order.subtotal);
      acc.totalPoDiscount += toNumber(order.totalDiscount);
      acc.totalPoGrandTotal += toNumber(order.grandTotal);
      acc.poStatusCounts[order.status] = (acc.poStatusCounts[order.status] || 0) + 1;
      return acc;
    },
    {
      totalPurchaseOrders: 0,
      totalPoSubtotal: 0,
      totalPoDiscount: 0,
      totalPoGrandTotal: 0,
      poStatusCounts: {},
    }
  );

  const receivingTotals = supplier.purchaseReceivings.reduce(
    (acc, receiving) => {
      acc.totalReceivings += 1;
      acc.totalReceivingSubtotal += toNumber(receiving.subtotal);
      acc.totalReceivingDiscount += toNumber(receiving.totalDiscount);
      acc.totalReceivingGrandTotal += toNumber(receiving.grandTotal);
      acc.receivingStatusCounts[receiving.status] =
        (acc.receivingStatusCounts[receiving.status] || 0) + 1;
      return acc;
    },
    {
      totalReceivings: 0,
      totalReceivingSubtotal: 0,
      totalReceivingDiscount: 0,
      totalReceivingGrandTotal: 0,
      receivingStatusCounts: {},
    }
  );

  return {
    id: supplier.id,
    supplierCode: supplier.supplierCode,
    name: supplier.name,
    contactPerson: supplier.contactPerson,
    contactNo: supplier.contactNo,
    email: supplier.email,
    address: supplier.address,
    tin: supplier.tin,
    notes: supplier.notes,
    status: supplier.status,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
    branch: supplier.branch,
    createdBy: supplier.createdBy,
    updatedBy: supplier.updatedBy,
    ...purchaseOrderTotals,
    ...receivingTotals,
  };
};

const getSupplierSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const createdAt = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(query.search
      ? {
          OR: [
            {
              supplierCode: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              name: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              contactPerson: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              contactNo: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const allSuppliers = await prisma.supplier.findMany({
    where,
    orderBy: [
      {
        name: "asc",
      },
      {
        supplierCode: "asc",
      },
    ],
    select: {
      id: true,
      supplierCode: true,
      name: true,
      contactPerson: true,
      contactNo: true,
      email: true,
      address: true,
      tin: true,
      notes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
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
      updatedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      purchaseOrders: {
        select: {
          id: true,
          poCode: true,
          status: true,
          subtotal: true,
          totalDiscount: true,
          grandTotal: true,
          orderDate: true,
        },
      },
      purchaseReceivings: {
        select: {
          id: true,
          receivingCode: true,
          status: true,
          subtotal: true,
          totalDiscount: true,
          grandTotal: true,
          receivingDate: true,
        },
      },
    },
  });

  const records = allSuppliers.map(buildSupplierSummaryRecord);

  const totals = records.reduce(
    (acc, supplier) => {
      acc.totalSuppliers += 1;

      acc.statusCounts[supplier.status] =
        (acc.statusCounts[supplier.status] || 0) + 1;

      acc.totalPurchaseOrders += supplier.totalPurchaseOrders;
      acc.totalPoGrandTotal += supplier.totalPoGrandTotal;
      acc.totalReceivings += supplier.totalReceivings;
      acc.totalReceivingGrandTotal += supplier.totalReceivingGrandTotal;

      for (const [status, count] of Object.entries(supplier.poStatusCounts)) {
        acc.poStatusCounts[status] = (acc.poStatusCounts[status] || 0) + count;
      }

      for (const [status, count] of Object.entries(supplier.receivingStatusCounts)) {
        acc.receivingStatusCounts[status] =
          (acc.receivingStatusCounts[status] || 0) + count;
      }

      return acc;
    },
    {
      totalSuppliers: 0,
      statusCounts: {},
      totalPurchaseOrders: 0,
      totalPoGrandTotal: 0,
      totalReceivings: 0,
      totalReceivingGrandTotal: 0,
      poStatusCounts: {},
      receivingStatusCounts: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Supplier Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        status: query.status || null,
        search: query.search || null,
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
  getCashSummary,
};`;

  if (!service.includes(marker)) {
    throw new Error("Current module.exports block not found. Patch stopped.");
  }

  service = service.replace(
    marker,
    `${supplierSummaryCode}
module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
};`
  );
}

fs.writeFileSync(servicePath, service);

let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("const getSupplierSummary =")) {
  const marker = `const getCashSummary = asyncHandler(async (req, res) => {
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

  const addition = `${marker}

const getSupplierSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getSupplierSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Supplier summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`;

  if (!controller.includes(marker)) {
    throw new Error("getCashSummary controller block not found. Patch stopped.");
  }

  controller = controller.replace(marker, addition);
}

if (!controller.includes("getSupplierSummary,")) {
  controller = controller.replace(
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
};`,
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
};`
  );
}

fs.writeFileSync(controllerPath, controller);

let routes = fs.readFileSync(routePath, "utf8");

if (!routes.includes("supplierSummarySchema")) {
  routes = routes.replace(
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
} = require("../validations/report.validation");`,
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
} = require("../validations/report.validation");`
  );
}

if (!routes.includes('"/supplier-summary"')) {
  const marker = `router.get(
  "/cash-summary",
  validate(cashSummarySchema),
  reportController.getCashSummary
);`;

  const addition = `${marker}

router.get(
  "/supplier-summary",
  validate(supplierSummarySchema),
  reportController.getSupplierSummary
);`;

  if (!routes.includes(marker)) {
    throw new Error("cash-summary route block not found. Patch stopped.");
  }

  routes = routes.replace(marker, addition);
}

fs.writeFileSync(routePath, routes);

console.log("DONE: Phase 14I-A supplier summary report patched.");
