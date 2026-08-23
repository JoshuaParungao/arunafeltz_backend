const fs = require("fs");
const path = require("path");

const root = process.cwd();

const validationPath = path.join(root, "src/modules/reports/validations/report.validation.js");
const servicePath = path.join(root, "src/modules/reports/services/report.service.js");
const controllerPath = path.join(root, "src/modules/reports/controllers/report.controller.js");
const routePath = path.join(root, "src/modules/reports/routes/report.routes.js");

let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("const purchaseOrderSummarySchema")) {
  const marker = `const supplierSummarySchema = z.object({
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

  const addition = `${marker}

const purchaseOrderSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    supplierId: z.string().trim().min(1, "Supplier ID cannot be empty").optional(),
    status: z.enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]).optional(),
    search: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`;

  if (!validation.includes(marker)) {
    throw new Error("supplierSummarySchema block not found. Patch stopped.");
  }

  validation = validation.replace(marker, addition);
}

if (!validation.includes("purchaseOrderSummarySchema,")) {
  validation = validation.replace(
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
};`,
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
  purchaseOrderSummarySchema,
};`
  );
}

fs.writeFileSync(validationPath, validation);

let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const buildPurchaseOrderSummaryRecord =")) {
  const purchaseOrderSummaryCode = `
const buildPurchaseOrderSummaryRecord = (purchaseOrder) => {
  const itemTotals = purchaseOrder.items.reduce(
    (acc, item) => {
      acc.totalLines += 1;
      acc.totalQuantity += toNumber(item.quantity);
      acc.totalReceivedQuantity += toNumber(item.receivedQuantity);
      acc.totalLineDiscount += toNumber(item.discountAmount);
      acc.totalLineAmount += toNumber(item.lineTotal);
      return acc;
    },
    {
      totalLines: 0,
      totalQuantity: 0,
      totalReceivedQuantity: 0,
      totalLineDiscount: 0,
      totalLineAmount: 0,
    }
  );

  return {
    id: purchaseOrder.id,
    poCode: purchaseOrder.poCode,
    status: purchaseOrder.status,
    orderDate: purchaseOrder.orderDate,
    expectedDate: purchaseOrder.expectedDate,
    supplierNameSnapshot: purchaseOrder.supplierNameSnapshot,
    supplierContactSnapshot: purchaseOrder.supplierContactSnapshot,
    notes: purchaseOrder.notes,
    internalNotes: purchaseOrder.internalNotes,
    cancellationReason: purchaseOrder.cancellationReason,
    subtotal: toNumber(purchaseOrder.subtotal),
    totalDiscount: toNumber(purchaseOrder.totalDiscount),
    grandTotal: toNumber(purchaseOrder.grandTotal),
    orderedAt: purchaseOrder.orderedAt,
    receivedAt: purchaseOrder.receivedAt,
    cancelledAt: purchaseOrder.cancelledAt,
    branch: purchaseOrder.branch,
    supplier: purchaseOrder.supplier,
    createdBy: purchaseOrder.createdBy,
    updatedBy: purchaseOrder.updatedBy,
    orderedBy: purchaseOrder.orderedBy,
    cancelledBy: purchaseOrder.cancelledBy,
    ...itemTotals,
  };
};

const getPurchaseOrderSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const orderDate = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(orderDate ? { orderDate } : {}),
    ...(query.search
      ? {
          OR: [
            {
              poCode: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              supplierNameSnapshot: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              supplierContactSnapshot: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              notes: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const allPurchaseOrders = await prisma.purchaseOrder.findMany({
    where,
    orderBy: [
      {
        orderDate: "desc",
      },
      {
        poCode: "desc",
      },
    ],
    select: {
      id: true,
      poCode: true,
      status: true,
      orderDate: true,
      expectedDate: true,
      supplierNameSnapshot: true,
      supplierContactSnapshot: true,
      notes: true,
      internalNotes: true,
      cancellationReason: true,
      subtotal: true,
      totalDiscount: true,
      grandTotal: true,
      orderedAt: true,
      receivedAt: true,
      cancelledAt: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      supplier: {
        select: {
          id: true,
          supplierCode: true,
          name: true,
          contactPerson: true,
          contactNo: true,
          email: true,
          status: true,
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
      orderedBy: {
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
      items: {
        select: {
          id: true,
          lineNo: true,
          description: true,
          quantity: true,
          receivedQuantity: true,
          unitCost: true,
          discountAmount: true,
          lineTotal: true,
          item: {
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const records = allPurchaseOrders.map(buildPurchaseOrderSummaryRecord);

  const totals = records.reduce(
    (acc, purchaseOrder) => {
      acc.totalPurchaseOrders += 1;
      acc.totalSubtotal += purchaseOrder.subtotal;
      acc.totalDiscount += purchaseOrder.totalDiscount;
      acc.totalGrandTotal += purchaseOrder.grandTotal;
      acc.totalLines += purchaseOrder.totalLines;
      acc.totalQuantity += purchaseOrder.totalQuantity;
      acc.totalReceivedQuantity += purchaseOrder.totalReceivedQuantity;

      acc.statusCounts[purchaseOrder.status] =
        (acc.statusCounts[purchaseOrder.status] || 0) + 1;

      return acc;
    },
    {
      totalPurchaseOrders: 0,
      totalSubtotal: 0,
      totalDiscount: 0,
      totalGrandTotal: 0,
      totalLines: 0,
      totalQuantity: 0,
      totalReceivedQuantity: 0,
      statusCounts: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Purchase Order Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        supplierId: query.supplierId || null,
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
  getSupplierSummary,
};`;

  if (!service.includes(marker)) {
    throw new Error("Current module.exports block not found. Patch stopped.");
  }

  service = service.replace(
    marker,
    `${purchaseOrderSummaryCode}
module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
  getPurchaseOrderSummary,
};`
  );
}

fs.writeFileSync(servicePath, service);

let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("const getPurchaseOrderSummary =")) {
  const marker = `const getSupplierSummary = asyncHandler(async (req, res) => {
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

  const addition = `${marker}

const getPurchaseOrderSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getPurchaseOrderSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Purchase order summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`;

  if (!controller.includes(marker)) {
    throw new Error("getSupplierSummary controller block not found. Patch stopped.");
  }

  controller = controller.replace(marker, addition);
}

if (!controller.includes("getPurchaseOrderSummary,")) {
  controller = controller.replace(
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
};`,
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
  getPurchaseOrderSummary,
};`
  );
}

fs.writeFileSync(controllerPath, controller);

let routes = fs.readFileSync(routePath, "utf8");

if (!routes.includes("purchaseOrderSummarySchema")) {
  routes = routes.replace(
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
} = require("../validations/report.validation");`,
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
  purchaseOrderSummarySchema,
} = require("../validations/report.validation");`
  );
}

if (!routes.includes('"/purchase-order-summary"')) {
  const marker = `router.get(
  "/supplier-summary",
  validate(supplierSummarySchema),
  reportController.getSupplierSummary
);`;

  const addition = `${marker}

router.get(
  "/purchase-order-summary",
  validate(purchaseOrderSummarySchema),
  reportController.getPurchaseOrderSummary
);`;

  if (!routes.includes(marker)) {
    throw new Error("supplier-summary route block not found. Patch stopped.");
  }

  routes = routes.replace(marker, addition);
}

fs.writeFileSync(routePath, routes);

console.log("DONE: Phase 14I-B purchase order summary report patched.");
