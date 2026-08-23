const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

const PURCHASE_ORDER_INCLUDE = {
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
  orderedBy: {
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

const assertManagePurchaseOrderRole = (actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (!OWNER_ADMIN_ROLES.has(actor.role)) {
    throw new AppError(
      "You are not allowed to manage purchase orders",
      403,
      "PURCHASE_ORDER_MANAGE_FORBIDDEN"
    );
  }
};

const assertViewPurchaseOrderRole = (actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (!OWNER_ADMIN_ROLES.has(actor.role)) {
    throw new AppError(
      "You are not allowed to view purchase orders",
      403,
      "PURCHASE_ORDER_VIEW_FORBIDDEN"
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
  assertManagePurchaseOrderRole(actor);

  if (actor.role === "SUPER_OWNER") {
    if (!requestedBranchId) {
      throw new AppError(
        "Branch ID is required for Super Owner purchase order creation",
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
      "You can only create purchase orders in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return getActiveBranchOrThrow(actor.branchId);
};

const getBranchIdForList = (actor, requestedBranchId) => {
  assertViewPurchaseOrderRole(actor);

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
      "You can only view purchase orders in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return actor.branchId;
};

const assertPurchaseOrderAccess = (purchaseOrder, actor) => {
  assertViewPurchaseOrderRole(actor);

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

  if (purchaseOrder.branchId !== actor.branchId) {
    throw new AppError(
      "You can only access purchase orders in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const assertPurchaseOrderManageAccess = (purchaseOrder, actor) => {
  assertManagePurchaseOrderRole(actor);
  assertPurchaseOrderAccess(purchaseOrder, actor);
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

const generatePurchaseOrderCode = async (branch) => {
  const prefix = `PO-${branch.code}-`;

  const existingPurchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      branchId: branch.id,
      poCode: {
        startsWith: prefix,
      },
    },
    select: {
      poCode: true,
    },
  });

  let highestNumber = 0;

  for (const purchaseOrder of existingPurchaseOrders) {
    const suffix = purchaseOrder.poCode.replace(prefix, "");
    const parsedNumber = Number.parseInt(suffix, 10);

    if (!Number.isNaN(parsedNumber) && parsedNumber > highestNumber) {
      highestNumber = parsedNumber;
    }
  }

  return `${prefix}${String(highestNumber + 1).padStart(5, "0")}`;
};

const assertPurchaseOrderCodeIsUnique = async (branchId, poCode, currentPurchaseOrderId = null) => {
  const existingPurchaseOrder = await prisma.purchaseOrder.findUnique({
    where: {
      branchId_poCode: {
        branchId,
        poCode,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingPurchaseOrder && existingPurchaseOrder.id !== currentPurchaseOrderId) {
    throw new AppError(
      "Purchase order code already exists in this branch",
      409,
      "PURCHASE_ORDER_CODE_ALREADY_EXISTS"
    );
  }
};

const validateAndBuildItems = async (items, branchId) => {
  const builtItems = [];
  let subtotal = 0;
  let totalDiscount = 0;

  for (let index = 0; index < items.length; index += 1) {
    const itemPayload = items[index];
    const quantity = Number(itemPayload.quantity);
    const unitCost = Number(itemPayload.unitCost);
    const discountAmount = Number(itemPayload.discountAmount || 0);

    if (discountAmount > quantity * unitCost) {
      throw new AppError(
        "Discount amount cannot be greater than line subtotal",
        400,
        "INVALID_LINE_DISCOUNT"
      );
    }

    let item = null;

    if (itemPayload.itemId) {
      item = await prisma.item.findUnique({
        where: {
          id: itemPayload.itemId,
        },
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          status: true,
          branchId: true,
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
    }

    const lineSubtotal = quantity * unitCost;
    const lineTotal = lineSubtotal - discountAmount;

    subtotal += lineSubtotal;
    totalDiscount += discountAmount;

    builtItems.push({
      lineNo: index + 1,
      description: itemPayload.description.trim(),
      quantity,
      receivedQuantity: 0,
      unitCost,
      discountAmount,
      lineTotal,
      itemId: item ? item.id : null,
    });
  }

  return {
    items: builtItems,
    subtotal,
    totalDiscount,
    grandTotal: subtotal - totalDiscount,
  };
};

const createPurchaseOrder = async (payload, actor) => {
  const branch = await getBranchForCreate(actor, payload.branchId);
  const supplier = await getActiveSupplierForBranchOrThrow(payload.supplierId, branch.id);

  const poCode = payload.poCode
    ? payload.poCode.trim().toUpperCase()
    : await generatePurchaseOrderCode(branch);

  await assertPurchaseOrderCodeIsUnique(branch.id, poCode);

  const totals = await validateAndBuildItems(payload.items, branch.id);

  return prisma.purchaseOrder.create({
    data: {
      poCode,
      status: "DRAFT",
      expectedDate: normalizeOptionalDate(payload.expectedDate),
      supplierNameSnapshot: supplier.name,
      supplierContactSnapshot: supplier.contactNo,
      notes: normalizeOptionalString(payload.notes),
      internalNotes: normalizeOptionalString(payload.internalNotes),
      subtotal: totals.subtotal,
      totalDiscount: totals.totalDiscount,
      grandTotal: totals.grandTotal,
      branchId: branch.id,
      supplierId: supplier.id,
      createdById: actor.id,
      updatedById: actor.id,
      items: {
        create: totals.items,
      },
    },
    include: PURCHASE_ORDER_INCLUDE,
  });
};

const listPurchaseOrders = async (filters = {}, actor) => {
  const page = Number.parseInt(filters.page || "1", 10);
  const limit = Number.parseInt(filters.limit || "20", 10);
  const safeLimit = Math.min(limit, 100);
  const skip = (page - 1) * safeLimit;

  const branchId = getBranchIdForList(actor, filters.branchId);
  const search = filters.search ? filters.search.trim() : null;

  const where = {
    branchId,
    supplierId: filters.supplierId,
    status: filters.status,
  };

  if (filters.dateFrom || filters.dateTo) {
    where.orderDate = {};

    if (filters.dateFrom) {
      const dateFrom = new Date(filters.dateFrom);
      if (Number.isNaN(dateFrom.getTime())) {
        throw new AppError("Invalid dateFrom value", 400, "INVALID_DATE_FROM");
      }
      dateFrom.setHours(0, 0, 0, 0);
      where.orderDate.gte = dateFrom;
    }

    if (filters.dateTo) {
      const dateTo = new Date(filters.dateTo);
      if (Number.isNaN(dateTo.getTime())) {
        throw new AppError("Invalid dateTo value", 400, "INVALID_DATE_TO");
      }
      dateTo.setHours(23, 59, 59, 999);
      where.orderDate.lte = dateTo;
    }
  }

  if (search) {
    where.OR = [
      {
        poCode: {
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
    prisma.purchaseOrder.findMany({
      where,
      include: PURCHASE_ORDER_INCLUDE,
      orderBy: {
        orderDate: "desc",
      },
      skip,
      take: safeLimit,
    }),
    prisma.purchaseOrder.count({
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

const getPurchaseOrderById = async (purchaseOrderId, actor) => {
  const purchaseOrder = await prisma.purchaseOrder.findUnique({
    where: {
      id: purchaseOrderId,
    },
    include: PURCHASE_ORDER_INCLUDE,
  });

  if (!purchaseOrder) {
    throw new AppError("Purchase order not found", 404, "PURCHASE_ORDER_NOT_FOUND");
  }

  assertPurchaseOrderAccess(purchaseOrder, actor);

  return purchaseOrder;
};

const updatePurchaseOrderById = async (purchaseOrderId, payload, actor) => {
  const existingPurchaseOrder = await prisma.purchaseOrder.findUnique({
    where: {
      id: purchaseOrderId,
    },
    include: PURCHASE_ORDER_INCLUDE,
  });

  if (!existingPurchaseOrder) {
    throw new AppError("Purchase order not found", 404, "PURCHASE_ORDER_NOT_FOUND");
  }

  assertPurchaseOrderManageAccess(existingPurchaseOrder, actor);

  if (existingPurchaseOrder.status !== "DRAFT") {
    throw new AppError(
      "Only draft purchase orders can be updated",
      400,
      "PURCHASE_ORDER_NOT_DRAFT"
    );
  }

  const updateData = {
    updatedById: actor.id,
  };

  if (payload.poCode !== undefined) {
    const poCode = payload.poCode.trim().toUpperCase();

    await assertPurchaseOrderCodeIsUnique(
      existingPurchaseOrder.branchId,
      poCode,
      existingPurchaseOrder.id
    );

    updateData.poCode = poCode;
  }

  if (payload.expectedDate !== undefined) {
    updateData.expectedDate = normalizeOptionalDate(payload.expectedDate);
  }

  if (payload.notes !== undefined) {
    updateData.notes = normalizeOptionalString(payload.notes);
  }

  if (payload.internalNotes !== undefined) {
    updateData.internalNotes = normalizeOptionalString(payload.internalNotes);
  }

  if (payload.items !== undefined) {
    const totals = await validateAndBuildItems(payload.items, existingPurchaseOrder.branchId);

    updateData.subtotal = totals.subtotal;
    updateData.totalDiscount = totals.totalDiscount;
    updateData.grandTotal = totals.grandTotal;

    return prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({
        where: {
          purchaseOrderId: existingPurchaseOrder.id,
        },
      });

      return tx.purchaseOrder.update({
        where: {
          id: existingPurchaseOrder.id,
        },
        data: {
          ...updateData,
          items: {
            create: totals.items,
          },
        },
        include: PURCHASE_ORDER_INCLUDE,
      });
    });
  }

  return prisma.purchaseOrder.update({
    where: {
      id: existingPurchaseOrder.id,
    },
    data: updateData,
    include: PURCHASE_ORDER_INCLUDE,
  });
};

const updatePurchaseOrderStatusById = async (purchaseOrderId, payload, actor) => {
  const existingPurchaseOrder = await prisma.purchaseOrder.findUnique({
    where: {
      id: purchaseOrderId,
    },
    include: PURCHASE_ORDER_INCLUDE,
  });

  if (!existingPurchaseOrder) {
    throw new AppError("Purchase order not found", 404, "PURCHASE_ORDER_NOT_FOUND");
  }

  assertPurchaseOrderManageAccess(existingPurchaseOrder, actor);

  if (existingPurchaseOrder.status !== "DRAFT") {
    throw new AppError(
      "Only draft purchase orders can be ordered or cancelled in this module",
      400,
      "PURCHASE_ORDER_NOT_DRAFT"
    );
  }

  const updateData = {
    status: payload.status,
    updatedById: actor.id,
  };

  if (payload.status === "ORDERED") {
    updateData.orderedAt = new Date();
    updateData.orderedById = actor.id;
  }

  if (payload.status === "CANCELLED") {
    updateData.cancelledAt = new Date();
    updateData.cancelledById = actor.id;
    updateData.cancellationReason = normalizeOptionalString(payload.cancellationReason);

    if (!updateData.cancellationReason) {
      throw new AppError(
        "Cancellation reason is required",
        400,
        "CANCELLATION_REASON_REQUIRED"
      );
    }
  }

  return prisma.purchaseOrder.update({
    where: {
      id: existingPurchaseOrder.id,
    },
    data: updateData,
    include: PURCHASE_ORDER_INCLUDE,
  });
};

module.exports = {
  PURCHASE_ORDER_INCLUDE,
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrderById,
  updatePurchaseOrderStatusById,
};
