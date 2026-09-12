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
  attributes: true,
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
      parentId: true,
      parent: {
        select: {
          id: true,
          categoryCode: true,
          name: true,
        },
      },
      attributeSchema: true,
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

  inventoryBatches: {
    where: {
      status: "ACTIVE",
    },
    select: {
      id: true,
      batchCode: true,
      quantityAvailable: true,
      status: true,
    },
  },

  createdAt: true,
  updatedAt: true,
};

const attachAvailableStock = (item) => {
  if (!item) return item;
  const quantityAvailable = Array.isArray(item.inventoryBatches)
    ? item.inventoryBatches.reduce(
        (sum, b) => sum + Number(b.quantityAvailable || 0),
        0
      )
    : 0;
  return { ...item, quantityAvailable };
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

const parseBooleanQuery = (value) => {
  if (value === undefined) {
    return undefined;
  }

  return value === "true";
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

const getBranchIdForList = (actor, requestedBranchId) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (actor.role === "SUPER_OWNER") {
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
      "You can only view items in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return actor.branchId;
};

const assertItemAccess = (item, actor) => {
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

  if (item.branchId !== actor.branchId) {
    throw new AppError(
      "You can only access items in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const PRICE_ADJUSTMENT_ROLES = new Set([
  "SUPER_OWNER",
  "ADMIN",
]);

const assertCanAdjustPrices = (actor) => {
  if (!actor || !PRICE_ADJUSTMENT_ROLES.has(actor.role)) {
    throw new AppError(
      "Only Main Admin and Admin are permitted to adjust item prices.",
      403,
      "PRICE_ADJUSTMENT_FORBIDDEN"
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
      parentId: true,
      attributeSchema: true,
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

const validateItemAttributes = (attributes, attributeSchema) => {
  if (!Array.isArray(attributeSchema) || attributeSchema.length === 0) {
    if (attributes && typeof attributes === "object" && !Array.isArray(attributes)) {
      return attributes;
    }
    return null;
  }

  const attrs = attributes && typeof attributes === "object" && !Array.isArray(attributes)
    ? attributes
    : {};

  const missing = [];

  for (const field of attributeSchema) {
    const fieldName = field.name;
    const value = attrs[fieldName];

    if (value === undefined || value === null || String(value).trim() === "") {
      missing.push(fieldName);
    }
  }

  if (missing.length > 0) {
    throw new AppError(
      `Please fill in all required specifications: ${missing.join(", ")}`,
      400,
      "SPECIFICATIONS_INCOMPLETE"
    );
  }

  const cleaned = {};
  for (const [key, val] of Object.entries(attrs)) {
    cleaned[key] = typeof val === "string" ? val.trim() : val;
  }
  return cleaned;
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

const assertCategoryBelongsToBranchId = (category, branchId) => {
  if (category.branchId !== branchId) {
    throw new AppError(
      "Item category does not belong to the selected branch",
      400,
      "CATEGORY_BRANCH_MISMATCH"
    );
  }
};

const generateItemCode = async (branch) => {
  const existingItems = await prisma.item.findMany({
    where: {
      branchId: branch.id,
    },
    select: {
      itemCode: true,
    },
  });

  let highestNumber = 0;

  for (const item of existingItems) {
    const raw = String(item.itemCode || "").trim();
    // Match pure digits or trailing digits from legacy formats (e.g. ITEM-...-0001)
    const match = raw.match(/\d+$/);
    if (match) {
      const num = Number.parseInt(match[0], 10);
      if (!Number.isNaN(num) && num > highestNumber) {
        highestNumber = num;
      }
    }
  }

  let nextNumber = highestNumber + 1;
  let itemCode = String(nextNumber).padStart(5, "0");

  // Collision check
  let exists = await prisma.item.findUnique({
    where: {
      branchId_itemCode: {
        branchId: branch.id,
        itemCode,
      },
    },
    select: {
      id: true,
    },
  });

  while (exists) {
    nextNumber += 1;
    itemCode = String(nextNumber).padStart(5, "0");
    exists = await prisma.item.findUnique({
      where: {
        branchId_itemCode: {
          branchId: branch.id,
          itemCode,
        },
      },
      select: {
        id: true,
      },
    });
  }

  return itemCode;
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

const assertItemCodeIsUniqueForUpdate = async (
  branchId,
  itemCode,
  currentItemId
) => {
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

  if (existingItem && existingItem.id !== currentItemId) {
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

  assertCategoryBelongsToBranchId(category, branch.id);

  const priceFields = ["costPrice", "price1", "price2", "price3", "price4", "price5"];
  const hasCustomPrices = priceFields.some(
    (field) => payload[field] !== undefined && Number(payload[field]) > 0
  );

  if (hasCustomPrices) {
    assertCanAdjustPrices(actor);
  }

  const itemCode = payload.itemCode
    ? payload.itemCode.trim().toUpperCase()
    : await generateItemCode(branch);

  await assertItemCodeIsUnique(branch.id, itemCode);

  const attributes = validateItemAttributes(payload.attributes, category.attributeSchema);

  return prisma.item.create({
    data: {
      itemCode,
      itemName: payload.itemName.trim(),
      description: normalizeOptionalString(payload.description),
      barcode: normalizeOptionalString(payload.barcode),
      brand: normalizeOptionalString(payload.brand),
      modelName: normalizeOptionalString(payload.modelName),
      status: "ACTIVE",
      attributes,
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

const listItems = async (filters = {}, actor) => {
  const page = Number.parseInt(filters.page || "1", 10);
  const limit = Number.parseInt(filters.limit || "20", 10);
  const safeLimit = Math.min(limit, 100);
  const skip = (page - 1) * safeLimit;

  const branchId = getBranchIdForList(actor, filters.branchId);
  const search = filters.search ? filters.search.trim() : null;

  let categoryCondition = filters.categoryId;
  if (filters.categoryId) {
    const childCategories = await prisma.itemCategory.findMany({
      where: { parentId: filters.categoryId },
      select: { id: true },
    });
    if (childCategories.length > 0) {
      categoryCondition = { in: [filters.categoryId, ...childCategories.map((c) => c.id)] };
    }
  }

  const where = {
    branchId,
    ...(filters.categoryId ? { categoryId: categoryCondition } : {}),
    ...(filters.brand && filters.brand.trim()
      ? { brand: { contains: filters.brand.trim(), mode: "insensitive" } }
      : {}),
    unitId: filters.unitId,
    status: filters.status,
    isSerialized: parseBooleanQuery(filters.isSerialized),
    hasWarranty: parseBooleanQuery(filters.hasWarranty),
  };

  if (search) {
    where.OR = [
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
        barcode: {
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
      {
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  const [items, totalItems] = await prisma.$transaction([
    prisma.item.findMany({
      where,
      select: ITEM_SELECT,
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
      skip,
      take: safeLimit,
    }),
    prisma.item.count({
      where,
    }),
  ]);

  const totalPages = Math.ceil(totalItems / safeLimit) || 1;

  return {
    items: items.map(attachAvailableStock),
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

const getItemById = async (itemId, actor) => {
  const item = await prisma.item.findUnique({
    where: {
      id: itemId,
    },
    select: ITEM_SELECT,
  });

  if (!item) {
    throw new AppError("Item not found", 404, "ITEM_NOT_FOUND");
  }

  assertItemAccess(item, actor);

  return attachAvailableStock(item);
};

const updateItemById = async (itemId, payload, actor) => {
  const existingItem = await prisma.item.findUnique({
    where: {
      id: itemId,
    },
    select: ITEM_SELECT,
  });

  if (!existingItem) {
    throw new AppError("Item not found", 404, "ITEM_NOT_FOUND");
  }

  assertItemAccess(existingItem, actor);

  const priceFields = ["costPrice", "price1", "price2", "price3", "price4", "price5"];
  const isAdjustingPrices = priceFields.some(
    (field) =>
      payload[field] !== undefined &&
      Number(payload[field]) !== Number(existingItem[field] ?? 0)
  );

  if (isAdjustingPrices) {
    assertCanAdjustPrices(actor);
  }

  const updateData = {
    updatedById: actor.id,
  };

  if (payload.itemCode !== undefined) {
    const itemCode = payload.itemCode.trim().toUpperCase();

    await assertItemCodeIsUniqueForUpdate(
      existingItem.branchId,
      itemCode,
      existingItem.id
    );

    updateData.itemCode = itemCode;
  }

  if (payload.itemName !== undefined) {
    updateData.itemName = payload.itemName.trim();
  }

  if (payload.description !== undefined) {
    updateData.description = normalizeOptionalString(payload.description);
  }

  if (payload.barcode !== undefined) {
    updateData.barcode = normalizeOptionalString(payload.barcode);
  }

  if (payload.brand !== undefined) {
    updateData.brand = normalizeOptionalString(payload.brand);
  }

  if (payload.modelName !== undefined) {
    updateData.modelName = normalizeOptionalString(payload.modelName);
  }

  if (payload.status !== undefined) {
    updateData.status = payload.status;
  }

  if (payload.isSerialized !== undefined) {
    updateData.isSerialized = Boolean(payload.isSerialized);
  }

  if (payload.hasWarranty !== undefined) {
    updateData.hasWarranty = Boolean(payload.hasWarranty);
  }

  let targetCategory = null;
  if (payload.categoryId !== undefined) {
    targetCategory = await getActiveCategoryOrThrow(payload.categoryId);

    assertCategoryBelongsToBranchId(targetCategory, existingItem.branchId);

    updateData.categoryId = targetCategory.id;
  }

  if (payload.attributes !== undefined || targetCategory) {
    const effectiveCategory = targetCategory || (await getActiveCategoryOrThrow(existingItem.categoryId));
    if (payload.attributes !== undefined) {
      updateData.attributes = validateItemAttributes(payload.attributes, effectiveCategory.attributeSchema);
    } else if (targetCategory && Array.isArray(effectiveCategory.attributeSchema) && effectiveCategory.attributeSchema.length > 0) {
      updateData.attributes = validateItemAttributes(existingItem.attributes, effectiveCategory.attributeSchema);
    }
  }

  if (payload.unitId !== undefined) {
    const unit = await getActiveUnitOrThrow(payload.unitId);

    updateData.unitId = unit.id;
  }

  if (payload.costPrice !== undefined) {
    updateData.costPrice = normalizeMoney(payload.costPrice);
  }

  if (payload.price1 !== undefined) {
    updateData.price1 = normalizeMoney(payload.price1);
  }

  if (payload.price2 !== undefined) {
    updateData.price2 = normalizeMoney(payload.price2);
  }

  if (payload.price3 !== undefined) {
    updateData.price3 = normalizeMoney(payload.price3);
  }

  if (payload.price4 !== undefined) {
    updateData.price4 = normalizeMoney(payload.price4);
  }

  if (payload.price5 !== undefined) {
    updateData.price5 = normalizeMoney(payload.price5);
  }

  if (payload.minimumStock !== undefined) {
    updateData.minimumStock = normalizeMoney(payload.minimumStock);
  }

  if (payload.reorderLevel !== undefined) {
    updateData.reorderLevel = normalizeMoney(payload.reorderLevel);
  }

  return prisma.item.update({
    where: {
      id: existingItem.id,
    },
    data: updateData,
    select: ITEM_SELECT,
  });
};

module.exports = {
  ITEM_SELECT,
  createItem,
  listItems,
  getItemById,
  updateItemById,
};
