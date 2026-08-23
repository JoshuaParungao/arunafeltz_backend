const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

const ITEM_CATEGORY_SELECT = {
  id: true,
  categoryCode: true,
  name: true,
  description: true,
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

  const categoryCode = payload.categoryCode
    ? payload.categoryCode.trim().toUpperCase()
    : await generateCategoryCode(branch);

  const name = payload.name.trim();

  await assertCategoryCodeIsUnique(branch.id, categoryCode);
  await assertCategoryNameIsUnique(branch.id, name);

  return prisma.itemCategory.create({
    data: {
      categoryCode,
      name,
      description: normalizeOptionalString(payload.description),
      status: "ACTIVE",
      branchId: branch.id,
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: ITEM_CATEGORY_SELECT,
  });
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

  if (payload.status !== undefined) {
    updateData.status = payload.status;
  }

  return prisma.itemCategory.update({
    where: {
      id: existingCategory.id,
    },
    data: updateData,
    select: ITEM_CATEGORY_SELECT,
  });
};

module.exports = {
  ITEM_CATEGORY_SELECT,
  createItemCategory,
  listItemCategories,
  getItemCategoryById,
  updateItemCategoryById,
};
