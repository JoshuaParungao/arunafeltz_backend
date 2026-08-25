const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { createAuditLog } = require("../../../utils/auditLogger");

const PURCHASE_RECEIVING_INCLUDE = {
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
  supplier: {
    select: {
      id: true,
      supplierCode: true,
      name: true,
      contactPerson: true,
      contactNo: true,
      email: true,
      status: true,
      branchId: true,
    },
  },
  purchaseOrder: {
    select: {
      id: true,
      poCode: true,
      status: true,
      branchId: true,
      supplierId: true,
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
      purchaseOrderItem: {
        select: {
          id: true,
          lineNo: true,
          description: true,
          quantity: true,
          receivedQuantity: true,
          unitCost: true,
          purchaseOrderId: true,
          itemId: true,
        },
      },
      serials: {
        select: {
          id: true,
          serialNumber: true,
        },
        orderBy: {
          serialNumber: "asc",
        },
      },
    },
    orderBy: {
      lineNo: "asc",
    },
  },
};

const PURCHASE_RECEIVING_OPERATION_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "CASHIER",
  "TECHNICIAN",
]);

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : null;
};

const normalizeOptionalDate = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("Invalid date value", 400, "INVALID_DATE");
  }

  return date;
};

const toMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const assertManageReceivingRole = (actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (!PURCHASE_RECEIVING_OPERATION_ROLES.has(actor.role)) {
    throw new AppError(
      "You are not allowed to manage purchase receivings",
      403,
      "PURCHASE_RECEIVING_MANAGE_FORBIDDEN"
    );
  }
};

const assertViewReceivingRole = (actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (!PURCHASE_RECEIVING_OPERATION_ROLES.has(actor.role)) {
    throw new AppError(
      "You are not allowed to view purchase receivings",
      403,
      "PURCHASE_RECEIVING_VIEW_FORBIDDEN"
    );
  }
};

