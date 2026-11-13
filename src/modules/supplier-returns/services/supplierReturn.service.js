const prisma = require("../../../config/prisma");
const { createAuditLog } = require("../../../utils/auditLogger");

const SUPPLIER_RETURN_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "CASHIER",
  "TECHNICIAN",
]);

const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";

const ensureCanAccessSupplierReturns = (actor) => {
  if (!SUPPLIER_RETURN_ROLES.has(actor.role)) {
    const error = new Error("SUPPLIER_RETURN_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const ensureCanAccessBranch = (actor, branchId) => {
  if (isSuperOwner(actor)) return;
  if (branchId !== actor.branchId) {
    const error = new Error("BRANCH_ACCESS_DENIED");
    error.statusCode = 403;
    throw error;
  }
};

const SUPPLIER_RETURN_INCLUDE = {
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      contactNo: true,
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
      address: true,
      tin: true,
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
  approvedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  dispatchedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  resolvedBy: {
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
          brand: true,
          modelName: true,
          isSerialized: true,
          costPrice: true,
        },
      },
      itemSerial: {
        select: {
          id: true,
          serialNumber: true,
          status: true,
        },
      },
      warrantyClaim: {
        select: {
          id: true,
          claimCode: true,
          status: true,
          issueDescription: true,
          customerComplaint: true,
          customer: {
            select: {
              id: true,
              fullName: true,
              mobileNumber: true,
            },
          },
        },
      },
      returnRequest: {
        select: {
          id: true,
          returnCode: true,
          status: true,
          reason: true,
        },
      },
      replacementItem: {
        select: {
          id: true,
          itemCode: true,
          itemName: true,
        },
      },
      replacementSerial: {
        select: {
          id: true,
          serialNumber: true,
          status: true,
        },
      },
    },
    orderBy: {
      lineNo: "asc",
    },
  },
};

const generateSupplierReturnCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `SRTN-${branchCode}-${datePart}-`;

  const latest = await tx.supplierReturn.findFirst({
    where: {
      branchId,
      returnCode: {
        startsWith: prefix,
      },
    },
    orderBy: {
      returnCode: "desc",
    },
    select: {
      returnCode: true,
    },
  });

  let nextNumber = 1;
  if (latest) {
    const numPart = latest.returnCode.slice(prefix.length);
    const parsed = Number(numPart);
    if (Number.isInteger(parsed) && parsed > 0) {
      nextNumber = parsed + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
};

const getEligibleDefects = async (actor, query = {}) => {
  ensureCanAccessSupplierReturns(actor);

  const targetBranchId = isSuperOwner(actor) && query.branchId ? query.branchId : actor.branchId;

  // 1. Pending Warranty Claims in this branch (IN or CHECKING, not yet sent to supplier)
  const warrantyWhere = {
    branchId: targetBranchId,
    status: {
      in: ["IN", "CHECKING"],
    },
    supplierReturnId: null,
  };

  if (query.search) {
    const s = query.search.trim();
    warrantyWhere.OR = [
      { claimCode: { contains: s, mode: "insensitive" } },
      { issueDescription: { contains: s, mode: "insensitive" } },
      { customerComplaint: { contains: s, mode: "insensitive" } },
      { item: { itemName: { contains: s, mode: "insensitive" } } },
      { serial: { serialNumber: { contains: s, mode: "insensitive" } } },
      { customer: { fullName: { contains: s, mode: "insensitive" } } },
    ];
  }

  const warrantyClaims = await prisma.warrantyClaim.findMany({
    where: warrantyWhere,
    include: {
      item: {
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          brand: true,
          modelName: true,
          costPrice: true,
          isSerialized: true,
        },
      },
      serial: {
        select: {
          id: true,
          serialNumber: true,
          status: true,
        },
      },
      customer: {
        select: {
          id: true,
          fullName: true,
          mobileNumber: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  // 2. Completed Customer Returns that have items needing supplier RMA
  const returnWhere = {
    branchId: targetBranchId,
    status: "COMPLETED",
  };

  const returnRequests = await prisma.returnRequest.findMany({
    where: returnWhere,
    include: {
      customer: {
        select: {
          id: true,
          fullName: true,
          mobileNumber: true,
        },
      },
      items: {
        include: {
          item: {
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              brand: true,
              modelName: true,
              costPrice: true,
              isSerialized: true,
            },
          },
          serial: {
            select: {
              id: true,
              serialNumber: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: {
      completedAt: "desc",
    },
    take: 30,
  });

  // 3. Store Defective Serials (status DAMAGED in this branch, not attached to an active return)
  const damagedSerials = await prisma.itemSerial.findMany({
    where: {
      branchId: targetBranchId,
      status: "DAMAGED",
    },
    include: {
      item: {
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          brand: true,
          modelName: true,
          costPrice: true,
          isSerialized: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 50,
  });

  return {
    customerWarrantyClaims: warrantyClaims.map((wc) => ({
      id: wc.id,
      code: wc.claimCode,
      sourceType: "CUSTOMER_WARRANTY",
      itemId: wc.itemId,
      itemCode: wc.item?.itemCode,
      itemName: wc.item?.itemName,
      brand: wc.item?.brand,
      modelName: wc.item?.modelName,
      unitCost: Number(wc.item?.costPrice || 0),
      isSerialized: wc.item?.isSerialized || false,
      serialId: wc.serialId,
      serialNumber: wc.serial?.serialNumber,
      defectReason: wc.issueDescription || wc.customerComplaint || "Customer warranty claim defect",
      customerName: wc.customer?.fullName,
      customerPhone: wc.customer?.mobileNumber,
      receivedAt: wc.receivedAt,
    })),
    customerReturns: returnRequests.flatMap((rr) =>
      rr.items.map((it) => ({
        id: it.id,
        returnRequestId: rr.id,
        code: rr.returnCode,
        sourceType: "CUSTOMER_RETURN",
        itemId: it.itemId,
        itemCode: it.item?.itemCode,
        itemName: it.item?.itemName,
        brand: it.item?.brand,
        modelName: it.item?.modelName,
        unitCost: Number(it.item?.costPrice || 0),
        isSerialized: it.item?.isSerialized || false,
        serialId: it.serialId,
        serialNumber: it.serial?.serialNumber,
        defectReason: it.reason || rr.reason || "Returned defective by customer",
        customerName: rr.customer?.fullName,
        completedAt: rr.completedAt,
      }))
    ),
    storeDefects: damagedSerials.map((s) => ({
      id: s.id,
      sourceType: "STORE_DEFECT",
      itemId: s.itemId,
      itemCode: s.item?.itemCode,
      itemName: s.item?.itemName,
      brand: s.item?.brand,
      modelName: s.item?.modelName,
      unitCost: Number(s.item?.costPrice || 0),
      isSerialized: true,
      serialId: s.id,
      serialNumber: s.serialNumber,
      defectReason: s.remarks || "Damaged / Defective store stock",
      updatedAt: s.updatedAt,
    })),
  };
};

const getSupplierReturns = async (actor, query = {}) => {
  ensureCanAccessSupplierReturns(actor);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const targetBranchId = isSuperOwner(actor) && query.branchId ? query.branchId : actor.branchId;

  const where = {};
  if (targetBranchId) {
    where.branchId = targetBranchId;
  }

  if (query.status && query.status !== "ALL") {
    where.status = query.status;
  }

  if (query.sourceType && query.sourceType !== "ALL") {
    where.sourceType = query.sourceType;
  }

  if (query.resolutionType && query.resolutionType !== "ALL") {
    where.resolutionType = query.resolutionType;
  }

  if (query.supplierId) {
    where.supplierId = query.supplierId;
  }

  if (query.search) {
    const s = query.search.trim();
    where.OR = [
      { returnCode: { contains: s, mode: "insensitive" } },
      { supplierRmaNumber: { contains: s, mode: "insensitive" } },
      { supplier: { name: { contains: s, mode: "insensitive" } } },
      { driverName: { contains: s, mode: "insensitive" } },
      { trackingNumber: { contains: s, mode: "insensitive" } },
      { items: { some: { item: { itemName: { contains: s, mode: "insensitive" } } } } },
      { items: { some: { serialNumberSnapshot: { contains: s, mode: "insensitive" } } } },
    ];
  }

  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) where.createdAt.gte = new Date(query.startDate);
    if (query.endDate) where.createdAt.lte = new Date(query.endDate);
  }

  const [total, returns] = await Promise.all([
    prisma.supplierReturn.count({ where }),
    prisma.supplierReturn.findMany({
      where,
      include: SUPPLIER_RETURN_INCLUDE,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
  ]);

  // Aggregate high-level stats for fast dashboard widgets
  const statsWhere = targetBranchId ? { branchId: targetBranchId } : {};
  const [totalDraft, totalOut, totalResolved, aggregateValue] = await Promise.all([
    prisma.supplierReturn.count({
      where: { ...statsWhere, status: { in: ["DRAFT", "APPROVED"] } },
    }),
    prisma.supplierReturn.count({
      where: { ...statsWhere, status: "OUT_TO_SUPPLIER" },
    }),
    prisma.supplierReturn.count({
      where: { ...statsWhere, status: "RESOLVED" },
    }),
    prisma.supplierReturn.aggregate({
      where: statsWhere,
      _sum: {
        subtotalCost: true,
      },
    }),
  ]);

  return {
    data: returns,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    summary: {
      pendingPullOut: totalDraft,
      withSupplier: totalOut,
      resolved: totalResolved,
      totalCostValue: Number(aggregateValue._sum.subtotalCost || 0),
    },
  };
};

const getSupplierReturnById = async (actor, returnId) => {
  ensureCanAccessSupplierReturns(actor);

  const supplierReturn = await prisma.supplierReturn.findUnique({
    where: { id: returnId },
    include: SUPPLIER_RETURN_INCLUDE,
  });

  if (!supplierReturn) {
    const error = new Error("SUPPLIER_RETURN_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  ensureCanAccessBranch(actor, supplierReturn.branchId);

  return supplierReturn;
};

const createSupplierReturn = async (actor, payload) => {
  ensureCanAccessSupplierReturns(actor);

  const branchId = isSuperOwner(actor) && payload.branchId ? payload.branchId : actor.branchId;

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({
      where: { id: branchId },
      select: { id: true, code: true, name: true, status: true },
    });

    if (!branch || branch.status !== "ACTIVE") {
      const error = new Error("BRANCH_NOT_FOUND_OR_INACTIVE");
      error.statusCode = 404;
      throw error;
    }

    const supplier = await tx.supplier.findUnique({
      where: { id: payload.supplierId },
      select: {
        id: true,
        supplierCode: true,
        name: true,
        contactPerson: true,
        contactNo: true,
        status: true,
      },
    });

    if (!supplier || supplier.status !== "ACTIVE") {
      const error = new Error("SUPPLIER_NOT_FOUND_OR_INACTIVE");
      error.statusCode = 404;
      throw error;
    }

    const returnCode = await generateSupplierReturnCode(tx, branch.code, branch.id);

    // Validate and build items
    let lineNo = 1;
    let subtotalCost = 0;
    const itemsData = [];
    let detectedSourceType = payload.sourceType || "STORE_DEFECT";

    for (const itemInput of payload.items) {
      const item = await tx.item.findUnique({
        where: { id: itemInput.itemId },
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          branchId: true,
          costPrice: true,
          isSerialized: true,
        },
      });

      if (!item || item.branchId !== branch.id) {
        const error = new Error(`Item ${itemInput.itemId} not found in this branch`);
        error.statusCode = 404;
        throw error;
      }

      let serialNumberSnapshot = null;
      let itemSerialId = itemInput.itemSerialId || null;

      if (itemSerialId) {
        const serial = await tx.itemSerial.findUnique({
          where: { id: itemSerialId },
        });
        if (!serial || serial.branchId !== branch.id) {
          const error = new Error(`Serial ${itemSerialId} not found in this branch`);
          error.statusCode = 404;
          throw error;
        }
        serialNumberSnapshot = serial.serialNumber;
      }

      const quantity = Math.max(1, Number(itemInput.quantity) || 1);
      const unitCost = Number(itemInput.unitCost ?? item.costPrice ?? 0);
      const totalCost = quantity * unitCost;
      subtotalCost += totalCost;

      const itemSource = itemInput.sourceType || (itemInput.warrantyClaimId ? "CUSTOMER_WARRANTY" : itemInput.returnRequestId ? "CUSTOMER_RETURN" : "STORE_DEFECT");

      itemsData.push({
        lineNo: lineNo++,
        itemId: item.id,
        itemSerialId,
        serialNumberSnapshot,
        quantity,
        unitCost,
        totalCost,
        defectReason: itemInput.defectReason.trim(),
        defectCategory: itemInput.defectCategory || "OTHER",
        sourceType: itemSource,
        warrantyClaimId: itemInput.warrantyClaimId || null,
        returnRequestId: itemInput.returnRequestId || null,
        resolutionStatus: "PENDING",
      });
    }

    // Determine header source type: if mixed, mark MIXED
    const uniqueSources = new Set(itemsData.map((it) => it.sourceType));
    if (uniqueSources.size > 1) {
      detectedSourceType = "MIXED";
    } else if (uniqueSources.size === 1) {
      detectedSourceType = Array.from(uniqueSources)[0];
    }

    const supplierReturn = await tx.supplierReturn.create({
      data: {
        returnCode,
        status: "DRAFT",
        sourceType: detectedSourceType,
        branchId: branch.id,
        supplierId: supplier.id,
        supplierRmaNumber: payload.supplierRmaNumber ? payload.supplierRmaNumber.trim() : null,
        supplierNameSnapshot: supplier.name,
        supplierContactSnapshot: `${supplier.contactPerson || ""} (${supplier.contactNo || ""})`.trim(),
        driverName: payload.driverName ? payload.driverName.trim() : null,
        driverContact: payload.driverContact ? payload.driverContact.trim() : null,
        vehiclePlate: payload.vehiclePlate ? payload.vehiclePlate.trim() : null,
        courierName: payload.courierName ? payload.courierName.trim() : null,
        trackingNumber: payload.trackingNumber ? payload.trackingNumber.trim() : null,
        notes: payload.notes ? payload.notes.trim() : null,
        internalNotes: payload.internalNotes ? payload.internalNotes.trim() : null,
        expectedResolutionDate: payload.expectedResolutionDate ? new Date(payload.expectedResolutionDate) : null,
        subtotalCost,
        totalItems: itemsData.length,
        createdById: actor.id,
        items: {
          create: itemsData,
        },
      },
      include: SUPPLIER_RETURN_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: branch.id,
        action: "SUPPLIER_RETURN_CREATED",
        entityType: "SupplierReturn",
        entityId: supplierReturn.id,
        description: `Created Supplier Return ${supplierReturn.returnCode} to ${supplier.name} with ${itemsData.length} item(s)`,
        metadata: {
          returnCode: supplierReturn.returnCode,
          supplierId: supplier.id,
          totalItems: itemsData.length,
          subtotalCost,
        },
      },
      tx
    );

    return supplierReturn;
  });
};

const updateSupplierReturn = async (actor, returnId, payload) => {
  ensureCanAccessSupplierReturns(actor);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.supplierReturn.findUnique({
      where: { id: returnId },
      include: { items: true },
    });

    if (!existing) {
      const error = new Error("SUPPLIER_RETURN_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessBranch(actor, existing.branchId);

    if (existing.status !== "DRAFT") {
      const error = new Error("CANNOT_EDIT_NON_DRAFT_SUPPLIER_RETURN");
      error.statusCode = 400;
      throw error;
    }

    const updateData = {
      updatedById: actor.id,
    };

    if (payload.supplierId) {
      const supplier = await tx.supplier.findUnique({
        where: { id: payload.supplierId },
      });
      if (!supplier || supplier.status !== "ACTIVE") {
        const error = new Error("SUPPLIER_NOT_FOUND_OR_INACTIVE");
        error.statusCode = 404;
        throw error;
      }
      updateData.supplierId = supplier.id;
      updateData.supplierNameSnapshot = supplier.name;
      updateData.supplierContactSnapshot = `${supplier.contactPerson || ""} (${supplier.contactNo || ""})`.trim();
    }

    if (payload.supplierRmaNumber !== undefined) updateData.supplierRmaNumber = payload.supplierRmaNumber ? payload.supplierRmaNumber.trim() : null;
    if (payload.notes !== undefined) updateData.notes = payload.notes ? payload.notes.trim() : null;
    if (payload.internalNotes !== undefined) updateData.internalNotes = payload.internalNotes ? payload.internalNotes.trim() : null;
    if (payload.expectedResolutionDate !== undefined) updateData.expectedResolutionDate = payload.expectedResolutionDate ? new Date(payload.expectedResolutionDate) : null;
    if (payload.driverName !== undefined) updateData.driverName = payload.driverName ? payload.driverName.trim() : null;
    if (payload.driverContact !== undefined) updateData.driverContact = payload.driverContact ? payload.driverContact.trim() : null;
    if (payload.vehiclePlate !== undefined) updateData.vehiclePlate = payload.vehiclePlate ? payload.vehiclePlate.trim() : null;
    if (payload.courierName !== undefined) updateData.courierName = payload.courierName ? payload.courierName.trim() : null;
    if (payload.trackingNumber !== undefined) updateData.trackingNumber = payload.trackingNumber ? payload.trackingNumber.trim() : null;

    if (payload.items && payload.items.length > 0) {
      await tx.supplierReturnItem.deleteMany({
        where: { supplierReturnId: existing.id },
      });

      let lineNo = 1;
      let subtotalCost = 0;
      const itemsData = [];

      for (const itemInput of payload.items) {
        const item = await tx.item.findUnique({
          where: { id: itemInput.itemId },
          select: {
            id: true,
            costPrice: true,
          },
        });

        let serialNumberSnapshot = null;
        if (itemInput.itemSerialId) {
          const serial = await tx.itemSerial.findUnique({
            where: { id: itemInput.itemSerialId },
          });
          serialNumberSnapshot = serial?.serialNumber || null;
        }

        const quantity = Math.max(1, Number(itemInput.quantity) || 1);
        const unitCost = Number(itemInput.unitCost ?? item?.costPrice ?? 0);
        const totalCost = quantity * unitCost;
        subtotalCost += totalCost;

        itemsData.push({
          supplierReturnId: existing.id,
          lineNo: lineNo++,
          itemId: itemInput.itemId,
          itemSerialId: itemInput.itemSerialId || null,
          serialNumberSnapshot,
          quantity,
          unitCost,
          totalCost,
          defectReason: itemInput.defectReason.trim(),
          defectCategory: itemInput.defectCategory || "OTHER",
          sourceType: itemInput.sourceType || "STORE_DEFECT",
          warrantyClaimId: itemInput.warrantyClaimId || null,
          returnRequestId: itemInput.returnRequestId || null,
          resolutionStatus: "PENDING",
        });
      }

      await tx.supplierReturnItem.createMany({
        data: itemsData,
      });

      updateData.subtotalCost = subtotalCost;
      updateData.totalItems = itemsData.length;
    }

    const updated = await tx.supplierReturn.update({
      where: { id: existing.id },
      data: updateData,
      include: SUPPLIER_RETURN_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: existing.branchId,
        action: "SUPPLIER_RETURN_UPDATED",
        entityType: "SupplierReturn",
        entityId: updated.id,
        description: `Updated Supplier Return ${updated.returnCode}`,
      },
      tx
    );

    return updated;
  });
};

const approveSupplierReturn = async (actor, returnId, payload = {}) => {
  ensureCanAccessSupplierReturns(actor);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.supplierReturn.findUnique({
      where: { id: returnId },
    });

    if (!existing) {
      const error = new Error("SUPPLIER_RETURN_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessBranch(actor, existing.branchId);

    if (existing.status !== "DRAFT") {
      const error = new Error("ONLY_DRAFT_CAN_BE_APPROVED");
      error.statusCode = 400;
      throw error;
    }

    const updated = await tx.supplierReturn.update({
      where: { id: existing.id },
      data: {
        status: "APPROVED",
        approvedById: actor.id,
        approvedAt: new Date(),
        updatedById: actor.id,
        internalNotes: payload.notes
          ? `${existing.internalNotes ? existing.internalNotes + " | " : ""}Approved: ${payload.notes.trim()}`
          : existing.internalNotes,
      },
      include: SUPPLIER_RETURN_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: existing.branchId,
        action: "SUPPLIER_RETURN_APPROVED",
        entityType: "SupplierReturn",
        entityId: updated.id,
        description: `Approved Supplier Return ${updated.returnCode}`,
      },
      tx
    );

    return updated;
  });
};

const dispatchSupplierReturn = async (actor, returnId, payload = {}) => {
  ensureCanAccessSupplierReturns(actor);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.supplierReturn.findUnique({
      where: { id: returnId },
      include: {
        items: true,
        supplier: true,
        branch: true,
      },
    });

    if (!existing) {
      const error = new Error("SUPPLIER_RETURN_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessBranch(actor, existing.branchId);

    if (!["DRAFT", "APPROVED"].includes(existing.status)) {
      const error = new Error("SUPPLIER_RETURN_ALREADY_DISPATCHED_OR_SETTLED");
      error.statusCode = 400;
      throw error;
    }

    const dispatchDate = payload.dispatchDate ? new Date(payload.dispatchDate) : new Date();

    // 1. Update each item's serial to IN_TRANSIT and link WarrantyClaims
    for (const item of existing.items) {
      if (item.itemSerialId) {
        await tx.itemSerial.update({
          where: { id: item.itemSerialId },
          data: {
            status: "IN_TRANSIT",
            updatedById: actor.id,
            remarks: `Dispatched to Supplier (${existing.supplier.name}) via ${existing.returnCode}`,
          },
        });
      }

      if (item.warrantyClaimId) {
        // Automatically sync and update Customer Warranty Claim status to SENT_TO_SUPPLIER!
        await tx.warrantyClaim.update({
          where: { id: item.warrantyClaimId },
          data: {
            status: "SENT_TO_SUPPLIER",
            sentToSupplierAt: dispatchDate,
            supplierName: existing.supplier.name,
            supplierReferenceNo: existing.supplierRmaNumber || existing.returnCode,
            supplierReturnId: existing.id,
            remarks: `Dispatched in Supplier Return batch ${existing.returnCode} (Courier/Driver: ${payload.driverName || payload.courierName || "Direct pull-out"})`,
            statusUpdatedById: actor.id,
            updatedById: actor.id,
          },
        });
      }
    }

    const updated = await tx.supplierReturn.update({
      where: { id: existing.id },
      data: {
        status: "OUT_TO_SUPPLIER",
        dispatchedById: actor.id,
        dispatchedAt: dispatchDate,
        dispatchDate: dispatchDate,
        driverName: payload.driverName ? payload.driverName.trim() : existing.driverName,
        driverContact: payload.driverContact ? payload.driverContact.trim() : existing.driverContact,
        vehiclePlate: payload.vehiclePlate ? payload.vehiclePlate.trim() : existing.vehiclePlate,
        courierName: payload.courierName ? payload.courierName.trim() : existing.courierName,
        trackingNumber: payload.trackingNumber ? payload.trackingNumber.trim() : existing.trackingNumber,
        notes: payload.notes ? payload.notes.trim() : existing.notes,
        updatedById: actor.id,
      },
      include: SUPPLIER_RETURN_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: existing.branchId,
        action: "SUPPLIER_RETURN_DISPATCHED",
        entityType: "SupplierReturn",
        entityId: updated.id,
        description: `Dispatched Supplier Return ${updated.returnCode} to ${existing.supplier.name} via ${payload.driverName || payload.courierName || "Direct Handover"}`,
        metadata: {
          returnCode: updated.returnCode,
          driverName: updated.driverName,
          courierName: updated.courierName,
          trackingNumber: updated.trackingNumber,
        },
      },
      tx
    );

    return updated;
  });
};

const resolveSupplierReturn = async (actor, returnId, payload) => {
  ensureCanAccessSupplierReturns(actor);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.supplierReturn.findUnique({
      where: { id: returnId },
      include: {
        items: {
          include: {
            item: true,
            itemSerial: true,
            warrantyClaim: true,
          },
        },
        supplier: true,
        branch: true,
      },
    });

    if (!existing) {
      const error = new Error("SUPPLIER_RETURN_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessBranch(actor, existing.branchId);

    if (existing.status === "CANCELLED" || existing.status === "RESOLVED") {
      const error = new Error("SUPPLIER_RETURN_ALREADY_RESOLVED_OR_CANCELLED");
      error.statusCode = 400;
      throw error;
    }

    const resolutionType = payload.resolutionType;
    const resolvedDate = new Date();
    const resolutionNotes = payload.resolutionNotes ? payload.resolutionNotes.trim() : null;
    const rejectionReason = payload.rejectionReason ? payload.rejectionReason.trim() : null;

    // Process each item resolution
    for (const item of existing.items) {
      // Find override item resolution from payload if provided
      const itemOverride = payload.items?.find(
        (it) => it.supplierReturnItemId === item.id
      );

      let itemStatus = "PENDING";
      let replacementSerial = null;
      let replacementItem = null;
      let replacementSerialNumber = itemOverride?.replacementSerialNumber || null;

      if (itemOverride?.resolutionStatus) {
        itemStatus = itemOverride.resolutionStatus;
      } else {
        // Fallback to header resolutionType
        if (resolutionType === "REPLACEMENT") itemStatus = "REPLACED";
        else if (resolutionType === "REPAIRED") itemStatus = "REPAIRED";
        else if (resolutionType === "CREDIT_MEMO") itemStatus = "CREDIT_MEMO";
        else if (resolutionType === "REFUND") itemStatus = "REFUND";
        else if (resolutionType === "RETURN_TO_CUSTOMER_DEFECTIVE") itemStatus = "RETURNED_DEFECTIVE";
        else if (resolutionType === "SCRAP_SHRINKAGE") itemStatus = "SCRAPPED";
      }

      // Handle item-level mutations based on outcome
      if (itemStatus === "REPLACED") {
        // Supplier gave a replacement unit
        if (item.itemSerialId) {
          // Original defective serial is marked RETURNED (or RMA settled)
          await tx.itemSerial.update({
            where: { id: item.itemSerialId },
            data: {
              status: "RETURNED",
              updatedById: actor.id,
              remarks: `Replaced by Supplier (${existing.supplier.name}) via ${existing.returnCode}`,
            },
          });
        }

        // If replacement serial number was given, register new serial or update
        if (replacementSerialNumber && replacementSerialNumber.trim()) {
          const cleanSerial = replacementSerialNumber.trim();
          let targetSerial = await tx.itemSerial.findFirst({
            where: {
              branchId: existing.branchId,
              itemId: item.itemId,
              serialNumber: cleanSerial,
            },
          });

          if (!targetSerial) {
            targetSerial = await tx.itemSerial.create({
              data: {
                branchId: existing.branchId,
                itemId: item.itemId,
                serialNumber: cleanSerial,
                status: "AVAILABLE",
                createdById: actor.id,
                remarks: `Supplier RMA Replacement unit for ${existing.returnCode} (Replaced original SN: ${item.serialNumberSnapshot || "N/A"})`,
              },
            });
          } else {
            await tx.itemSerial.update({
              where: { id: targetSerial.id },
              data: {
                status: "AVAILABLE",
                updatedById: actor.id,
                remarks: `Supplier RMA Replacement unit for ${existing.returnCode}`,
              },
            });
          }
          replacementSerial = targetSerial;
        }

        // If item linked to WarrantyClaim -> update WarrantyClaim to REPLACED!
        if (item.warrantyClaimId) {
          await tx.warrantyClaim.update({
            where: { id: item.warrantyClaimId },
            data: {
              status: "REPLACED",
              replacedAt: resolvedDate,
              actionTaken: `Supplier RMA Replaced: New unit received from ${existing.supplier.name} (SN: ${replacementSerialNumber || "Replacement unit"}). ${resolutionNotes || ""}`.trim(),
              remarks: `Resolved via Supplier Return ${existing.returnCode}. Ready for release to customer.`,
              statusUpdatedById: actor.id,
              updatedById: actor.id,
            },
          });
        }
      } else if (itemStatus === "REPAIRED") {
        // Supplier repaired the unit
        if (item.itemSerialId) {
          await tx.itemSerial.update({
            where: { id: item.itemSerialId },
            data: {
              status: "AVAILABLE",
              updatedById: actor.id,
              remarks: `Repaired by Supplier (${existing.supplier.name}) via ${existing.returnCode}`,
            },
          });
        }

        // If item linked to WarrantyClaim -> update WarrantyClaim to REPAIRED!
        if (item.warrantyClaimId) {
          await tx.warrantyClaim.update({
            where: { id: item.warrantyClaimId },
            data: {
              status: "REPAIRED",
              repairedAt: resolvedDate,
              actionTaken: `Supplier RMA Repaired: Unit serviced and tested functional by ${existing.supplier.name}. ${resolutionNotes || ""}`.trim(),
              remarks: `Resolved via Supplier Return ${existing.returnCode}. Ready for release to customer.`,
              statusUpdatedById: actor.id,
              updatedById: actor.id,
            },
          });
        }
      } else if (itemStatus === "RETURNED_DEFECTIVE") {
        // Supplier REJECTED warranty claim / RMA (e.g. Customer Induced Damage, void sticker broken, liquid damage)
        // Unit returned to store STILL DEFECTIVE, to be handed back to customer
        if (item.itemSerialId) {
          await tx.itemSerial.update({
            where: { id: item.itemSerialId },
            data: {
              status: "DAMAGED",
              updatedById: actor.id,
              remarks: `Supplier Rejected RMA: ${rejectionReason || "Customer Induced Damage / Void Warranty"}. Returned to store still defective.`,
            },
          });
        }

        if (item.warrantyClaimId) {
          await tx.warrantyClaim.update({
            where: { id: item.warrantyClaimId },
            data: {
              status: "REJECTED",
              rejectedAt: resolvedDate,
              diagnosis: `Supplier RMA Rejected: ${rejectionReason || resolutionNotes || "Warranty voided by supplier / Customer Induced Damage"}`.trim(),
              actionTaken: `Defective unit returned by supplier to store. Ready for customer claim release with rejection findings.`,
              remarks: `Supplier rejected RMA. Unit returned to store still defective. ${rejectionReason ? `Reason: ${rejectionReason}` : ""}`.trim(),
              statusUpdatedById: actor.id,
              updatedById: actor.id,
            },
          });
        }
      } else if (itemStatus === "CREDIT_MEMO") {
        if (item.itemSerialId) {
          await tx.itemSerial.update({
            where: { id: item.itemSerialId },
            data: {
              status: "DAMAGED",
              updatedById: actor.id,
              remarks: `Supplier Credit Memo issued (#${payload.creditMemoNumber || "N/A"}). Unit written off.`,
            },
          });
        }

        if (item.warrantyClaimId) {
          await tx.warrantyClaim.update({
            where: { id: item.warrantyClaimId },
            data: {
              status: "REPLACED",
              replacedAt: resolvedDate,
              actionTaken: `Supplier issued Credit Memo (#${payload.creditMemoNumber || "N/A"}) for ₱${Number(payload.creditMemoAmount || 0).toFixed(2)}.`,
              remarks: `Resolved via Supplier Credit Memo. Store credit / store warranty coverage applies.`,
              statusUpdatedById: actor.id,
              updatedById: actor.id,
            },
          });
        }
      } else if (itemStatus === "REFUND" || itemStatus === "SCRAPPED") {
        if (item.itemSerialId) {
          await tx.itemSerial.update({
            where: { id: item.itemSerialId },
            data: {
              status: "DAMAGED",
              updatedById: actor.id,
              remarks: `Supplier RMA settled as ${itemStatus}. Written off.`,
            },
          });
        }

        if (item.warrantyClaimId) {
          await tx.warrantyClaim.update({
            where: { id: item.warrantyClaimId },
            data: {
              status: "REPLACED",
              replacedAt: resolvedDate,
              actionTaken: `Supplier RMA Settled via ${itemStatus}. ${resolutionNotes || ""}`.trim(),
              statusUpdatedById: actor.id,
              updatedById: actor.id,
            },
          });
        }
      }

      await tx.supplierReturnItem.update({
        where: { id: item.id },
        data: {
          resolutionStatus: itemStatus,
          resolutionNotes: itemOverride?.resolutionNotes || resolutionNotes,
          replacementSerialId: replacementSerial?.id || null,
          replacementSerialNumber: replacementSerialNumber || null,
          resolvedAt: resolvedDate,
          repairedAt: itemStatus === "REPAIRED" ? resolvedDate : null,
          replacedAt: itemStatus === "REPLACED" ? resolvedDate : null,
        },
      });
    }

    const updated = await tx.supplierReturn.update({
      where: { id: existing.id },
      data: {
        status: "RESOLVED",
        resolutionType,
        resolvedDate,
        resolvedById: actor.id,
        updatedById: actor.id,
        resolutionNotes,
        rejectionReason,
        creditMemoNumber: payload.creditMemoNumber ? payload.creditMemoNumber.trim() : existing.creditMemoNumber,
        creditMemoAmount: payload.creditMemoAmount ? Number(payload.creditMemoAmount) : existing.creditMemoAmount,
        refundAmount: payload.refundAmount ? Number(payload.refundAmount) : existing.refundAmount,
      },
      include: SUPPLIER_RETURN_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: existing.branchId,
        action: "SUPPLIER_RETURN_RESOLVED",
        entityType: "SupplierReturn",
        entityId: updated.id,
        description: `Resolved Supplier Return ${updated.returnCode} with outcome ${resolutionType}${rejectionReason ? ` (Rejection: ${rejectionReason})` : ""}`,
        metadata: {
          returnCode: updated.returnCode,
          resolutionType,
          creditMemoNumber: updated.creditMemoNumber,
          creditMemoAmount: Number(updated.creditMemoAmount),
          rejectionReason,
        },
      },
      tx
    );

    return updated;
  });
};

const cancelSupplierReturn = async (actor, returnId, payload) => {
  ensureCanAccessSupplierReturns(actor);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.supplierReturn.findUnique({
      where: { id: returnId },
      include: {
        items: true,
      },
    });

    if (!existing) {
      const error = new Error("SUPPLIER_RETURN_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessBranch(actor, existing.branchId);

    if (existing.status === "RESOLVED" || existing.status === "CANCELLED") {
      const error = new Error("CANNOT_CANCEL_RESOLVED_OR_CANCELLED_RETURN");
      error.statusCode = 400;
      throw error;
    }

    // Revert serials if they were IN_TRANSIT
    for (const item of existing.items) {
      if (item.itemSerialId) {
        await tx.itemSerial.update({
          where: { id: item.itemSerialId },
          data: {
            status: "DAMAGED",
            updatedById: actor.id,
            remarks: `Supplier Return ${existing.returnCode} was cancelled. Reverted to DAMAGED.`,
          },
        });
      }

      if (item.warrantyClaimId) {
        await tx.warrantyClaim.update({
          where: { id: item.warrantyClaimId },
          data: {
            status: "CHECKING",
            supplierReturnId: null,
            remarks: `Supplier Return ${existing.returnCode} was cancelled. Reverted claim to CHECKING.`,
            statusUpdatedById: actor.id,
            updatedById: actor.id,
          },
        });
      }
    }

    const updated = await tx.supplierReturn.update({
      where: { id: existing.id },
      data: {
        status: "CANCELLED",
        cancelledById: actor.id,
        cancelledAt: new Date(),
        cancellationReason: payload.reason.trim(),
        updatedById: actor.id,
      },
      include: SUPPLIER_RETURN_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: existing.branchId,
        action: "SUPPLIER_RETURN_CANCELLED",
        entityType: "SupplierReturn",
        entityId: updated.id,
        description: `Cancelled Supplier Return ${updated.returnCode}: ${payload.reason}`,
        metadata: {
          returnCode: updated.returnCode,
          reason: payload.reason,
        },
      },
      tx
    );

    return updated;
  });
};

module.exports = {
  getEligibleDefects,
  getSupplierReturns,
  getSupplierReturnById,
  createSupplierReturn,
  updateSupplierReturn,
  approveSupplierReturn,
  dispatchSupplierReturn,
  resolveSupplierReturn,
  cancelSupplierReturn,
};

