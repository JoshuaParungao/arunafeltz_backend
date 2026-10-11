const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

const ITEM_CATEGORY_SELECT = {
  id: true,
  categoryCode: true,
  name: true,
  description: true,
  status: true,
  parentId: true,
  parent: {
    select: {
      id: true,
      categoryCode: true,
      name: true,
    },
  },
  attributeSchema: true,
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

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : null;
};

const getActorBranchIdForCreate = (actor, requestedBranchId) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (actor.role === "SUPER_OWNER") {
    if (!requestedBranchId) {
      throw new AppError(
        "Branch ID is required for Super Owner category creation",
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
      "You can only create categories in your assigned branch",
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
      "You can only view categories in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return actor.branchId;
};

const assertCategoryAccess = (category, actor) => {
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

  if (category.branchId !== actor.branchId) {
    throw new AppError(
      "You can only access categories in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
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

const generateCategoryCode = async (branch) => {
  const prefix = `CAT-${branch.code}-`;

  const existingCategories = await prisma.itemCategory.findMany({
    where: {
      branchId: branch.id,
      categoryCode: {
        startsWith: prefix,
      },
    },
    select: {
      categoryCode: true,
    },
  });

  let highestNumber = 0;

  for (const category of existingCategories) {
    const suffix = category.categoryCode.replace(prefix, "");
    const parsedNumber = Number.parseInt(suffix, 10);

    if (!Number.isNaN(parsedNumber) && parsedNumber > highestNumber) {
      highestNumber = parsedNumber;
    }
  }

  const nextNumber = highestNumber + 1;

  return `${prefix}${String(nextNumber).padStart(3, "0")}`;
};

const assertCategoryCodeIsUnique = async (branchId, categoryCode) => {
  const existingCategory = await prisma.itemCategory.findUnique({
    where: {
      branchId_categoryCode: {
        branchId,
        categoryCode,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingCategory) {
    throw new AppError(
      "Category code already exists in this branch",
      409,
      "CATEGORY_CODE_ALREADY_EXISTS"
    );
  }
};

const assertCategoryCodeIsUniqueForUpdate = async (
  branchId,
  categoryCode,
  currentCategoryId
) => {
  const existingCategory = await prisma.itemCategory.findUnique({
    where: {
      branchId_categoryCode: {
        branchId,
        categoryCode,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingCategory && existingCategory.id !== currentCategoryId) {
    throw new AppError(
      "Category code already exists in this branch",
      409,
      "CATEGORY_CODE_ALREADY_EXISTS"
    );
  }
};

const assertCategoryNameIsUnique = async (branchId, name) => {
  const existingCategory = await prisma.itemCategory.findUnique({
    where: {
      branchId_name: {
        branchId,
        name,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingCategory) {
    throw new AppError(
      "Category name already exists in this branch",
      409,
      "CATEGORY_NAME_ALREADY_EXISTS"
    );
  }
};

const assertCategoryNameIsUniqueForUpdate = async (
  branchId,
  name,
  currentCategoryId
) => {
  const existingCategory = await prisma.itemCategory.findUnique({
    where: {
      branchId_name: {
        branchId,
        name,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingCategory && existingCategory.id !== currentCategoryId) {
    throw new AppError(
      "Category name already exists in this branch",
      409,
      "CATEGORY_NAME_ALREADY_EXISTS"
    );
  }
};

const createItemCategory = async (payload, actor) => {
  const branchId = getActorBranchIdForCreate(actor, payload.branchId);
  const branch = await getActiveBranchOrThrow(branchId);

  let parentId = null;
  if (payload.parentId) {
    const parentCategory = await prisma.itemCategory.findUnique({
      where: { id: payload.parentId },
      select: { id: true, branchId: true, status: true },
    });
    if (!parentCategory || parentCategory.branchId !== branch.id) {
      throw new AppError("Parent category not found in this branch", 404, "PARENT_CATEGORY_NOT_FOUND");
    }
    parentId = parentCategory.id;
  }

  const categoryCode = payload.categoryCode
    ? payload.categoryCode.trim().toUpperCase()
    : await generateCategoryCode(branch);

  const name = payload.name.trim();

  await assertCategoryCodeIsUnique(branch.id, categoryCode);
  await assertCategoryNameIsUnique(branch.id, name);

  const createdCategory = await prisma.itemCategory.create({
    data: {
      categoryCode,
      name,
      description: normalizeOptionalString(payload.description),
      status: "ACTIVE",
      branchId: branch.id,
      parentId,
      attributeSchema: payload.attributeSchema !== undefined ? payload.attributeSchema : null,
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: ITEM_CATEGORY_SELECT,
  });

  // Automatically sync to all other active branches so catalog categories match everywhere
  await syncCategoriesAcrossBranches(actor);

  return createdCategory;
};

const syncCategoriesAcrossBranches = async (actor) => {
  try {
    const activeBranches = await prisma.branch.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });

    if (activeBranches.length <= 1) return { syncedCount: 0 };

    // Fetch all existing categories across all active branches
    const allCategories = await prisma.itemCategory.findMany({
      where: {
        branchId: { in: activeBranches.map((b) => b.id) },
      },
      select: {
        id: true,
        categoryCode: true,
        name: true,
        description: true,
        status: true,
        parentId: true,
        attributeSchema: true,
        branchId: true,
        parent: {
          select: {
            id: true,
            name: true,
            categoryCode: true,
          },
        },
      },
      orderBy: [{ parentId: "asc" }, { createdAt: "asc" }],
    });

    if (allCategories.length === 0) return { syncedCount: 0 };

    let createdCount = 0;

    // Step 1: Sync Root/Main Categories (parentId is null)
    const rootCategories = allCategories.filter((c) => !c.parentId);
    const distinctRootNames = new Map();
    for (const c of rootCategories) {
      const key = c.name.trim().toLowerCase();
      if (!distinctRootNames.has(key)) {
        distinctRootNames.set(key, c);
      }
    }

    for (const targetBranch of activeBranches) {
      const existingInBranch = allCategories.filter((c) => c.branchId === targetBranch.id);
      const existingNameSet = new Set(existingInBranch.map((c) => c.name.trim().toLowerCase()));

      for (const [key, sourceCat] of distinctRootNames.entries()) {
        if (!existingNameSet.has(key)) {
          const categoryCode = await generateCategoryCode(targetBranch);
          const created = await prisma.itemCategory.create({
            data: {
              categoryCode,
              name: sourceCat.name.trim(),
              description: sourceCat.description,
              status: sourceCat.status || "ACTIVE",
              branchId: targetBranch.id,
              parentId: null,
              attributeSchema: sourceCat.attributeSchema,
              createdById: actor?.id || null,
              updatedById: actor?.id || null,
            },
            select: { id: true, name: true, branchId: true },
          });
          existingInBranch.push(created);
          allCategories.push(created);
          existingNameSet.add(key);
          createdCount++;
        }
      }
    }

    // Step 2: Sync Subcategories (parentId is not null)
    const currentAllCats = await prisma.itemCategory.findMany({
      where: {
        branchId: { in: activeBranches.map((b) => b.id) },
      },
      select: {
        id: true,
        categoryCode: true,
        name: true,
        description: true,
        status: true,
        parentId: true,
        attributeSchema: true,
        branchId: true,
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const subcategories = currentAllCats.filter((c) => c.parentId && c.parent);
    const distinctSubcats = new Map();
    for (const sc of subcategories) {
      const compositeKey = `${sc.parent.name.trim().toLowerCase()}:::${sc.name.trim().toLowerCase()}`;
      if (!distinctSubcats.has(compositeKey)) {
        distinctSubcats.set(compositeKey, sc);
      }
    }

    for (const targetBranch of activeBranches) {
      const branchCats = currentAllCats.filter((c) => c.branchId === targetBranch.id);
      const branchCatByName = new Map(branchCats.map((c) => [c.name.trim().toLowerCase(), c]));

      for (const [compositeKey, sourceSubcat] of distinctSubcats.entries()) {
        const parentNameLower = sourceSubcat.parent.name.trim().toLowerCase();
        const subcatNameLower = sourceSubcat.name.trim().toLowerCase();

        const targetParent = branchCatByName.get(parentNameLower);
        const targetSubcat = branchCatByName.get(subcatNameLower);

        if (targetParent && !targetSubcat) {
          const categoryCode = await generateCategoryCode(targetBranch);
          const created = await prisma.itemCategory.create({
            data: {
              categoryCode,
              name: sourceSubcat.name.trim(),
              description: sourceSubcat.description,
              status: sourceSubcat.status || "ACTIVE",
              branchId: targetBranch.id,
              parentId: targetParent.id,
              attributeSchema: sourceSubcat.attributeSchema,
              createdById: actor?.id || null,
              updatedById: actor?.id || null,
            },
            select: { id: true, name: true, branchId: true },
          });
          branchCats.push(created);
          branchCatByName.set(subcatNameLower, created);
          createdCount++;
        } else if (targetParent && targetSubcat && !targetSubcat.parentId) {
          await prisma.itemCategory.update({
            where: { id: targetSubcat.id },
            data: { parentId: targetParent.id },
          });
        }
      }
    }

    return { success: true, createdCount };
  } catch (err) {
    console.error("Failed to sync categories across branches:", err);
    return { success: false, error: err.message };
  }
};

const listItemCategories = async (filters = {}, actor) => {
  const page = Number.parseInt(filters.page || "1", 10);
  const limit = Number.parseInt(filters.limit || "20", 10);
  const safeLimit = Math.min(limit, 100);
  const skip = (page - 1) * safeLimit;

  const branchId = getBranchIdForList(actor, filters.branchId);
  const search = filters.search ? filters.search.trim() : null;

  const where = {
    branchId,
    status: filters.status,
  };

  if (filters.parentId !== undefined) {
    if (filters.parentId === "null" || filters.parentId === "" || filters.parentId === null) {
      where.parentId = null;
    } else {
      where.parentId = filters.parentId;
    }
  }

  if (search) {
    where.OR = [
      {
        categoryCode: {
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
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  const [items, totalItems] = await prisma.$transaction([
    prisma.itemCategory.findMany({
      where,
      select: ITEM_CATEGORY_SELECT,
      orderBy: [
        {
          branch: {
            code: "asc",
          },
        },
        {
          categoryCode: "asc",
        },
      ],
      skip,
      take: safeLimit,
    }),
    prisma.itemCategory.count({
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

const getItemCategoryById = async (categoryId, actor) => {
  const category = await prisma.itemCategory.findUnique({
    where: {
      id: categoryId,
    },
    select: ITEM_CATEGORY_SELECT,
  });

  if (!category) {
    throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
  }

  assertCategoryAccess(category, actor);

  return category;
};

const updateItemCategoryById = async (categoryId, payload, actor) => {
  const existingCategory = await prisma.itemCategory.findUnique({
    where: {
      id: categoryId,
    },
    select: ITEM_CATEGORY_SELECT,
  });

  if (!existingCategory) {
    throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
  }

  assertCategoryAccess(existingCategory, actor);

  const updateData = {
    updatedById: actor.id,
  };

  if (payload.categoryCode !== undefined) {
    const categoryCode = payload.categoryCode.trim().toUpperCase();

    await assertCategoryCodeIsUniqueForUpdate(
      existingCategory.branchId,
      categoryCode,
      existingCategory.id
    );

    updateData.categoryCode = categoryCode;
  }

  if (payload.name !== undefined) {
    const name = payload.name.trim();

    await assertCategoryNameIsUniqueForUpdate(
      existingCategory.branchId,
      name,
      existingCategory.id
    );

    updateData.name = name;
  }

  if (payload.description !== undefined) {
    updateData.description = normalizeOptionalString(payload.description);
  }

  if (payload.parentId !== undefined) {
    if (payload.parentId === null || payload.parentId === "") {
      updateData.parentId = null;
    } else {
      if (payload.parentId === existingCategory.id) {
        throw new AppError("A category cannot be its own parent", 400, "INVALID_PARENT_CATEGORY");
      }
      const parentCategory = await prisma.itemCategory.findUnique({
        where: { id: payload.parentId },
        select: { id: true, branchId: true, parentId: true },
      });
      if (!parentCategory || parentCategory.branchId !== existingCategory.branchId) {
        throw new AppError("Parent category not found in this branch", 404, "PARENT_CATEGORY_NOT_FOUND");
      }
      if (parentCategory.parentId === existingCategory.id) {
        throw new AppError("Circular category hierarchy is not allowed", 400, "CIRCULAR_CATEGORY_HIERARCHY");
      }
      updateData.parentId = parentCategory.id;
    }
  }

  if (payload.attributeSchema !== undefined) {
    updateData.attributeSchema = payload.attributeSchema;
  }

  if (payload.status !== undefined) {
    updateData.status = payload.status;
  }

  const updatedCategory = await prisma.itemCategory.update({
    where: {
      id: existingCategory.id,
    },
    data: updateData,
    select: ITEM_CATEGORY_SELECT,
  });

  // Sync category updates to matching categories in other active branches
  try {
    const matchingInOtherBranches = await prisma.itemCategory.findMany({
      where: {
        id: { not: existingCategory.id },
        OR: [
          { name: { equals: existingCategory.name, mode: "insensitive" } },
          { categoryCode: existingCategory.categoryCode },
        ],
      },
      select: { id: true, branchId: true },
    });

    for (const otherCat of matchingInOtherBranches) {
      const otherUpdateData = {
        updatedById: actor.id,
      };
      if (updateData.name) otherUpdateData.name = updateData.name;
      if (updateData.description !== undefined) otherUpdateData.description = updateData.description;
      if (updateData.status) otherUpdateData.status = updateData.status;
      if (updateData.attributeSchema !== undefined) otherUpdateData.attributeSchema = updateData.attributeSchema;

      if (updateData.parentId !== undefined) {
        if (!updateData.parentId) {
          otherUpdateData.parentId = null;
        } else {
          const newParent = await prisma.itemCategory.findUnique({
            where: { id: updateData.parentId },
            select: { name: true },
          });
          if (newParent) {
            const targetParent = await prisma.itemCategory.findFirst({
              where: {
                branchId: otherCat.branchId,
                name: { equals: newParent.name, mode: "insensitive" },
              },
              select: { id: true },
            });
            if (targetParent) {
              otherUpdateData.parentId = targetParent.id;
            }
          }
        }
      }

      await prisma.itemCategory.update({
        where: { id: otherCat.id },
        data: otherUpdateData,
      });
    }
  } catch (syncUpdErr) {
    console.error("Failed to sync category update across branches:", syncUpdErr);
  }

  return updatedCategory;
};

const deleteItemCategoryById = async (categoryId, actor) => {
  const existingCategory = await getItemCategoryById(categoryId, actor);
  if (!existingCategory) {
    throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
  }

  const itemsCount = await prisma.item.count({
    where: { categoryId: existingCategory.id },
  });
  if (itemsCount > 0) {
    throw new AppError(
      "Cannot delete category with items assigned to it. Please reassign or delete items first.",
      400,
      "CATEGORY_HAS_ITEMS"
    );
  }

  // Unlink any child categories
  await prisma.itemCategory.updateMany({
    where: { parentId: existingCategory.id },
    data: { parentId: null },
  });

  await prisma.itemCategory.delete({
    where: { id: existingCategory.id },
  });

  return { success: true, message: `Category "${existingCategory.name}" deleted successfully from this branch.` };
};

const clearAllCategories = async (actor, requestedBranchId) => {
  if (actor.role !== "SUPER_OWNER" && actor.role !== "ADMIN" && actor.role !== "BRANCH_OWNER") {
    throw new AppError("Only Owner or Admin can clear categories", 403, "FORBIDDEN");
  }

  const branchId = getActorBranchIdForCreate(actor, requestedBranchId);
  const branch = await getActiveBranchOrThrow(branchId);

  const itemsCount = await prisma.item.count({
    where: { branchId: branch.id },
  });
  if (itemsCount > 0) {
    throw new AppError(
      `Cannot clear categories in ${branch.name} while items/products exist in this branch's catalog. Please delete or reassign items first.`,
      400,
      "ITEMS_EXIST"
    );
  }

  await prisma.itemCategory.updateMany({
    where: { branchId: branch.id },
    data: { parentId: null },
  });

  const deleted = await prisma.itemCategory.deleteMany({
    where: { branchId: branch.id },
  });

  return {
    success: true,
    deletedCount: deleted.count,
    message: `All ${deleted.count} categories in ${branch.name} have been cleared successfully. Other branches were not affected.`,
  };
};

module.exports = {
  ITEM_CATEGORY_SELECT,
  createItemCategory,
  listItemCategories,
  getItemCategoryById,
  updateItemCategoryById,
  deleteItemCategoryById,
  clearAllCategories,
  syncCategoriesAcrossBranches,
};
