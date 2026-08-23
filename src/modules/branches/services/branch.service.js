const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { createAuditLog } = require("../../../utils/auditLogger");
const cache = require("../../../config/cache");

const BRANCH_CACHE_PREFIX = "branches:";
const BRANCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const normalizeCode = (code) => {
  return code.trim().toUpperCase();
};

const createBranch = async (payload, actor = null) => {
  const code = normalizeCode(payload.code);

  const existingBranch = await prisma.branch.findUnique({
    where: { code },
  });

  if (existingBranch) {
    throw new AppError("Branch code already exists", 409, "BRANCH_CODE_EXISTS");
  }

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.create({
      data: {
        code,
        name: payload.name.trim(),
        address: payload.address?.trim() || null,
        contactNo: payload.contactNo?.trim() || null,
      },
    });

    await createAuditLog({
      actor,
      branchId: branch.id,
      action: "BRANCH_CREATED",
      entityType: "Branch",
      entityId: branch.id,
      description: `Branch ${branch.code} created`,
      metadata: { code: branch.code, name: branch.name, status: branch.status },
    }, tx);

    cache.invalidatePrefix(BRANCH_CACHE_PREFIX);
    return branch;
  });
};

const getBranches = async ({ status } = {}) => {
  const cacheKey = `${BRANCH_CACHE_PREFIX}list:${status || "ALL"}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const where = {};

  if (status) {
    where.status = status;
  }

  const branches = await prisma.branch.findMany({
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  cache.set(cacheKey, branches, BRANCH_CACHE_TTL);
  return branches;
};

const getBranchById = async (id) => {
  const branch = await prisma.branch.findUnique({
    where: { id },
  });

  if (!branch) {
    throw new AppError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }

  return branch;
};

const updateBranch = async (id, payload, actor = null) => {
  const existingBranch = await getBranchById(id);

  const data = {};

  if (payload.code !== undefined) {
    const code = normalizeCode(payload.code);

    const existingBranch = await prisma.branch.findUnique({
      where: { code },
    });

    if (existingBranch && existingBranch.id !== id) {
      throw new AppError("Branch code already exists", 409, "BRANCH_CODE_EXISTS");
    }

    data.code = code;
  }

  if (payload.name !== undefined) {
    data.name = payload.name.trim();
  }

  if (payload.address !== undefined) {
    data.address = payload.address?.trim() || null;
  }

  if (payload.contactNo !== undefined) {
    data.contactNo = payload.contactNo?.trim() || null;
  }

  if (payload.status !== undefined) {
    data.status = payload.status;
  }

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.update({ where: { id }, data });

    await createAuditLog({
      actor,
      branchId: branch.id,
      action: "BRANCH_UPDATED",
      entityType: "Branch",
      entityId: branch.id,
      description: `Branch ${branch.code} updated`,
      metadata: {
        previous: {
          code: existingBranch.code,
          name: existingBranch.name,
          status: existingBranch.status,
        },
        current: { code: branch.code, name: branch.name, status: branch.status },
      },
    }, tx);

    cache.invalidatePrefix(BRANCH_CACHE_PREFIX);
    return branch;
  });
};

const deactivateBranch = async (id, actor = null) => {
  const existingBranch = await getBranchById(id);

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await createAuditLog({
      actor,
      branchId: branch.id,
      action: "BRANCH_DEACTIVATED",
      entityType: "Branch",
      entityId: branch.id,
      description: `Branch ${branch.code} deactivated`,
      metadata: { previousStatus: existingBranch.status, status: branch.status },
    }, tx);

    cache.invalidatePrefix(BRANCH_CACHE_PREFIX);
    return branch;
  });
};

module.exports = {
  createBranch,
  getBranches,
  getBranchById,
  updateBranch,
  deactivateBranch,
};
