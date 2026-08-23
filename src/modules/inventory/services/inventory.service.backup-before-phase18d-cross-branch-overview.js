const prisma = require("../../../config/prisma");

const isSuperOwner = (actor) => actor && actor.role === "SUPER_OWNER";

const resolveBranchFilter = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
    return requestedBranchId || undefined;
  }

  return actor.branchId;
};

const parsePagination = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const rawLimit = Math.max(Number(query.limit) || 20, 1);
  const limit = Math.min(rawLimit, 100);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
};

const parseBoolean = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "true" || value === true) {
    return true;
  }

  if (value === "false" || value === false) {
    return false;
  }

  throw new Error("INVALID_BOOLEAN_FILTER");
};

const getInventoryOverview = async (actor, query) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const search = query.search ? String(query.search).trim() : "";
  const lowStockOnly = parseBoolean(query.lowStockOnly);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
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
          ],
        }
      : {}),
  };

  const { page, limit, skip } = parsePagination(query);

  const [totalItems, items] = await Promise.all([
    prisma.item.count({ where }),
    prisma.item.findMany({
      where,
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
      take: limit,
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        brand: true,
        modelName: true,
        status: true,
        isSerialized: true,
        minimumStock: true,
        reorderLevel: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        category: {
          select: {
            id: true,
            categoryCode: true,
            name: true,
          },
        },
        unit: {
          select: {
            id: true,
            unitCode: true,
            name: true,
          },
        },
        inventoryBatches: {
          select: {
            id: true,
            batchCode: true,
            quantityIn: true,
            quantityAvailable: true,
            status: true,
          },
          orderBy: {
            batchCode: "asc",
          },
        },
        itemSerials: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    }),
  ]);

  let data = items.map((item) => {
    const quantityAvailable = item.inventoryBatches.reduce((sum, batch) => {
      return sum + Number(batch.quantityAvailable);
    }, 0);

    const quantityIn = item.inventoryBatches.reduce((sum, batch) => {
      return sum + Number(batch.quantityIn);
    }, 0);

    const serialCounts = item.itemSerials.reduce((acc, serial) => {
      acc[serial.status] = (acc[serial.status] || 0) + 1;
      return acc;
    }, {});

    const reorderLevel = Number(item.reorderLevel || 0);
    const minimumStock = Number(item.minimumStock || 0);

    return {
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      brand: item.brand,
      modelName: item.modelName,
      status: item.status,
      isSerialized: item.isSerialized,
      branch: item.branch,
      category: item.category,
      unit: item.unit,
      quantityIn,
      quantityAvailable,
      batchCount: item.inventoryBatches.length,
      serialCount: item.itemSerials.length,
      serialCounts,
      minimumStock,
      reorderLevel,
      isLowStock: reorderLevel > 0 ? quantityAvailable <= reorderLevel : false,
    };
  });

  if (lowStockOnly === true) {
    data = data.filter((item) => item.isLowStock);
  }

  return {
    data,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

const getInventoryBatches = async (actor, query) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const search = query.search ? String(query.search).trim() : "";

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.itemId ? { itemId: query.itemId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            {
              batchCode: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              referenceNo: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              supplierName: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              item: {
                itemCode: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              item: {
                itemName: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
  };

  const { page, limit, skip } = parsePagination(query);

  const [totalItems, batches] = await Promise.all([
    prisma.inventoryBatch.count({ where }),
    prisma.inventoryBatch.findMany({
      where,
      orderBy: [
        {
          branch: {
            code: "asc",
          },
        },
        {
          batchCode: "asc",
        },
      ],
      skip,
      take: limit,
      select: {
        id: true,
        batchCode: true,
        quantityIn: true,
        quantityAvailable: true,
        unitCost: true,
        sellingPrice1: true,
        sellingPrice2: true,
        sellingPrice3: true,
        sellingPrice4: true,
        sellingPrice5: true,
        supplierName: true,
        referenceNo: true,
        remarks: true,
        receivedAt: true,
        expiryDate: true,
        status: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        item: {
          select: {
            id: true,
            itemCode: true,
            itemName: true,
            brand: true,
            modelName: true,
            isSerialized: true,
          },
        },
        _count: {
          select: {
            serials: true,
            movements: true,
          },
        },
      },
    }),
  ]);

  return {
    data: batches,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

const getInventorySerials = async (actor, query) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const search = query.search ? String(query.search).trim() : "";

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.itemId ? { itemId: query.itemId } : {}),
    ...(query.batchId ? { batchId: query.batchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            {
              serialNumber: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              item: {
                itemCode: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              item: {
                itemName: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
  };

  const { page, limit, skip } = parsePagination(query);

  const [totalItems, serials] = await Promise.all([
    prisma.itemSerial.count({ where }),
    prisma.itemSerial.findMany({
      where,
      orderBy: [
        {
          branch: {
            code: "asc",
          },
        },
        {
          serialNumber: "asc",
        },
      ],
      skip,
      take: limit,
      select: {
        id: true,
        serialNumber: true,
        status: true,
        remarks: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        item: {
          select: {
            id: true,
            itemCode: true,
            itemName: true,
            brand: true,
            modelName: true,
          },
        },
        batch: {
          select: {
            id: true,
            batchCode: true,
          },
        },
      },
    }),
  ]);

  return {
    data: serials,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};


const createMovementCode = async (branchCode, itemCode, movementType) => {
  const count = await prisma.inventoryMovement.count({
    where: {
      movementCode: {
        startsWith: `MOV-${branchCode}-${itemCode}-${movementType}-`,
      },
    },
  });

  return `MOV-${branchCode}-${itemCode}-${movementType}-${String(count + 1).padStart(3, "0")}`;
};

const ensureManageBranchAccess = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
    return requestedBranchId;
  }

  if (!actor.branchId) {
    const error = new Error("BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }

  if (requestedBranchId && requestedBranchId !== actor.branchId) {
    const error = new Error("BRANCH_ACCESS_DENIED");
    error.statusCode = 403;
    throw error;
  }

  return actor.branchId;
};

const getItemForStockMutation = async (itemId, branchId) => {
  const item = await prisma.item.findFirst({
    where: {
      id: itemId,
      branchId,
    },
    include: {
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  if (!item) {
    const error = new Error("ITEM_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return item;
};

const normalizeSerialNumbers = (serialNumbers) => {
  if (!Array.isArray(serialNumbers)) {
    return [];
  }

  return serialNumbers
    .map((serialNumber) => String(serialNumber).trim())
    .filter(Boolean);
};

const assertUniqueSerialNumbers = (serialNumbers) => {
  const normalized = normalizeSerialNumbers(serialNumbers);
  const unique = new Set(normalized);

  if (unique.size !== normalized.length) {
    const error = new Error("DUPLICATE_SERIAL_IN_REQUEST");
    error.statusCode = 400;
    throw error;
  }

  return normalized;
};

const createStockIn = async (actor, payload) => {
  const branchId = ensureManageBranchAccess(actor, payload.branchId);
  const item = await getItemForStockMutation(payload.itemId, branchId);

  const quantity = Number(payload.quantity);
  const serialNumbers = assertUniqueSerialNumbers(payload.serialNumbers);

  if (item.isSerialized && serialNumbers.length !== quantity) {
    const error = new Error("SERIAL_COUNT_MISMATCH");
    error.statusCode = 400;
    throw error;
  }

  if (!item.isSerialized && serialNumbers.length > 0) {
    const error = new Error("SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM");
    error.statusCode = 400;
    throw error;
  }

  if (serialNumbers.length > 0) {
    const existingSerials = await prisma.itemSerial.findMany({
      where: {
        branchId,
        serialNumber: {
          in: serialNumbers,
        },
      },
      select: {
        serialNumber: true,
      },
    });

    if (existingSerials.length > 0) {
      const error = new Error("SERIAL_ALREADY_EXISTS");
      error.statusCode = 409;
      error.details = existingSerials.map((serial) => serial.serialNumber);
      throw error;
    }
  }

  return prisma.$transaction(async (tx) => {
    const existingBatch = await tx.inventoryBatch.findUnique({
      where: {
        branchId_batchCode: {
          branchId,
          batchCode: payload.batchCode,
        },
      },
    });

    const previousQuantity = existingBatch
      ? Number(existingBatch.quantityAvailable)
      : 0;

    const newQuantity = previousQuantity + quantity;

    const batch = await tx.inventoryBatch.upsert({
      where: {
        branchId_batchCode: {
          branchId,
          batchCode: payload.batchCode,
        },
      },
      update: {
        itemId: item.id,
        quantityIn: ((existingBatch ? Number(existingBatch.quantityIn) : 0) + quantity).toString(),
        quantityAvailable: newQuantity.toString(),
        unitCost: payload.unitCost !== undefined ? payload.unitCost.toString() : item.costPrice.toString(),
        sellingPrice1: payload.sellingPrice1 !== undefined ? payload.sellingPrice1.toString() : item.price1.toString(),
        sellingPrice2: payload.sellingPrice2 !== undefined ? payload.sellingPrice2.toString() : item.price2.toString(),
        sellingPrice3: payload.sellingPrice3 !== undefined ? payload.sellingPrice3.toString() : item.price3.toString(),
        sellingPrice4: payload.sellingPrice4 !== undefined ? payload.sellingPrice4.toString() : item.price4.toString(),
        sellingPrice5: payload.sellingPrice5 !== undefined ? payload.sellingPrice5.toString() : item.price5.toString(),
        supplierName: payload.supplierName || (existingBatch ? existingBatch.supplierName : null),
        referenceNo: payload.referenceNo || (existingBatch ? existingBatch.referenceNo : null),
        remarks: payload.remarks || (existingBatch ? existingBatch.remarks : null),
        expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : (existingBatch ? existingBatch.expiryDate : null),
        status: "ACTIVE",
        updatedById: actor.id,
      },
      create: {
        branchId,
        itemId: item.id,
        batchCode: payload.batchCode,
        quantityIn: quantity.toString(),
        quantityAvailable: quantity.toString(),
        unitCost: payload.unitCost !== undefined ? payload.unitCost.toString() : item.costPrice.toString(),
        sellingPrice1: payload.sellingPrice1 !== undefined ? payload.sellingPrice1.toString() : item.price1.toString(),
        sellingPrice2: payload.sellingPrice2 !== undefined ? payload.sellingPrice2.toString() : item.price2.toString(),
        sellingPrice3: payload.sellingPrice3 !== undefined ? payload.sellingPrice3.toString() : item.price3.toString(),
        sellingPrice4: payload.sellingPrice4 !== undefined ? payload.sellingPrice4.toString() : item.price4.toString(),
        sellingPrice5: payload.sellingPrice5 !== undefined ? payload.sellingPrice5.toString() : item.price5.toString(),
        supplierName: payload.supplierName || null,
        referenceNo: payload.referenceNo || null,
        remarks: payload.remarks || null,
        expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : null,
        status: "ACTIVE",
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    const movementCode = await createMovementCode(item.branch.code, item.itemCode, "STOCKIN");

    const movement = await tx.inventoryMovement.create({
      data: {
        branchId,
        itemId: item.id,
        batchId: batch.id,
        movementCode,
        type: "STOCK_IN",
        source: "MANUAL",
        quantity: quantity.toString(),
        previousQuantity: previousQuantity.toString(),
        newQuantity: newQuantity.toString(),
        unitCost: payload.unitCost !== undefined ? payload.unitCost.toString() : item.costPrice.toString(),
        referenceNo: payload.referenceNo || null,
        remarks: payload.remarks || "Manual stock-in.",
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    const createdSerials = [];

    for (const serialNumber of serialNumbers) {
      const serial = await tx.itemSerial.create({
        data: {
          branchId,
          itemId: item.id,
          batchId: batch.id,
          serialNumber,
          status: "AVAILABLE",
          remarks: payload.remarks || "Manual stock-in serial.",
          createdById: actor.id,
          updatedById: actor.id,
        },
      });

      createdSerials.push(serial);
    }

    return {
      batch,
      movement,
      serials: createdSerials,
    };
  });
};

const createStockAdjustment = async (actor, payload) => {
  const requestedBranchId = payload.branchId;
  const allowedBranchId = ensureManageBranchAccess(actor, requestedBranchId);

  const batch = await prisma.inventoryBatch.findFirst({
    where: {
      id: payload.batchId,
      branchId: allowedBranchId,
    },
    include: {
      item: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  if (!batch) {
    const error = new Error("BATCH_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  const quantity = Number(payload.quantity);
  const previousQuantity = Number(batch.quantityAvailable);

  let newQuantity = previousQuantity;

  if (payload.type === "INCREASE") {
    newQuantity = previousQuantity + quantity;
  }

  if (payload.type === "DECREASE") {
    newQuantity = previousQuantity - quantity;
  }

  if (newQuantity < 0) {
    const error = new Error("INSUFFICIENT_BATCH_QUANTITY");
    error.statusCode = 400;
    throw error;
  }

  const movementType = payload.type === "INCREASE" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";

  return prisma.$transaction(async (tx) => {
    const updatedBatch = await tx.inventoryBatch.update({
      where: {
        id: batch.id,
      },
      data: {
        quantityAvailable: newQuantity.toString(),
        status: newQuantity === 0 ? "DEPLETED" : "ACTIVE",
        updatedById: actor.id,
      },
    });

    const movementCode = await createMovementCode(batch.branch.code, batch.item.itemCode, movementType.replace("_", ""));

    const movement = await tx.inventoryMovement.create({
      data: {
        branchId: batch.branchId,
        itemId: batch.itemId,
        batchId: batch.id,
        movementCode,
        type: movementType,
        source: "MANUAL",
        quantity: quantity.toString(),
        previousQuantity: previousQuantity.toString(),
        newQuantity: newQuantity.toString(),
        unitCost: batch.unitCost.toString(),
        referenceNo: payload.referenceNo || null,
        remarks: payload.remarks || "Manual stock adjustment.",
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    return {
      batch: updatedBatch,
      movement,
    };
  });
};


const updateSerialStatus = async (actor, serialId, payload) => {
  const serial = await prisma.itemSerial.findUnique({
    where: {
      id: serialId,
    },
    include: {
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      item: {
        select: {
          id: true,
          itemCode: true,
          itemName: true,
        },
      },
      batch: {
        select: {
          id: true,
          batchCode: true,
          quantityAvailable: true,
        },
      },
    },
  });

  if (!serial) {
    const error = new Error("SERIAL_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (!isSuperOwner(actor) && serial.branchId !== actor.branchId) {
    const error = new Error("BRANCH_ACCESS_DENIED");
    error.statusCode = 403;
    throw error;
  }

  const previousStatus = serial.status;

  const updatedSerial = await prisma.itemSerial.update({
    where: {
      id: serial.id,
    },
    data: {
      status: payload.status,
      remarks: payload.remarks || serial.remarks,
      updatedById: actor.id,
    },
    select: {
      id: true,
      serialNumber: true,
      status: true,
      remarks: true,
      createdAt: true,
      updatedAt: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      item: {
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          brand: true,
          modelName: true,
        },
      },
      batch: {
        select: {
          id: true,
          batchCode: true,
          quantityAvailable: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
    },
  });

  return {
    previousStatus,
    serial: updatedSerial,
  };
};


const getInventoryMovements = async (actor, query) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const search = query.search ? String(query.search).trim() : "";

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.itemId ? { itemId: query.itemId } : {}),
    ...(query.batchId ? { batchId: query.batchId } : {}),
    ...(query.serialId ? { serialId: query.serialId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(search
      ? {
          OR: [
            {
              movementCode: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              referenceNo: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              remarks: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              item: {
                itemCode: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              item: {
                itemName: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              batch: {
                batchCode: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              serial: {
                serialNumber: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
  };

  const { page, limit, skip } = parsePagination(query);

  const [totalItems, movements] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      orderBy: [
        {
          movementDate: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      skip,
      take: limit,
      select: {
        id: true,
        movementCode: true,
        type: true,
        source: true,
        quantity: true,
        previousQuantity: true,
        newQuantity: true,
        unitCost: true,
        referenceNo: true,
        remarks: true,
        movementDate: true,
        createdAt: true,
        updatedAt: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        item: {
          select: {
            id: true,
            itemCode: true,
            itemName: true,
            brand: true,
            modelName: true,
          },
        },
        batch: {
          select: {
            id: true,
            batchCode: true,
          },
        },
        serial: {
          select: {
            id: true,
            serialNumber: true,
            status: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
      },
    }),
  ]);

  return {
    data: movements,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

module.exports = {
  getInventoryOverview,
  getInventoryBatches,
  getInventorySerials,
  getInventoryMovements,
  createStockIn,
  createStockAdjustment,
  updateSerialStatus,
};


