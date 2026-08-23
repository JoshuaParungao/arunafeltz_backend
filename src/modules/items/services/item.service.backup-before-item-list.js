const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

const ITEM_SELECT = {
  id: true,
  itemCode: true,
  itemName: true,
  description: true,
  barcode: true,
  brand: true,
  modelName: true,
  status: true,
  isSerialized: true,
  hasWarranty: true,
  costPrice: true,
  price1: true,
  price2: true,
  price3: true,
  price4: true,
  price5: true,
  minimumStock: true,
  reorderLevel: true,

  branchId: true,
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },

  categoryId: true,
  category: {
    select: {
      id: true,
      categoryCode: true,
      name: true,
      status: true,
      branchId: true,
    },
  },

  unitId: true,
  unit: {
    select: {
      id: true,
      unitCode: true,
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

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : null;
};

const normalizeMoney = (value) => {
  if (value === undefined || value === null || value === "") {
    return "0.00";
  }

  return Number(value).toFixed(2);
};

const getActorBranchIdForCreate = (actor, requestedBranchId) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (actor.role === "SUPER_OWNER") {
    if (!requestedBranchId) {
      throw new AppError(
        "Branch ID is required for Super Owner item creation",
        400,
        "BRANCH_ID_REQUIRED"
      );
    }

    return requestedBranchId;
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
      "You can only create items in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return actor.branchId;
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

const getActiveCategoryOrThrow = async (categoryId) => {
  const category = await prisma.itemCategory.findUnique({
    where: {
      id: categoryId,
    },
    select: {
      id: true,
      categoryCode: true,
      name: true,
      status: true,
      branchId: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  if (!category) {
    throw new AppError("Item category not found", 404, "CATEGORY_NOT_FOUND");
  }

  if (category.status !== "ACTIVE") {
    throw new AppError(
      "Item category is not active",
      400,
      "CATEGORY_NOT_ACTIVE"
    );
  }

  return category;
};

const getActiveUnitOrThrow = async (unitId) => {
  const unit = await prisma.unit.findUnique({
    where: {
      id: unitId,
    },
    select: {
      id: true,
      unitCode: true,
      name: true,
      status: true,
    },
  });

  if (!unit) {
    throw new AppError("Unit not found", 404, "UNIT_NOT_FOUND");
  }

  if (unit.status !== "ACTIVE") {
    throw new AppError("Unit is not active", 400, "UNIT_NOT_ACTIVE");
  }

  return unit;
};

const assertCategoryBelongsToBranch = (category, branch) => {
  if (category.branchId !== branch.id) {
    throw new AppError(
      "Item category does not belong to the selected branch",
      400,
      "CATEGORY_BRANCH_MISMATCH"
    );
  }
};

const generateItemCode = async (branch) => {
  const prefix = `ITEM-${branch.code}-API-`;

  const existingItems = await prisma.item.findMany({
    where: {
      branchId: branch.id,
      itemCode: {
        startsWith: prefix,
      },
    },
    select: {
      itemCode: true,
    },
  });

  let highestNumber = 0;

  for (const item of existingItems) {
    const suffix = item.itemCode.replace(prefix, "");
    const parsedNumber = Number.parseInt(suffix, 10);

    if (!Number.isNaN(parsedNumber) && parsedNumber > highestNumber) {
      highestNumber = parsedNumber;
    }
  }

  const nextNumber = highestNumber + 1;

  return `${prefix}${String(nextNumber).padStart(3, "0")}`;
};

const assertItemCodeIsUnique = async (branchId, itemCode) => {
  const existingItem = await prisma.item.findUnique({
    where: {
      branchId_itemCode: {
        branchId,
        itemCode,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingItem) {
    throw new AppError(
      "Item code already exists in this branch",
      409,
      "ITEM_CODE_ALREADY_EXISTS"
    );
  }
};

const createItem = async (payload, actor) => {
  const branchId = getActorBranchIdForCreate(actor, payload.branchId);
  const branch = await getActiveBranchOrThrow(branchId);
  const category = await getActiveCategoryOrThrow(payload.categoryId);
  const unit = await getActiveUnitOrThrow(payload.unitId);

  assertCategoryBelongsToBranch(category, branch);

  const itemCode = payload.itemCode
    ? payload.itemCode.trim().toUpperCase()
    : await generateItemCode(branch);

  await assertItemCodeIsUnique(branch.id, itemCode);

  return prisma.item.create({
    data: {
      itemCode,
      itemName: payload.itemName.trim(),
      description: normalizeOptionalString(payload.description),
      barcode: normalizeOptionalString(payload.barcode),
      brand: normalizeOptionalString(payload.brand),
      modelName: normalizeOptionalString(payload.modelName),
      status: "ACTIVE",
      isSerialized: Boolean(payload.isSerialized),
      hasWarranty: Boolean(payload.hasWarranty),

      costPrice: normalizeMoney(payload.costPrice),
      price1: normalizeMoney(payload.price1),
      price2: normalizeMoney(payload.price2),
      price3: normalizeMoney(payload.price3),
      price4: normalizeMoney(payload.price4),
      price5: normalizeMoney(payload.price5),

      minimumStock: normalizeMoney(payload.minimumStock),
      reorderLevel: normalizeMoney(payload.reorderLevel),

      branchId: branch.id,
      categoryId: category.id,
      unitId: unit.id,

      createdById: actor.id,
      updatedById: actor.id,
    },
    select: ITEM_SELECT,
  });
};

module.exports = {
  ITEM_SELECT,
  createItem,
};
