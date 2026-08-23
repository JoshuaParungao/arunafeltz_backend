const fs = require("fs");
const path = require("path");

const root = process.cwd();

const ensureDir = (dirPath) => {
  const fullPath = path.join(root, dirPath);

  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
};

const writeFile = (filePath, content) => {
  fs.writeFileSync(path.join(root, filePath), content);
};

ensureDir("src/modules/audit-logs/routes");
ensureDir("src/modules/audit-logs/controllers");
ensureDir("src/modules/audit-logs/services");
ensureDir("src/modules/audit-logs/validations");

writeFile(
  "src/modules/audit-logs/validations/auditLog.validation.js",
`const { z } = require("zod");

const positiveNumberString = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]*$/, "Value must be a positive number")
  .optional();

const optionalString = z.string().trim().min(1, "Value cannot be empty").optional();

const optionalDateString = z
  .string()
  .trim()
  .datetime("Invalid date format")
  .optional();

const listAuditLogsSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    branchId: optionalString,
    actorId: optionalString,
    action: optionalString,
    entityType: optionalString,
    entityId: optionalString,
    dateFrom: optionalDateString,
    dateTo: optionalDateString,
    page: positiveNumberString,
    limit: positiveNumberString,
  }),
});

const auditLogIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Audit log ID is required"),
  }),
});

module.exports = {
  listAuditLogsSchema,
  auditLogIdParamSchema,
};
`
);

writeFile(
  "src/modules/audit-logs/services/auditLog.service.js",
`const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

const AUDIT_LOG_SELECT = {
  id: true,
  actorId: true,
  actor: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      branchId: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  },
  branchId: true,
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
  action: true,
  entityType: true,
  entityId: true,
  description: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
};

const AUDIT_VIEW_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

const assertAuditLogViewAccess = (actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (!AUDIT_VIEW_ROLES.has(actor.role)) {
    throw new AppError(
      "You are not allowed to view audit logs",
      403,
      "AUDIT_LOG_VIEW_FORBIDDEN"
    );
  }

  if (actor.role !== "SUPER_OWNER" && !actor.branchId) {
    throw new AppError(
      "User is not assigned to a branch",
      400,
      "USER_BRANCH_REQUIRED"
    );
  }
};

const parsePagination = (query) => {
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 20), 100);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
};

const buildAuditLogWhere = (query, actor) => {
  assertAuditLogViewAccess(actor);

  const where = {};

  if (actor.role !== "SUPER_OWNER") {
    where.branchId = actor.branchId;

    if (query.branchId && query.branchId !== actor.branchId) {
      throw new AppError(
        "You can only view audit logs in your assigned branch",
        403,
        "BRANCH_ACCESS_DENIED"
      );
    }
  } else if (query.branchId) {
    where.branchId = query.branchId;
  }

  if (query.actorId) {
    where.actorId = query.actorId;
  }

  if (query.action) {
    where.action = {
      contains: query.action,
      mode: "insensitive",
    };
  }

  if (query.entityType) {
    where.entityType = {
      contains: query.entityType,
      mode: "insensitive",
    };
  }

  if (query.entityId) {
    where.entityId = query.entityId;
  }

  if (query.search) {
    where.OR = [
      {
        action: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        entityType: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        entityId: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: query.search,
          mode: "insensitive",
        },
      },
    ];
  }

  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};

    if (query.dateFrom) {
      where.createdAt.gte = new Date(query.dateFrom);
    }

    if (query.dateTo) {
      where.createdAt.lte = new Date(query.dateTo);
    }
  }

  return where;
};

const listAuditLogs = async (query, actor) => {
  const where = buildAuditLogWhere(query, actor);
  const { page, limit, skip } = parsePagination(query);

  const [auditLogs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: AUDIT_LOG_SELECT,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({
      where,
    }),
  ]);

  return {
    records: auditLogs,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getAuditLogById = async (id, actor) => {
  assertAuditLogViewAccess(actor);

  const auditLog = await prisma.auditLog.findUnique({
    where: {
      id,
    },
    select: AUDIT_LOG_SELECT,
  });

  if (!auditLog) {
    throw new AppError("Audit log not found", 404, "AUDIT_LOG_NOT_FOUND");
  }

  if (actor.role !== "SUPER_OWNER" && auditLog.branchId !== actor.branchId) {
    throw new AppError(
      "You can only view audit logs in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return auditLog;
};

module.exports = {
  listAuditLogs,
  getAuditLogById,
};
`
);

writeFile(
  "src/modules/audit-logs/controllers/auditLog.controller.js",
`const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const auditLogService = require("../services/auditLog.service");

const listAuditLogs = asyncHandler(async (req, res) => {
  const result = await auditLogService.listAuditLogs(req.query, req.user);

  return sendSuccess(res, {
    message: "Audit logs retrieved successfully",
    data: result.records,
    meta: result.meta,
  });
});

const getAuditLogById = asyncHandler(async (req, res) => {
  const auditLog = await auditLogService.getAuditLogById(req.params.id, req.user);

  return sendSuccess(res, {
    message: "Audit log retrieved successfully",
    data: auditLog,
  });
});

module.exports = {
  listAuditLogs,
  getAuditLogById,
};
`
);

writeFile(
  "src/modules/audit-logs/routes/auditLog.routes.js",
`const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const auditLogController = require("../controllers/auditLog.controller");
const {
  listAuditLogsSchema,
  auditLogIdParamSchema,
} = require("../validations/auditLog.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS),
  validate(listAuditLogsSchema),
  auditLogController.listAuditLogs
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS),
  validate(auditLogIdParamSchema),
  auditLogController.getAuditLogById
);

module.exports = router;
`
);

const apiRoutesPath = path.join(root, "src/routes/api.routes.js");
let apiRoutes = fs.readFileSync(apiRoutesPath, "utf8");

if (!apiRoutes.includes('const auditLogRoutes = require("../modules/audit-logs/routes/auditLog.routes");')) {
  apiRoutes = apiRoutes.replace(
    'const warrantyClaimRoutes = require("../modules/warranty-claims/routes/warrantyClaim.routes");',
    'const warrantyClaimRoutes = require("../modules/warranty-claims/routes/warrantyClaim.routes");\\nconst auditLogRoutes = require("../modules/audit-logs/routes/auditLog.routes");'
  );
}

if (!apiRoutes.includes('router.use("/audit-logs", auditLogRoutes);')) {
  apiRoutes = apiRoutes.replace(
    'router.use("/warranty-claims", warrantyClaimRoutes);',
    'router.use("/warranty-claims", warrantyClaimRoutes);\\nrouter.use("/audit-logs", auditLogRoutes);'
  );
}

fs.writeFileSync(apiRoutesPath, apiRoutes);

console.log("DONE: Phase 14B audit logs API patched.");
