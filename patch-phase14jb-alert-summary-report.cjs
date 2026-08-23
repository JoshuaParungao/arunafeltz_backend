const fs = require("fs");
const path = require("path");

const root = process.cwd();

const validationPath = path.join(root, "src/modules/reports/validations/report.validation.js");
const servicePath = path.join(root, "src/modules/reports/services/report.service.js");
const controllerPath = path.join(root, "src/modules/reports/controllers/report.controller.js");
const routePath = path.join(root, "src/modules/reports/routes/report.routes.js");

let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("const alertSummarySchema")) {
  const marker = `const stockTransferSummarySchema = z.object({
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

  const addition = `${marker}

const alertSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    limit: optionalPositiveIntegerString,
  }),
});`;

  if (!validation.includes(marker)) {
    throw new Error("stockTransferSummarySchema block not found. Patch stopped.");
  }

  validation = validation.replace(marker, addition);
}

if (!validation.includes("alertSummarySchema,")) {
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
  stockTransferSummarySchema,
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
  alertSummarySchema,
};`
  );
}

fs.writeFileSync(validationPath, validation);

let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const getAlertSummary =")) {
  const alertSummaryCode = `
const buildLowStockAlerts = (items) => {
  return items
    .map((item) => {
      const quantityAvailable = item.inventoryBatches.reduce((sum, batch) => {
        return sum + toNumber(batch.quantityAvailable);
      }, 0);

      const minimumStock = toNumber(item.minimumStock);
      const reorderLevel = toNumber(item.reorderLevel);
      const alertLevel = reorderLevel > 0 ? reorderLevel : minimumStock;

      const isZeroStock = quantityAvailable === 0;
      const isLowStock = alertLevel > 0 && quantityAvailable <= alertLevel;

      if (!isZeroStock && !isLowStock) {
        return null;
      }

      return {
        id: item.id,
        type: isZeroStock ? "ZERO_STOCK" : "LOW_STOCK",
        severity: isZeroStock ? "HIGH" : "MEDIUM",
        message: isZeroStock
          ? \`\${item.itemName} has zero available stock\`
          : \`\${item.itemName} is at or below alert stock level\`,
        item: {
          id: item.id,
          itemCode: item.itemCode,
          itemName: item.itemName,
          status: item.status,
          minimumStock,
          reorderLevel,
          quantityAvailable,
        },
        branch: item.branch,
      };
    })
    .filter(Boolean);
};

const getAlertSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const limit = query.limit ? Number(query.limit) : 10;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10;

  const branchWhere = branchId ? { branchId } : {};

  const [
    inventoryItems,
    stockTransfers,
    warrantyClaims,
    purchaseOrders,
    purchaseReceivings,
    cashHandovers,
  ] = await Promise.all([
    prisma.item.findMany({
      where: {
        ...branchWhere,
        status: "ACTIVE",
      },
      orderBy: {
        itemName: "asc",
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        status: true,
        minimumStock: true,
        reorderLevel: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        inventoryBatches: {
          where: {
            status: {
              in: ["ACTIVE", "DEPLETED"],
            },
          },
          select: {
            quantityAvailable: true,
            status: true,
          },
        },
      },
    }),

    prisma.stockTransfer.findMany({
      where: {
        ...(branchId
          ? {
              OR: [
                {
                  fromBranchId: branchId,
                },
                {
                  toBranchId: branchId,
                },
              ],
            }
          : {}),
        status: {
          in: ["DRAFT", "REQUESTED", "APPROVED"],
        },
      },
      orderBy: {
        transferDate: "desc",
      },
      take: safeLimit,
      select: {
        id: true,
        transferCode: true,
        status: true,
        transferDate: true,
        requestedAt: true,
        approvedAt: true,
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
      },
    }),

    prisma.warrantyClaim.findMany({
      where: {
        ...branchWhere,
        status: {
          in: ["IN", "CHECKING", "SENT_TO_SUPPLIER", "APPROVED", "REPAIRED", "REPLACED"],
        },
      },
      orderBy: {
        receivedAt: "desc",
      },
      take: safeLimit,
      select: {
        id: true,
        claimCode: true,
        status: true,
        issueDescription: true,
        receivedAt: true,
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
            fullName: true,
            mobileNumber: true,
          },
        },
        item: {
          select: {
            id: true,
            itemCode: true,
            itemName: true,
          },
        },
        serial: {
          select: {
            id: true,
            serialNumber: true,
            status: true,
          },
        },
      },
    }),

    prisma.purchaseOrder.findMany({
      where: {
        ...branchWhere,
        status: {
          in: ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"],
        },
      },
      orderBy: {
        orderDate: "desc",
      },
      take: safeLimit,
      select: {
        id: true,
        poCode: true,
        status: true,
        orderDate: true,
        expectedDate: true,
        supplierNameSnapshot: true,
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
          },
        },
      },
    }),

    prisma.purchaseReceiving.findMany({
      where: {
        ...branchWhere,
        status: "DRAFT",
      },
      orderBy: {
        receivingDate: "desc",
      },
      take: safeLimit,
      select: {
        id: true,
        receivingCode: true,
        status: true,
        receivingDate: true,
        supplierDeliveryNo: true,
        supplierInvoiceNo: true,
        supplierNameSnapshot: true,
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
          },
        },
        purchaseOrder: {
          select: {
            id: true,
            poCode: true,
            status: true,
          },
        },
      },
    }),

    prisma.cashHandover.findMany({
      where: {
        ...branchWhere,
        status: "PENDING",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: safeLimit,
      select: {
        id: true,
        handoverCode: true,
        status: true,
        amount: true,
        remarks: true,
        createdAt: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        cashBox: {
          select: {
            id: true,
            boxCode: true,
            name: true,
          },
        },
        fromUser: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        toUser: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
      },
    }),
  ]);

  const lowStockAlerts = buildLowStockAlerts(inventoryItems);
  const limitedLowStockAlerts = lowStockAlerts.slice(0, safeLimit);

  const alertGroups = {
    inventory: {
      total: lowStockAlerts.length,
      zeroStock: lowStockAlerts.filter((alert) => alert.type === "ZERO_STOCK").length,
      lowStock: lowStockAlerts.filter((alert) => alert.type === "LOW_STOCK").length,
      records: limitedLowStockAlerts,
    },
    stockTransfers: {
      total: stockTransfers.length,
      requested: stockTransfers.filter((transfer) => transfer.status === "REQUESTED").length,
      approved: stockTransfers.filter((transfer) => transfer.status === "APPROVED").length,
      draft: stockTransfers.filter((transfer) => transfer.status === "DRAFT").length,
      records: stockTransfers,
    },
    warrantyClaims: {
      total: warrantyClaims.length,
      in: warrantyClaims.filter((claim) => claim.status === "IN").length,
      checking: warrantyClaims.filter((claim) => claim.status === "CHECKING").length,
      sentToSupplier: warrantyClaims.filter((claim) => claim.status === "SENT_TO_SUPPLIER").length,
      approved: warrantyClaims.filter((claim) => claim.status === "APPROVED").length,
      repaired: warrantyClaims.filter((claim) => claim.status === "REPAIRED").length,
      replaced: warrantyClaims.filter((claim) => claim.status === "REPLACED").length,
      records: warrantyClaims,
    },
    purchaseOrders: {
      total: purchaseOrders.length,
      draft: purchaseOrders.filter((order) => order.status === "DRAFT").length,
      ordered: purchaseOrders.filter((order) => order.status === "ORDERED").length,
      partiallyReceived: purchaseOrders.filter((order) => order.status === "PARTIALLY_RECEIVED").length,
      records: purchaseOrders,
    },
    purchaseReceivings: {
      total: purchaseReceivings.length,
      draft: purchaseReceivings.length,
      records: purchaseReceivings,
    },
    cashHandovers: {
      total: cashHandovers.length,
      pending: cashHandovers.length,
      records: cashHandovers.map((handover) => ({
        ...handover,
        amount: toNumber(handover.amount),
      })),
    },
  };

  const totalAlerts = Object.values(alertGroups).reduce((sum, group) => {
    return sum + group.total;
  }, 0);

  return {
    report: {
      name: "Alert Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        limit: safeLimit,
      },
      totals: {
        totalAlerts,
        inventoryAlerts: alertGroups.inventory.total,
        stockTransferAlerts: alertGroups.stockTransfers.total,
        warrantyAlerts: alertGroups.warrantyClaims.total,
        purchaseOrderAlerts: alertGroups.purchaseOrders.total,
        purchaseReceivingAlerts: alertGroups.purchaseReceivings.total,
        cashHandoverAlerts: alertGroups.cashHandovers.total,
      },
    },
    alerts: alertGroups,
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
  getStockTransferSummary,
};`;

  if (!service.includes(marker)) {
    throw new Error("Current module.exports block not found. Patch stopped.");
  }

  service = service.replace(
    marker,
    `${alertSummaryCode}
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
  getAlertSummary,
};`
  );
}

