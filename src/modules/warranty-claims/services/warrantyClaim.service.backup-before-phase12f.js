const prisma = require("../../../config/prisma");

const CREATE_WARRANTY_CLAIM_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "CASHIER",
  "TECHNICIAN",
]);

const UPDATE_WARRANTY_STATUS_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "TECHNICIAN",
]);


const RELEASE_WARRANTY_STATUS_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "TECHNICIAN",
]);

const RELEASE_ALLOWED_STATUSES = new Set([
  "REPAIRED",
  "REPLACED",
  "REJECTED",
]);

const ensureCanReleaseWarrantyClaim = (actor) => {
  if (!RELEASE_WARRANTY_STATUS_ROLES.has(actor.role)) {
    const error = new Error("WARRANTY_RELEASE_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const WARRANTY_STATUS_TRANSITIONS = {
  IN: new Set(["CHECKING"]),
  CHECKING: new Set(["SENT_TO_SUPPLIER", "APPROVED", "REJECTED", "REPAIRED"]),
  SENT_TO_SUPPLIER: new Set(["APPROVED", "REJECTED", "REPAIRED", "REPLACED"]),
  APPROVED: new Set(["REPAIRED", "REPLACED"]),
  REPAIRED: new Set(["OUT"]),
  REPLACED: new Set(["OUT"]),
  REJECTED: new Set(["OUT"]),
  OUT: new Set([]),
};

const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";

const ensureCanCreateWarrantyClaim = (actor) => {
  if (!CREATE_WARRANTY_CLAIM_ROLES.has(actor.role)) {
    const error = new Error("WARRANTY_CLAIM_CREATE_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const ensureCanUpdateWarrantyStatus = (actor) => {
  if (!UPDATE_WARRANTY_STATUS_ROLES.has(actor.role)) {
    const error = new Error("WARRANTY_STATUS_UPDATE_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const WARRANTY_CLAIM_INCLUDE = {
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  customer: {
    select: {
      id: true,
      customerCode: true,
      fullName: true,
      mobileNumber: true,
    },
  },
  item: {
    select: {
      id: true,
      itemCode: true,
      itemName: true,
      brand: true,
      modelName: true,
      hasWarranty: true,
    },
  },
  serial: {
    select: {
      id: true,
      serialNumber: true,
      status: true,
    },
  },
  sale: {
    select: {
      id: true,
      receiptCode: true,
      status: true,
      saleDate: true,
    },
  },
  saleItem: {
    select: {
      id: true,
      lineNo: true,
      description: true,
      itemCodeSnapshot: true,
      itemNameSnapshot: true,
      serialId: true,
      itemId: true,
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
  statusUpdatedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  releasedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
};

const ensureCanAccessWarrantyClaimBranch = (actor, warrantyClaim) => {
  if (isSuperOwner(actor)) return;

  if (warrantyClaim.branchId !== actor.branchId) {
    const error = new Error("WARRANTY_CLAIM_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }
};

const generateWarrantyClaimCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `WTY-${branchCode}-${datePart}-`;

  const latestClaim = await tx.warrantyClaim.findFirst({
    where: {
      branchId,
      claimCode: {
        startsWith: prefix,
      },
    },
    orderBy: {
      claimCode: "desc",
    },
    select: {
      claimCode: true,
    },
  });

  let nextNumber = 1;

  if (latestClaim) {
    const latestNumberText = latestClaim.claimCode.slice(prefix.length);
    const latestNumber = Number(latestNumberText);

    if (Number.isInteger(latestNumber) && latestNumber > 0) {
      nextNumber = latestNumber + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
};

const resolveBranchForCreate = async (tx, actor, payload) => {
  if (isSuperOwner(actor)) {
    if (!payload.branchId) {
      const error = new Error("BRANCH_ID_REQUIRED");
      error.statusCode = 400;
      throw error;
    }

    const branch = await tx.branch.findUnique({
      where: {
        id: payload.branchId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
    });

    if (!branch || branch.status !== "ACTIVE") {
      const error = new Error("BRANCH_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    return branch;
  }

  const branch = await tx.branch.findUnique({
    where: {
      id: actor.branchId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  if (!branch || branch.status !== "ACTIVE") {
    const error = new Error("BRANCH_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return branch;
};

const validateCustomer = async (tx, customerId, branchId) => {
  if (!customerId) return null;

  const customer = await tx.customer.findUnique({
    where: {
      id: customerId,
    },
    select: {
      id: true,
      branchId: true,
      status: true,
    },
  });

  if (!customer || customer.branchId !== branchId || customer.status !== "ACTIVE") {
    const error = new Error("CUSTOMER_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return customer;
};

const validateItem = async (tx, itemId, branchId) => {
  if (!itemId) return null;

  const item = await tx.item.findUnique({
    where: {
      id: itemId,
    },
    select: {
      id: true,
      branchId: true,
      status: true,
      hasWarranty: true,
    },
  });

  if (!item || item.branchId !== branchId || item.status !== "ACTIVE") {
    const error = new Error("ITEM_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return item;
};

const validateSerial = async (tx, serialId, branchId) => {
  if (!serialId) return null;

  const serial = await tx.itemSerial.findUnique({
    where: {
      id: serialId,
    },
    select: {
      id: true,
      branchId: true,
      itemId: true,
      status: true,
    },
  });

  if (!serial || serial.branchId !== branchId) {
    const error = new Error("SERIAL_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return serial;
};

const validateSale = async (tx, saleId, branchId) => {
  if (!saleId) return null;

  const sale = await tx.sale.findUnique({
    where: {
      id: saleId,
    },
    select: {
      id: true,
      branchId: true,
      customerId: true,
      status: true,
    },
  });

  if (!sale || sale.branchId !== branchId || sale.status === "CANCELLED") {
    const error = new Error("SALE_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return sale;
};

const validateSaleItem = async (tx, saleItemId, branchId) => {
  if (!saleItemId) return null;

  const saleItem = await tx.saleItem.findUnique({
    where: {
      id: saleItemId,
    },
    select: {
      id: true,
      saleId: true,
      itemId: true,
      serialId: true,
      sale: {
        select: {
          id: true,
          branchId: true,
          customerId: true,
          status: true,
        },
      },
    },
  });

  if (
    !saleItem ||
    !saleItem.sale ||
    saleItem.sale.branchId !== branchId ||
    saleItem.sale.status === "CANCELLED"
  ) {
    const error = new Error("SALE_ITEM_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return saleItem;
};

const createWarrantyClaim = async (actor, payload) => {
  ensureCanCreateWarrantyClaim(actor);

  return prisma.$transaction(async (tx) => {
    const branch = await resolveBranchForCreate(tx, actor, payload);

    const saleItem = await validateSaleItem(tx, payload.saleItemId, branch.id);

    const resolvedSaleId = payload.saleId || saleItem?.saleId || null;
    const sale = await validateSale(tx, resolvedSaleId, branch.id);

    if (payload.saleId && saleItem && payload.saleId !== saleItem.saleId) {
      const error = new Error("SALE_ITEM_SALE_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    const resolvedCustomerId = payload.customerId || sale?.customerId || saleItem?.sale?.customerId || null;
    const customer = await validateCustomer(tx, resolvedCustomerId, branch.id);

    if (payload.customerId && sale?.customerId && payload.customerId !== sale.customerId) {
      const error = new Error("CUSTOMER_SALE_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    if (
      payload.customerId &&
      saleItem?.sale?.customerId &&
      payload.customerId !== saleItem.sale.customerId
    ) {
      const error = new Error("CUSTOMER_SALE_ITEM_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    const resolvedSerialId = payload.serialId || saleItem?.serialId || null;
    const serial = await validateSerial(tx, resolvedSerialId, branch.id);

    const resolvedItemId = payload.itemId || saleItem?.itemId || serial?.itemId || null;
    const item = await validateItem(tx, resolvedItemId, branch.id);

    if (serial && item && serial.itemId !== item.id) {
      const error = new Error("SERIAL_ITEM_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    if (saleItem && item && saleItem.itemId && saleItem.itemId !== item.id) {
      const error = new Error("SALE_ITEM_ITEM_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    if (saleItem && serial && saleItem.serialId && saleItem.serialId !== serial.id) {
      const error = new Error("SALE_ITEM_SERIAL_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    const claimCode = await generateWarrantyClaimCode(tx, branch.code, branch.id);

    return tx.warrantyClaim.create({
      data: {
        claimCode,
        status: "IN",
        issueDescription: payload.issueDescription,
        customerComplaint: payload.customerComplaint || null,
        diagnosis: payload.diagnosis || null,
        actionTaken: payload.actionTaken || null,
        supplierName: payload.supplierName || null,
        supplierReferenceNo: payload.supplierReferenceNo || null,
        remarks: payload.remarks || null,
        branchId: branch.id,
        customerId: customer ? customer.id : null,
        itemId: item ? item.id : null,
        serialId: serial ? serial.id : null,
        saleId: sale ? sale.id : null,
        saleItemId: saleItem ? saleItem.id : null,
        createdById: actor.id,
        updatedById: actor.id,
        statusUpdatedById: actor.id,
      },
      include: WARRANTY_CLAIM_INCLUDE,
    });
  });
};

const updateWarrantyClaimStatus = async (actor, warrantyClaimId, payload) => {
  ensureCanUpdateWarrantyStatus(actor);

  return prisma.$transaction(async (tx) => {
    const warrantyClaim = await tx.warrantyClaim.findUnique({
      where: {
        id: warrantyClaimId,
      },
    });

    if (!warrantyClaim) {
      const error = new Error("WARRANTY_CLAIM_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessWarrantyClaimBranch(actor, warrantyClaim);

    const allowedNextStatuses = WARRANTY_STATUS_TRANSITIONS[warrantyClaim.status] || new Set();

    if (!allowedNextStatuses.has(payload.status)) {
      const error = new Error("INVALID_WARRANTY_STATUS_TRANSITION");
      error.statusCode = 400;
      throw error;
    }

    const updateData = {
      status: payload.status,
      diagnosis: payload.diagnosis ?? warrantyClaim.diagnosis,
      actionTaken: payload.actionTaken ?? warrantyClaim.actionTaken,
      supplierName: payload.supplierName ?? warrantyClaim.supplierName,
      supplierReferenceNo: payload.supplierReferenceNo ?? warrantyClaim.supplierReferenceNo,
      remarks: payload.remarks ?? warrantyClaim.remarks,
      updatedById: actor.id,
      statusUpdatedById: actor.id,
    };

    if (payload.status === "CHECKING" && !warrantyClaim.checkingAt) {
      updateData.checkingAt = new Date();
    }

    if (payload.status === "SENT_TO_SUPPLIER" && !warrantyClaim.sentToSupplierAt) {
      updateData.sentToSupplierAt = new Date();
    }

    if (payload.status === "APPROVED" && !warrantyClaim.approvedAt) {
      updateData.approvedAt = new Date();
    }

    if (payload.status === "REJECTED" && !warrantyClaim.rejectedAt) {
      updateData.rejectedAt = new Date();
    }

    if (payload.status === "REPAIRED" && !warrantyClaim.repairedAt) {
      updateData.repairedAt = new Date();
    }

    if (payload.status === "REPLACED" && !warrantyClaim.replacedAt) {
      updateData.replacedAt = new Date();
    }

    if (payload.status === "OUT") {
      updateData.releasedAt = warrantyClaim.releasedAt || new Date();
      updateData.releasedById = actor.id;
    }

    return tx.warrantyClaim.update({
      where: {
        id: warrantyClaim.id,
      },
      data: updateData,
      include: WARRANTY_CLAIM_INCLUDE,
    });
  });
};


const releaseWarrantyClaim = async (actor, warrantyClaimId, payload) => {
  ensureCanReleaseWarrantyClaim(actor);

  return prisma.$transaction(async (tx) => {
    const warrantyClaim = await tx.warrantyClaim.findUnique({
      where: {
        id: warrantyClaimId,
      },
    });

    if (!warrantyClaim) {
      const error = new Error("WARRANTY_CLAIM_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessWarrantyClaimBranch(actor, warrantyClaim);

    if (warrantyClaim.status === "OUT") {
      const error = new Error("WARRANTY_CLAIM_ALREADY_RELEASED");
      error.statusCode = 400;
      throw error;
    }

    if (!RELEASE_ALLOWED_STATUSES.has(warrantyClaim.status)) {
      const error = new Error("WARRANTY_CLAIM_NOT_READY_FOR_RELEASE");
      error.statusCode = 400;
      throw error;
    }

    return tx.warrantyClaim.update({
      where: {
        id: warrantyClaim.id,
      },
      data: {
        status: "OUT",
        actionTaken: payload.actionTaken ?? warrantyClaim.actionTaken,
        remarks: payload.remarks ?? warrantyClaim.remarks,
        releasedAt: warrantyClaim.releasedAt || new Date(),
        releasedById: actor.id,
        updatedById: actor.id,
        statusUpdatedById: actor.id,
      },
      include: WARRANTY_CLAIM_INCLUDE,
    });
  });
};

module.exports = {
  createWarrantyClaim,
  releaseWarrantyClaim,
  updateWarrantyClaimStatus,
};
