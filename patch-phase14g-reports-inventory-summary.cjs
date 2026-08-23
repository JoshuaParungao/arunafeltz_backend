const fs = require("fs");
const path = require("path");

const root = process.cwd();

const ensureDir = (dirPath) => {
  fs.mkdirSync(path.join(root, dirPath), { recursive: true });
};

const writeFile = (filePath, content) => {
  fs.writeFileSync(path.join(root, filePath), content);
};

const permissionsPath = path.join(root, "src/constants/permissions.js");
const apiRoutesPath = path.join(root, "src/routes/api.routes.js");

let permissionsContent = fs.readFileSync(permissionsPath, "utf8");

if (!permissionsContent.includes('VIEW_REPORTS: "reports:view"')) {
  permissionsContent = permissionsContent.replace(
    '  VIEW_AUDIT_LOGS: "audit_logs:view",',
    '  VIEW_AUDIT_LOGS: "audit_logs:view",\n  VIEW_REPORTS: "reports:view",'
  );
}

if (!permissionsContent.includes("PERMISSIONS.VIEW_REPORTS")) {
  permissionsContent = permissionsContent.replace(
    "    PERMISSIONS.VIEW_AUDIT_LOGS,\n    PERMISSIONS.VIEW_QUOTATIONS,",
    "    PERMISSIONS.VIEW_AUDIT_LOGS,\n    PERMISSIONS.VIEW_REPORTS,\n    PERMISSIONS.VIEW_QUOTATIONS,"
  );

  permissionsContent = permissionsContent.replace(
    "    PERMISSIONS.VIEW_AUDIT_LOGS,\n    PERMISSIONS.VIEW_QUOTATIONS,",
    "    PERMISSIONS.VIEW_AUDIT_LOGS,\n    PERMISSIONS.VIEW_REPORTS,\n    PERMISSIONS.VIEW_QUOTATIONS,"
  );
}

fs.writeFileSync(permissionsPath, permissionsContent);

ensureDir("src/modules/reports/controllers");
ensureDir("src/modules/reports/routes");
ensureDir("src/modules/reports/services");
ensureDir("src/modules/reports/validations");

writeFile(
  "src/modules/reports/validations/report.validation.js",
  `const { z } = require("zod");

const optionalPositiveIntegerString = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]*$/, "Value must be a positive number")
  .optional();

const inventorySummarySchema = z.object({
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

module.exports = {
  inventorySummarySchema,
};
`
);

