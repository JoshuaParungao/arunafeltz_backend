const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

const UNIT_SELECT = {
  id: true,
  unitCode: true,
  name: true,
  description: true,
  status: true,
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

const assertUnitCodeIsUnique = async (unitCode) => {
  const existingUnit = await prisma.unit.findUnique({
    where: {
      unitCode,
    },
    select: {
      id: true,
    },
  });

  if (existingUnit) {
    throw new AppError(
      "Unit code already exists",
      409,
      "UNIT_CODE_ALREADY_EXISTS"
    );
  }
};

const assertUnitCodeIsUniqueForUpdate = async (unitCode, currentUnitId) => {
  const existingUnit = await prisma.unit.findUnique({
    where: {
      unitCode,
    },
    select: {
      id: true,
    },
  });

  if (existingUnit && existingUnit.id !== currentUnitId) {
    throw new AppError(
      "Unit code already exists",
      409,
      "UNIT_CODE_ALREADY_EXISTS"
    );
  }
};

const assertUnitNameIsUnique = async (name) => {
  const existingUnit = await prisma.unit.findUnique({
    where: {
      name,
    },
    select: {
      id: true,
    },
  });

  if (existingUnit) {
    throw new AppError(
      "Unit name already exists",
      409,
      "UNIT_NAME_ALREADY_EXISTS"
    );
  }
};

const assertUnitNameIsUniqueForUpdate = async (name, currentUnitId) => {
  const existingUnit = await prisma.unit.findUnique({
    where: {
      name,
    },
    select: {
      id: true,
    },
  });

  if (existingUnit && existingUnit.id !== currentUnitId) {
    throw new AppError(
      "Unit name already exists",
      409,
      "UNIT_NAME_ALREADY_EXISTS"
    );
  }
};

const createUnit = async (payload, actor) => {
  const unitCode = payload.unitCode.trim().toUpperCase();
  const name = payload.name.trim();

  await assertUnitCodeIsUnique(unitCode);
  await assertUnitNameIsUnique(name);

  return prisma.unit.create({
    data: {
      unitCode,
      name,
      description: normalizeOptionalString(payload.description),
      status: "ACTIVE",
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: UNIT_SELECT,
  });
};

const listUnits = async (filters = {}) => {
  const page = Number.parseInt(filters.page || "1", 10);
  const limit = Number.parseInt(filters.limit || "20", 10);
  const safeLimit = Math.min(limit, 100);
  const skip = (page - 1) * safeLimit;

  const search = filters.search ? filters.search.trim() : null;

  const where = {
    status: filters.status,
  };

  if (search) {
    where.OR = [
      {
        unitCode: {
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
    prisma.unit.findMany({
      where,
      select: UNIT_SELECT,
      orderBy: {
        unitCode: "asc",
      },
      skip,
      take: safeLimit,
    }),
    prisma.unit.count({
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

const getUnitById = async (unitId) => {
  const unit = await prisma.unit.findUnique({
    where: {
      id: unitId,
    },
    select: UNIT_SELECT,
  });

  if (!unit) {
    throw new AppError("Unit not found", 404, "UNIT_NOT_FOUND");
  }

  return unit;
};

const updateUnitById = async (unitId, payload, actor) => {
  const existingUnit = await prisma.unit.findUnique({
    where: {
      id: unitId,
    },
    select: UNIT_SELECT,
  });

  if (!existingUnit) {
    throw new AppError("Unit not found", 404, "UNIT_NOT_FOUND");
  }

  const updateData = {
    updatedById: actor.id,
  };

  if (payload.unitCode !== undefined) {
    const unitCode = payload.unitCode.trim().toUpperCase();

    await assertUnitCodeIsUniqueForUpdate(unitCode, existingUnit.id);

    updateData.unitCode = unitCode;
  }

  if (payload.name !== undefined) {
    const name = payload.name.trim();

    await assertUnitNameIsUniqueForUpdate(name, existingUnit.id);

    updateData.name = name;
  }

  if (payload.description !== undefined) {
    updateData.description = normalizeOptionalString(payload.description);
  }

  if (payload.status !== undefined) {
    updateData.status = payload.status;
  }

  return prisma.unit.update({
    where: {
      id: existingUnit.id,
    },
    data: updateData,
    select: UNIT_SELECT,
  });
};

module.exports = {
  UNIT_SELECT,
  createUnit,
  listUnits,
  getUnitById,
  updateUnitById,
};
