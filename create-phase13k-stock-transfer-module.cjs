const fs = require("fs");

const ensureDir = (path) => {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true });
  }
};

ensureDir("./src/modules/stock-transfers/validations");
ensureDir("./src/modules/stock-transfers/services");
ensureDir("./src/modules/stock-transfers/controllers");
ensureDir("./src/modules/stock-transfers/routes");

fs.writeFileSync(
  "./src/modules/stock-transfers/validations/stockTransfer.validation.js",
`const { z } = require("zod");

const stockTransferStatusValues = [
  "DRAFT",
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "POSTED",
  "CANCELLED",
];

const updatableStockTransferStatusValues = [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "POSTED",
  "CANCELLED",
];

const optionalString = z
  .string()
  .trim()
  .min(1, "Value cannot be empty")
  .optional()
  .nullable();

const stockTransferItemSchema = z.object({
  itemId: z.string().trim().min(1, "Item ID is required"),
  fromBatchId: z.string().trim().min(1, "Batch ID cannot be empty").optional().nullable(),
  description: z.string().trim().min(1, "Description is required"),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  serialIds: z.array(z.string().trim().min(1, "Serial ID cannot be empty")).optional(),
});

const createStockTransferSchema = z.object({
  body: z.object({
    fromBranchId: z.string().trim().min(1, "From branch ID cannot be empty").optional(),
    toBranchId: z.string().trim().min(1, "To branch ID is required"),
    transferCode: z.string().trim().min(1, "Transfer code cannot be empty").optional(),
    notes: optionalString,
    internalNotes: optionalString,
    items: z.array(stockTransferItemSchema).min(1, "At least one item is required"),
  }),
});

const listStockTransfersSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    fromBranchId: z.string().trim().min(1, "From branch ID cannot be empty").optional(),
    toBranchId: z.string().trim().min(1, "To branch ID cannot be empty").optional(),
    status: z.enum(stockTransferStatusValues).optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: z.string().trim().regex(/^[1-9][0-9]*$/, "Page must be a positive number").optional(),
    limit: z.string().trim().regex(/^[1-9][0-9]*$/, "Limit must be a positive number").optional(),
  }),
});

const stockTransferIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Stock Transfer ID is required"),
  }),
});

const updateStockTransferSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Stock Transfer ID is required"),
  }),
  body: z.object({
    toBranchId: z.string().trim().min(1, "To branch ID cannot be empty").optional(),
    transferCode: z.string().trim().min(1, "Transfer code cannot be empty").optional(),
    notes: optionalString,
    internalNotes: optionalString,
    items: z.array(stockTransferItemSchema).min(1, "At least one item is required").optional(),
  }),
});

const updateStockTransferStatusSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Stock Transfer ID is required"),
  }),
  body: z.object({
    status: z.enum(updatableStockTransferStatusValues),
    rejectionReason: optionalString,
    cancellationReason: optionalString,
  }),
});

module.exports = {
  createStockTransferSchema,
  listStockTransfersSchema,
  stockTransferIdParamSchema,
  updateStockTransferSchema,
  updateStockTransferStatusSchema,
};
`
);

fs.writeFileSync(
  "./src/modules/stock-transfers/services/stockTransfer.service.js",
`const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

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
  const prefix = \`TR-\${fromBranch.code}-\`;

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

  return \`\${prefix}\${String(highestNumber + 1).padStart(5, "0")}\`;
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

  return prisma.stockTransfer.create({
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

    return prisma.$transaction(async (tx) => {
      await tx.stockTransferItem.deleteMany({
        where: {
          stockTransferId: existingTransfer.id,
        },
      });

      return tx.stockTransfer.update({
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
    });
  }

  return prisma.stockTransfer.update({
    where: {
      id: existingTransfer.id,
    },
    data: updateData,
    include: STOCK_TRANSFER_INCLUDE,
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

  assertStockTransferManageAccess(existingTransfer, actor);

  if (payload.status === "POSTED") {
    throw new AppError(
      "Posting stock transfer is not available until inventory transfer movement module",
      400,
      "STOCK_TRANSFER_POST_NOT_AVAILABLE"
    );
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

  return prisma.stockTransfer.update({
    where: {
      id: existingTransfer.id,
    },
    data: updateData,
    include: STOCK_TRANSFER_INCLUDE,
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
`
);

fs.writeFileSync(
  "./src/modules/stock-transfers/controllers/stockTransfer.controller.js",
`const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const stockTransferService = require("../services/stockTransfer.service");

const createStockTransfer = asyncHandler(async (req, res) => {
  const stockTransfer = await stockTransferService.createStockTransfer(req.body, req.user);

  return sendSuccess(res, {
    statusCode: 201,
    message: "Stock transfer created successfully",
    data: stockTransfer,
  });
});

const listStockTransfers = asyncHandler(async (req, res) => {
  const result = await stockTransferService.listStockTransfers(req.query, req.user);

  return sendSuccess(res, {
    message: "Stock transfers retrieved successfully",
    data: result,
  });
});

const getStockTransferById = asyncHandler(async (req, res) => {
  const stockTransfer = await stockTransferService.getStockTransferById(
    req.params.id,
    req.user
  );

  return sendSuccess(res, {
    message: "Stock transfer retrieved successfully",
    data: stockTransfer,
  });
});

const updateStockTransferById = asyncHandler(async (req, res) => {
  const stockTransfer = await stockTransferService.updateStockTransferById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Stock transfer updated successfully",
    data: stockTransfer,
  });
});

const updateStockTransferStatusById = asyncHandler(async (req, res) => {
  const stockTransfer = await stockTransferService.updateStockTransferStatusById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Stock transfer status updated successfully",
    data: stockTransfer,
  });
});

module.exports = {
  createStockTransfer,
  listStockTransfers,
  getStockTransferById,
  updateStockTransferById,
  updateStockTransferStatusById,
};
`
);

fs.writeFileSync(
  "./src/modules/stock-transfers/routes/stockTransfer.routes.js",
`const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const stockTransferController = require("../controllers/stockTransfer.controller");
const {
  createStockTransferSchema,
  listStockTransfersSchema,
  stockTransferIdParamSchema,
  updateStockTransferSchema,
  updateStockTransferStatusSchema,
} = require("../validations/stockTransfer.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_STOCK_TRANSFERS),
  validate(listStockTransfersSchema),
  stockTransferController.listStockTransfers
);

router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_STOCK_TRANSFERS),
  validate(createStockTransferSchema),
  stockTransferController.createStockTransfer
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_STOCK_TRANSFERS),
  validate(stockTransferIdParamSchema),
  stockTransferController.getStockTransferById
);

router.patch(
  "/:id/status",
  protect,
  requirePermission(PERMISSIONS.MANAGE_STOCK_TRANSFERS),
  validate(updateStockTransferStatusSchema),
  stockTransferController.updateStockTransferStatusById
);

router.patch(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.MANAGE_STOCK_TRANSFERS),
  validate(updateStockTransferSchema),
  stockTransferController.updateStockTransferById
);

module.exports = router;
`
);

console.log("DONE: Stock Transfer module files created.");
