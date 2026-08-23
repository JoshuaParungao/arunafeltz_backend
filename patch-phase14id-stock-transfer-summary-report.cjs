const fs = require("fs");
const path = require("path");

const root = process.cwd();

const validationPath = path.join(root, "src/modules/reports/validations/report.validation.js");
const servicePath = path.join(root, "src/modules/reports/services/report.service.js");
const controllerPath = path.join(root, "src/modules/reports/controllers/report.controller.js");
const routePath = path.join(root, "src/modules/reports/routes/report.routes.js");

let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("const stockTransferSummarySchema")) {
  const marker = `const purchaseReceivingSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    supplierId: z.string().trim().min(1, "Supplier ID cannot be empty").optional(),
    purchaseOrderId: z.string().trim().min(1, "Purchase order ID cannot be empty").optional(),
    status: z.enum(["DRAFT", "POSTED", "CANCELLED"]).optional(),
    search: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`;

  const addition = `${marker}

const stockTransferSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    fromBranchId: z.string().trim().min(1, "From branch ID cannot be empty").optional(),
    toBranchId: z.string().trim().min(1, "To branch ID cannot be empty").optional(),
    status: z.enum(["DRAFT", "REQUESTED", "APPROVED", "REJECTED", "POSTED", "CANCELLED"]).optional(),
    search: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`;

  if (!validation.includes(marker)) {
    throw new Error("purchaseReceivingSummarySchema block not found. Patch stopped.");
  }

  validation = validation.replace(marker, addition);
}

if (!validation.includes("stockTransferSummarySchema,")) {
  validation = validation.replace(
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
  purchaseOrderSummarySchema,
  purchaseReceivingSummarySchema,
};`,
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
  purchaseOrderSummarySchema,
  purchaseReceivingSummarySchema,
  stockTransferSummarySchema,
};`
  );
}

fs.writeFileSync(validationPath, validation);

let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const buildStockTransferSummaryRecord =")) {
  const stockTransferSummaryCode = `
const buildStockTransferSummaryRecord = (transfer) => {
  const itemTotals = transfer.items.reduce(
    (acc, item) => {
      const serialCount = Array.isArray(item.serials) ? item.serials.length : 0;

      acc.totalLines += 1;
      acc.totalQuantity += toNumber(item.quantity);
      acc.totalSerials += serialCount;

      if (item.fromBatchId) {
        acc.totalWithBatch += 1;
      }

      return acc;
    },
    {
      totalLines: 0,
      totalQuantity: 0,
      totalSerials: 0,
      totalWithBatch: 0,
    }
  );

  return {
    id: transfer.id,
    transferCode: transfer.transferCode,
    status: transfer.status,
    transferDate: transfer.transferDate,
    requestedAt: transfer.requestedAt,
    approvedAt: transfer.approvedAt,
    rejectedAt: transfer.rejectedAt,
    postedAt: transfer.postedAt,
    cancelledAt: transfer.cancelledAt,
    notes: transfer.notes,
    internalNotes: transfer.internalNotes,
    rejectionReason: transfer.rejectionReason,
    cancellationReason: transfer.cancellationReason,
    fromBranch: transfer.fromBranch,
    toBranch: transfer.toBranch,
    requestedBy: transfer.requestedBy,
    approvedBy: transfer.approvedBy,
    rejectedBy: transfer.rejectedBy,
    postedBy: transfer.postedBy,
    cancelledBy: transfer.cancelledBy,
    createdBy: transfer.createdBy,
    updatedBy: transfer.updatedBy,
    ...itemTotals,
  };
};

const getStockTransferSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const transferDate = parseDateRange(query);

  const andConditions = [];

  if (branchId) {
    andConditions.push({
      OR: [
        {
          fromBranchId: branchId,
        },
        {
          toBranchId: branchId,
        },
      ],
    });
  }

  if (query.fromBranchId) {
    andConditions.push({
      fromBranchId: query.fromBranchId,
    });
  }

  if (query.toBranchId) {
    andConditions.push({
      toBranchId: query.toBranchId,
    });
  }

  if (query.status) {
    andConditions.push({
      status: query.status,
    });
  }

  if (transferDate) {
    andConditions.push({
      transferDate,
    });
  }

  if (query.search) {
    andConditions.push({
      OR: [
        {
          transferCode: {
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
        {
          rejectionReason: {
            contains: String(query.search).trim(),
            mode: "insensitive",
          },
        },
        {
          cancellationReason: {
            contains: String(query.search).trim(),
            mode: "insensitive",
          },
        },
      ],
    });
  }

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  const allTransfers = await prisma.stockTransfer.findMany({
    where,
    orderBy: [
      {
        transferDate: "desc",
      },
      {
        transferCode: "desc",
      },
    ],
    select: {
      id: true,
      transferCode: true,
      status: true,
      transferDate: true,
      requestedAt: true,
      approvedAt: true,
      rejectedAt: true,
      postedAt: true,
      cancelledAt: true,
      notes: true,
      internalNotes: true,
      rejectionReason: true,
      cancellationReason: true,
      fromBranch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      toBranch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      approvedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      rejectedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      postedBy: {
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
      items: {
        select: {
          id: true,
          lineNo: true,
          description: true,
          quantity: true,
          fromBatchId: true,
          item: {
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              status: true,
              isSerialized: true,
            },
          },
          fromBatch: {
            select: {
              id: true,
              batchCode: true,
              quantityAvailable: true,
              status: true,
            },
          },
          serials: {
            select: {
              id: true,
              serialNumberSnapshot: true,
              itemSerial: {
                select: {
                  id: true,
                  serialNumber: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const records = allTransfers.map(buildStockTransferSummaryRecord);

  const totals = records.reduce(
    (acc, transfer) => {
      acc.totalTransfers += 1;
      acc.totalLines += transfer.totalLines;
      acc.totalQuantity += transfer.totalQuantity;
      acc.totalSerials += transfer.totalSerials;
      acc.totalWithBatch += transfer.totalWithBatch;

      acc.statusCounts[transfer.status] =
        (acc.statusCounts[transfer.status] || 0) + 1;

      return acc;
    },
    {
      totalTransfers: 0,
      totalLines: 0,
      totalQuantity: 0,
      totalSerials: 0,
      totalWithBatch: 0,
      statusCounts: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Stock Transfer Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        fromBranchId: query.fromBranchId || null,
        toBranchId: query.toBranchId || null,
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
  getPurchaseOrderSummary,
  getPurchaseReceivingSummary,
};`;

  if (!service.includes(marker)) {
    throw new Error("Current module.exports block not found. Patch stopped.");
  }

  service = service.replace(
    marker,
    `${stockTransferSummaryCode}
module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
  getPurchaseOrderSummary,
  getPurchaseReceivingSummary,
  getStockTransferSummary,
};`
  );
}

