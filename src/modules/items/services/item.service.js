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
  return {
    ...item,
    quantityAvailable,
    totalStock: quantityAvailable,
    stockQuantity: quantityAvailable,
  };
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

const assertCanAdjustPrices = (actor) => {
  if (!actor) {
    throw new AppError(
      "Authentication required to adjust item prices.",
      401,
      "PRICE_ADJUSTMENT_UNAUTHORIZED"
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

const validateItemAttributes = (attributes) => {
  if (attributes && typeof attributes === "object" && !Array.isArray(attributes)) {
    const cleaned = {};
    for (const [key, val] of Object.entries(attributes)) {
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        cleaned[key] = typeof val === "string" ? val.trim() : val;
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  }
  return null;
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

  const attributes = validateItemAttributes(payload.attributes);

  const createdItem = await prisma.item.create({
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

  // Auto-propagate item across other active branches with 0 stock
  try {
    const otherBranches = await prisma.branch.findMany({
      where: {
        id: { not: branch.id },
        status: "ACTIVE",
      },
      select: { id: true, code: true, name: true },
    });

    for (const targetBranch of otherBranches) {
      const existingInTarget = await prisma.item.findUnique({
        where: {
          branchId_itemCode: {
            branchId: targetBranch.id,
            itemCode: createdItem.itemCode,
          },
        },
        select: { id: true },
      });

      if (!existingInTarget) {
        let targetCategoryId = null;

        let matchedCat = await prisma.itemCategory.findFirst({
          where: {
            branchId: targetBranch.id,
            OR: [
              { categoryCode: category.categoryCode },
              { name: { equals: category.name, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });

        if (!matchedCat && category.parentId) {
          const parentCat = await prisma.itemCategory.findUnique({
            where: { id: category.parentId },
            select: { id: true, categoryCode: true, name: true, description: true },
          });

          if (parentCat) {
            let targetParentCat = await prisma.itemCategory.findFirst({
              where: {
                branchId: targetBranch.id,
                OR: [
                  { categoryCode: parentCat.categoryCode },
                  { name: { equals: parentCat.name, mode: "insensitive" } },
                ],
              },
              select: { id: true },
            });

            if (!targetParentCat) {
              targetParentCat = await prisma.itemCategory.create({
                data: {
                  branchId: targetBranch.id,
                  categoryCode: parentCat.categoryCode,
                  name: parentCat.name,
                  description: parentCat.description,
                  status: "ACTIVE",
                  createdById: actor.id,
                  updatedById: actor.id,
                },
                select: { id: true },
              });
            }

            matchedCat = await prisma.itemCategory.create({
              data: {
                branchId: targetBranch.id,
                categoryCode: category.categoryCode,
                name: category.name,
                description: category.description,
                parentId: targetParentCat.id,
                status: "ACTIVE",
                createdById: actor.id,
                updatedById: actor.id,
              },
              select: { id: true },
            });
          }
        } else if (!matchedCat) {
          matchedCat = await prisma.itemCategory.create({
            data: {
              branchId: targetBranch.id,
              categoryCode: category.categoryCode,
              name: category.name,
              description: category.description,
              status: "ACTIVE",
              createdById: actor.id,
              updatedById: actor.id,
            },
            select: { id: true },
          });
        }

        targetCategoryId = matchedCat ? matchedCat.id : category.id;

        await prisma.item.create({
          data: {
            itemCode: createdItem.itemCode,
            itemName: createdItem.itemName,
            description: createdItem.description,
            barcode: createdItem.barcode,
            brand: createdItem.brand,
            modelName: createdItem.modelName,
            status: "ACTIVE",
            attributes: createdItem.attributes,
            isSerialized: createdItem.isSerialized,
            hasWarranty: createdItem.hasWarranty,
            costPrice: createdItem.costPrice,
            price1: createdItem.price1,
            price2: createdItem.price2,
            price3: createdItem.price3,
            price4: createdItem.price4,
            price5: createdItem.price5,
            minimumStock: "0.00",
            reorderLevel: "0.00",
            branchId: targetBranch.id,
            categoryId: targetCategoryId,
            unitId: createdItem.unitId,
            createdById: actor.id,
            updatedById: actor.id,
          },
        });
      }
    }
  } catch (propagateErr) {
    console.error("Auto-propagation to other branches non-fatal error:", propagateErr);
  }

  return createdItem;
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

  if (payload.attributes !== undefined) {
    updateData.attributes = validateItemAttributes(payload.attributes);
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
