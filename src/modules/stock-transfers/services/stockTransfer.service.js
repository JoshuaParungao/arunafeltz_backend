const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { Prisma } = require("@prisma/client");
const { createAuditLog } = require("../../../utils/auditLogger");

const STOCK_TRANSFER_INCLUDE = {
  fromBranch: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
  toBranch: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
  requestedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  approvedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  rejectedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  postedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  cancelledBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
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
  updatedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  items: {
    include: {
      item: {
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          status: true,
          branchId: true,
          isSerialized: true,
        },
      },
      fromBatch: {
        select: {
          id: true,
          batchCode: true,
          quantityAvailable: true,
          unitCost: true,
          operationalUnitCost: true,
          branchId: true,
          itemId: true,
          status: true,
        },
      },
      destinationItem: {
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          branchId: true,
          isSerialized: true,
          price1: true,
          price2: true,
          price3: true,
          price4: true,
          price5: true,
        },
      },
      priceProposedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      priceSetBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      serials: {
        include: {
          itemSerial: {
            select: {
              id: true,
              serialNumber: true,
              status: true,
              branchId: true,
              itemId: true,
              batchId: true,
            },
          },
          allocation: {
            select: {
              id: true,
              sourceBatchId: true,
              destinationBatchId: true,
            },
          },
        },
        orderBy: {
          serialNumberSnapshot: "asc",
        },
      },
      allocations: {
        include: {
          sourceBatch: {
            select: {
              id: true,
              batchCode: true,
              branchId: true,
              itemId: true,
              unitCost: true,
              operationalUnitCost: true,
            },
          },
          destinationBatch: {
            select: {
              id: true,
              batchCode: true,
              branchId: true,
              itemId: true,
              unitCost: true,
              operationalUnitCost: true,
              originBatchId: true,
            },
          },
          serials: {
            select: {
              id: true,
              itemSerialId: true,
              serialNumberSnapshot: true,
            },
            orderBy: {
              serialNumberSnapshot: "asc",
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: {
      lineNo: "asc",
    },
  },
};

const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

const STOCK_TRANSFER_OPERATION_ROLES = new Set([
  ...OWNER_ADMIN_ROLES,
  "CASHIER",
  "TECHNICIAN",
]);

const MAX_TRANSFER_MONEY = new Prisma.Decimal("9999999999.99");

const toMoneyDecimal = (value) =>
  new Prisma.Decimal(value || 0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

const normalizeTransferUnitPrice = (value, label = "Transfer unit price") => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  let price;

  try {
    price = new Prisma.Decimal(value);
  } catch (_error) {
    throw new AppError(
      `${label} must be a valid number`,
      400,
      "INVALID_TRANSFER_UNIT_PRICE"
    );
  }

  if (
    !price.isFinite() ||
    price.isNegative() ||
    price.decimalPlaces() > 2 ||
    price.greaterThan(MAX_TRANSFER_MONEY)
  ) {
    throw new AppError(
      `${label} must be nonnegative, have at most two decimal places, and fit the supported amount range`,
      400,
      "INVALID_TRANSFER_UNIT_PRICE"
    );
  }

  return price.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
};

const buildProposedPriceData = (itemPayload, actor) => {
  const proposedPrice = normalizeTransferUnitPrice(
    itemPayload.proposedTransferUnitPrice,
    "Proposed transfer unit price"
  );

  if (proposedPrice === null) {
    return {};
  }

  return {
    proposedTransferUnitPrice: proposedPrice.toFixed(2),
    priceProposedAt: new Date(),
    priceProposedById: actor.id,
  };
};

const sanitizeStockTransferCostsForActor = (stockTransfer, actor) => {
  if (!stockTransfer || OWNER_ADMIN_ROLES.has(actor?.role)) {
    return stockTransfer;
  }

  const isTransferRecord =
    Array.isArray(stockTransfer.items) &&
    typeof stockTransfer.fromBranchId === "string" &&
    typeof stockTransfer.toBranchId === "string";

  if (!isTransferRecord) {
    if (Array.isArray(stockTransfer.items)) {
      return {
        ...stockTransfer,
        items: stockTransfer.items.map((transfer) =>
          sanitizeStockTransferCostsForActor(transfer, actor)
        ),
      };
    }

    if (Array.isArray(stockTransfer.data)) {
      return {
        ...stockTransfer,
        data: stockTransfer.data.map((transfer) =>
          sanitizeStockTransferCostsForActor(transfer, actor)
        ),
      };
    }

    return stockTransfer;
  }

  const canViewOwnProposal =
    Boolean(actor?.id && actor?.branchId) &&
    stockTransfer.requestedById === actor.id &&
    stockTransfer.toBranchId === actor.branchId;

  const sanitizeItem = (item) => {
    const {
      proposedTransferUnitPrice,
      priceProposedAt,
      priceProposedById,
      priceProposedBy,
      agreedTransferUnitPrice,
      transferAmount,
      priceSetAt,
      priceLockedAt,
      priceSetById,
      priceSetBy,
      allocations,
      ...safeItem
    } = item;

    if (canViewOwnProposal) {
      safeItem.proposedTransferUnitPrice = proposedTransferUnitPrice;
      safeItem.priceProposedAt = priceProposedAt;
      safeItem.priceProposedById = priceProposedById;
      safeItem.priceProposedBy = priceProposedBy;
    }

    safeItem.agreedTransferUnitPrice = agreedTransferUnitPrice;
    safeItem.transferAmount = transferAmount;
    safeItem.priceSetAt = priceSetAt;
    safeItem.priceLockedAt = priceLockedAt;
    safeItem.priceSetById = priceSetById;
    safeItem.priceSetBy = priceSetBy;

    if (safeItem.fromBatch) {
      const {
        unitCost,
        operationalUnitCost,
        ...safeSourceBatch
      } = safeItem.fromBatch;
      safeItem.fromBatch = safeSourceBatch;
    }

    return safeItem;
  };

  return {
    ...stockTransfer,
    items: stockTransfer.items.map(sanitizeItem),
  };
};

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : null;
};

const assertManageStockTransferRole = (actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (!STOCK_TRANSFER_OPERATION_ROLES.has(actor.role)) {
    throw new AppError(
      "You are not allowed to manage stock transfers",
      403,
      "STOCK_TRANSFER_MANAGE_FORBIDDEN"
    );
  }
};

const assertViewStockTransferRole = (actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (!STOCK_TRANSFER_OPERATION_ROLES.has(actor.role)) {
    throw new AppError(
      "You are not allowed to view stock transfers",
      403,
      "STOCK_TRANSFER_VIEW_FORBIDDEN"
    );
  }
};

const getActiveBranchOrThrow = async (branchId, label = "Branch") => {
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
    throw new AppError(label + " not found", 404, "BRANCH_NOT_FOUND");
  }

  if (branch.status !== "ACTIVE") {
    throw new AppError(label + " is not active", 400, "BRANCH_NOT_ACTIVE");
  }

  return branch;
};

const getFromBranchForCreate = async (actor, requestedFromBranchId) => {
  assertManageStockTransferRole(actor);

  if (actor.role === "SUPER_OWNER") {
    if (!requestedFromBranchId) {
      throw new AppError(
        "From branch ID is required for Super Owner stock transfer creation",
        400,
        "FROM_BRANCH_ID_REQUIRED"
      );
    }

    return getActiveBranchOrThrow(requestedFromBranchId, "From branch");
  }

  if (!actor.branchId) {
    throw new AppError(
      "User is not assigned to a branch",
      400,
      "USER_BRANCH_REQUIRED"
    );
  }

  if (requestedFromBranchId && requestedFromBranchId !== actor.branchId) {
    throw new AppError(
      "You can only create stock transfers from your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return getActiveBranchOrThrow(actor.branchId, "From branch");
};

const assertDifferentBranches = (fromBranchId, toBranchId) => {
  if (fromBranchId === toBranchId) {
    throw new AppError(
      "From branch and to branch cannot be the same",
      400,
      "SAME_BRANCH_TRANSFER_NOT_ALLOWED"
    );
  }
};

const assertStockTransferAccess = (stockTransfer, actor) => {
  assertViewStockTransferRole(actor);

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

  if (
    stockTransfer.fromBranchId !== actor.branchId &&
    stockTransfer.toBranchId !== actor.branchId
  ) {
    throw new AppError(
      "You can only access stock transfers linked to your branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const assertStockTransferManageAccess = (stockTransfer, actor) => {
  assertManageStockTransferRole(actor);

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

  if (stockTransfer.fromBranchId !== actor.branchId) {
    throw new AppError(
      "You can only manage stock transfers from your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const generateTransferCode = async (fromBranch) => {
  const prefix = `TR-${fromBranch.code}-`;

  const existingTransfers = await prisma.stockTransfer.findMany({
    where: {
      fromBranchId: fromBranch.id,
      transferCode: {
        startsWith: prefix,
      },
    },
    select: {
      transferCode: true,
    },
  });

  let highestNumber = 0;

  for (const transfer of existingTransfers) {
    const suffix = transfer.transferCode.replace(prefix, "");
    const parsedNumber = Number.parseInt(suffix, 10);

    if (!Number.isNaN(parsedNumber) && parsedNumber > highestNumber) {
      highestNumber = parsedNumber;
    }
  }

  return `${prefix}${String(highestNumber + 1).padStart(5, "0")}`;
};

const assertTransferCodeIsUnique = async (fromBranchId, transferCode, currentTransferId = null) => {
  const existingTransfer = await prisma.stockTransfer.findUnique({
    where: {
      fromBranchId_transferCode: {
        fromBranchId,
        transferCode,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingTransfer && existingTransfer.id !== currentTransferId) {
    throw new AppError(
      "Transfer code already exists in this branch",
      409,
      "STOCK_TRANSFER_CODE_ALREADY_EXISTS"
    );
  }
};

const normalizeSerialIds = (serialIds) => {
  if (!Array.isArray(serialIds)) {
    return [];
  }

  return serialIds.map((serialId) => String(serialId).trim()).filter(Boolean);
};

const validateAndBuildItems = async (items, fromBranchId, actor) => {
  const builtItems = [];
  const serialIdsInRequest = new Set();

  for (let index = 0; index < items.length; index += 1) {
    const itemPayload = items[index];
    const quantity = Number(itemPayload.quantity);
    const serialIds = normalizeSerialIds(itemPayload.serialIds);

    const item = await prisma.item.findUnique({
      where: {
        id: itemPayload.itemId,
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        status: true,
        branchId: true,
        isSerialized: true,
      },
    });

    if (!item) {
      throw new AppError("Item not found", 404, "ITEM_NOT_FOUND");
    }

    if (item.branchId !== fromBranchId) {
      throw new AppError(
        "Item is not available in from branch",
        403,
        "ITEM_BRANCH_ACCESS_DENIED"
      );
    }

    if (item.status !== "ACTIVE") {
      throw new AppError("Item is not active", 400, "ITEM_NOT_ACTIVE");
    }

    let fromBatchId = null;

    if (itemPayload.fromBatchId) {
      const batch = await prisma.inventoryBatch.findUnique({
        where: {
          id: itemPayload.fromBatchId,
        },
        select: {
          id: true,
          branchId: true,
          itemId: true,
          quantityAvailable: true,
          status: true,
        },
      });

      if (!batch) {
        throw new AppError("Batch not found", 404, "BATCH_NOT_FOUND");
      }

      if (batch.branchId !== fromBranchId || batch.itemId !== item.id) {
        throw new AppError(
          "Batch is not available for this item and from branch",
          403,
          "BATCH_BRANCH_OR_ITEM_MISMATCH"
        );
      }

      if (batch.status !== "ACTIVE") {
        throw new AppError(
          "Only active source batches can be transferred",
          400,
          "SOURCE_BATCH_NOT_ACTIVE"
        );
      }

      if (Number(batch.quantityAvailable) < quantity) {
        throw new AppError(
          "Transfer quantity cannot exceed batch available quantity",
          400,
          "INSUFFICIENT_BATCH_QUANTITY"
        );
      }

      fromBatchId = batch.id;
    }

    if (item.isSerialized) {
      if (!Number.isInteger(quantity)) {
        throw new AppError(
          "Serialized transfer quantity must be a whole number",
          400,
          "SERIALIZED_QUANTITY_MUST_BE_WHOLE_NUMBER"
        );
      }

      if (serialIds.length !== quantity) {
        throw new AppError(
          "Serialized transfer requires serial count to match quantity",
          400,
          "SERIAL_COUNT_MISMATCH"
        );
      }
    }

    if (!item.isSerialized && serialIds.length > 0) {
      throw new AppError(
        "Serials are not allowed for non-serialized item",
        400,
        "SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM"
      );
    }

    for (const serialId of serialIds) {
      if (serialIdsInRequest.has(serialId)) {
        throw new AppError(
          "Duplicate serial found in request",
          400,
          "DUPLICATE_SERIAL_IN_REQUEST"
        );
      }

      serialIdsInRequest.add(serialId);
    }

    const serialCreateData = [];

    if (serialIds.length > 0) {
      const serials = await prisma.itemSerial.findMany({
        where: {
          id: {
            in: serialIds,
          },
          branchId: fromBranchId,
          itemId: item.id,
          status: "AVAILABLE",
        },
        select: {
          id: true,
          serialNumber: true,
          batchId: true,
        },
      });

      if (serials.length !== serialIds.length) {
        throw new AppError(
          "One or more serials are not available in from branch",
          400,
          "SERIAL_NOT_AVAILABLE"
        );
      }

      if (fromBatchId) {
        const mismatchedSerial = serials.find((serial) => serial.batchId !== fromBatchId);

        if (mismatchedSerial) {
          throw new AppError(
            "Serial does not belong to selected batch",
            400,
            "SERIAL_BATCH_MISMATCH"
          );
        }
      }

      for (const serial of serials) {
        serialCreateData.push({
          itemSerialId: serial.id,
          serialNumberSnapshot: serial.serialNumber,
        });
      }
    }

    builtItems.push({
      lineNo: index + 1,
      description: itemPayload.description.trim(),
      quantity,
      itemId: item.id,
      fromBatchId,
      ...buildProposedPriceData(itemPayload, actor),
      ...(serialCreateData.length > 0
        ? {
            serials: {
              create: serialCreateData,
            },
          }
        : {}),
    });
  }

  return builtItems;
};

const validateAndBuildRequestItems = async (items, fromBranchId, actor) => {
  const builtItems = [];
  const requestedQuantityByItem = new Map();

  for (let index = 0; index < items.length; index += 1) {
    const itemPayload = items[index];
    const quantity = Number(itemPayload.quantity);

    const item = await prisma.item.findUnique({
      where: {
        id: itemPayload.itemId,
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        status: true,
        branchId: true,
        isSerialized: true,
      },
    });

    if (!item) {
      throw new AppError("Item not found", 404, "ITEM_NOT_FOUND");
    }

    if (item.branchId !== fromBranchId) {
      throw new AppError(
        "Item is not available in source branch",
        403,
        "ITEM_BRANCH_ACCESS_DENIED"
      );
    }

    if (item.status !== "ACTIVE") {
      throw new AppError("Item is not active", 400, "ITEM_NOT_ACTIVE");
    }

    if (item.isSerialized && !Number.isInteger(quantity)) {
      throw new AppError(
        "Serialized item request quantity must be a whole number",
        400,
        "SERIALIZED_QUANTITY_MUST_BE_WHOLE_NUMBER"
      );
    }

    const batches = await prisma.inventoryBatch.findMany({
      where: {
        branchId: fromBranchId,
        itemId: item.id,
        status: "ACTIVE",
        quantityAvailable: {
          gt: 0,
        },
      },
      select: {
        quantityAvailable: true,
      },
    });

    const totalAvailable = batches.reduce(
      (sum, batch) => sum + Number(batch.quantityAvailable || 0),
      0
    );

    const cumulativeQuantity =
      (requestedQuantityByItem.get(item.id) || 0) + quantity;

    if (cumulativeQuantity > totalAvailable) {
      throw new AppError(
        "Total requested quantity is higher than available stock",
        400,
        "INSUFFICIENT_AVAILABLE_STOCK"
      );
    }


    if (item.isSerialized) {
      const availableSerialCount = await prisma.itemSerial.count({
        where: {
          branchId: fromBranchId,
          itemId: item.id,
          status: "AVAILABLE",
          batchId: {
            not: null,
          },
          batch: {
            is: {
              branchId: fromBranchId,
              itemId: item.id,
              status: "ACTIVE",
            },
          },
        },
      });

      if (cumulativeQuantity > availableSerialCount) {
        throw new AppError(
          "Total requested quantity is higher than available serialized stock",
          400,
          "INSUFFICIENT_AVAILABLE_SERIALS"
        );
      }
    }

    requestedQuantityByItem.set(item.id, cumulativeQuantity);

    const cleanDescription = normalizeOptionalString(itemPayload.description);

    builtItems.push({
      lineNo: index + 1,
      description: cleanDescription || `${item.itemCode} - ${item.itemName}`,
      quantity,
      itemId: item.id,
    });
  }

  return builtItems;
};

const listRequestableStock = async (filters = {}, actor) => {
  if (!actor?.id) {
    throw new AppError("Login is required", 401, "AUTHENTICATION_REQUIRED");
  }

  const sourceBranch = await getActiveBranchOrThrow(
    filters.fromBranchId,
    "From branch"
  );

  if (actor.role !== "SUPER_OWNER") {
    if (!actor.branchId) {
      throw new AppError(
        "User is not assigned to a branch",
        400,
        "USER_BRANCH_REQUIRED"
      );
    }

    if (sourceBranch.id === actor.branchId) {
      throw new AppError(
        "Choose another branch as the request source",
        400,
        "SAME_BRANCH_TRANSFER_NOT_ALLOWED"
      );
    }
  }

  const page = Number.parseInt(filters.page || "1", 10);
  const limit = Math.min(Number.parseInt(filters.limit || "20", 10), 100);
  const skip = (page - 1) * limit;
  const search = normalizeOptionalString(filters.search);
  const where = {
    branchId: sourceBranch.id,
    status: "ACTIVE",
    AND: [
      {
        inventoryBatches: {
          some: {
            status: "ACTIVE",
            quantityAvailable: { gt: 0 },
          },
        },
      },
      {
        OR: [
          { isSerialized: false },
          {
            isSerialized: true,
            itemSerials: {
              some: {
                status: "AVAILABLE",
                batchId: { not: null },
                batch: { is: { status: "ACTIVE", quantityAvailable: { gt: 0 } } },
              },
            },
          },
        ],
      },
    ],
    ...(search
      ? {
          OR: [
            { itemCode: { contains: search, mode: "insensitive" } },
            { itemName: { contains: search, mode: "insensitive" } },
            { brand: { contains: search, mode: "insensitive" } },
            { modelName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [totalItems, items] = await prisma.$transaction([
    prisma.item.count({ where }),
    prisma.item.findMany({
      where,
      orderBy: { itemCode: "asc" },
      skip,
      take: limit,
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        brand: true,
        modelName: true,
        isSerialized: true,
        branch: { select: { id: true, code: true, name: true } },
        category: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
        inventoryBatches: {
          where: { status: "ACTIVE", quantityAvailable: { gt: 0 } },
          select: { quantityAvailable: true },
        },
        itemSerials: {
          where: {
            status: "AVAILABLE",
            batchId: { not: null },
            batch: { is: { status: "ACTIVE" } },
          },
          select: { id: true },
        },
      },
    }),
  ]);

  const data = items.map((item) => {
    const batchQuantity = item.inventoryBatches.reduce(
      (sum, batch) => sum + Number(batch.quantityAvailable || 0),
      0
    );
    const quantityAvailable = item.isSerialized
      ? Math.min(batchQuantity, item.itemSerials.length)
      : batchQuantity;
    const { inventoryBatches, itemSerials, ...safeItem } = item;

    return {
      ...safeItem,
      quantityAvailable,
      availableSerialCount: item.isSerialized ? itemSerials.length : null,
    };
  });

  return {
    data,
    sourceBranch,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

const createStockTransferRequest = async (payload, actor) => {
  if (!actor || !actor.id) {
    throw new AppError("Login is required", 401, "AUTHENTICATION_REQUIRED");
  }

  const fulfillmentMethod = String(payload.fulfillmentMethod || "").toUpperCase();

  if (!["PICKUP", "DELIVERY"].includes(fulfillmentMethod)) {
    throw new AppError(
      "Fulfillment method must be PICKUP or DELIVERY",
      400,
      "INVALID_STOCK_TRANSFER_FULFILLMENT_METHOD"
    );
  }

  const deliveryCharge =
    normalizeTransferUnitPrice(
      payload.deliveryCharge ?? 0,
      "Delivery charge"
    ) || new Prisma.Decimal(0);

  if (fulfillmentMethod === "PICKUP" && !deliveryCharge.isZero()) {
    throw new AppError(
      "Pickup stock transfers cannot have a delivery charge",
      400,
      "PICKUP_DELIVERY_CHARGE_NOT_ALLOWED"
    );
  }

  const fromBranch = await getActiveBranchOrThrow(
    payload.fromBranchId,
    "From branch"
  );

  let toBranchId = payload.toBranchId;

  if (actor.role !== "SUPER_OWNER") {
    if (!actor.branchId) {
      throw new AppError(
        "User is not assigned to a branch",
        400,
        "USER_BRANCH_REQUIRED"
      );
    }

    if (toBranchId && toBranchId !== actor.branchId) {
      throw new AppError(
        "You can only request products for your assigned branch",
        403,
        "BRANCH_ACCESS_DENIED"
      );
    }

    toBranchId = actor.branchId;
  }

  if (!toBranchId) {
    throw new AppError(
      "To branch is required",
      400,
      "TO_BRANCH_REQUIRED"
    );
  }

  const toBranch = await getActiveBranchOrThrow(
    toBranchId,
    "To branch"
  );

  assertDifferentBranches(fromBranch.id, toBranch.id);

  const transferCode = await generateTransferCode(fromBranch);

  await assertTransferCodeIsUnique(
    fromBranch.id,
    transferCode
  );

  const items = await validateAndBuildRequestItems(
    payload.items,
    fromBranch.id,
    actor
  );

  return prisma.$transaction(async (tx) => {
    const stockTransfer = await tx.stockTransfer.create({
      data: {
        transferCode,
        status: "REQUESTED",

        fulfillmentMethod,
        fulfillmentStatus: "PENDING",
        deliveryCharge: deliveryCharge.toFixed(2),

        notes: normalizeOptionalString(payload.notes),

        fromBranchId: fromBranch.id,
        toBranchId: toBranch.id,

        requestedAt: new Date(),
        requestedById: actor.id,

        createdById: actor.id,
        updatedById: actor.id,

        items: {
          create: items,
        },
      },

      include: STOCK_TRANSFER_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: stockTransfer.fromBranchId,
        action: "STOCK_TRANSFER_REQUESTED",
        entityType: "StockTransfer",
        entityId: stockTransfer.id,
        description: `Stock transfer ${stockTransfer.transferCode} requested`,
        metadata: {
          transferCode: stockTransfer.transferCode,
          status: stockTransfer.status,
          fromBranchId: stockTransfer.fromBranchId,
          toBranchId: stockTransfer.toBranchId,
          itemCount: stockTransfer.items.length,
          fulfillmentMethod: stockTransfer.fulfillmentMethod,
          deliveryCharge: stockTransfer.deliveryCharge,
          notes: stockTransfer.notes,
        },
      },
      tx
    );

    return sanitizeStockTransferCostsForActor(
      stockTransfer,
      actor
    );
  });
};

const createStockTransfer = async (payload, actor) => {
  const fromBranch = await getFromBranchForCreate(actor, payload.fromBranchId);
  const toBranch = await getActiveBranchOrThrow(payload.toBranchId, "To branch");

  assertDifferentBranches(fromBranch.id, toBranch.id);

  const transferCode = payload.transferCode
    ? payload.transferCode.trim().toUpperCase()
    : await generateTransferCode(fromBranch);

  await assertTransferCodeIsUnique(fromBranch.id, transferCode);

  const items = await validateAndBuildItems(payload.items, fromBranch.id, actor);

  return prisma.$transaction(async (tx) => {
    const stockTransfer = await tx.stockTransfer.create({
      data: {
        transferCode,
        status: "DRAFT",
        notes: normalizeOptionalString(payload.notes),
        internalNotes: normalizeOptionalString(payload.internalNotes),
        fromBranchId: fromBranch.id,
        toBranchId: toBranch.id,
        createdById: actor.id,
        updatedById: actor.id,
        items: {
          create: items,
        },
      },
      include: STOCK_TRANSFER_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: stockTransfer.fromBranchId,
        action: "STOCK_TRANSFER_CREATED",
        entityType: "StockTransfer",
        entityId: stockTransfer.id,
        description: `Stock transfer ${stockTransfer.transferCode} created`,
        metadata: {
          transferCode: stockTransfer.transferCode,
          status: stockTransfer.status,
          fromBranchId: stockTransfer.fromBranchId,
          toBranchId: stockTransfer.toBranchId,
          itemCount: stockTransfer.items.length,
          notes: stockTransfer.notes,
          internalNotes: stockTransfer.internalNotes,
        },
      },
      tx
    );

    return stockTransfer;
  });
};

const listStockTransfers = async (filters = {}, actor) => {
  assertViewStockTransferRole(actor);

  const page = Number.parseInt(filters.page || "1", 10);
  const limit = Number.parseInt(filters.limit || "20", 10);
  const safeLimit = Math.min(limit, 100);
  const skip = (page - 1) * safeLimit;
  const search = filters.search ? filters.search.trim() : null;

  const where = {
    status: filters.status,
  };

  const andConditions = [];

  if (actor.role !== "SUPER_OWNER") {
    if (!actor.branchId) {
      throw new AppError(
        "User is not assigned to a branch",
        400,
        "USER_BRANCH_REQUIRED"
      );
    }

    if (filters.branchId && filters.branchId !== actor.branchId) {
      throw new AppError(
        "You can only filter stock transfers linked to your branch",
        403,
        "BRANCH_ACCESS_DENIED"
      );
    }

    if (
      filters.fromBranchId &&
      filters.toBranchId &&
      filters.fromBranchId !== actor.branchId &&
      filters.toBranchId !== actor.branchId
    ) {
      throw new AppError(
        "You can only filter stock transfers linked to your branch",
        403,
        "BRANCH_ACCESS_DENIED"
      );
    }

    if (filters.fromBranchId && filters.toBranchId) {
      where.fromBranchId = filters.fromBranchId;
      where.toBranchId = filters.toBranchId;
    } else if (filters.fromBranchId) {
      where.fromBranchId = filters.fromBranchId;
      if (filters.fromBranchId !== actor.branchId) {
        where.toBranchId = actor.branchId;
      }
    } else if (filters.toBranchId) {
      where.toBranchId = filters.toBranchId;
      if (filters.toBranchId !== actor.branchId) {
        where.fromBranchId = actor.branchId;
      }
    } else {
      andConditions.push({
        OR: [
          { fromBranchId: actor.branchId },
          { toBranchId: actor.branchId },
        ],
      });
    }
  } else {
    if (filters.fromBranchId) {
      where.fromBranchId = filters.fromBranchId;
    }
    if (filters.toBranchId) {
      where.toBranchId = filters.toBranchId;
    }
    if (filters.branchId) {
      andConditions.push({
        OR: [
          { fromBranchId: filters.branchId },
          { toBranchId: filters.branchId },
        ],
      });
    }
  }

  if (filters.dateFrom || filters.dateTo) {
    where.transferDate = {};

    if (filters.dateFrom) {
      const dateFrom = new Date(filters.dateFrom);
      if (Number.isNaN(dateFrom.getTime())) {
        throw new AppError("Invalid dateFrom value", 400, "INVALID_DATE_FROM");
      }
      dateFrom.setHours(0, 0, 0, 0);
      where.transferDate.gte = dateFrom;
    }

    if (filters.dateTo) {
      const dateTo = new Date(filters.dateTo);
      if (Number.isNaN(dateTo.getTime())) {
        throw new AppError("Invalid dateTo value", 400, "INVALID_DATE_TO");
      }
      dateTo.setHours(23, 59, 59, 999);
      where.transferDate.lte = dateTo;
    }

    if (
      where.transferDate.gte &&
      where.transferDate.lte &&
      where.transferDate.gte > where.transferDate.lte
    ) {
      throw new AppError(
        "dateFrom cannot be later than dateTo",
        400,
        "INVALID_DATE_RANGE"
      );
    }
  }

  if (search) {
    const searchOr = [
      {
        transferCode: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        notes: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        internalNotes: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];

    andConditions.push({ OR: searchOr });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const [items, totalItems] = await prisma.$transaction([
    prisma.stockTransfer.findMany({
      where,
      include: STOCK_TRANSFER_INCLUDE,
      orderBy: {
        transferDate: "desc",
      },
      skip,
      take: safeLimit,
    }),
    prisma.stockTransfer.count({
      where,
    }),
  ]);

  const totalPages = Math.ceil(totalItems / safeLimit) || 1;

  return sanitizeStockTransferCostsForActor({
    items,
    pagination: {
      page,
      limit: safeLimit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  }, actor);
};

const getStockTransferById = async (stockTransferId, actor) => {
  const stockTransfer = await prisma.stockTransfer.findUnique({
    where: {
      id: stockTransferId,
    },
    include: STOCK_TRANSFER_INCLUDE,
  });

  if (!stockTransfer) {
    throw new AppError("Stock transfer not found", 404, "STOCK_TRANSFER_NOT_FOUND");
  }

  assertStockTransferAccess(stockTransfer, actor);

  return sanitizeStockTransferCostsForActor(stockTransfer, actor);
};

const updateStockTransferById = async (stockTransferId, payload, actor) => {
  const existingTransfer = await prisma.stockTransfer.findUnique({
    where: {
      id: stockTransferId,
    },
    include: STOCK_TRANSFER_INCLUDE,
  });

  if (!existingTransfer) {
    throw new AppError("Stock transfer not found", 404, "STOCK_TRANSFER_NOT_FOUND");
  }

  assertStockTransferManageAccess(existingTransfer, actor);

  if (existingTransfer.status !== "DRAFT") {
    throw new AppError(
      "Only draft stock transfers can be updated",
      400,
      "STOCK_TRANSFER_NOT_DRAFT"
    );
  }

  const updateData = {
    updatedById: actor.id,
  };

  if (payload.toBranchId !== undefined) {
    const toBranch = await getActiveBranchOrThrow(payload.toBranchId, "To branch");

    assertDifferentBranches(existingTransfer.fromBranchId, toBranch.id);

    updateData.toBranchId = toBranch.id;
  }

  if (payload.transferCode !== undefined) {
    const transferCode = payload.transferCode.trim().toUpperCase();

    await assertTransferCodeIsUnique(
      existingTransfer.fromBranchId,
      transferCode,
      existingTransfer.id
    );

    updateData.transferCode = transferCode;
  }

  if (payload.notes !== undefined) {
    updateData.notes = normalizeOptionalString(payload.notes);
  }

  if (payload.internalNotes !== undefined) {
    updateData.internalNotes = normalizeOptionalString(payload.internalNotes);
  }

  if (payload.items !== undefined) {
    const items = await validateAndBuildItems(
      payload.items,
      existingTransfer.fromBranchId,
      actor
    );

    const changedFields = Object.keys(updateData).filter(
      (field) => field !== "updatedById"
    );

    if (!changedFields.includes("items")) {
      changedFields.push("items");
    }

    return prisma.$transaction(async (tx) => {
      await tx.stockTransferItem.deleteMany({
        where: {
          stockTransferId: existingTransfer.id,
        },
      });

      const stockTransfer = await tx.stockTransfer.update({
        where: {
          id: existingTransfer.id,
        },
        data: {
          ...updateData,
          items: {
            create: items,
          },
        },
        include: STOCK_TRANSFER_INCLUDE,
      });

      await createAuditLog(
        {
          actor,
          branchId: stockTransfer.fromBranchId,
          action: "STOCK_TRANSFER_UPDATED",
          entityType: "StockTransfer",
          entityId: stockTransfer.id,
          description: `Stock transfer ${stockTransfer.transferCode} updated`,
          metadata: {
            transferCode: stockTransfer.transferCode,
            status: stockTransfer.status,
            changedFields,
            previous: {
              transferCode: existingTransfer.transferCode,
              fromBranchId: existingTransfer.fromBranchId,
              toBranchId: existingTransfer.toBranchId,
              notes: existingTransfer.notes,
              internalNotes: existingTransfer.internalNotes,
              itemCount: existingTransfer.items.length,
            },
            current: {
              transferCode: stockTransfer.transferCode,
              fromBranchId: stockTransfer.fromBranchId,
              toBranchId: stockTransfer.toBranchId,
              notes: stockTransfer.notes,
              internalNotes: stockTransfer.internalNotes,
              itemCount: stockTransfer.items.length,
            },
          },
        },
        tx
      );

      return stockTransfer;
    });
  }

  const changedFields = Object.keys(updateData).filter(
    (field) => field !== "updatedById"
  );

  return prisma.$transaction(async (tx) => {
    const stockTransfer = await tx.stockTransfer.update({
      where: {
        id: existingTransfer.id,
      },
      data: updateData,
      include: STOCK_TRANSFER_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: stockTransfer.fromBranchId,
        action: "STOCK_TRANSFER_UPDATED",
        entityType: "StockTransfer",
        entityId: stockTransfer.id,
        description: `Stock transfer ${stockTransfer.transferCode} updated`,
        metadata: {
          transferCode: stockTransfer.transferCode,
          status: stockTransfer.status,
          changedFields,
          previous: {
            transferCode: existingTransfer.transferCode,
            fromBranchId: existingTransfer.fromBranchId,
            toBranchId: existingTransfer.toBranchId,
            notes: existingTransfer.notes,
            internalNotes: existingTransfer.internalNotes,
            itemCount: existingTransfer.items.length,
          },
          current: {
            transferCode: stockTransfer.transferCode,
            fromBranchId: stockTransfer.fromBranchId,
            toBranchId: stockTransfer.toBranchId,
            notes: stockTransfer.notes,
            internalNotes: stockTransfer.internalNotes,
            itemCount: stockTransfer.items.length,
          },
        },
      },
      tx
    );

    return stockTransfer;
  });
};

const updateStockTransferPricingById = async (stockTransferId, payload, actor) => {
  const requestedPrices = Array.isArray(payload.items) ? payload.items : [];
  const requestedItemIds = requestedPrices.map(
    (item) => item.stockTransferItemId
  );

  if (new Set(requestedItemIds).size !== requestedItemIds.length) {
    throw new AppError(
      "Each stock transfer line can only be priced once per request",
      400,
      "DUPLICATE_STOCK_TRANSFER_PRICING_LINE"
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "StockTransfer"
      WHERE "id" = ${stockTransferId}
      FOR UPDATE
    `;

    const stockTransfer = await tx.stockTransfer.findUnique({
      where: { id: stockTransferId },
      include: STOCK_TRANSFER_INCLUDE,
    });

    if (!stockTransfer) {
      throw new AppError(
        "Stock transfer not found",
        404,
        "STOCK_TRANSFER_NOT_FOUND"
      );
    }

    assertStockTransferManageAccess(stockTransfer, actor);

    if (!["DRAFT", "REQUESTED"].includes(stockTransfer.status)) {
      throw new AppError(
        "Transfer Cost / Unit is locked once the transfer is approved",
        409,
        "STOCK_TRANSFER_PRICING_LOCKED"
      );
    }

    const transferItemMap = new Map(
      stockTransfer.items.map((item) => [item.id, item])
    );

    const invalidItemId = requestedItemIds.find(
      (itemId) => !transferItemMap.has(itemId)
    );

    if (invalidItemId) {
      throw new AppError(
        "One or more pricing lines do not belong to this stock transfer",
        400,
        "STOCK_TRANSFER_ITEM_MISMATCH"
      );
    }

    const priceSetAt = new Date();

    for (const itemPayload of requestedPrices) {
      const agreedPrice = normalizeTransferUnitPrice(
        itemPayload.agreedTransferUnitPrice,
        "Transfer Cost / Unit"
      );

      if (agreedPrice === null) {
        throw new AppError(
          "Transfer Cost / Unit is required",
          400,
          "AGREED_TRANSFER_UNIT_PRICE_REQUIRED"
        );
      }

      const currentLine = transferItemMap.get(
        itemPayload.stockTransferItemId
      );

      const projectedTransferAmount = toMoneyDecimal(
        new Prisma.Decimal(currentLine.quantity).mul(agreedPrice)
      );

      if (projectedTransferAmount.greaterThan(MAX_TRANSFER_MONEY)) {
        throw new AppError(
          "Projected transfer amount is too large",
          400,
          "TRANSFER_AMOUNT_TOO_LARGE"
        );
      }

      const update = await tx.stockTransferItem.updateMany({
        where: {
          id: itemPayload.stockTransferItemId,
          stockTransferId: stockTransfer.id,
          priceLockedAt: null,
        },
        data: {
          agreedTransferUnitPrice: agreedPrice.toFixed(2),

          // Projected before approval.
          // Approval will recalculate and lock this same value.
          transferAmount: projectedTransferAmount.toFixed(2),

          priceSetAt,
          priceSetById: actor.id,
        },
      });

      if (update.count !== 1) {
        throw new AppError(
          "Transfer Cost / Unit was locked before this update completed",
          409,
          "STOCK_TRANSFER_PRICING_LOCKED"
        );
      }
    }

    const currentLines = await tx.stockTransferItem.findMany({
      where: {
        stockTransferId: stockTransfer.id,
      },
      select: {
        quantity: true,
        agreedTransferUnitPrice: true,
        transferAmount: true,
      },
    });

    const projectedItemSubtotal = currentLines.reduce(
      (sum, line) =>
        line.transferAmount === null
          ? sum
          : sum.plus(line.transferAmount),
      new Prisma.Decimal(0)
    );

    const headerData = {
      updatedById: actor.id,
    };

    if (stockTransfer.fulfillmentMethod) {
      const deliveryCharge = toMoneyDecimal(
        stockTransfer.deliveryCharge || 0
      );

      headerData.itemSubtotal =
        toMoneyDecimal(projectedItemSubtotal).toFixed(2);

      headerData.grandTotal = toMoneyDecimal(
        projectedItemSubtotal.plus(deliveryCharge)
      ).toFixed(2);
    }

    await tx.stockTransfer.update({
      where: { id: stockTransfer.id },
      data: headerData,
    });

    const updatedTransfer = await tx.stockTransfer.findUnique({
      where: { id: stockTransfer.id },
      include: STOCK_TRANSFER_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: updatedTransfer.fromBranchId,
        action: "STOCK_TRANSFER_PRICE_SET",
        entityType: "StockTransfer",
        entityId: updatedTransfer.id,
        description: `Transfer cost set for ${updatedTransfer.transferCode}`,
        metadata: {
          transferCode: updatedTransfer.transferCode,
          priceSetAt,
          projectedItemSubtotal:
            toMoneyDecimal(projectedItemSubtotal).toFixed(2),
          projectedGrandTotal:
            updatedTransfer.grandTotal?.toString() || null,
          lines: requestedPrices.map((item) => {
            const savedLine = updatedTransfer.items.find(
              (line) => line.id === item.stockTransferItemId
            );

            return {
              stockTransferItemId: item.stockTransferItemId,
              transferCostPerUnit:
                savedLine?.agreedTransferUnitPrice?.toString() || null,
              projectedTransferAmount:
                savedLine?.transferAmount?.toString() || null,
            };
          }),
        },
      },
      tx
    );

    return sanitizeStockTransferCostsForActor(
      updatedTransfer,
      actor
    );
  });
};

const createTransferMovementCode = async (tx, branchId, branchCode, itemCode, movementType) => {
  const prefix = `MOV-${branchCode}-${itemCode}-${movementType}-`;

  const existingMovements = await tx.inventoryMovement.findMany({
    where: {
      branchId,
      movementCode: {
        startsWith: prefix,
      },
    },
    select: {
      movementCode: true,
    },
  });

  let highestNumber = 0;

  for (const movement of existingMovements) {
    const suffix = movement.movementCode.replace(prefix, "");
    const parsedNumber = Number.parseInt(suffix, 10);

    if (!Number.isNaN(parsedNumber) && parsedNumber > highestNumber) {
      highestNumber = parsedNumber;
    }
  }

  return `${prefix}${String(highestNumber + 1).padStart(5, "0")}`;
};

const getTransferSourceItems = async (
  tx,
  transferItem,
  sourceItem,
  fromBranch,
  toBranchId
) => {
  const quantity = Number(transferItem.quantity);
  const persistedTransferSerials = Array.isArray(transferItem.serials)
    ? transferItem.serials
    : [];

  if (sourceItem.isSerialized) {
    if (!Number.isInteger(quantity)) {
      throw new AppError(
        "Serialized transfer quantity must be a whole number",
        400,
        "SERIALIZED_QUANTITY_MUST_BE_WHOLE_NUMBER"
      );
    }

    const persistedSerialIds = persistedTransferSerials.map(
      (transferSerial) => transferSerial.itemSerialId
    );

    const serials = await tx.itemSerial.findMany({
      where: {
        ...(persistedSerialIds.length > 0
          ? { id: { in: persistedSerialIds } }
          : {}),
        branchId: fromBranch.id,
        itemId: sourceItem.id,
        status: "AVAILABLE",
        batchId: {
          not: null,
        },
        ...(transferItem.fromBatchId
          ? { batchId: transferItem.fromBatchId }
          : {}),
        batch: {
          is: {
            branchId: fromBranch.id,
            itemId: sourceItem.id,
            status: "ACTIVE",
          },
        },
      },
      include: {
        batch: true,
      },
      orderBy: [
        { createdAt: "asc" },
        { serialNumber: "asc" },
      ],
      ...(persistedSerialIds.length === 0 ? { take: quantity } : {}),
    });

    if (serials.length !== quantity) {
      throw new AppError(
        "Serialized transfer requires enough available serials",
        400,
        "SERIAL_COUNT_MISMATCH"
      );
    }

    const destinationCollision = await tx.itemSerial.findFirst({
      where: {
        branchId: toBranchId,
        serialNumber: {
          in: serials.map((serial) => serial.serialNumber),
        },
      },
      select: {
        id: true,
        serialNumber: true,
      },
    });

    if (destinationCollision) {
      throw new AppError(
        `Serial ${destinationCollision.serialNumber} already exists in destination branch`,
        409,
        "DESTINATION_SERIAL_ALREADY_EXISTS"
      );
    }

    if (persistedSerialIds.length === 0) {
      await tx.stockTransferSerial.createMany({
        data: serials.map((serial) => ({
          stockTransferItemId: transferItem.id,
          itemSerialId: serial.id,
          serialNumberSnapshot: serial.serialNumber,
        })),
      });
    }

    const allocationsByBatch = new Map();

    for (const serial of serials) {
      if (!serial.batch) {
        throw new AppError(
          "Serial is not linked to an active source batch",
          400,
          "SERIAL_BATCH_REQUIRED"
        );
      }

      const allocation = allocationsByBatch.get(serial.batch.id) || {
        batch: serial.batch,
        quantity: 0,
        serials: [],
      };

      allocation.quantity += 1;
      allocation.serials.push(serial);
      allocationsByBatch.set(serial.batch.id, allocation);
    }

    const allocations = Array.from(allocationsByBatch.values());

    if (
      allocations.some(
        (allocation) =>
          Number(allocation.batch.quantityAvailable) < allocation.quantity
      )
    ) {
      throw new AppError(
        "Source batch quantity is lower than its available serial count",
        400,
        "INSUFFICIENT_SOURCE_BATCH_QUANTITY"
      );
    }

    return allocations;
  }

  if (persistedTransferSerials.length > 0) {
    throw new AppError(
      "Serials are not allowed for non-serialized item",
      400,
      "SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM"
    );
  }

  if (transferItem.fromBatchId) {
    const sourceBatch = await tx.inventoryBatch.findUnique({
      where: {
        id: transferItem.fromBatchId,
      },
    });

    if (!sourceBatch) {
      throw new AppError("Source batch not found", 404, "SOURCE_BATCH_NOT_FOUND");
    }

    if (
      sourceBatch.branchId !== fromBranch.id ||
      sourceBatch.itemId !== sourceItem.id ||
      sourceBatch.status !== "ACTIVE"
    ) {
      throw new AppError(
        "Source batch does not match transfer item and active from branch inventory",
        403,
        "SOURCE_BATCH_MISMATCH"
      );
    }

    return [{ batch: sourceBatch, quantity, serials: [] }];
  }

  const sourceBatches = await tx.inventoryBatch.findMany({
    where: {
      branchId: fromBranch.id,
      itemId: sourceItem.id,
      status: "ACTIVE",
      quantityAvailable: {
        gt: 0,
      },
    },
    orderBy: [
      { receivedAt: "asc" },
      { createdAt: "asc" },
    ],
  });

  let remainingQuantity = quantity;
  const allocations = [];

  for (const sourceBatch of sourceBatches) {
    if (remainingQuantity <= 0) {
      break;
    }

    const allocatedQuantity = Math.min(
      remainingQuantity,
      Number(sourceBatch.quantityAvailable)
    );

    if (allocatedQuantity > 0) {
      allocations.push({
        batch: sourceBatch,
        quantity: allocatedQuantity,
        serials: [],
      });
      remainingQuantity -= allocatedQuantity;
    }
  }

  if (remainingQuantity > 0.000001) {
    throw new AppError(
      "Insufficient active source stock across available batches",
      400,
      "INSUFFICIENT_SOURCE_BATCH_QUANTITY"
    );
  }

  return allocations;
};

const assertStockTransferStatusAccess = (stockTransfer, nextStatus, actor) => {
  assertManageStockTransferRole(actor);

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

  const canManageFromBranch = stockTransfer.fromBranchId === actor.branchId;
  const canCancelLinkedTransfer =
    nextStatus === "CANCELLED" && stockTransfer.toBranchId === actor.branchId;

  if (!canManageFromBranch && !canCancelLinkedTransfer) {
    throw new AppError(
      nextStatus === "CANCELLED"
        ? "You can only cancel stock transfers linked to your branch"
        : "Only the source branch can perform this stock transfer action",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const applyTransferAllocation = async (
  tx,
  {
    stockTransfer,
    transferItem,
    sourceItem,
    destinationItem,
    sourceBatch,
    quantity,
    serials,
    allocationTransferAmount,
    fromBranch,
    toBranch,
    actor,
  }
) => {
  const sourceUpdate = await tx.inventoryBatch.updateMany({
    where: {
      id: sourceBatch.id,
      branchId: fromBranch.id,
      itemId: sourceItem.id,
      status: "ACTIVE",
      quantityAvailable: {
        gte: quantity.toString(),
      },
    },
    data: {
      quantityAvailable: {
        decrement: quantity.toString(),
      },
      updatedById: actor.id,
    },
  });

  if (sourceUpdate.count !== 1) {
    throw new AppError(
      "Insufficient source batch quantity",
      400,
      "INSUFFICIENT_SOURCE_BATCH_QUANTITY"
    );
  }

  let updatedSourceBatch = await tx.inventoryBatch.findUnique({
    where: {
      id: sourceBatch.id,
    },
  });

  const sourceNewQuantity = Number(updatedSourceBatch.quantityAvailable);
  const sourcePreviousQuantity = sourceNewQuantity + quantity;

  if (sourceNewQuantity === 0) {
    updatedSourceBatch = await tx.inventoryBatch.update({
      where: {
        id: sourceBatch.id,
      },
      data: {
        status: "DEPLETED",
        updatedById: actor.id,
      },
    });
  }

  const referenceNo = stockTransfer.transferCode;
  const destinationBatchCode = [
    "TRN",
    String(fromBranch.code).replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
    String(stockTransfer.transferCode).replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
    `L${transferItem.lineNo}`,
    sourceBatch.id.toUpperCase(),
  ].join("-");
  const existingDestinationBatch = await tx.inventoryBatch.findUnique({
    where: {
      branchId_batchCode: {
        branchId: toBranch.id,
        batchCode: destinationBatchCode,
      },
    },
  });

  if (existingDestinationBatch) {
    throw new AppError(
      "Transfer destination batch code already exists and cannot be reused",
      409,
      "DESTINATION_BATCH_CODE_ALREADY_EXISTS"
    );
  }

  const acquisitionUnitCost = toMoneyDecimal(sourceBatch.unitCost);
  const sourceOperationalUnitCost = toMoneyDecimal(
    sourceBatch.operationalUnitCost ?? sourceBatch.unitCost
  );
  const destinationOperationalUnitCost = normalizeTransferUnitPrice(
    transferItem.agreedTransferUnitPrice,
    "Locked agreed transfer unit price"
  );

  let destinationBatch;

  try {
    destinationBatch = await tx.inventoryBatch.create({
      data: {
      branchId: toBranch.id,
      itemId: destinationItem.id,
      batchCode: destinationBatchCode,
      quantityIn: quantity.toString(),
      quantityAvailable: quantity.toString(),
      unitCost: acquisitionUnitCost.toFixed(2),
      operationalUnitCost: destinationOperationalUnitCost.toFixed(2),
      sellingPrice1: destinationItem.price1.toString(),
      sellingPrice2: destinationItem.price2.toString(),
      sellingPrice3: destinationItem.price3.toString(),
      sellingPrice4: destinationItem.price4.toString(),
      sellingPrice5: destinationItem.price5.toString(),
      supplierName: sourceBatch.supplierName,
      referenceNo,
      remarks: `Transfer in from ${fromBranch.code} via ${stockTransfer.transferCode}`,
      expiryDate: sourceBatch.expiryDate || null,
      originBatchId: sourceBatch.id,
      status: "ACTIVE",
      createdById: actor.id,
      updatedById: actor.id,
      },
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError(
        "Transfer destination batch code already exists and cannot be reused",
        409,
        "DESTINATION_BATCH_CODE_ALREADY_EXISTS"
      );
    }

    throw error;
  }

  const destinationNewQuantity = Number(destinationBatch.quantityAvailable);
  const destinationPreviousQuantity = 0;

  const allocation = await tx.stockTransferAllocation.create({
    data: {
      stockTransferItemId: transferItem.id,
      sourceBatchId: sourceBatch.id,
      destinationBatchId: destinationBatch.id,
      quantity: quantity.toString(),
      acquisitionUnitCostSnapshot: acquisitionUnitCost.toFixed(2),
      sourceOperationalUnitCostSnapshot: sourceOperationalUnitCost.toFixed(2),
      destinationOperationalUnitCostSnapshot:
        destinationOperationalUnitCost.toFixed(2),
      transferAmount: allocationTransferAmount.toFixed(2),
    },
  });

  const transferOutMovementCode = await createTransferMovementCode(
    tx,
    fromBranch.id,
    fromBranch.code,
    sourceItem.itemCode,
    "TRANSFEROUT"
  );

  await tx.inventoryMovement.create({
    data: {
      branchId: fromBranch.id,
      itemId: sourceItem.id,
      batchId: sourceBatch.id,
      movementCode: transferOutMovementCode,
      type: "TRANSFER_OUT",
      source: "TRANSFER",
      quantity: quantity.toString(),
      previousQuantity: sourcePreviousQuantity.toString(),
      newQuantity: sourceNewQuantity.toString(),
      unitCost: acquisitionUnitCost.toFixed(2),
      referenceNo,
      remarks: `Transfer out to ${toBranch.code} via ${stockTransfer.transferCode}`,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  const transferInMovementCode = await createTransferMovementCode(
    tx,
    toBranch.id,
    toBranch.code,
    destinationItem.itemCode,
    "TRANSFERIN"
  );

  await tx.inventoryMovement.create({
    data: {
      branchId: toBranch.id,
      itemId: destinationItem.id,
      batchId: destinationBatch.id,
      movementCode: transferInMovementCode,
      type: "TRANSFER_IN",
      source: "TRANSFER",
      quantity: quantity.toString(),
      previousQuantity: destinationPreviousQuantity.toString(),
      newQuantity: destinationNewQuantity.toString(),
      unitCost: acquisitionUnitCost.toFixed(2),
      referenceNo,
      remarks: `Transfer in from ${fromBranch.code} via ${stockTransfer.transferCode}`,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  for (const serial of serials) {
    const transferSerialUpdate = await tx.stockTransferSerial.updateMany({
      where: {
        stockTransferItemId: transferItem.id,
        itemSerialId: serial.id,
        allocationId: null,
      },
      data: {
        allocationId: allocation.id,
      },
    });

    if (transferSerialUpdate.count !== 1) {
      throw new AppError(
        "Transfer serial allocation lineage is missing or already assigned",
        409,
        "STOCK_TRANSFER_SERIAL_ALLOCATION_CONFLICT"
      );
    }

    const serialUpdate = await tx.itemSerial.updateMany({
      where: {
        id: serial.id,
        branchId: fromBranch.id,
        itemId: sourceItem.id,
        batchId: sourceBatch.id,
        status: "AVAILABLE",
      },
      data: {
        branchId: toBranch.id,
        itemId: destinationItem.id,
        batchId: destinationBatch.id,
        status: "AVAILABLE",
        remarks: `Transferred from ${fromBranch.code} via ${stockTransfer.transferCode}`,
        updatedById: actor.id,
      },
    });

    if (serialUpdate.count !== 1) {
      throw new AppError(
        "Serial is no longer available in source branch and batch",
        409,
        "SERIAL_NOT_AVAILABLE"
      );
    }
  }

  return {
    transferItemId: transferItem.id,
    allocation,
    updatedSourceBatch,
    destinationBatch,
  };
};

const postStockTransferInventoryMovement = async (tx, stockTransfer, actor) => {
  const [fromBranch, toBranch] = await Promise.all([
    tx.branch.findUnique({
      where: { id: stockTransfer.fromBranchId },
      select: { id: true, code: true, name: true, status: true },
    }),
    tx.branch.findUnique({
      where: { id: stockTransfer.toBranchId },
      select: { id: true, code: true, name: true, status: true },
    }),
  ]);

  if (!fromBranch || fromBranch.status !== "ACTIVE") {
    throw new AppError("From branch is not active", 400, "FROM_BRANCH_NOT_ACTIVE");
  }

  if (!toBranch || toBranch.status !== "ACTIVE") {
    throw new AppError("To branch is not active", 400, "TO_BRANCH_NOT_ACTIVE");
  }

  for (const transferItem of stockTransfer.items) {
    if (
      transferItem.agreedTransferUnitPrice === null ||
      transferItem.transferAmount === null ||
      !transferItem.priceLockedAt ||
      !transferItem.destinationItemId
    ) {
      throw new AppError(
        "Approved transfer pricing or destination item lock is incomplete",
        409,
        "STOCK_TRANSFER_PRICING_NOT_LOCKED"
      );
    }

    if (transferItem.allocations?.length > 0) {
      throw new AppError(
        "Stock transfer line was already allocated",
        409,
        "STOCK_TRANSFER_ALREADY_ALLOCATED"
      );
    }

    const agreedTransferUnitPrice = normalizeTransferUnitPrice(
      transferItem.agreedTransferUnitPrice,
      "Locked agreed transfer unit price"
    );
    const lockedTransferAmount = toMoneyDecimal(transferItem.transferAmount);
    const expectedTransferAmount = toMoneyDecimal(
      new Prisma.Decimal(transferItem.quantity).mul(agreedTransferUnitPrice)
    );

    if (!lockedTransferAmount.equals(expectedTransferAmount)) {
      throw new AppError(
        "Locked transfer amount does not match quantity and agreed unit price",
        409,
        "STOCK_TRANSFER_AMOUNT_MISMATCH"
      );
    }

    const sourceItem = await tx.item.findUnique({
        where: { id: transferItem.itemId },
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          status: true,
          branchId: true,
          isSerialized: true,
          hasWarranty: true,
          costPrice: true,
          price1: true,
          price2: true,
          price3: true,
          price4: true,
          price5: true,
        },
    });

    if (!sourceItem) {
      throw new AppError("Source item not found", 404, "SOURCE_ITEM_NOT_FOUND");
    }

    if (sourceItem.branchId !== fromBranch.id) {
      throw new AppError(
        "Source item does not belong to from branch",
        403,
        "SOURCE_ITEM_BRANCH_MISMATCH"
      );
    }

    if (sourceItem.status !== "ACTIVE") {
      throw new AppError("Source item is not active", 400, "SOURCE_ITEM_NOT_ACTIVE");
    }

    const destinationItem = await tx.item.findFirst({
        where: {
          id: transferItem.destinationItemId,
          branchId: toBranch.id,
          itemCode: sourceItem.itemCode,
          status: "ACTIVE",
        },
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          status: true,
          branchId: true,
          isSerialized: true,
          hasWarranty: true,
          costPrice: true,
          price1: true,
          price2: true,
          price3: true,
          price4: true,
          price5: true,
        },
    });

    if (!destinationItem) {
      throw new AppError(
        "Matching destination itemCode not found in to branch",
        404,
        "DESTINATION_ITEM_NOT_FOUND"
      );
    }

    if (destinationItem.isSerialized !== sourceItem.isSerialized) {
      throw new AppError(
        "Destination item serialized setting does not match source item",
        400,
        "DESTINATION_ITEM_SERIALIZED_MISMATCH"
      );
    }

    const allocations = await getTransferSourceItems(
      tx,
      transferItem,
      sourceItem,
      fromBranch,
      toBranch.id
    );

    let allocatedQuantity = new Prisma.Decimal(0);
    let allocatedTransferAmount = new Prisma.Decimal(0);

    for (let index = 0; index < allocations.length; index += 1) {
      const allocation = allocations[index];
      const isFinalAllocation = index === allocations.length - 1;
      allocatedQuantity = allocatedQuantity.plus(allocation.quantity);
      const allocationTransferAmount = isFinalAllocation
        ? lockedTransferAmount.minus(allocatedTransferAmount)
        : toMoneyDecimal(allocatedQuantity.mul(agreedTransferUnitPrice)).minus(
            allocatedTransferAmount
          );

      if (allocationTransferAmount.isNegative()) {
        throw new AppError(
          "Transfer allocation amount could not be reconciled",
          409,
          "STOCK_TRANSFER_ALLOCATION_AMOUNT_MISMATCH"
        );
      }

      await applyTransferAllocation(tx, {
        stockTransfer,
        transferItem,
        sourceItem,
        destinationItem,
        sourceBatch: allocation.batch,
        quantity: allocation.quantity,
        serials: allocation.serials,
        allocationTransferAmount,
        fromBranch,
        toBranch,
        actor,
      });

      allocatedTransferAmount = allocatedTransferAmount.plus(
        allocationTransferAmount
      );
    }

    const postedAllocation = await tx.stockTransferAllocation.aggregate({
      where: { stockTransferItemId: transferItem.id },
      _sum: {
        quantity: true,
        transferAmount: true,
      },
    });

    if (
      !new Prisma.Decimal(postedAllocation._sum.quantity || 0).equals(
        new Prisma.Decimal(transferItem.quantity)
      ) ||
      !toMoneyDecimal(postedAllocation._sum.transferAmount || 0).equals(
        lockedTransferAmount
      )
    ) {
      throw new AppError(
        "Posted allocation totals do not match the locked transfer line",
        409,
        "STOCK_TRANSFER_ALLOCATION_TOTAL_MISMATCH"
      );
    }
  }
};

const resolveDestinationTransferItem = async (
  tx,
  {
    sourceItemId,
    toBranchId,
    actor,
  }
) => {
  const sourceItem = await tx.item.findUnique({
    where: {
      id: sourceItemId,
    },
    select: {
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
      category: {
        select: {
          id: true,
          categoryCode: true,
          name: true,
          status: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitCode: true,
          name: true,
          status: true,
        },
      },
    },
  });

  if (!sourceItem) {
    throw new AppError(
      "Source item not found",
      404,
      "SOURCE_ITEM_NOT_FOUND"
    );
  }

  if (sourceItem.status !== "ACTIVE") {
    throw new AppError(
      "Source item is not active",
      400,
      "SOURCE_ITEM_NOT_ACTIVE"
    );
  }

  /*
   * Item identity is mirrored between branches using the same
   * Item Code. The database permits the same itemCode in different
   * branches because uniqueness is branchId + itemCode.
   */
  let destinationItem = await tx.item.findFirst({
    where: {
      branchId: toBranchId,
      itemCode: sourceItem.itemCode,
    },
    select: {
      id: true,
      itemCode: true,
      itemName: true,
      status: true,
      branchId: true,
      isSerialized: true,
    },
  });

  if (destinationItem) {
    if (destinationItem.status !== "ACTIVE") {
      throw new AppError(
        `Destination item ${sourceItem.itemCode} exists but is inactive`,
        409,
        "DESTINATION_ITEM_INACTIVE"
      );
    }

    if (
      destinationItem.isSerialized !==
      sourceItem.isSerialized
    ) {
      throw new AppError(
        "Destination item serialized setting does not match source item",
        400,
        "DESTINATION_ITEM_SERIALIZED_MISMATCH"
      );
    }

    return destinationItem;
  }

  /*
   * Categories are branch-scoped in the current catalog model.
   * Resolve the equivalent category by categoryCode.
   */
  const destinationCategory =
    await tx.itemCategory.findFirst({
      where: {
        branchId: toBranchId,
        categoryCode: sourceItem.category.categoryCode,
        status: "ACTIVE",
      },
      select: {
        id: true,
        categoryCode: true,
      },
    });

  if (!destinationCategory) {
    throw new AppError(
      `Destination branch does not have active category ${sourceItem.category.categoryCode}`,
      409,
      "DESTINATION_CATEGORY_NOT_FOUND"
    );
  }

  /*
   * Units are shared catalog references in the current item service.
   * Resolve by the same unitCode rather than blindly copying an ID.
   */
  const destinationUnit = await tx.unit.findFirst({
    where: {
      unitCode: sourceItem.unit.unitCode,
      status: "ACTIVE",
    },
    select: {
      id: true,
      unitCode: true,
    },
  });

  if (!destinationUnit) {
    throw new AppError(
      `Active unit ${sourceItem.unit.unitCode} was not found`,
      409,
      "DESTINATION_UNIT_NOT_FOUND"
    );
  }

  try {
    destinationItem = await tx.item.create({
      data: {
        itemCode: sourceItem.itemCode,
        itemName: sourceItem.itemName,
        description: sourceItem.description,
        barcode: sourceItem.barcode,
        brand: sourceItem.brand,
        modelName: sourceItem.modelName,

        status: "ACTIVE",
        isSerialized: sourceItem.isSerialized,
        hasWarranty: sourceItem.hasWarranty,

        /*
         * Preserve catalog pricing.
         * Actual transferred-stock operational cost remains handled
         * by the transfer inventory/batch posting flow.
         */
        costPrice: sourceItem.costPrice,
        price1: sourceItem.price1,
        price2: sourceItem.price2,
        price3: sourceItem.price3,
        price4: sourceItem.price4,
        price5: sourceItem.price5,

        /*
         * Do not copy branch-specific replenishment thresholds.
         * Destination admin can configure these separately.
         */
        minimumStock: "0",
        reorderLevel: "0",

        branchId: toBranchId,
        categoryId: destinationCategory.id,
        unitId: destinationUnit.id,

        createdById: actor.id,
        updatedById: actor.id,
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        status: true,
        branchId: true,
        isSerialized: true,
      },
    });
  } catch (error) {
    /*
     * Handle a concurrent approval creating the same
     * branch + itemCode between our lookup and create.
     */
    if (error?.code !== "P2002") {
      throw error;
    }

    destinationItem = await tx.item.findFirst({
      where: {
        branchId: toBranchId,
        itemCode: sourceItem.itemCode,
        status: "ACTIVE",
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        status: true,
        branchId: true,
        isSerialized: true,
      },
    });

    if (!destinationItem) {
      throw error;
    }
  }

  if (
    destinationItem.isSerialized !==
    sourceItem.isSerialized
  ) {
    throw new AppError(
      "Destination item serialized setting does not match source item",
      400,
      "DESTINATION_ITEM_SERIALIZED_MISMATCH"
    );
  }

  await createAuditLog(
    {
      actor,
      branchId: toBranchId,
      action: "STOCK_TRANSFER_DESTINATION_ITEM_CREATED",
      entityType: "Item",
      entityId: destinationItem.id,
      description: `Destination catalog item ${sourceItem.itemCode} created from stock transfer`,
      metadata: {
        sourceItemId: sourceItem.id,
        destinationItemId: destinationItem.id,
        itemCode: sourceItem.itemCode,
        sourceCategoryCode:
          sourceItem.category.categoryCode,
        unitCode: sourceItem.unit.unitCode,
      },
    },
    tx
  );

  return destinationItem;
};

const approveAndLockStockTransferPricing = async (stockTransferId, actor) => {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "StockTransfer" WHERE "id" = ${stockTransferId} FOR UPDATE`;

    const stockTransfer = await tx.stockTransfer.findUnique({
      where: { id: stockTransferId },
      include: STOCK_TRANSFER_INCLUDE,
    });

    if (!stockTransfer) {
      throw new AppError("Stock transfer not found", 404, "STOCK_TRANSFER_NOT_FOUND");
    }

    assertStockTransferStatusAccess(stockTransfer, "APPROVED", actor);

    if (stockTransfer.status === "APPROVED") {
      return stockTransfer;
    }

    if (!["DRAFT", "REQUESTED"].includes(stockTransfer.status)) {
      throw new AppError(
        "Only draft or requested stock transfers can be approved",
        400,
        "INVALID_STATUS_TRANSITION"
      );
    }

    const priceLockedAt = new Date();

    for (const transferItem of stockTransfer.items) {
      if (
        transferItem.agreedTransferUnitPrice === null ||
        !transferItem.priceSetAt ||
        !transferItem.priceSetById
      ) {
        throw new AppError(
          "Every transfer line requires an agreed transfer unit price before approval",
          400,
          "AGREED_TRANSFER_PRICE_REQUIRED"
        );
      }

      const agreedPrice = normalizeTransferUnitPrice(
        transferItem.agreedTransferUnitPrice,
        "Agreed transfer unit price"
      );
      const transferAmount = toMoneyDecimal(
        new Prisma.Decimal(transferItem.quantity).mul(agreedPrice)
      );

      if (transferAmount.greaterThan(MAX_TRANSFER_MONEY)) {
        throw new AppError(
          "Transfer line amount is too large",
          400,
          "TRANSFER_AMOUNT_TOO_LARGE"
        );
      }


      const destinationItem =
        await resolveDestinationTransferItem(tx, {
          sourceItemId: transferItem.itemId,
          toBranchId: stockTransfer.toBranchId,
          actor,
        });

      const itemLock = await tx.stockTransferItem.updateMany({
        where: {
          id: transferItem.id,
          stockTransferId: stockTransfer.id,
          priceLockedAt: null,
        },
        data: {
          destinationItemId: destinationItem.id,
          transferAmount: transferAmount.toFixed(2),
          priceLockedAt,
        },
      });

      if (itemLock.count !== 1) {
        throw new AppError(
          "Transfer pricing was already locked",
          409,
          "STOCK_TRANSFER_PRICING_LOCKED"
        );
      }
    }

    const transition = await tx.stockTransfer.updateMany({
      where: {
        id: stockTransfer.id,
        status: stockTransfer.status,
      },
      data: {
        status: "APPROVED",
        approvedAt: priceLockedAt,
        approvedById: actor.id,
        updatedById: actor.id,
      },
    });

    if (transition.count !== 1) {
      throw new AppError(
        "Stock transfer status changed before approval completed",
        409,
        "STOCK_TRANSFER_STATUS_CONFLICT"
      );
    }

    const approvedTransfer = await tx.stockTransfer.findUnique({
      where: { id: stockTransfer.id },
      include: STOCK_TRANSFER_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: approvedTransfer.fromBranchId,
        action: "STOCK_TRANSFER_APPROVED",
        entityType: "StockTransfer",
        entityId: approvedTransfer.id,
        description: `Stock transfer ${approvedTransfer.transferCode} approved with locked pricing`,
        metadata: {
          transferCode: approvedTransfer.transferCode,
          previousStatus: stockTransfer.status,
          currentStatus: approvedTransfer.status,
          priceLockedAt,
          lineCount: approvedTransfer.items.length,
          transferAmount: approvedTransfer.items
            .reduce(
              (sum, item) => sum.plus(item.transferAmount || 0),
              new Prisma.Decimal(0)
            )
            .toFixed(2),
        },
      },
      tx
    );

    return approvedTransfer;
  });
};

const updateStockTransferStatusById = async (stockTransferId, payload, actor) => {
  const existingTransfer = await prisma.stockTransfer.findUnique({
    where: {
      id: stockTransferId,
    },
    include: STOCK_TRANSFER_INCLUDE,
  });

  if (!existingTransfer) {
    throw new AppError("Stock transfer not found", 404, "STOCK_TRANSFER_NOT_FOUND");
  }

  assertStockTransferStatusAccess(existingTransfer, payload.status, actor);

  if (existingTransfer.status === payload.status) {
    return existingTransfer;
  }

  if (payload.status === "APPROVED") {
    return approveAndLockStockTransferPricing(stockTransferId, actor);
  }

  if (payload.status === "POSTED") {
    if (existingTransfer.status !== "APPROVED") {
      throw new AppError(
        "Only approved stock transfers can be posted",
        400,
        "INVALID_STATUS_TRANSITION"
      );
    }

    return prisma.$transaction(async (tx) => {
      const claim = await tx.stockTransfer.updateMany({
        where: {
          id: existingTransfer.id,
          status: "APPROVED",
        },
        data: {
          status: "POSTED",
          postedAt: new Date(),
          postedById: actor.id,
          updatedById: actor.id,
        },
      });

      if (claim.count !== 1) {
        const currentTransfer = await tx.stockTransfer.findUnique({
          where: { id: existingTransfer.id },
          include: STOCK_TRANSFER_INCLUDE,
        });

        if (currentTransfer?.status === "POSTED") {
          return currentTransfer;
        }

        throw new AppError(
          "Only approved stock transfers can be posted",
          400,
          "INVALID_STATUS_TRANSITION"
        );
      }

      if (Array.isArray(payload.items) && payload.items.length > 0) {
        for (const itemPayload of payload.items) {
          const transferItem = existingTransfer.items.find(
            (item) => item.id === itemPayload.stockTransferItemId
          );

          if (!transferItem) {
            throw new AppError(
              "Stock transfer item not found in transfer",
              400,
              "STOCK_TRANSFER_ITEM_MISMATCH"
            );
          }

          if (transferItem.item?.isSerialized) {
            const serialIds = Array.isArray(itemPayload.serialIds)
              ? itemPayload.serialIds
              : [];
            const quantity = Number(transferItem.quantity);

            if (serialIds.length !== quantity) {
              throw new AppError(
                `Item ${transferItem.item.itemName} requires exactly ${quantity} serial(s), got ${serialIds.length}`,
                400,
                "SERIAL_COUNT_MISMATCH"
              );
            }

            if (new Set(serialIds).size !== serialIds.length) {
              throw new AppError(
                "Duplicate serial ID found in fulfillment request",
                400,
                "DUPLICATE_SERIAL_IN_REQUEST"
              );
            }

            const validSerials = await tx.itemSerial.findMany({
              where: {
                id: { in: serialIds },
                branchId: existingTransfer.fromBranchId,
                itemId: transferItem.itemId,
                status: "AVAILABLE",
              },
            });

            if (validSerials.length !== serialIds.length) {
              throw new AppError(
                "One or more selected serials are no longer available in source branch",
                400,
                "SERIAL_NOT_AVAILABLE"
              );
            }

            await tx.stockTransferSerial.deleteMany({
              where: {
                stockTransferItemId: transferItem.id,
                allocationId: null,
              },
            });

            await tx.stockTransferSerial.createMany({
              data: validSerials.map((s) => ({
                stockTransferItemId: transferItem.id,
                itemSerialId: s.id,
                serialNumberSnapshot: s.serialNumber,
              })),
            });
          }
        }
      }

      const stockTransfer = await tx.stockTransfer.findUnique({
        where: {
          id: existingTransfer.id,
        },
        include: STOCK_TRANSFER_INCLUDE,
      });

      if (!stockTransfer) {
        throw new AppError("Stock transfer not found", 404, "STOCK_TRANSFER_NOT_FOUND");
      }

      await postStockTransferInventoryMovement(tx, stockTransfer, actor);

      const postedTransfer = await tx.stockTransfer.findUnique({
        where: { id: stockTransfer.id },
        include: STOCK_TRANSFER_INCLUDE,
      });

      await createAuditLog(
        {
          actor,
          branchId: postedTransfer.fromBranchId,
          action: "STOCK_TRANSFER_POSTED",
          entityType: "StockTransfer",
          entityId: postedTransfer.id,
          description: `Stock transfer ${postedTransfer.transferCode} posted`,
          metadata: {
            transferCode: postedTransfer.transferCode,
            previousStatus: "APPROVED",
            currentStatus: postedTransfer.status,
            fromBranchId: postedTransfer.fromBranchId,
            toBranchId: postedTransfer.toBranchId,
            postedAt: postedTransfer.postedAt,
            itemCount: postedTransfer.items.length,
          },
        },
        tx
      );

      return postedTransfer;
    });
  }

  const updateData = {
    status: payload.status,
    updatedById: actor.id,
  };

  if (payload.status === "REQUESTED") {
    if (existingTransfer.status !== "DRAFT") {
      throw new AppError("Only draft stock transfers can be requested", 400, "INVALID_STATUS_TRANSITION");
    }

    updateData.requestedAt = new Date();
    updateData.requestedById = actor.id;
  }

  if (payload.status === "REJECTED") {
    if (!["DRAFT", "REQUESTED"].includes(existingTransfer.status)) {
      throw new AppError("Only draft or requested stock transfers can be rejected", 400, "INVALID_STATUS_TRANSITION");
    }

    const rejectionReason = normalizeOptionalString(payload.rejectionReason);

    if (!rejectionReason) {
      throw new AppError("Rejection reason is required", 400, "REJECTION_REASON_REQUIRED");
    }

    updateData.rejectedAt = new Date();
    updateData.rejectedById = actor.id;
    updateData.rejectionReason = rejectionReason;
  }

  if (payload.status === "CANCELLED") {
    if (["POSTED", "CANCELLED"].includes(existingTransfer.status)) {
      throw new AppError("This stock transfer cannot be cancelled", 400, "INVALID_STATUS_TRANSITION");
    }

    const cancellationReason = normalizeOptionalString(payload.cancellationReason);

    if (!cancellationReason) {
      throw new AppError("Cancellation reason is required", 400, "CANCELLATION_REASON_REQUIRED");
    }

    updateData.cancelledAt = new Date();
    updateData.cancelledById = actor.id;
    updateData.cancellationReason = cancellationReason;
  }

  return prisma.$transaction(async (tx) => {
    const transition = await tx.stockTransfer.updateMany({
      where: {
        id: existingTransfer.id,
        status: existingTransfer.status,
      },
      data: updateData,
    });

    if (transition.count !== 1) {
      const currentTransfer = await tx.stockTransfer.findUnique({
        where: { id: existingTransfer.id },
        include: STOCK_TRANSFER_INCLUDE,
      });

      if (currentTransfer?.status === payload.status) {
        return currentTransfer;
      }

      throw new AppError(
        "Stock transfer status changed before this action completed",
        409,
        "STOCK_TRANSFER_STATUS_CONFLICT"
      );
    }

    const stockTransfer = await tx.stockTransfer.findUnique({
      where: { id: existingTransfer.id },
      include: STOCK_TRANSFER_INCLUDE,
    });

    const actionMap = {
      REQUESTED: "STOCK_TRANSFER_REQUESTED",
      APPROVED: "STOCK_TRANSFER_APPROVED",
      REJECTED: "STOCK_TRANSFER_REJECTED",
      CANCELLED: "STOCK_TRANSFER_CANCELLED",
    };

    await createAuditLog(
      {
        actor,
        branchId: stockTransfer.fromBranchId,
        action: actionMap[stockTransfer.status] || "STOCK_TRANSFER_STATUS_UPDATED",
        entityType: "StockTransfer",
        entityId: stockTransfer.id,
        description: `Stock transfer ${stockTransfer.transferCode} status updated to ${stockTransfer.status}`,
        metadata: {
          transferCode: stockTransfer.transferCode,
          previousStatus: existingTransfer.status,
          currentStatus: stockTransfer.status,
          fromBranchId: stockTransfer.fromBranchId,
          toBranchId: stockTransfer.toBranchId,
          requestedAt: stockTransfer.requestedAt,
          approvedAt: stockTransfer.approvedAt,
          rejectedAt: stockTransfer.rejectedAt,
          cancelledAt: stockTransfer.cancelledAt,
          rejectionReason: stockTransfer.rejectionReason,
          cancellationReason: stockTransfer.cancellationReason,
          itemCount: stockTransfer.items.length,
        },
      },
      tx
    );

    return stockTransfer;
  });
};

module.exports = {
  STOCK_TRANSFER_INCLUDE,
  createStockTransferRequest,
  listRequestableStock,
  createStockTransfer,
  listStockTransfers,
  getStockTransferById,
  updateStockTransferById,
  updateStockTransferPricingById,
  updateStockTransferStatusById,
};