fs.writeFileSync(servicePath, service);

let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("const getStockTransferSummary =")) {
  const marker = `const getPurchaseReceivingSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getPurchaseReceivingSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Purchase receiving summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`;

  const addition = `${marker}

const getStockTransferSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getStockTransferSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Stock transfer summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`;

  if (!controller.includes(marker)) {
    throw new Error("getPurchaseReceivingSummary controller block not found. Patch stopped.");
  }

  controller = controller.replace(marker, addition);
}

if (!controller.includes("getStockTransferSummary,")) {
  controller = controller.replace(
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
  getPurchaseOrderSummary,
  getPurchaseReceivingSummary,
};`,
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
  getPurchaseOrderSummary,
  getPurchaseReceivingSummary,
  getStockTransferSummary,
};`
  );
}

fs.writeFileSync(controllerPath, controller);

let routes = fs.readFileSync(routePath, "utf8");

if (!routes.includes("stockTransferSummarySchema")) {
  routes = routes.replace(
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
  purchaseOrderSummarySchema,
  purchaseReceivingSummarySchema,
} = require("../validations/report.validation");`,
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
  purchaseOrderSummarySchema,
  purchaseReceivingSummarySchema,
  stockTransferSummarySchema,
} = require("../validations/report.validation");`
  );
}

if (!routes.includes('"/stock-transfer-summary"')) {
  const marker = `router.get(
  "/purchase-receiving-summary",
  validate(purchaseReceivingSummarySchema),
  reportController.getPurchaseReceivingSummary
);`;

  const addition = `${marker}

router.get(
  "/stock-transfer-summary",
  validate(stockTransferSummarySchema),
  reportController.getStockTransferSummary
);`;

  if (!routes.includes(marker)) {
    throw new Error("purchase-receiving-summary route block not found. Patch stopped.");
  }

  routes = routes.replace(marker, addition);
}

fs.writeFileSync(routePath, routes);

console.log("DONE: Phase 14I-D stock transfer summary report patched.");
