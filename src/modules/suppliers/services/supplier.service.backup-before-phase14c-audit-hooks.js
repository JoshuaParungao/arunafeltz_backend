const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

const SUPPLIER_SELECT = {
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
  branchId: true,
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
  createdById: true,
  createdBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  updatedById: true,
  updatedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  createdAt: true,
  updatedAt: true,
};

const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : null;
};

const assertManageSupplierRole = (actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (!OWNER_ADMIN_ROLES.has(actor.role)) {
    throw new AppError(
      "You are not allowed to manage suppliers",
      403,
      "SUPPLIER_MANAGE_FORBIDDEN"
    );
  }
};

const getActiveBranchOrThrow = async (branchId) => {
  const branch = await prisma.branch.findUnique({
    where: {
      id: branchId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  if (!branch) {
    throw new AppError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }

  if (branch.status !== "ACTIVE") {
    throw new AppError("Branch is not active", 400, "BRANCH_NOT_ACTIVE");
  }

  return branch;
};

const getBranchForCreate = async (actor, requestedBranchId) => {
  assertManageSupplierRole(actor);

  if (actor.role === "SUPER_OWNER") {
    if (!requestedBranchId) {
      return null;
    }

    return getActiveBranchOrThrow(requestedBranchId);
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
      "You can only create suppliers in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return getActiveBranchOrThrow(actor.branchId);
};

const getSupplierAccessWhere = (actor, requestedBranchId) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (actor.role === "SUPER_OWNER") {
    if (requestedBranchId) {
      return {
        OR: [
          {
            branchId: requestedBranchId,
          },
          {
            branchId: null,
          },
        ],
      };
    }

    return {};
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
      "You can only view suppliers in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return {
    OR: [
      {
        branchId: actor.branchId,
      },
      {
        branchId: null,
      },
    ],
  };
};

const assertSupplierViewAccess = (supplier, actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (actor.role === "SUPER_OWNER") {
    return;
  }

  if (!actor.branchId) {
    throw new AppError(
      "User is not assigned to a branch",
      400,
      "USER_BRANCH_REQUIRED"
    );
  }

  if (supplier.branchId && supplier.branchId !== actor.branchId) {
    throw new AppError(
      "You can only access suppliers in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const assertSupplierManageAccess = (supplier, actor) => {
  assertManageSupplierRole(actor);

  if (actor.role === "SUPER_OWNER") {
    return;
  }

  if (!actor.branchId) {
    throw new AppError(
      "User is not assigned to a branch",
      400,
      "USER_BRANCH_REQUIRED"
    );
  }

  if (!supplier.branchId || supplier.branchId !== actor.branchId) {
    throw new AppError(
      "You can only manage suppliers in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const generateSupplierCode = async (branch) => {
  const prefix = branch ? `SUP-${branch.code}-` : "SUP-GLOBAL-";

  const existingSuppliers = await prisma.supplier.findMany({
    where: {
      branchId: branch ? branch.id : null,
      supplierCode: {
        startsWith: prefix,
      },
    },
    select: {
      supplierCode: true,
    },
  });

  let highestNumber = 0;

  for (const supplier of existingSuppliers) {
    const suffix = supplier.supplierCode.replace(prefix, "");
    const parsedNumber = Number.parseInt(suffix, 10);

    if (!Number.isNaN(parsedNumber) && parsedNumber > highestNumber) {
      highestNumber = parsedNumber;
    }
  }

  return `${prefix}${String(highestNumber + 1).padStart(3, "0")}`;
};

const assertSupplierCodeIsUnique = async (branchId, supplierCode, currentSupplierId = null) => {
  const existingSupplier = await prisma.supplier.findFirst({
    where: {
      branchId,
      supplierCode,
    },
    select: {
      id: true,
    },
  });

  if (existingSupplier && existingSupplier.id !== currentSupplierId) {
    throw new AppError(
      "Supplier code already exists in this supplier scope",
      409,
      "SUPPLIER_CODE_ALREADY_EXISTS"
    );
  }
};

const createSupplier = async (payload, actor) => {
  const branch = await getBranchForCreate(actor, payload.branchId);
  const branchId = branch ? branch.id : null;

  const supplierCode = payload.supplierCode
    ? payload.supplierCode.trim().toUpperCase()
    : await generateSupplierCode(branch);

  await assertSupplierCodeIsUnique(branchId, supplierCode);

  return prisma.supplier.create({
    data: {
      supplierCode,
      name: payload.name.trim(),
      contactPerson: normalizeOptionalString(payload.contactPerson),
      contactNo: normalizeOptionalString(payload.contactNo),
      email: normalizeOptionalString(payload.email),
      address: normalizeOptionalString(payload.address),
      tin: normalizeOptionalString(payload.tin),
      notes: normalizeOptionalString(payload.notes),
      status: "ACTIVE",
      branchId,
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: SUPPLIER_SELECT,
  });
};

const listSuppliers = async (filters = {}, actor) => {
  const page = Number.parseInt(filters.page || "1", 10);
  const limit = Number.parseInt(filters.limit || "20", 10);
  const safeLimit = Math.min(limit, 100);
  const skip = (page - 1) * safeLimit;

  const search = filters.search ? filters.search.trim() : null;

  const where = {
    ...getSupplierAccessWhere(actor, filters.branchId),
    status: filters.status,
  };

  if (search) {
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          {
            supplierCode: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            contactPerson: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            contactNo: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            email: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            tin: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      },
    ];
  }

  const [items, totalItems] = await prisma.$transaction([
    prisma.supplier.findMany({
      where,
      select: SUPPLIER_SELECT,
      orderBy: [
        {
          branch: {
            code: "asc",
          },
        },
        {
          supplierCode: "asc",
        },
      ],
      skip,
      take: safeLimit,
    }),
    prisma.supplier.count({
      where,
    }),
  ]);

  const totalPages = Math.ceil(totalItems / safeLimit) || 1;

  return {
    items,
    pagination: {
      page,
      limit: safeLimit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const getSupplierById = async (supplierId, actor) => {
  const supplier = await prisma.supplier.findUnique({
    where: {
      id: supplierId,
    },
    select: SUPPLIER_SELECT,
  });

  if (!supplier) {
    throw new AppError("Supplier not found", 404, "SUPPLIER_NOT_FOUND");
  }

  assertSupplierViewAccess(supplier, actor);

  return supplier;
};

const updateSupplierById = async (supplierId, payload, actor) => {
  const existingSupplier = await prisma.supplier.findUnique({
    where: {
      id: supplierId,
    },
    select: SUPPLIER_SELECT,
  });

  if (!existingSupplier) {
    throw new AppError("Supplier not found", 404, "SUPPLIER_NOT_FOUND");
  }

  assertSupplierManageAccess(existingSupplier, actor);

  const updateData = {
    updatedById: actor.id,
  };

  if (payload.supplierCode !== undefined) {
    const supplierCode = payload.supplierCode.trim().toUpperCase();

    await assertSupplierCodeIsUnique(
      existingSupplier.branchId,
      supplierCode,
      existingSupplier.id
    );

    updateData.supplierCode = supplierCode;
  }

  if (payload.name !== undefined) {
    updateData.name = payload.name.trim();
  }

  if (payload.contactPerson !== undefined) {
    updateData.contactPerson = normalizeOptionalString(payload.contactPerson);
  }

  if (payload.contactNo !== undefined) {
    updateData.contactNo = normalizeOptionalString(payload.contactNo);
  }

  if (payload.email !== undefined) {
    updateData.email = normalizeOptionalString(payload.email);
  }

  if (payload.address !== undefined) {
    updateData.address = normalizeOptionalString(payload.address);
  }

  if (payload.tin !== undefined) {
    updateData.tin = normalizeOptionalString(payload.tin);
  }

  if (payload.notes !== undefined) {
    updateData.notes = normalizeOptionalString(payload.notes);
  }

  return prisma.supplier.update({
    where: {
      id: existingSupplier.id,
    },
    data: updateData,
    select: SUPPLIER_SELECT,
  });
};

const updateSupplierStatusById = async (supplierId, status, actor) => {
  const existingSupplier = await prisma.supplier.findUnique({
    where: {
      id: supplierId,
    },
    select: SUPPLIER_SELECT,
  });

  if (!existingSupplier) {
    throw new AppError("Supplier not found", 404, "SUPPLIER_NOT_FOUND");
  }

  assertSupplierManageAccess(existingSupplier, actor);

  return prisma.supplier.update({
    where: {
      id: existingSupplier.id,
    },
    data: {
      status,
      updatedById: actor.id,
    },
    select: SUPPLIER_SELECT,
  });
};

module.exports = {
  SUPPLIER_SELECT,
  createSupplier,
  listSuppliers,
  getSupplierById,
  updateSupplierById,
  updateSupplierStatusById,
};
