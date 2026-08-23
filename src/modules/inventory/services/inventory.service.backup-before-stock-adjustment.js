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

module.exports = {
  getInventoryOverview,
  getInventoryBatches,
  getInventorySerials,
};
