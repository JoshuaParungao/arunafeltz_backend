const fs = require("fs");
const path = require("path");

const root = process.cwd();

const validationPath = path.join(root, "src/modules/reports/validations/report.validation.js");
const servicePath = path.join(root, "src/modules/reports/services/report.service.js");
const controllerPath = path.join(root, "src/modules/reports/controllers/report.controller.js");
const routePath = path.join(root, "src/modules/reports/routes/report.routes.js");

let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("const purchaseReceivingSummarySchema")) {
  const marker = `const purchaseOrderSummarySchema = z.object({
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

  const addition = `${marker}

const purchaseReceivingSummarySchema = z.object({
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

  if (!validation.includes(marker)) {
    throw new Error("purchaseOrderSummarySchema block not found. Patch stopped.");
  }

  validation = validation.replace(marker, addition);
}

if (!validation.includes("purchaseReceivingSummarySchema,")) {
  validation = validation.replace(
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
  purchaseOrderSummarySchema,
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
};`
  );
}

fs.writeFileSync(validationPath, validation);

let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const buildPurchaseReceivingSummaryRecord =")) {
  const purchaseReceivingSummaryCode = `
const buildPurchaseReceivingSummaryRecord = (receiving) => {
  const itemTotals = receiving.items.reduce(
    (acc, item) => {
      const serialCount = Array.isArray(item.serials) ? item.serials.length : 0;

      acc.totalLines += 1;
      acc.totalQuantityReceived += toNumber(item.quantityReceived);
      acc.totalLineDiscount += toNumber(item.discountAmount);
      acc.totalLineAmount += toNumber(item.lineTotal);
      acc.totalSerials += serialCount;

      if (item.batchCode) {
        acc.totalWithBatch += 1;
      }

      return acc;
    },
    {
      totalLines: 0,
      totalQuantityReceived: 0,
      totalLineDiscount: 0,
      totalLineAmount: 0,
      totalSerials: 0,
      totalWithBatch: 0,
    }
  );

  return {
    id: receiving.id,
    receivingCode: receiving.receivingCode,
    status: receiving.status,
    receivingDate: receiving.receivingDate,
    supplierDeliveryNo: receiving.supplierDeliveryNo,
    supplierInvoiceNo: receiving.supplierInvoiceNo,
    referenceNo: receiving.referenceNo,
    supplierNameSnapshot: receiving.supplierNameSnapshot,
    supplierContactSnapshot: receiving.supplierContactSnapshot,
    notes: receiving.notes,
    internalNotes: receiving.internalNotes,
    cancellationReason: receiving.cancellationReason,
    subtotal: toNumber(receiving.subtotal),
    totalDiscount: toNumber(receiving.totalDiscount),
    grandTotal: toNumber(receiving.grandTotal),
    postedAt: receiving.postedAt,
    cancelledAt: receiving.cancelledAt,
    branch: receiving.branch,
    supplier: receiving.supplier,
    purchaseOrder: receiving.purchaseOrder,
    createdBy: receiving.createdBy,
    updatedBy: receiving.updatedBy,
    postedBy: receiving.postedBy,
    cancelledBy: receiving.cancelledBy,
    ...itemTotals,
  };
};

const getPurchaseReceivingSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const receivingDate = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(receivingDate ? { receivingDate } : {}),
    ...(query.search
      ? {
          OR: [
            {
              receivingCode: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              supplierDeliveryNo: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              supplierInvoiceNo: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              referenceNo: {
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
          ],
        }
      : {}),
  };

  const allReceivings = await prisma.purchaseReceiving.findMany({
    where,
    orderBy: [
      {
        receivingDate: "desc",
      },
      {
        receivingCode: "desc",
      },
    ],
    select: {
      id: true,
      receivingCode: true,
      status: true,
      receivingDate: true,
      supplierDeliveryNo: true,
      supplierInvoiceNo: true,
      referenceNo: true,
      supplierNameSnapshot: true,
      supplierContactSnapshot: true,
      notes: true,
      internalNotes: true,
      cancellationReason: true,
      subtotal: true,
      totalDiscount: true,
      grandTotal: true,
      postedAt: true,
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
      purchaseOrder: {
        select: {
          id: true,
          poCode: true,
          status: true,
          orderDate: true,
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
      items: {
        select: {
          id: true,
          lineNo: true,
          description: true,
          quantityReceived: true,
          unitCost: true,
          discountAmount: true,
          lineTotal: true,
          batchCode: true,
          expiryDate: true,
          item: {
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              status: true,
              isSerialized: true,
            },
          },
          serials: {
            select: {
              id: true,
              serialNumber: true,
            },
          },
        },
      },
    },
  });

  const records = allReceivings.map(buildPurchaseReceivingSummaryRecord);

  const totals = records.reduce(
    (acc, receiving) => {
      acc.totalReceivings += 1;
      acc.totalSubtotal += receiving.subtotal;
      acc.totalDiscount += receiving.totalDiscount;
      acc.totalGrandTotal += receiving.grandTotal;
      acc.totalLines += receiving.totalLines;
      acc.totalQuantityReceived += receiving.totalQuantityReceived;
      acc.totalSerials += receiving.totalSerials;
      acc.totalWithBatch += receiving.totalWithBatch;

      acc.statusCounts[receiving.status] =
        (acc.statusCounts[receiving.status] || 0) + 1;

      return acc;
    },
    {
      totalReceivings: 0,
      totalSubtotal: 0,
      totalDiscount: 0,
      totalGrandTotal: 0,
      totalLines: 0,
      totalQuantityReceived: 0,
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
      name: "Purchase Receiving Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        supplierId: query.supplierId || null,
        purchaseOrderId: query.purchaseOrderId || null,
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
};`;

  if (!service.includes(marker)) {
    throw new Error("Current module.exports block not found. Patch stopped.");
  }

  service = service.replace(
    marker,
    `${purchaseReceivingSummaryCode}
module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
  getPurchaseOrderSummary,
  getPurchaseReceivingSummary,
};`
  );
}

fs.writeFileSync(servicePath, service);

let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("const getPurchaseReceivingSummary =")) {
  const marker = `const getPurchaseOrderSummary = asyncHandler(async (req, res) => {
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

  const addition = `${marker}

const getPurchaseReceivingSummary = asyncHandler(async (req, res) => {
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

  if (!controller.includes(marker)) {
    throw new Error("getPurchaseOrderSummary controller block not found. Patch stopped.");
  }

  controller = controller.replace(marker, addition);
}

if (!controller.includes("getPurchaseReceivingSummary,")) {
  controller = controller.replace(
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
  getPurchaseOrderSummary,
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
};`
  );
}

fs.writeFileSync(controllerPath, controller);

let routes = fs.readFileSync(routePath, "utf8");

if (!routes.includes("purchaseReceivingSummarySchema")) {
  routes = routes.replace(
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
  purchaseOrderSummarySchema,
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
} = require("../validations/report.validation");`
  );
}

if (!routes.includes('"/purchase-receiving-summary"')) {
  const marker = `router.get(
  "/purchase-order-summary",
  validate(purchaseOrderSummarySchema),
  reportController.getPurchaseOrderSummary
);`;

  const addition = `${marker}

router.get(
  "/purchase-receiving-summary",
  validate(purchaseReceivingSummarySchema),
  reportController.getPurchaseReceivingSummary
);`;

  if (!routes.includes(marker)) {
    throw new Error("purchase-order-summary route block not found. Patch stopped.");
  }

  routes = routes.replace(marker, addition);
}

fs.writeFileSync(routePath, routes);

console.log("DONE: Phase 14I-C purchase receiving summary report patched.");