const getActiveBranchOrThrow = async (branchId, db = prisma) => {
  const branch = await db.branch.findUnique({
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

const getBranchForCreate = async (actor, requestedBranchId) => {
  assertManageReceivingRole(actor);

  if (actor.role === "SUPER_OWNER") {
    if (!requestedBranchId) {
      throw new AppError(
        "Branch ID is required for Super Owner purchase receiving creation",
        400,
        "BRANCH_ID_REQUIRED"
      );
    }

    return getActiveBranchOrThrow(requestedBranchId);
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
      "You can only create purchase receivings in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return getActiveBranchOrThrow(actor.branchId);
};

const getBranchIdForList = (actor, requestedBranchId) => {
  assertViewReceivingRole(actor);

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
      "You can only view purchase receivings in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return actor.branchId;
};

const assertReceivingAccess = (receiving, actor) => {
  assertViewReceivingRole(actor);

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

  if (receiving.branchId !== actor.branchId) {
    throw new AppError(
      "You can only access purchase receivings in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const assertReceivingManageAccess = (receiving, actor) => {
  assertManageReceivingRole(actor);
  assertReceivingAccess(receiving, actor);
};

const getActiveSupplierForBranchOrThrow = async (
  supplierId,
  branchId,
  db = prisma
) => {
  const supplier = await db.supplier.findUnique({
    where: {
      id: supplierId,
    },
    select: {
      id: true,
      supplierCode: true,
      name: true,
      contactPerson: true,
      contactNo: true,
      email: true,
      status: true,
      branchId: true,
    },
  });

  if (!supplier) {
    throw new AppError("Supplier not found", 404, "SUPPLIER_NOT_FOUND");
  }

  if (supplier.status !== "ACTIVE") {
    throw new AppError("Supplier is not active", 400, "SUPPLIER_NOT_ACTIVE");
  }

  if (supplier.branchId && supplier.branchId !== branchId) {
    throw new AppError(
      "Supplier is not available for this branch",
      403,
      "SUPPLIER_BRANCH_ACCESS_DENIED"
    );
  }

  return supplier;
};

const getPurchaseOrderForReceiving = async (
  purchaseOrderId,
  branchId,
  supplierId,
  db = prisma
) => {
  if (!purchaseOrderId) {
    return null;
  }

  const purchaseOrder = await db.purchaseOrder.findUnique({
    where: {
      id: purchaseOrderId,
    },
    include: {
      items: true,
    },
  });

  if (!purchaseOrder) {
    throw new AppError("Purchase order not found", 404, "PURCHASE_ORDER_NOT_FOUND");
  }

  if (purchaseOrder.branchId !== branchId) {
    throw new AppError(
      "Purchase order is not available in this branch",
      403,
      "PURCHASE_ORDER_BRANCH_ACCESS_DENIED"
    );
  }

  if (purchaseOrder.supplierId !== supplierId) {
    throw new AppError(
      "Purchase order supplier does not match receiving supplier",
      400,
      "PURCHASE_ORDER_SUPPLIER_MISMATCH"
    );
  }

  if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status)) {
    throw new AppError(
      "Only ordered purchase orders can be received",
      400,
      "PURCHASE_ORDER_NOT_RECEIVABLE"
    );
  }

  return purchaseOrder;
};

const generateReceivingCode = async (branch, db = prisma) => {
  const prefix = `REC-${branch.code}-`;

  const existingReceivings = await db.purchaseReceiving.findMany({
    where: {
      branchId: branch.id,
      receivingCode: {
        startsWith: prefix,
      },
    },
    select: {
      receivingCode: true,
    },
  });

  let highestNumber = 0;

  for (const receiving of existingReceivings) {
    const suffix = receiving.receivingCode.replace(prefix, "");
    const parsedNumber = Number.parseInt(suffix, 10);

    if (!Number.isNaN(parsedNumber) && parsedNumber > highestNumber) {
      highestNumber = parsedNumber;
    }
  }

  return `${prefix}${String(highestNumber + 1).padStart(5, "0")}`;
};

const assertReceivingCodeIsUnique = async (
  branchId,
  receivingCode,
  currentReceivingId = null,
  db = prisma
) => {
  const existingReceiving = await db.purchaseReceiving.findUnique({
    where: {
      branchId_receivingCode: {
        branchId,
        receivingCode,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingReceiving && existingReceiving.id !== currentReceivingId) {
    throw new AppError(
      "Receiving code already exists in this branch",
      409,
      "PURCHASE_RECEIVING_CODE_ALREADY_EXISTS"
    );
  }
};

const assertReceivingReferencesAreUnique = async (
  db,
  branchId,
  supplierId,
  references,
  currentReceivingId = null
) => {
  const referenceFields = [
    ["supplierDeliveryNo", "Supplier delivery number"],
    ["supplierInvoiceNo", "Supplier invoice number"],
    ["referenceNo", "Receiving reference number"],
  ];

  for (const [field, label] of referenceFields) {
    const value = normalizeOptionalString(references[field]);

    if (!value) {
      continue;
    }

    const duplicate = await db.purchaseReceiving.findFirst({
      where: {
        branchId,
        supplierId,
        ...(currentReceivingId
          ? {
              id: {
                not: currentReceivingId,
              },
            }
          : {}),
        [field]: {
          equals: value,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        receivingCode: true,
      },
    });

    if (duplicate) {
      const error = new AppError(
        `${label} already belongs to receiving ${duplicate.receivingCode}`,
        409,
        "PURCHASE_RECEIVING_REFERENCE_ALREADY_EXISTS"
      );
      error.details = {
        field,
        receivingId: duplicate.id,
        receivingCode: duplicate.receivingCode,
      };
      throw error;
    }
  }
};

const normalizeSerialNumbers = (serialNumbers) => {
  if (!Array.isArray(serialNumbers)) {
    return [];
  }

  return serialNumbers
    .map((serialNumber) => String(serialNumber).trim())
    .filter(Boolean);
};

const validateAndBuildItems = async (
  items,
  branchId,
  purchaseOrder = null,
  currentReceivingId = null,
  db = prisma
) => {
  const builtItems = [];
  let subtotal = 0;
  let totalDiscount = 0;
  const serialNumbersInRequest = new Set();
  const quantitiesByPurchaseOrderItem = new Map();
  const itemsByBatchCode = new Map();

  for (let index = 0; index < items.length; index += 1) {
    const itemPayload = items[index];
    const quantityReceived = Number(itemPayload.quantityReceived);
    const unitCost = Number(itemPayload.unitCost);
    const discountAmount = Number(itemPayload.discountAmount || 0);
    const serialNumbers = normalizeSerialNumbers(itemPayload.serialNumbers);
    const lineSubtotal = toMoney(quantityReceived * unitCost);

    if (discountAmount > lineSubtotal) {
      throw new AppError(
        "Discount amount cannot be greater than line subtotal",
        400,
        "INVALID_LINE_DISCOUNT"
      );
    }

    await db.$queryRaw`SELECT "id" FROM "Item" WHERE "id" = ${itemPayload.itemId} FOR UPDATE`;

    const item = await db.item.findUnique({
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

    if (item.branchId !== branchId) {
      throw new AppError(
        "Item is not available in this branch",
        403,
        "ITEM_BRANCH_ACCESS_DENIED"
      );
    }

    if (item.status !== "ACTIVE") {
      throw new AppError("Item is not active", 400, "ITEM_NOT_ACTIVE");
    }

    if (item.isSerialized) {
      if (!Number.isInteger(quantityReceived)) {
        throw new AppError(
          "Serialized item receiving quantity must be a whole number",
          400,
          "SERIALIZED_QUANTITY_MUST_BE_WHOLE_NUMBER"
        );
      }

      if (serialNumbers.length !== quantityReceived) {
        throw new AppError(
          "Serialized item requires serial count to match received quantity",
          400,
          "SERIAL_COUNT_MISMATCH"
        );
      }
    }

    if (!item.isSerialized && serialNumbers.length > 0) {
      throw new AppError(
        "Serial numbers are not allowed for non-serialized item",
        400,
        "SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM"
      );
    }

    for (const serialNumber of serialNumbers) {
      if (serialNumbersInRequest.has(serialNumber)) {
        throw new AppError(
          "Duplicate serial number found in request",
          400,
          "DUPLICATE_SERIAL_IN_REQUEST"
        );
      }

      serialNumbersInRequest.add(serialNumber);
    }

    if (serialNumbers.length > 0) {
      const existingItemSerials = await db.itemSerial.findMany({
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

      if (existingItemSerials.length > 0) {
        const error = new AppError(
          "One or more serial numbers already exist",
          409,
          "SERIAL_ALREADY_EXISTS"
        );

        error.details = existingItemSerials.map((serial) => serial.serialNumber);
        throw error;
      }

      const existingDraftSerials = await db.purchaseReceivingSerial.findMany({
        where: {
          serialNumber: {
            in: serialNumbers,
          },
          purchaseReceivingItem: {
            purchaseReceiving: {
              branchId,
              status: "DRAFT",
              ...(currentReceivingId
                ? {
                    id: {
                      not: currentReceivingId,
                    },
                  }
                : {}),
            },
          },
        },
        select: {
          serialNumber: true,
        },
      });

      if (existingDraftSerials.length > 0) {
        const error = new AppError(
          "One or more serial numbers already exist in another draft receiving",
          409,
          "SERIAL_ALREADY_IN_DRAFT_RECEIVING"
        );

        error.details = existingDraftSerials.map((serial) => serial.serialNumber);
        throw error;
      }
    }

    let purchaseOrderItemId = null;

    if (itemPayload.purchaseOrderItemId) {
      if (!purchaseOrder) {
        throw new AppError(
          "Purchase order is required when purchaseOrderItemId is provided",
          400,
          "PURCHASE_ORDER_REQUIRED"
        );
      }

      const purchaseOrderItem = purchaseOrder.items.find(
        (poItem) => poItem.id === itemPayload.purchaseOrderItemId
      );

      if (!purchaseOrderItem) {
        throw new AppError(
          "Purchase order item not found in selected purchase order",
          404,
          "PURCHASE_ORDER_ITEM_NOT_FOUND"
        );
      }

      if (purchaseOrderItem.itemId !== item.id) {
        throw new AppError(
          "Purchase order item does not match selected item",
          400,
          "PURCHASE_ORDER_ITEM_MISMATCH"
        );
      }

      const remainingQuantityInHundredths =
        Math.round(Number(purchaseOrderItem.quantity) * 100) -
        Math.round(Number(purchaseOrderItem.receivedQuantity) * 100);

      const accumulatedQuantityInHundredths =
        (quantitiesByPurchaseOrderItem.get(purchaseOrderItem.id) || 0) +
        Math.round(quantityReceived * 100);

      if (accumulatedQuantityInHundredths > remainingQuantityInHundredths) {
        throw new AppError(
          "Quantity received cannot exceed remaining purchase order quantity",
          400,
          "RECEIVING_QUANTITY_EXCEEDS_REMAINING"
        );
      }

      quantitiesByPurchaseOrderItem.set(
        purchaseOrderItem.id,
        accumulatedQuantityInHundredths
      );
      purchaseOrderItemId = purchaseOrderItem.id;
    } else if (purchaseOrder) {
      throw new AppError(
        "Each line received against a purchase order must select its purchase order item",
        400,
        "PURCHASE_ORDER_ITEM_REQUIRED"
      );
    }

    const normalizedBatchCode = normalizeOptionalString(itemPayload.batchCode);

    if (normalizedBatchCode) {
      const batchKey = normalizedBatchCode.toUpperCase();
      const batchItemId = itemsByBatchCode.get(batchKey);

      if (batchItemId && batchItemId !== item.id) {
        throw new AppError(
          "The same batch code cannot be assigned to different items",
          400,
          "BATCH_ITEM_MISMATCH_IN_REQUEST"
        );
      }

      itemsByBatchCode.set(batchKey, item.id);
    }

    const lineTotal = toMoney(lineSubtotal - discountAmount);

    if (lineSubtotal > 9999999999.99 || lineTotal > 9999999999.99) {
      throw new AppError(
        "Purchase receiving line total is too large",
        400,
        "PURCHASE_RECEIVING_LINE_TOTAL_TOO_LARGE"
      );
    }

    subtotal = toMoney(subtotal + lineSubtotal);
    totalDiscount = toMoney(totalDiscount + discountAmount);

    builtItems.push({
      lineNo: index + 1,
      description: itemPayload.description.trim(),
      quantityReceived,
      unitCost,
      discountAmount,
      lineTotal,
      batchCode: normalizedBatchCode,
      expiryDate: normalizeOptionalDate(itemPayload.expiryDate),
      itemId: item.id,
      purchaseOrderItemId,
      ...(serialNumbers.length > 0
        ? {
            serials: {
              create: serialNumbers.map((serialNumber) => ({
                serialNumber,
              })),
            },
          }
        : {}),
    });
  }

  const grandTotal = toMoney(subtotal - totalDiscount);

  if (
    subtotal > 9999999999.99 ||
    totalDiscount > 9999999999.99 ||
    grandTotal > 9999999999.99
  ) {
    throw new AppError(
      "Purchase receiving total is too large",
      400,
      "PURCHASE_RECEIVING_TOTAL_TOO_LARGE"
    );
  }

  return {
    items: builtItems,
    subtotal,
    totalDiscount,
    grandTotal,
  };
};

const lockBranch = async (tx, branchId) => {
  await tx.$queryRaw`SELECT "id" FROM "Branch" WHERE "id" = ${branchId} FOR UPDATE`;
};

const getLockedReceiving = async (tx, purchaseReceivingId) => {
  await tx.$queryRaw`SELECT "id" FROM "PurchaseReceiving" WHERE "id" = ${purchaseReceivingId} FOR UPDATE`;

  return tx.purchaseReceiving.findUnique({
    where: {
      id: purchaseReceivingId,
    },
    include: PURCHASE_RECEIVING_INCLUDE,
  });
};

const lockPurchaseOrder = async (tx, purchaseOrderId) => {
  if (!purchaseOrderId) {
    return null;
  }

  await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${purchaseOrderId} FOR UPDATE`;

  return tx.purchaseOrder.findUnique({
    where: {
      id: purchaseOrderId,
    },
    include: {
      items: true,
    },
  });
};

const createPurchaseReceiving = async (payload, actor) => {
  const requestedBranch = await getBranchForCreate(actor, payload.branchId);

  return prisma.$transaction(async (tx) => {
    await lockBranch(tx, requestedBranch.id);

    const branch = await getActiveBranchOrThrow(requestedBranch.id, tx);
    await tx.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id" = ${payload.supplierId} FOR UPDATE`;
    const supplier = await getActiveSupplierForBranchOrThrow(
      payload.supplierId,
      branch.id,
      tx
    );

    if (payload.purchaseOrderId) {
      await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${payload.purchaseOrderId} FOR UPDATE`;
    }

    const purchaseOrder = await getPurchaseOrderForReceiving(
      payload.purchaseOrderId,
      branch.id,
      supplier.id,
      tx
    );
    const receivingCode = payload.receivingCode
      ? payload.receivingCode.trim().toUpperCase()
      : await generateReceivingCode(branch, tx);

    await assertReceivingCodeIsUnique(branch.id, receivingCode, null, tx);

    const references = {
      supplierDeliveryNo: normalizeOptionalString(payload.supplierDeliveryNo),
      supplierInvoiceNo: normalizeOptionalString(payload.supplierInvoiceNo),
      referenceNo: normalizeOptionalString(payload.referenceNo),
    };

    await assertReceivingReferencesAreUnique(
      tx,
      branch.id,
      supplier.id,
      references
    );

    const totals = await validateAndBuildItems(
      payload.items,
      branch.id,
      purchaseOrder,
      null,
      tx
    );

    const receiving = await tx.purchaseReceiving.create({
      data: {
        receivingCode,
        status: "DRAFT",
        supplierDeliveryNo: references.supplierDeliveryNo,
        supplierInvoiceNo: references.supplierInvoiceNo,
        referenceNo: references.referenceNo,
        supplierNameSnapshot: supplier.name,
        supplierContactSnapshot: supplier.contactNo,
        notes: normalizeOptionalString(payload.notes),
        internalNotes: normalizeOptionalString(payload.internalNotes),
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        grandTotal: totals.grandTotal,
        branchId: branch.id,
        supplierId: supplier.id,
        purchaseOrderId: purchaseOrder ? purchaseOrder.id : null,
        createdById: actor.id,
        updatedById: actor.id,
        items: {
          create: totals.items,
        },
      },
      include: PURCHASE_RECEIVING_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: receiving.branchId,
        action: "PURCHASE_RECEIVING_CREATED",
        entityType: "PurchaseReceiving",
        entityId: receiving.id,
        description: `Purchase receiving ${receiving.receivingCode} created`,
        metadata: {
          receivingCode: receiving.receivingCode,
          supplierId: receiving.supplierId,
          supplierNameSnapshot: receiving.supplierNameSnapshot,
          purchaseOrderId: receiving.purchaseOrderId,
          status: receiving.status,
          itemCount: receiving.items.length,
          subtotal: String(receiving.subtotal),
          totalDiscount: String(receiving.totalDiscount),
          grandTotal: String(receiving.grandTotal),
        },
      },
      tx
    );

    return receiving;
  });
};

const listPurchaseReceivings = async (filters = {}, actor) => {
  const page = Number.parseInt(filters.page || "1", 10);
  const limit = Number.parseInt(filters.limit || "20", 10);
  const safeLimit = Math.min(limit, 100);
  const skip = (page - 1) * safeLimit;

  const branchId = getBranchIdForList(actor, filters.branchId);
  const search = filters.search ? filters.search.trim() : null;

  const where = {
    branchId,
    supplierId: filters.supplierId,
    purchaseOrderId: filters.purchaseOrderId,
    status: filters.status,
  };

  if (filters.dateFrom || filters.dateTo) {
    where.receivingDate = {};

    if (filters.dateFrom) {
      const dateFrom = new Date(filters.dateFrom);
      if (Number.isNaN(dateFrom.getTime())) {
        throw new AppError("Invalid dateFrom value", 400, "INVALID_DATE_FROM");
      }
      dateFrom.setHours(0, 0, 0, 0);
      where.receivingDate.gte = dateFrom;
    }

    if (filters.dateTo) {
      const dateTo = new Date(filters.dateTo);
      if (Number.isNaN(dateTo.getTime())) {
        throw new AppError("Invalid dateTo value", 400, "INVALID_DATE_TO");
      }
      dateTo.setHours(23, 59, 59, 999);
      where.receivingDate.lte = dateTo;
    }
  }

  if (search) {
    where.OR = [
      {
        receivingCode: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        supplierDeliveryNo: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        supplierInvoiceNo: {
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
        supplierNameSnapshot: {
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
  }

  const [items, totalItems] = await prisma.$transaction([
    prisma.purchaseReceiving.findMany({
      where,
      include: PURCHASE_RECEIVING_INCLUDE,
      orderBy: {
        receivingDate: "desc",
      },
      skip,
      take: safeLimit,
    }),
    prisma.purchaseReceiving.count({
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

const getPurchaseReceivingById = async (purchaseReceivingId, actor) => {
  const receiving = await prisma.purchaseReceiving.findUnique({
    where: {
      id: purchaseReceivingId,
    },
    include: PURCHASE_RECEIVING_INCLUDE,
  });

  if (!receiving) {
    throw new AppError(
      "Purchase receiving not found",
      404,
      "PURCHASE_RECEIVING_NOT_FOUND"
    );
  }

  assertReceivingAccess(receiving, actor);

  return receiving;
};

const updatePurchaseReceivingById = async (purchaseReceivingId, payload, actor) => {
  const accessibleReceiving = await prisma.purchaseReceiving.findUnique({
    where: {
      id: purchaseReceivingId,
    },
    include: PURCHASE_RECEIVING_INCLUDE,
  });

  if (!accessibleReceiving) {
    throw new AppError(
      "Purchase receiving not found",
      404,
      "PURCHASE_RECEIVING_NOT_FOUND"
    );
  }

  assertReceivingManageAccess(accessibleReceiving, actor);

  return prisma.$transaction(async (tx) => {
    await lockBranch(tx, accessibleReceiving.branchId);

    const existingReceiving = await getLockedReceiving(
      tx,
      accessibleReceiving.id
    );

    if (!existingReceiving) {
      throw new AppError(
        "Purchase receiving not found",
        404,
        "PURCHASE_RECEIVING_NOT_FOUND"
      );
    }

    assertReceivingManageAccess(existingReceiving, actor);

    if (existingReceiving.status !== "DRAFT") {
      throw new AppError(
        "Only draft purchase receivings can be updated",
        400,
        "PURCHASE_RECEIVING_NOT_DRAFT"
      );
    }

    const updateData = {
      updatedById: actor.id,
    };

    if (payload.receivingCode !== undefined) {
      const receivingCode = payload.receivingCode.trim().toUpperCase();

      await assertReceivingCodeIsUnique(
        existingReceiving.branchId,
        receivingCode,
        existingReceiving.id,
        tx
      );

      updateData.receivingCode = receivingCode;
    }

    if (payload.supplierDeliveryNo !== undefined) {
      updateData.supplierDeliveryNo = normalizeOptionalString(
        payload.supplierDeliveryNo
      );
    }

    if (payload.supplierInvoiceNo !== undefined) {
      updateData.supplierInvoiceNo = normalizeOptionalString(
        payload.supplierInvoiceNo
      );
    }

    if (payload.referenceNo !== undefined) {
      updateData.referenceNo = normalizeOptionalString(payload.referenceNo);
    }

    if (payload.notes !== undefined) {
      updateData.notes = normalizeOptionalString(payload.notes);
    }

    if (payload.internalNotes !== undefined) {
      updateData.internalNotes = normalizeOptionalString(payload.internalNotes);
    }

    if (
      payload.supplierDeliveryNo !== undefined ||
      payload.supplierInvoiceNo !== undefined ||
      payload.referenceNo !== undefined
    ) {
      await assertReceivingReferencesAreUnique(
        tx,
        existingReceiving.branchId,
        existingReceiving.supplierId,
        {
          supplierDeliveryNo:
            payload.supplierDeliveryNo !== undefined
              ? updateData.supplierDeliveryNo
              : existingReceiving.supplierDeliveryNo,
          supplierInvoiceNo:
            payload.supplierInvoiceNo !== undefined
              ? updateData.supplierInvoiceNo
              : existingReceiving.supplierInvoiceNo,
          referenceNo:
            payload.referenceNo !== undefined
              ? updateData.referenceNo
              : existingReceiving.referenceNo,
        },
        existingReceiving.id
      );
    }

    let totals = null;

    if (payload.items !== undefined) {
      let purchaseOrder = null;

      if (existingReceiving.purchaseOrderId) {
        await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${existingReceiving.purchaseOrderId} FOR UPDATE`;
        purchaseOrder = await getPurchaseOrderForReceiving(
          existingReceiving.purchaseOrderId,
          existingReceiving.branchId,
          existingReceiving.supplierId,
          tx
        );
      }

      totals = await validateAndBuildItems(
        payload.items,
        existingReceiving.branchId,
        purchaseOrder,
        existingReceiving.id,
        tx
      );

      updateData.subtotal = totals.subtotal;
      updateData.totalDiscount = totals.totalDiscount;
      updateData.grandTotal = totals.grandTotal;

      await tx.purchaseReceivingItem.deleteMany({
        where: {
          purchaseReceivingId: existingReceiving.id,
        },
      });
    }

    const changedFields = Object.keys(updateData).filter(
      (field) => field !== "updatedById"
    );

    if (totals) {
      changedFields.push("items");
    }

    const receiving = await tx.purchaseReceiving.update({
      where: {
        id: existingReceiving.id,
      },
      data: {
        ...updateData,
        ...(totals
          ? {
              items: {
                create: totals.items,
              },
            }
          : {}),
      },
      include: PURCHASE_RECEIVING_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: receiving.branchId,
        action: "PURCHASE_RECEIVING_UPDATED",
        entityType: "PurchaseReceiving",
        entityId: receiving.id,
        description: `Purchase receiving ${receiving.receivingCode} updated`,
        metadata: {
          receivingCode: receiving.receivingCode,
          status: receiving.status,
          changedFields,
          previous: {
            receivingCode: existingReceiving.receivingCode,
            supplierDeliveryNo: existingReceiving.supplierDeliveryNo,
            supplierInvoiceNo: existingReceiving.supplierInvoiceNo,
            referenceNo: existingReceiving.referenceNo,
            notes: existingReceiving.notes,
            internalNotes: existingReceiving.internalNotes,
            itemCount: existingReceiving.items.length,
            subtotal: String(existingReceiving.subtotal),
            totalDiscount: String(existingReceiving.totalDiscount),
            grandTotal: String(existingReceiving.grandTotal),
          },
          current: {
            receivingCode: receiving.receivingCode,
            supplierDeliveryNo: receiving.supplierDeliveryNo,
            supplierInvoiceNo: receiving.supplierInvoiceNo,
            referenceNo: receiving.referenceNo,
            notes: receiving.notes,
            internalNotes: receiving.internalNotes,
            itemCount: receiving.items.length,
            subtotal: String(receiving.subtotal),
            totalDiscount: String(receiving.totalDiscount),
            grandTotal: String(receiving.grandTotal),
          },
        },
      },
      tx
    );

    return receiving;
  });
};


const createPurchaseStockInMovementCode = async (tx, branchId, branchCode, itemCode) => {
  const prefix = `MOV-${branchCode}-${itemCode}-PURCHASE-STOCKIN-`;

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

const postReceivingStockIn = async (tx, receiving, actor) => {
  for (const receivingItem of receiving.items) {
    const quantityReceived = Number(receivingItem.quantityReceived);
    const netAcquisitionUnitCost = toMoney(
      Number(receivingItem.lineTotal) / quantityReceived
    );
    let batchCode = normalizeOptionalString(receivingItem.batchCode);
    const serialNumbers = Array.isArray(receivingItem.serials)
      ? receivingItem.serials.map((serial) => serial.serialNumber)
      : [];

    await tx.$queryRaw`SELECT "id" FROM "Item" WHERE "id" = ${receivingItem.itemId} FOR UPDATE`;

    const item = await tx.item.findUnique({
      where: {
        id: receivingItem.itemId,
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
      throw new AppError("Item not found", 404, "ITEM_NOT_FOUND");
    }

    if (!batchCode) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const count = await tx.inventoryBatch.count({
        where: {
          branchId: receiving.branchId,
          itemId: item.id,
        },
      });
      batchCode = `BAT-${dateStr}-${String(count + 1).padStart(4, "0")}`;
    }

    if (item.branchId !== receiving.branchId) {
      throw new AppError(
        "Item is not available in this branch",
        403,
        "ITEM_BRANCH_ACCESS_DENIED"
      );
    }

    if (item.status !== "ACTIVE") {
      throw new AppError("Item is not active", 400, "ITEM_NOT_ACTIVE");
    }

    if (item.isSerialized) {
      if (!Number.isInteger(quantityReceived)) {
        throw new AppError(
          "Serialized item receiving quantity must be a whole number",
          400,
          "SERIALIZED_QUANTITY_MUST_BE_WHOLE_NUMBER"
        );
      }

      if (serialNumbers.length !== quantityReceived) {
        throw new AppError(
          "Serialized item requires serial count to match received quantity",
          400,
          "SERIAL_COUNT_MISMATCH"
        );
      }
    }

    if (!item.isSerialized && serialNumbers.length > 0) {
      throw new AppError(
        "Serial numbers are not allowed for non-serialized item",
        400,
        "SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM"
      );
    }

    if (serialNumbers.length > 0) {
      const existingSerials = await tx.itemSerial.findMany({
        where: {
          branchId: receiving.branchId,
          serialNumber: {
            in: serialNumbers,
          },
        },
        select: {
          serialNumber: true,
        },
      });

      if (existingSerials.length > 0) {
        const error = new AppError(
          "One or more serial numbers already exist",
          409,
          "SERIAL_ALREADY_EXISTS"
        );

        error.details = existingSerials.map((serial) => serial.serialNumber);
        throw error;
      }
    }

    let existingBatch = await tx.inventoryBatch.findUnique({
      where: {
        branchId_batchCode: {
          branchId: receiving.branchId,
          batchCode,
        },
      },
    });

    if (existingBatch) {
      await tx.$queryRaw`SELECT "id" FROM "InventoryBatch" WHERE "id" = ${existingBatch.id} FOR UPDATE`;
      existingBatch = await tx.inventoryBatch.findUnique({
        where: {
          id: existingBatch.id,
        },
      });
    }

    if (existingBatch && existingBatch.itemId !== item.id) {
      throw new AppError(
        "Batch code already belongs to another item",
        409,
        "BATCH_ITEM_MISMATCH"
      );
    }

    if (existingBatch) {
      throw new AppError(
        "Batch code already exists in this branch and cannot be reused",
        409,
        "BATCH_CODE_ALREADY_EXISTS"
      );
    }

    const previousQuantity = "0";

    const referenceNo =
      receiving.supplierInvoiceNo ||
      receiving.supplierDeliveryNo ||
      receiving.referenceNo ||
      receiving.receivingCode;

    let batch;

    try {
      batch = await tx.inventoryBatch.create({
          data: {
            branchId: receiving.branchId,
            itemId: item.id,
            batchCode,
            quantityIn: quantityReceived.toString(),
            quantityAvailable: quantityReceived.toString(),
            unitCost: netAcquisitionUnitCost.toFixed(2),
            operationalUnitCost: netAcquisitionUnitCost.toFixed(2),
            sellingPrice1: item.price1.toString(),
            sellingPrice2: item.price2.toString(),
            sellingPrice3: item.price3.toString(),
            sellingPrice4: item.price4.toString(),
            sellingPrice5: item.price5.toString(),
            supplierName: receiving.supplierNameSnapshot,
            referenceNo,
            remarks: `Purchase receiving ${receiving.receivingCode}`,
            expiryDate: receivingItem.expiryDate || null,
            status: "ACTIVE",
            createdById: actor.id,
            updatedById: actor.id,
          },
        });
    } catch (error) {
      if (error?.code === "P2002") {
        throw new AppError(
          "Batch code already exists in this branch and cannot be reused",
          409,
          "BATCH_CODE_ALREADY_EXISTS"
        );
      }

      throw error;
    }

    const newQuantity = batch.quantityAvailable.toString();

    const movementCode = await createPurchaseStockInMovementCode(
      tx,
      receiving.branchId,
      item.branch.code,
      item.itemCode
    );

    await tx.inventoryMovement.create({
      data: {
        branchId: receiving.branchId,
        itemId: item.id,
        batchId: batch.id,
        movementCode,
        type: "STOCK_IN",
        source: "PURCHASE",
        quantity: quantityReceived.toString(),
        previousQuantity,
        newQuantity,
        unitCost: netAcquisitionUnitCost.toFixed(2),
        referenceNo,
        remarks: `Posted purchase receiving ${receiving.receivingCode}`,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    for (const serialNumber of serialNumbers) {
      await tx.itemSerial.create({
        data: {
          branchId: receiving.branchId,
          itemId: item.id,
          batchId: batch.id,
          serialNumber,
          status: "AVAILABLE",
          remarks: `Posted purchase receiving ${receiving.receivingCode}`,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
    }

    if (receivingItem.purchaseOrderItemId) {
      await tx.$queryRaw`SELECT "id" FROM "PurchaseOrderItem" WHERE "id" = ${receivingItem.purchaseOrderItemId} FOR UPDATE`;

      const purchaseOrderItem = await tx.purchaseOrderItem.findUnique({
        where: {
          id: receivingItem.purchaseOrderItemId,
        },
      });

      if (!purchaseOrderItem) {
        throw new AppError(
          "Purchase order item not found",
          404,
          "PURCHASE_ORDER_ITEM_NOT_FOUND"
        );
      }

      if (
        purchaseOrderItem.purchaseOrderId !== receiving.purchaseOrderId ||
        purchaseOrderItem.itemId !== receivingItem.itemId
      ) {
        throw new AppError(
          "Purchase order item does not match this receiving line",
          400,
          "PURCHASE_ORDER_ITEM_MISMATCH"
        );
      }

      const previousReceivedQuantityInHundredths = Math.round(
        Number(purchaseOrderItem.receivedQuantity) * 100
      );
      const orderedQuantityInHundredths = Math.round(
        Number(purchaseOrderItem.quantity) * 100
      );
      const newReceivedQuantityInHundredths =
        previousReceivedQuantityInHundredths + Math.round(quantityReceived * 100);

      if (newReceivedQuantityInHundredths > orderedQuantityInHundredths) {
        throw new AppError(
          "Quantity received cannot exceed ordered quantity",
          400,
          "RECEIVING_QUANTITY_EXCEEDS_REMAINING"
        );
      }

      await tx.purchaseOrderItem.update({
        where: {
          id: purchaseOrderItem.id,
        },
        data: {
          receivedQuantity: (newReceivedQuantityInHundredths / 100).toFixed(2),
        },
      });
    }
  }

  if (receiving.purchaseOrderId) {
    const purchaseOrderItems = await tx.purchaseOrderItem.findMany({
      where: {
        purchaseOrderId: receiving.purchaseOrderId,
      },
      select: {
        quantity: true,
        receivedQuantity: true,
      },
    });

    const hasAnyReceived = purchaseOrderItems.some((item) => {
      return Number(item.receivedQuantity) > 0;
    });

    const isFullyReceived =
      purchaseOrderItems.length > 0 &&
      purchaseOrderItems.every((item) => {
        return Number(item.receivedQuantity) >= Number(item.quantity);
      });

    let nextStatus = "ORDERED";
    const updatePurchaseOrderData = {
      updatedById: actor.id,
    };

    if (isFullyReceived) {
      nextStatus = "RECEIVED";
      updatePurchaseOrderData.receivedAt = new Date();
    } else if (hasAnyReceived) {
      nextStatus = "PARTIALLY_RECEIVED";
    }

    updatePurchaseOrderData.status = nextStatus;

    await tx.purchaseOrder.update({
      where: {
        id: receiving.purchaseOrderId,
      },
      data: updatePurchaseOrderData,
    });
  }
};

const updatePurchaseReceivingStatusById = async (purchaseReceivingId, payload, actor) => {
  const accessibleReceiving = await prisma.purchaseReceiving.findUnique({
    where: {
      id: purchaseReceivingId,
    },
    include: PURCHASE_RECEIVING_INCLUDE,
  });

  if (!accessibleReceiving) {
    throw new AppError(
      "Purchase receiving not found",
      404,
      "PURCHASE_RECEIVING_NOT_FOUND"
    );
  }

  assertReceivingManageAccess(accessibleReceiving, actor);

  const cancellationReason = normalizeOptionalString(payload.cancellationReason);

  if (payload.status === "CANCELLED" && !cancellationReason) {
    throw new AppError(
      "Cancellation reason is required",
      400,
      "CANCELLATION_REASON_REQUIRED"
    );
  }

  return prisma.$transaction(async (tx) => {
    await lockBranch(tx, accessibleReceiving.branchId);

    const receiving = await getLockedReceiving(tx, accessibleReceiving.id);

    if (!receiving) {
      throw new AppError(
        "Purchase receiving not found",
        404,
        "PURCHASE_RECEIVING_NOT_FOUND"
      );
    }

    assertReceivingManageAccess(receiving, actor);

    if (receiving.status !== "DRAFT") {
      throw new AppError(
        "Only draft purchase receivings can be changed in this module",
        400,
        "PURCHASE_RECEIVING_NOT_DRAFT"
      );
    }

    if (payload.status === "POSTED") {
      if (receiving.purchaseOrderId) {
        const purchaseOrder = await lockPurchaseOrder(
          tx,
          receiving.purchaseOrderId
        );

        if (!purchaseOrder) {
          throw new AppError(
            "Purchase order not found",
            404,
            "PURCHASE_ORDER_NOT_FOUND"
          );
        }

        if (
          purchaseOrder.branchId !== receiving.branchId ||
          purchaseOrder.supplierId !== receiving.supplierId
        ) {
          throw new AppError(
            "Purchase order does not match this receiving",
            400,
            "PURCHASE_ORDER_RECEIVING_MISMATCH"
          );
        }

        if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status)) {
          throw new AppError(
            "Purchase order is no longer receivable",
            400,
            "PURCHASE_ORDER_NOT_RECEIVABLE"
          );
        }
      }

      await postReceivingStockIn(tx, receiving, actor);

      const postedReceiving = await tx.purchaseReceiving.update({
        where: {
          id: receiving.id,
        },
        data: {
          status: "POSTED",
          postedAt: new Date(),
          postedById: actor.id,
          updatedById: actor.id,
        },
        include: PURCHASE_RECEIVING_INCLUDE,
      });

      await createAuditLog(
        {
          actor,
          branchId: postedReceiving.branchId,
          action: "PURCHASE_RECEIVING_POSTED",
          entityType: "PurchaseReceiving",
          entityId: postedReceiving.id,
          description: `Purchase receiving ${postedReceiving.receivingCode} posted`,
          metadata: {
            receivingCode: postedReceiving.receivingCode,
            purchaseOrderId: postedReceiving.purchaseOrderId,
            previousStatus: receiving.status,
            currentStatus: postedReceiving.status,
            postedAt: postedReceiving.postedAt,
            itemCount: postedReceiving.items.length,
            subtotal: String(postedReceiving.subtotal),
            totalDiscount: String(postedReceiving.totalDiscount),
            grandTotal: String(postedReceiving.grandTotal),
          },
        },
        tx
      );

      return postedReceiving;
    }

    const cancelledReceiving = await tx.purchaseReceiving.update({
      where: {
        id: receiving.id,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: actor.id,
        cancellationReason,
        updatedById: actor.id,
      },
      include: PURCHASE_RECEIVING_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: cancelledReceiving.branchId,
        action: "PURCHASE_RECEIVING_CANCELLED",
        entityType: "PurchaseReceiving",
        entityId: cancelledReceiving.id,
        description: `Purchase receiving ${cancelledReceiving.receivingCode} cancelled`,
        metadata: {
          receivingCode: cancelledReceiving.receivingCode,
          purchaseOrderId: cancelledReceiving.purchaseOrderId,
          previousStatus: receiving.status,
          currentStatus: cancelledReceiving.status,
          cancellationReason: cancelledReceiving.cancellationReason,
          cancelledAt: cancelledReceiving.cancelledAt,
        },
      },
      tx
    );

    return cancelledReceiving;
  });
};

module.exports = {
  PURCHASE_RECEIVING_INCLUDE,
  createPurchaseReceiving,
  listPurchaseReceivings,
  getPurchaseReceivingById,
  updatePurchaseReceivingById,
  updatePurchaseReceivingStatusById,
};
