const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
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
          branchId: true,
          itemId: true,
          status: true,
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
        },
        orderBy: {
          serialNumberSnapshot: "asc",
        },
      },
    },
    orderBy: {
      lineNo: "asc",
    },
  },
};

const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

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

  if (!OWNER_ADMIN_ROLES.has(actor.role)) {
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

  if (!OWNER_ADMIN_ROLES.has(actor.role)) {
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

const validateAndBuildItems = async (items, fromBranchId) => {
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

const createStockTransfer = async (payload, actor) => {
  const fromBranch = await getFromBranchForCreate(actor, payload.fromBranchId);
  const toBranch = await getActiveBranchOrThrow(payload.toBranchId, "To branch");

  assertDifferentBranches(fromBranch.id, toBranch.id);

  const transferCode = payload.transferCode
    ? payload.transferCode.trim().toUpperCase()
    : await generateTransferCode(fromBranch);

  await assertTransferCodeIsUnique(fromBranch.id, transferCode);

  const items = await validateAndBuildItems(payload.items, fromBranch.id);

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
    fromBranchId: filters.fromBranchId,
    toBranchId: filters.toBranchId,
  };

  if (actor.role !== "SUPER_OWNER") {
    if (!actor.branchId) {
      throw new AppError(
        "User is not assigned to a branch",
        400,
        "USER_BRANCH_REQUIRED"
      );
    }

    where.OR = [
      {
        fromBranchId: actor.branchId,
      },
      {
        toBranchId: actor.branchId,
      },
    ];

    if (filters.fromBranchId && filters.fromBranchId !== actor.branchId) {
      throw new AppError(
        "You can only filter stock transfers linked to your branch",
        403,
        "BRANCH_ACCESS_DENIED"
      );
    }

    if (filters.toBranchId && filters.toBranchId !== actor.branchId) {
      throw new AppError(
        "You can only filter stock transfers linked to your branch",
        403,
        "BRANCH_ACCESS_DENIED"
      );
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

    if (where.OR) {
      where.AND = [
        {
          OR: where.OR,
        },
        {
          OR: searchOr,
        },
      ];

      delete where.OR;
    } else {
      where.OR = searchOr;
    }
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

  return stockTransfer;
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
    const items = await validateAndBuildItems(payload.items, existingTransfer.fromBranchId);

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

const postStockTransferInventoryMovement = async (tx, stockTransfer, actor) => {
  const fromBranch = await tx.branch.findUnique({
    where: {
      id: stockTransfer.fromBranchId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  const toBranch = await tx.branch.findUnique({
    where: {
      id: stockTransfer.toBranchId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  if (!fromBranch || fromBranch.status !== "ACTIVE") {
    throw new AppError("From branch is not active", 400, "FROM_BRANCH_NOT_ACTIVE");
  }

  if (!toBranch || toBranch.status !== "ACTIVE") {
    throw new AppError("To branch is not active", 400, "TO_BRANCH_NOT_ACTIVE");
  }

  for (const transferItem of stockTransfer.items) {
    const quantity = Number(transferItem.quantity);

    const sourceItem = await tx.item.findUnique({
      where: {
        id: transferItem.itemId,
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

    if (!transferItem.fromBatchId) {
      throw new AppError(
        "Source batch is required before posting stock transfer",
        400,
        "SOURCE_BATCH_REQUIRED_FOR_POSTING"
      );
    }

    const sourceBatch = await tx.inventoryBatch.findUnique({
      where: {
        id: transferItem.fromBatchId,
      },
    });

    if (!sourceBatch) {
      throw new AppError("Source batch not found", 404, "SOURCE_BATCH_NOT_FOUND");
    }

    if (sourceBatch.branchId !== fromBranch.id || sourceBatch.itemId !== sourceItem.id) {
      throw new AppError(
        "Source batch does not match transfer item and from branch",
        403,
        "SOURCE_BATCH_MISMATCH"
      );
    }

    const sourcePreviousQuantity = Number(sourceBatch.quantityAvailable);
    const sourceNewQuantity = sourcePreviousQuantity - quantity;

    if (sourceNewQuantity < 0) {
      throw new AppError(
        "Insufficient source batch quantity",
        400,
        "INSUFFICIENT_SOURCE_BATCH_QUANTITY"
      );
    }

    const transferSerials = Array.isArray(transferItem.serials)
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

      if (transferSerials.length !== quantity) {
        throw new AppError(
          "Serialized transfer requires serial count to match quantity",
          400,
          "SERIAL_COUNT_MISMATCH"
        );
      }
    }

    if (!sourceItem.isSerialized && transferSerials.length > 0) {
      throw new AppError(
        "Serials are not allowed for non-serialized item",
        400,
        "SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM"
      );
    }

    const destinationBatchCode = sourceBatch.batchCode;

    const existingDestinationBatch = await tx.inventoryBatch.findUnique({
      where: {
        branchId_batchCode: {
          branchId: toBranch.id,
          batchCode: destinationBatchCode,
        },
      },
    });

    if (existingDestinationBatch && existingDestinationBatch.itemId !== destinationItem.id) {
      throw new AppError(
        "Destination batch code already belongs to another item",
        409,
        "DESTINATION_BATCH_ITEM_MISMATCH"
      );
    }

    const destinationPreviousQuantity = existingDestinationBatch
      ? Number(existingDestinationBatch.quantityAvailable)
      : 0;

    const destinationPreviousQuantityIn = existingDestinationBatch
      ? Number(existingDestinationBatch.quantityIn)
      : 0;

    const destinationNewQuantity = destinationPreviousQuantity + quantity;
    const destinationNewQuantityIn = destinationPreviousQuantityIn + quantity;

    const referenceNo = stockTransfer.transferCode;

    const updatedSourceBatch = await tx.inventoryBatch.update({
      where: {
        id: sourceBatch.id,
      },
      data: {
        quantityAvailable: sourceNewQuantity.toString(),
        status: sourceNewQuantity === 0 ? "DEPLETED" : "ACTIVE",
        updatedById: actor.id,
      },
    });

    const destinationBatch = await tx.inventoryBatch.upsert({
      where: {
        branchId_batchCode: {
          branchId: toBranch.id,
          batchCode: destinationBatchCode,
        },
      },
      update: {
        itemId: destinationItem.id,
        quantityIn: destinationNewQuantityIn.toString(),
        quantityAvailable: destinationNewQuantity.toString(),
        unitCost: sourceBatch.unitCost.toString(),
        sellingPrice1: destinationItem.price1.toString(),
        sellingPrice2: destinationItem.price2.toString(),
        sellingPrice3: destinationItem.price3.toString(),
        sellingPrice4: destinationItem.price4.toString(),
        sellingPrice5: destinationItem.price5.toString(),
        supplierName: sourceBatch.supplierName,
        referenceNo,
        remarks: `Transfer in from ${fromBranch.code} via ${stockTransfer.transferCode}`,
        expiryDate: sourceBatch.expiryDate || null,
        status: "ACTIVE",
        updatedById: actor.id,
      },
      create: {
        branchId: toBranch.id,
        itemId: destinationItem.id,
        batchCode: destinationBatchCode,
        quantityIn: quantity.toString(),
        quantityAvailable: quantity.toString(),
        unitCost: sourceBatch.unitCost.toString(),
        sellingPrice1: destinationItem.price1.toString(),
        sellingPrice2: destinationItem.price2.toString(),
        sellingPrice3: destinationItem.price3.toString(),
        sellingPrice4: destinationItem.price4.toString(),
        sellingPrice5: destinationItem.price5.toString(),
        supplierName: sourceBatch.supplierName,
        referenceNo,
        remarks: `Transfer in from ${fromBranch.code} via ${stockTransfer.transferCode}`,
        expiryDate: sourceBatch.expiryDate || null,
        status: "ACTIVE",
        createdById: actor.id,
        updatedById: actor.id,
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
        unitCost: sourceBatch.unitCost.toString(),
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
        unitCost: sourceBatch.unitCost.toString(),
        referenceNo,
        remarks: `Transfer in from ${fromBranch.code} via ${stockTransfer.transferCode}`,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    for (const transferSerial of transferSerials) {
      const serial = await tx.itemSerial.findUnique({
        where: {
          id: transferSerial.itemSerialId,
        },
      });

      if (!serial) {
        throw new AppError("Serial not found", 404, "SERIAL_NOT_FOUND");
      }

      if (
        serial.branchId !== fromBranch.id ||
        serial.itemId !== sourceItem.id ||
        serial.batchId !== sourceBatch.id ||
        serial.status !== "AVAILABLE"
      ) {
        throw new AppError(
          "Serial is not available in source branch and batch",
          400,
          "SERIAL_NOT_AVAILABLE"
        );
      }

      await tx.itemSerial.update({
        where: {
          id: serial.id,
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
    }

    if (Number(updatedSourceBatch.quantityAvailable) !== sourceNewQuantity) {
      throw new AppError(
        "Source batch quantity mismatch after update",
        500,
        "SOURCE_BATCH_UPDATE_MISMATCH"
      );
    }
  }
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

  assertStockTransferManageAccess(existingTransfer, actor);

  if (payload.status === "POSTED") {
    if (existingTransfer.status !== "APPROVED") {
      throw new AppError(
        "Only approved stock transfers can be posted",
        400,
        "INVALID_STATUS_TRANSITION"
      );
    }

    return prisma.$transaction(async (tx) => {
      const stockTransfer = await tx.stockTransfer.findUnique({
        where: {
          id: existingTransfer.id,
        },
        include: STOCK_TRANSFER_INCLUDE,
      });

      if (!stockTransfer) {
        throw new AppError("Stock transfer not found", 404, "STOCK_TRANSFER_NOT_FOUND");
      }

      if (stockTransfer.status !== "APPROVED") {
        throw new AppError(
          "Only approved stock transfers can be posted",
          400,
          "INVALID_STATUS_TRANSITION"
        );
      }

      await postStockTransferInventoryMovement(tx, stockTransfer, actor);

      const postedTransfer = await tx.stockTransfer.update({
        where: {
          id: stockTransfer.id,
        },
        data: {
          status: "POSTED",
          postedAt: new Date(),
          postedById: actor.id,
          updatedById: actor.id,
        },
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
            previousStatus: stockTransfer.status,
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

  if (payload.status === "APPROVED") {
    if (!["DRAFT", "REQUESTED"].includes(existingTransfer.status)) {
      throw new AppError("Only draft or requested stock transfers can be approved", 400, "INVALID_STATUS_TRANSITION");
    }

    updateData.approvedAt = new Date();
    updateData.approvedById = actor.id;
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
    const stockTransfer = await tx.stockTransfer.update({
      where: {
        id: existingTransfer.id,
      },
      data: updateData,
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
  createStockTransfer,
  listStockTransfers,
  getStockTransferById,
  updateStockTransferById,
  updateStockTransferStatusById,
};
