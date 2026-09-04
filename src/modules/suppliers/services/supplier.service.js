const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { createAuditLog } = require("../../../utils/auditLogger");

const SUPPLIER_SELECT = {
  id: true,
  supplierCode: true,
  name: true,
  contactPerson: true,
  contactNo: true,
  email: true,
  address: true,
  tin: true,
  notes: true,
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

const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed.length > 0 ? trimmed : null;
};

const assertManageSupplierRole = (actor) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (!OWNER_ADMIN_ROLES.has(actor.role)) {
    throw new AppError(
      "You are not allowed to manage suppliers",
      403,
      "SUPPLIER_MANAGE_FORBIDDEN"
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
  assertManageSupplierRole(actor);

  if (actor.role === "SUPER_OWNER") {
    if (!requestedBranchId) {
      return null;
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
      "You can only create suppliers in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return getActiveBranchOrThrow(actor.branchId);
};

const getSupplierAccessWhere = (actor, requestedBranchId) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (actor.role === "SUPER_OWNER") {
    if (requestedBranchId) {
      return {
        OR: [
          {
            branchId: requestedBranchId,
          },
          {
            branchId: null,
          },
        ],
      };
    }

    return {};
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
      "You can only view suppliers in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return {
    OR: [
      {
        branchId: actor.branchId,
      },
      {
        branchId: null,
      },
    ],
  };
};

const assertSupplierViewAccess = (supplier, actor) => {
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

  if (supplier.branchId && supplier.branchId !== actor.branchId) {
    throw new AppError(
      "You can only access suppliers in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const assertSupplierManageAccess = (supplier, actor) => {
  assertManageSupplierRole(actor);

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

  if (!supplier.branchId || supplier.branchId !== actor.branchId) {
    throw new AppError(
      "You can only manage suppliers in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const generateSupplierCode = async (branch, db = prisma) => {
  const prefix = branch ? `SUP-${branch.code}-` : "SUP-GLOBAL-";

  const existingSuppliers = await db.supplier.findMany({
    where: {
      branchId: branch ? branch.id : null,
      supplierCode: {
        startsWith: prefix,
      },
    },
    select: {
      supplierCode: true,
    },
  });

  let highestNumber = 0;

  for (const supplier of existingSuppliers) {
    const suffix = supplier.supplierCode.replace(prefix, "");
    const parsedNumber = Number.parseInt(suffix, 10);

    if (!Number.isNaN(parsedNumber) && parsedNumber > highestNumber) {
      highestNumber = parsedNumber;
    }
  }

  return `${prefix}${String(highestNumber + 1).padStart(3, "0")}`;
};

const assertSupplierCodeIsUnique = async (
  branchId,
  supplierCode,
  currentSupplierId = null,
  db = prisma
) => {
  const existingSupplier = await db.supplier.findFirst({
    where: {
      branchId,
      supplierCode,
    },
    select: {
      id: true,
    },
  });

  if (existingSupplier && existingSupplier.id !== currentSupplierId) {
    throw new AppError(
      "Supplier code already exists in this supplier scope",
      409,
      "SUPPLIER_CODE_ALREADY_EXISTS"
    );
  }
};

const lockSupplierScope = async (tx, branchId) => {
  if (branchId) {
    await tx.$queryRaw`SELECT "id" FROM "Branch" WHERE "id" = ${branchId} FOR UPDATE`;
    return;
  }

  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${"supplier-code:global"}, 0)
    )::text AS "lockValue"
  `;
};

const getLockedSupplier = async (tx, supplierId) => {
  await tx.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id" = ${supplierId} FOR UPDATE`;

  return tx.supplier.findUnique({
    where: {
      id: supplierId,
    },
    select: SUPPLIER_SELECT,
  });
};

const createSupplier = async (payload, actor) => {
  const requestedBranch = await getBranchForCreate(actor, payload.branchId);
  const requestedBranchId = requestedBranch ? requestedBranch.id : null;

  return prisma.$transaction(async (tx) => {
    await lockSupplierScope(tx, requestedBranchId);

    const branch = requestedBranchId
      ? await getActiveBranchOrThrow(requestedBranchId, tx)
      : null;
    const branchId = branch ? branch.id : null;
    const supplierCode = payload.supplierCode
      ? payload.supplierCode.trim().toUpperCase()
      : await generateSupplierCode(branch, tx);

    await assertSupplierCodeIsUnique(branchId, supplierCode, null, tx);

    const supplier = await tx.supplier.create({
      data: {
        supplierCode,
        name: payload.name.trim(),
        contactPerson: normalizeOptionalString(payload.contactPerson),
        contactNo: normalizeOptionalString(payload.contactNo),
        email: normalizeOptionalString(payload.email),
        address: normalizeOptionalString(payload.address),
        tin: normalizeOptionalString(payload.tin),
        notes: normalizeOptionalString(payload.notes),
        status: "ACTIVE",
        branchId,
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: SUPPLIER_SELECT,
    });

    await createAuditLog(
      {
        actor,
        branchId: supplier.branchId,
        action: "SUPPLIER_CREATED",
        entityType: "Supplier",
        entityId: supplier.id,
        description: `Supplier ${supplier.supplierCode} created`,
        metadata: {
          supplierCode: supplier.supplierCode,
          name: supplier.name,
          branchId: supplier.branchId,
          status: supplier.status,
        },
      },
      tx
    );

    return supplier;
  });
};

const listSuppliers = async (filters = {}, actor) => {
  const page = Number.parseInt(filters.page || "1", 10);
  const limit = Number.parseInt(filters.limit || "20", 10);
  const safeLimit = Math.min(limit, 100);
  const skip = (page - 1) * safeLimit;

  const search = filters.search ? filters.search.trim() : null;

  const where = {
    ...getSupplierAccessWhere(actor, filters.branchId),
    status: filters.status,
  };

  if (search) {
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          {
            supplierCode: {
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
            contactPerson: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            contactNo: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            email: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            tin: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      },
    ];
  }

  const [items, totalItems] = await prisma.$transaction([
    prisma.supplier.findMany({
      where,
      select: SUPPLIER_SELECT,
      orderBy: [
        {
          branch: {
            code: "asc",
          },
        },
        {
          supplierCode: "asc",
        },
      ],
      skip,
      take: safeLimit,
    }),
    prisma.supplier.count({
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

const getSupplierById = async (supplierId, actor) => {
  const supplier = await prisma.supplier.findUnique({
    where: {
      id: supplierId,
    },
    select: SUPPLIER_SELECT,
  });

  if (!supplier) {
    throw new AppError("Supplier not found", 404, "SUPPLIER_NOT_FOUND");
  }

  assertSupplierViewAccess(supplier, actor);

  return supplier;
};

const updateSupplierById = async (supplierId, payload, actor) => {
  const accessibleSupplier = await prisma.supplier.findUnique({
    where: {
      id: supplierId,
    },
    select: SUPPLIER_SELECT,
  });

  if (!accessibleSupplier) {
    throw new AppError("Supplier not found", 404, "SUPPLIER_NOT_FOUND");
  }

  assertSupplierManageAccess(accessibleSupplier, actor);

  return prisma.$transaction(async (tx) => {
    await lockSupplierScope(tx, accessibleSupplier.branchId);

    const existingSupplier = await getLockedSupplier(tx, accessibleSupplier.id);

    if (!existingSupplier) {
      throw new AppError("Supplier not found", 404, "SUPPLIER_NOT_FOUND");
    }

    assertSupplierManageAccess(existingSupplier, actor);

    const updateData = {
      updatedById: actor.id,
    };

    if (payload.supplierCode !== undefined) {
      const supplierCode = payload.supplierCode.trim().toUpperCase();

      await assertSupplierCodeIsUnique(
        existingSupplier.branchId,
        supplierCode,
        existingSupplier.id,
        tx
      );

      updateData.supplierCode = supplierCode;
    }

    if (payload.name !== undefined) {
      updateData.name = payload.name.trim();
    }

    if (payload.contactPerson !== undefined) {
      updateData.contactPerson = normalizeOptionalString(payload.contactPerson);
    }

    if (payload.contactNo !== undefined) {
      updateData.contactNo = normalizeOptionalString(payload.contactNo);
    }

    if (payload.email !== undefined) {
      updateData.email = normalizeOptionalString(payload.email);
    }

    if (payload.address !== undefined) {
      updateData.address = normalizeOptionalString(payload.address);
    }

    if (payload.tin !== undefined) {
      updateData.tin = normalizeOptionalString(payload.tin);
    }

    if (payload.notes !== undefined) {
      updateData.notes = normalizeOptionalString(payload.notes);
    }

    const changedFields = Object.keys(updateData).filter(
      (field) => field !== "updatedById"
    );

    const supplier = await tx.supplier.update({
      where: {
        id: existingSupplier.id,
      },
      data: updateData,
      select: SUPPLIER_SELECT,
    });

    await createAuditLog(
      {
        actor,
        branchId: supplier.branchId,
        action: "SUPPLIER_UPDATED",
        entityType: "Supplier",
        entityId: supplier.id,
        description: `Supplier ${supplier.supplierCode} updated`,
        metadata: {
          supplierCode: supplier.supplierCode,
          previous: {
            supplierCode: existingSupplier.supplierCode,
            name: existingSupplier.name,
            contactPerson: existingSupplier.contactPerson,
            contactNo: existingSupplier.contactNo,
            email: existingSupplier.email,
            address: existingSupplier.address,
            tin: existingSupplier.tin,
            notes: existingSupplier.notes,
          },
          current: {
            supplierCode: supplier.supplierCode,
            name: supplier.name,
            contactPerson: supplier.contactPerson,
            contactNo: supplier.contactNo,
            email: supplier.email,
            address: supplier.address,
            tin: supplier.tin,
            notes: supplier.notes,
          },
          changedFields,
        },
      },
      tx
    );

    return supplier;
  });
};

const updateSupplierStatusById = async (supplierId, status, actor) => {
  const accessibleSupplier = await prisma.supplier.findUnique({
    where: {
      id: supplierId,
    },
    select: SUPPLIER_SELECT,
  });

  if (!accessibleSupplier) {
    throw new AppError("Supplier not found", 404, "SUPPLIER_NOT_FOUND");
  }

  assertSupplierManageAccess(accessibleSupplier, actor);

  return prisma.$transaction(async (tx) => {
    await lockSupplierScope(tx, accessibleSupplier.branchId);

    const existingSupplier = await getLockedSupplier(tx, accessibleSupplier.id);

    if (!existingSupplier) {
      throw new AppError("Supplier not found", 404, "SUPPLIER_NOT_FOUND");
    }

    assertSupplierManageAccess(existingSupplier, actor);

    const supplier = await tx.supplier.update({
      where: {
        id: existingSupplier.id,
      },
      data: {
        status,
        updatedById: actor.id,
      },
      select: SUPPLIER_SELECT,
    });

    await createAuditLog(
      {
        actor,
        branchId: supplier.branchId,
        action: "SUPPLIER_STATUS_UPDATED",
        entityType: "Supplier",
        entityId: supplier.id,
        description: `Supplier ${supplier.supplierCode} status updated to ${supplier.status}`,
        metadata: {
          supplierCode: supplier.supplierCode,
          previousStatus: existingSupplier.status,
          currentStatus: supplier.status,
        },
      },
      tx
    );

    return supplier;
  });
};

const getSupplierHistory = async (supplierId, query = {}, actor) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: SUPPLIER_SELECT,
  });

  if (!supplier) {
    throw new AppError("Supplier not found", 404, "SUPPLIER_NOT_FOUND");
  }

  assertSupplierViewAccess(supplier, actor);

  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);

  const branchFilter =
    actor.role === "SUPER_OWNER" ? {} : { branchId: actor.branchId };

  const [
    purchaseOrders,
    purchaseOrderCount,
    purchaseReceivings,
    purchaseReceivingCount,
    warrantyClaims,
    warrantyClaimCount,
  ] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: {
        supplierId: supplier.id,
        ...branchFilter,
      },
      select: {
        id: true,
        poCode: true,
        status: true,
        orderDate: true,
        expectedDate: true,
        subtotal: true,
        totalDiscount: true,
        grandTotal: true,
        notes: true,
        orderedAt: true,
        receivedAt: true,
        cancelledAt: true,
        branch: {
          select: { id: true, code: true, name: true },
        },
        orderedBy: {
          select: { id: true, username: true, fullName: true, role: true },
        },
        createdBy: {
          select: { id: true, username: true, fullName: true, role: true },
        },
        items: {
          select: {
            id: true,
            lineNo: true,
            description: true,
            quantity: true,
            receivedQuantity: true,
            unitCost: true,
            discountAmount: true,
            lineTotal: true,
            item: {
              select: { id: true, itemCode: true, itemName: true },
            },
          },
          orderBy: { lineNo: "asc" },
        },
      },
      orderBy: { orderDate: "desc" },
      take: limit,
    }),
    prisma.purchaseOrder.count({
      where: {
        supplierId: supplier.id,
        ...branchFilter,
      },
    }),
    prisma.purchaseReceiving.findMany({
      where: {
        supplierId: supplier.id,
        ...branchFilter,
      },
      select: {
        id: true,
        receivingCode: true,
        status: true,
        receivingDate: true,
        supplierDeliveryNo: true,
        supplierInvoiceNo: true,
        referenceNo: true,
        notes: true,
        subtotal: true,
        totalDiscount: true,
        grandTotal: true,
        postedAt: true,
        cancelledAt: true,
        branch: {
          select: { id: true, code: true, name: true },
        },
        purchaseOrder: {
          select: { id: true, poCode: true, status: true },
        },
        createdBy: {
          select: { id: true, username: true, fullName: true, role: true },
        },
        postedBy: {
          select: { id: true, username: true, fullName: true, role: true },
        },
        items: {
          select: {
            id: true,
            lineNo: true,
            description: true,
            quantityReceived: true,
            unitCost: true,
            discountAmount: true,
            lineTotal: true,
            batchCode: true,
            expiryDate: true,
            item: {
              select: { id: true, itemCode: true, itemName: true },
            },
            serials: {
              select: { id: true, serialNumber: true },
            },
          },
          orderBy: { lineNo: "asc" },
        },
      },
      orderBy: { receivingDate: "desc" },
      take: limit,
    }),
    prisma.purchaseReceiving.count({
      where: {
        supplierId: supplier.id,
        ...branchFilter,
      },
    }),
    prisma.warrantyClaim.findMany({
      where: {
        ...branchFilter,
        OR: [
          { supplierName: { equals: supplier.name, mode: "insensitive" } },
          { supplierName: { equals: supplier.supplierCode, mode: "insensitive" } },
          { remarks: { contains: supplier.name, mode: "insensitive" } },
          { remarks: { contains: supplier.supplierCode, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        claimCode: true,
        status: true,
        issueDescription: true,
        customerComplaint: true,
        diagnosis: true,
        actionTaken: true,
        supplierName: true,
        supplierReferenceNo: true,
        remarks: true,
        receivedAt: true,
        sentToSupplierAt: true,
        approvedAt: true,
        rejectedAt: true,
        repairedAt: true,
        replacedAt: true,
        releasedAt: true,
        item: {
          select: { id: true, itemCode: true, itemName: true },
        },
        serial: {
          select: { id: true, serialNumber: true },
        },
        branch: {
          select: { id: true, code: true, name: true },
        },
        customer: {
          select: { id: true, fullName: true, mobileNumber: true },
        },
        createdBy: {
          select: { id: true, username: true, fullName: true, role: true },
        },
      },
      orderBy: { receivedAt: "desc" },
      take: limit,
    }),
    prisma.warrantyClaim.count({
      where: {
        ...branchFilter,
        OR: [
          { supplierName: { equals: supplier.name, mode: "insensitive" } },
          { supplierName: { equals: supplier.supplierCode, mode: "insensitive" } },
          { remarks: { contains: supplier.name, mode: "insensitive" } },
          { remarks: { contains: supplier.supplierCode, mode: "insensitive" } },
        ],
      },
    }),
  ]);

  const totalPurchaseOrderAmount = purchaseOrders.reduce(
    (sum, po) => sum + Number(po.grandTotal || 0),
    0
  );
  const totalReceivingAmount = purchaseReceivings
    .filter((pr) => pr.status === "POSTED" || pr.status === "COMPLETED" || pr.status === "RECEIVED")
    .reduce((sum, pr) => sum + Number(pr.grandTotal || 0), 0);
  const totalAllReceivingAmount = purchaseReceivings.reduce(
    (sum, pr) => sum + Number(pr.grandTotal || 0),
    0
  );

  const activeRmaCount = warrantyClaims.filter(
    (c) => c.status === "SENT_TO_SUPPLIER" || c.status === "CHECKING" || c.status === "IN"
  ).length;

  const resolvedRmaCount = warrantyClaims.filter(
    (c) => ["APPROVED", "REPAIRED", "REPLACED", "OUT", "REJECTED"].includes(c.status)
  ).length;

  return {
    supplier,
    summary: {
      totalPurchaseOrderCount: purchaseOrderCount,
      totalPurchaseOrderAmount,
      totalReceivingCount: purchaseReceivingCount,
      totalReceivingAmount: totalReceivingAmount || totalAllReceivingAmount,
      totalReturnCount: warrantyClaimCount,
      activeRmaCount,
      resolvedRmaCount,
    },
    purchaseOrders: {
      items: purchaseOrders,
      totalItems: purchaseOrderCount,
      limit,
    },
    purchaseReceivings: {
      items: purchaseReceivings,
      totalItems: purchaseReceivingCount,
      limit,
    },
    returns: {
      items: warrantyClaims,
      totalItems: warrantyClaimCount,
      limit,
    },
  };
};

module.exports = {
  SUPPLIER_SELECT,
  createSupplier,
  listSuppliers,
  getSupplierById,
  getSupplierHistory,
  updateSupplierById,
  updateSupplierStatusById,
};