fs.writeFileSync(servicePath, service);

let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("const getAlertSummary =")) {
  const marker = `const getStockTransferSummary = asyncHandler(async (req, res) => {
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

  const addition = `${marker}

const getAlertSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getAlertSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Alert summary report retrieved successfully",
    data: {
      report: result.report,
      alerts: result.alerts,
    },
  });
});`;

  if (!controller.includes(marker)) {
    throw new Error("getStockTransferSummary controller block not found. Patch stopped.");
  }

  controller = controller.replace(marker, addition);
}

if (!controller.includes("getAlertSummary,")) {
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
  getStockTransferSummary,
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
  getAlertSummary,
};`
  );
}

fs.writeFileSync(controllerPath, controller);

let routes = fs.readFileSync(routePath, "utf8");

if (!routes.includes("alertSummarySchema")) {
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
  stockTransferSummarySchema,
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
  alertSummarySchema,
} = require("../validations/report.validation");`
  );
}

if (!routes.includes('"/alert-summary"')) {
  const marker = `router.get(
  "/stock-transfer-summary",
  validate(stockTransferSummarySchema),
  reportController.getStockTransferSummary
);`;

  const addition = `${marker}

router.get(
  "/alert-summary",
  validate(alertSummarySchema),
  reportController.getAlertSummary
);`;

  if (!routes.includes(marker)) {
    throw new Error("stock-transfer-summary route block not found. Patch stopped.");
  }

  routes = routes.replace(marker, addition);
}

fs.writeFileSync(routePath, routes);

console.log("DONE: Phase 14J-B alert summary endpoint patched.");