writeFile(
  "src/modules/reports/services/report.service.js",
  `const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

const isSuperOwner = (actor) => actor && actor.role === "SUPER_OWNER";

const resolveBranchFilter = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
    return requestedBranchId || undefined;
  }

  if (!actor.branchId) {
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

const parsePagination = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const rawLimit = Math.max(Number(query.limit) || 20, 1);
  const limit = Math.min(rawLimit, 100);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
};

const parseBoolean = (value) => {
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

const buildInventorySummaryItem = (item) => {
  const quantityIn = item.inventoryBatches.reduce((sum, batch) => {
    return sum + Number(batch.quantityIn);
  }, 0);

  const quantityAvailable = item.inventoryBatches.reduce((sum, batch) => {
    return sum + Number(batch.quantityAvailable);
  }, 0);

  const activeBatchCount = item.inventoryBatches.filter((batch) => {
    return batch.status === "ACTIVE";
  }).length;

  const depletedBatchCount = item.inventoryBatches.filter((batch) => {
    return batch.status === "DEPLETED";
  }).length;

  const serialCounts = item.itemSerials.reduce((acc, serial) => {
    acc[serial.status] = (acc[serial.status] || 0) + 1;
    return acc;
  }, {});

  const minimumStock = Number(item.minimumStock || 0);
  const reorderLevel = Number(item.reorderLevel || 0);
  const isLowStock = reorderLevel > 0 ? quantityAvailable <= reorderLevel : false;
  const isZeroStock = quantityAvailable === 0;

  return {
    id: item.id,
    itemCode: item.itemCode,
    itemName: item.itemName,
    brand: item.brand,
    modelName: item.modelName,
    status: item.status,
    isSerialized: item.isSerialized,
    branch: item.branch,
    category: item.category,
    unit: item.unit,
    quantityIn,
    quantityAvailable,
    minimumStock,
    reorderLevel,
    isLowStock,
    isZeroStock,
    batchCount: item.inventoryBatches.length,
    activeBatchCount,
    depletedBatchCount,
    serialCount: item.itemSerials.length,
    serialCounts,
  };
};

const getInventorySummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const search = query.search ? String(query.search).trim() : "";
  const lowStockOnly = parseBoolean(query.lowStockOnly);
  const { page, limit, skip } = parsePagination(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            {
              itemCode: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              itemName: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              brand: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              modelName: {
                contains: search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const allItems = await prisma.item.findMany({
    where,
    orderBy: [
      {
        branch: {
          code: "asc",
        },
      },
      {
        itemCode: "asc",
      },
    ],
    select: {
      id: true,
      itemCode: true,
      itemName: true,
      brand: true,
      modelName: true,
      status: true,
      isSerialized: true,
      minimumStock: true,
      reorderLevel: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          categoryCode: true,
          name: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitCode: true,
          name: true,
        },
      },
      inventoryBatches: {
        select: {
          id: true,
          batchCode: true,
          quantityIn: true,
          quantityAvailable: true,
          status: true,
        },
        orderBy: {
          batchCode: "asc",
        },
      },
      itemSerials: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  let summaryItems = allItems.map(buildInventorySummaryItem);

  if (lowStockOnly === true) {
    summaryItems = summaryItems.filter((item) => item.isLowStock);
  }

  const totalItems = summaryItems.length;
  const paginatedItems = summaryItems.slice(skip, skip + limit);

  const totals = summaryItems.reduce(
    (acc, item) => {
      acc.totalQuantityIn += item.quantityIn;
      acc.totalQuantityAvailable += item.quantityAvailable;
      acc.totalBatches += item.batchCount;
      acc.totalSerials += item.serialCount;

      if (item.isLowStock) {
        acc.lowStockItems += 1;
      }

      if (item.isZeroStock) {
        acc.zeroStockItems += 1;
      }

      return acc;
    },
    {
      totalItems,
      totalQuantityIn: 0,
      totalQuantityAvailable: 0,
      totalBatches: 0,
      totalSerials: 0,
      lowStockItems: 0,
      zeroStockItems: 0,
    }
  );

  return {
    report: {
      name: "Inventory Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        categoryId: query.categoryId || null,
        status: query.status || null,
        search: search || null,
        lowStockOnly: lowStockOnly === undefined ? null : lowStockOnly,
      },
      totals,
    },
    records: paginatedItems,
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit) || 1,
      hasNextPage: page < (Math.ceil(totalItems / limit) || 1),
      hasPreviousPage: page > 1,
    },
  };
};

module.exports = {
  getInventorySummary,
};
`
);

writeFile(
  "src/modules/reports/controllers/report.controller.js",
  `const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const reportService = require("../services/report.service");

const getInventorySummary = asyncHandler(async (req, res) => {
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

module.exports = {
  getInventorySummary,
};
`
);

writeFile(
  "src/modules/reports/routes/report.routes.js",
  `const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const reportController = require("../controllers/report.controller");
const { inventorySummarySchema } = require("../validations/report.validation");

const router = express.Router();

router.use(protect);
router.use(requirePermission(PERMISSIONS.VIEW_REPORTS));

router.get(
  "/inventory-summary",
  validate(inventorySummarySchema),
  reportController.getInventorySummary
);

module.exports = router;
`
);

let apiRoutesContent = fs.readFileSync(apiRoutesPath, "utf8");

if (!apiRoutesContent.includes('const reportRoutes = require("../modules/reports/routes/report.routes");')) {
  apiRoutesContent = apiRoutesContent.replace(
    'const auditLogRoutes = require("../modules/audit-logs/routes/auditLog.routes");',
    'const auditLogRoutes = require("../modules/audit-logs/routes/auditLog.routes");\nconst reportRoutes = require("../modules/reports/routes/report.routes");'
  );
}

if (!apiRoutesContent.includes('router.use("/reports", reportRoutes);')) {
  apiRoutesContent = apiRoutesContent.replace(
    'router.use("/audit-logs", auditLogRoutes);',
    'router.use("/audit-logs", auditLogRoutes);\nrouter.use("/reports", reportRoutes);'
  );
}

fs.writeFileSync(apiRoutesPath, apiRoutesContent);

console.log("DONE: Phase 14G reports foundation and inventory summary patched.");
