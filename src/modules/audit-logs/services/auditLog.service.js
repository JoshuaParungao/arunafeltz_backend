const prisma = require("../../../config/prisma");
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
