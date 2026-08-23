const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

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

const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

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

const assertManageReceivingRole = (actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (!OWNER_ADMIN_ROLES.has(actor.role)) {
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

  if (!OWNER_ADMIN_ROLES.has(actor.role)) {
    throw new AppError(
      "You are not allowed to view purchase receivings",
      403,
      "PURCHASE_RECEIVING_VIEW_FORBIDDEN"
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

const getActiveSupplierForBranchOrThrow = async (supplierId, branchId) => {
  const supplier = await prisma.supplier.findUnique({
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

const getPurchaseOrderForReceiving = async (purchaseOrderId, branchId, supplierId) => {
  if (!purchaseOrderId) {
    return null;
  }

  const purchaseOrder = await prisma.purchaseOrder.findUnique({
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

const generateReceivingCode = async (branch) => {
  const prefix = `REC-${branch.code}-`;

  const existingReceivings = await prisma.purchaseReceiving.findMany({
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

const assertReceivingCodeIsUnique = async (branchId, receivingCode, currentReceivingId = null) => {
  const existingReceiving = await prisma.purchaseReceiving.findUnique({
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
  currentReceivingId = null
) => {
  const builtItems = [];
  let subtotal = 0;
  let totalDiscount = 0;
  const serialNumbersInRequest = new Set();

  for (let index = 0; index < items.length; index += 1) {
    const itemPayload = items[index];
    const quantityReceived = Number(itemPayload.quantityReceived);
    const unitCost = Number(itemPayload.unitCost);
    const discountAmount = Number(itemPayload.discountAmount || 0);
    const serialNumbers = normalizeSerialNumbers(itemPayload.serialNumbers);

    if (discountAmount > quantityReceived * unitCost) {
      throw new AppError(
        "Discount amount cannot be greater than line subtotal",
        400,
        "INVALID_LINE_DISCOUNT"
      );
    }

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
      const existingItemSerials = await prisma.itemSerial.findMany({
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

      const existingDraftSerials = await prisma.purchaseReceivingSerial.findMany({
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

      const remainingQuantity =
        Number(purchaseOrderItem.quantity) - Number(purchaseOrderItem.receivedQuantity);

      if (quantityReceived > remainingQuantity) {
        throw new AppError(
          "Quantity received cannot exceed remaining purchase order quantity",
          400,
          "RECEIVING_QUANTITY_EXCEEDS_REMAINING"
        );
      }

      purchaseOrderItemId = purchaseOrderItem.id;
    }

    const lineSubtotal = quantityReceived * unitCost;
    const lineTotal = lineSubtotal - discountAmount;

    subtotal += lineSubtotal;
    totalDiscount += discountAmount;

    builtItems.push({
      lineNo: index + 1,
      description: itemPayload.description.trim(),
      quantityReceived,
      unitCost,
      discountAmount,
      lineTotal,
      batchCode: normalizeOptionalString(itemPayload.batchCode),
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

  return {
    items: builtItems,
    subtotal,
    totalDiscount,
    grandTotal: subtotal - totalDiscount,
  };
};

const createPurchaseReceiving = async (payload, actor) => {
  const branch = await getBranchForCreate(actor, payload.branchId);
  const supplier = await getActiveSupplierForBranchOrThrow(payload.supplierId, branch.id);
  const purchaseOrder = await getPurchaseOrderForReceiving(
    payload.purchaseOrderId,
    branch.id,
    supplier.id
  );

  const receivingCode = payload.receivingCode
    ? payload.receivingCode.trim().toUpperCase()
    : await generateReceivingCode(branch);

  await assertReceivingCodeIsUnique(branch.id, receivingCode);

  const totals = await validateAndBuildItems(payload.items, branch.id, purchaseOrder);

  return prisma.purchaseReceiving.create({
    data: {
      receivingCode,
      status: "DRAFT",
      supplierDeliveryNo: normalizeOptionalString(payload.supplierDeliveryNo),
      supplierInvoiceNo: normalizeOptionalString(payload.supplierInvoiceNo),
      referenceNo: normalizeOptionalString(payload.referenceNo),
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
  const existingReceiving = await prisma.purchaseReceiving.findUnique({
    where: {
      id: purchaseReceivingId,
    },
    include: PURCHASE_RECEIVING_INCLUDE,
  });

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
      existingReceiving.id
    );

    updateData.receivingCode = receivingCode;
  }

  if (payload.supplierDeliveryNo !== undefined) {
    updateData.supplierDeliveryNo = normalizeOptionalString(payload.supplierDeliveryNo);
  }

  if (payload.supplierInvoiceNo !== undefined) {
    updateData.supplierInvoiceNo = normalizeOptionalString(payload.supplierInvoiceNo);
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

  if (payload.items !== undefined) {
    let purchaseOrder = null;

    if (existingReceiving.purchaseOrderId) {
      purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: {
          id: existingReceiving.purchaseOrderId,
        },
        include: {
          items: true,
        },
      });
    }

    const totals = await validateAndBuildItems(
      payload.items,
      existingReceiving.branchId,
      purchaseOrder,
      existingReceiving.id
    );

    updateData.subtotal = totals.subtotal;
    updateData.totalDiscount = totals.totalDiscount;
    updateData.grandTotal = totals.grandTotal;

    return prisma.$transaction(async (tx) => {
      await tx.purchaseReceivingItem.deleteMany({
        where: {
          purchaseReceivingId: existingReceiving.id,
        },
      });

      return tx.purchaseReceiving.update({
        where: {
          id: existingReceiving.id,
        },
        data: {
          ...updateData,
          items: {
            create: totals.items,
          },
        },
        include: PURCHASE_RECEIVING_INCLUDE,
      });
    });
  }

  return prisma.purchaseReceiving.update({
    where: {
      id: existingReceiving.id,
    },
    data: updateData,
    include: PURCHASE_RECEIVING_INCLUDE,
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
    const unitCost = Number(receivingItem.unitCost);
    const batchCode = normalizeOptionalString(receivingItem.batchCode);
    const serialNumbers = Array.isArray(receivingItem.serials)
      ? receivingItem.serials.map((serial) => serial.serialNumber)
      : [];

    if (!batchCode) {
      throw new AppError(
        "Batch code is required before posting receiving",
        400,
        "BATCH_CODE_REQUIRED_FOR_POSTING"
      );
    }

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

    const existingBatch = await tx.inventoryBatch.findUnique({
      where: {
        branchId_batchCode: {
          branchId: receiving.branchId,
          batchCode,
        },
      },
    });

    if (existingBatch && existingBatch.itemId !== item.id) {
      throw new AppError(
        "Batch code already belongs to another item",
        409,
        "BATCH_ITEM_MISMATCH"
      );
    }

    const previousQuantity = existingBatch
      ? Number(existingBatch.quantityAvailable)
      : 0;

    const previousQuantityIn = existingBatch
      ? Number(existingBatch.quantityIn)
      : 0;

    const newQuantity = previousQuantity + quantityReceived;
    const newQuantityIn = previousQuantityIn + quantityReceived;

    const referenceNo =
      receiving.supplierInvoiceNo ||
      receiving.supplierDeliveryNo ||
      receiving.referenceNo ||
      receiving.receivingCode;

    const batch = await tx.inventoryBatch.upsert({
      where: {
        branchId_batchCode: {
          branchId: receiving.branchId,
          batchCode,
        },
      },
      update: {
        itemId: item.id,
        quantityIn: newQuantityIn.toString(),
        quantityAvailable: newQuantity.toString(),
        unitCost: unitCost.toString(),
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
        updatedById: actor.id,
      },
      create: {
        branchId: receiving.branchId,
        itemId: item.id,
        batchCode,
        quantityIn: quantityReceived.toString(),
        quantityAvailable: quantityReceived.toString(),
        unitCost: unitCost.toString(),
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
        previousQuantity: previousQuantity.toString(),
        newQuantity: newQuantity.toString(),
        unitCost: unitCost.toString(),
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

      const previousReceivedQuantity = Number(purchaseOrderItem.receivedQuantity);
      const orderedQuantity = Number(purchaseOrderItem.quantity);
      const newReceivedQuantity = previousReceivedQuantity + quantityReceived;

      if (newReceivedQuantity > orderedQuantity) {
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
          receivedQuantity: newReceivedQuantity.toString(),
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
  const existingReceiving = await prisma.purchaseReceiving.findUnique({
    where: {
      id: purchaseReceivingId,
    },
    include: PURCHASE_RECEIVING_INCLUDE,
  });

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
      "Only draft purchase receivings can be changed in this module",
      400,
      "PURCHASE_RECEIVING_NOT_DRAFT"
    );
  }

  if (payload.status === "POSTED") {
    return prisma.$transaction(async (tx) => {
      const receiving = await tx.purchaseReceiving.findUnique({
        where: {
          id: existingReceiving.id,
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

      if (receiving.status !== "DRAFT") {
        throw new AppError(
          "Only draft purchase receivings can be posted",
          400,
          "PURCHASE_RECEIVING_NOT_DRAFT"
        );
      }

      await postReceivingStockIn(tx, receiving, actor);

      return tx.purchaseReceiving.update({
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
    });
  }

  const cancellationReason = normalizeOptionalString(payload.cancellationReason);

  if (!cancellationReason) {
    throw new AppError(
      "Cancellation reason is required",
      400,
      "CANCELLATION_REASON_REQUIRED"
    );
  }

  return prisma.purchaseReceiving.update({
    where: {
      id: existingReceiving.id,
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
};

module.exports = {
  PURCHASE_RECEIVING_INCLUDE,
  createPurchaseReceiving,
  listPurchaseReceivings,
  getPurchaseReceivingById,
  updatePurchaseReceivingById,
  updatePurchaseReceivingStatusById,
};
