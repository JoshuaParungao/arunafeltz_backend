const prisma = require("../../../config/prisma");

const { BRANCH_SCOPED_ROLES } = require("../../../constants/roles");
const { createAuditLog } = require("../../../utils/auditLogger");

const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);
const STAFF_ROLES = new Set(["CASHIER", "TECHNICIAN"]);

const SERVICE_DONE_BY_SELECT = {
  id: true,
  fullName: true,
  role: true,
};

const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";

const toMoney = (value) => {
  return Math.round(Number(value) * 100) / 100;
};

const toMoneyString = (value) => {
  return toMoney(value).toFixed(2);
};

const normalizeOptionalId = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const hasServiceLines = (items = []) => {
  return items.some((item) => !item.itemId);
};

const getItemPriceByTier = (item, tier) => {
  const priceMap = {
    1: item.price1,
    2: item.price2,
    3: item.price3,
    4: item.price4,
    5: item.price5,
  };

  return Number(priceMap[tier]);
};

const resolveMarkupPercent = (value) => {
  const markupPercent =
    value === undefined || value === null || value === ""
      ? 0
      : Number(value);

  if (
    !Number.isFinite(markupPercent) ||
    markupPercent < 0 ||
    markupPercent >= 100
  ) {
    const error = new Error("INVALID_MARKUP_PERCENT");
    error.statusCode = 400;
    throw error;
  }

  return markupPercent;
};

const applyMarkupToBasePrice = (basePrice, markupPercent) => {
  return toMoney(Number(basePrice) / (1 - Number(markupPercent) / 100));
};

const resolveBranchIdForCreate = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
    if (!requestedBranchId) {
      const error = new Error("BRANCH_REQUIRED");
      error.statusCode = 400;
      throw error;
    }

    return requestedBranchId;
  }

  if (!actor.branchId) {
    const error = new Error("BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }

  if (requestedBranchId && requestedBranchId !== actor.branchId) {
    const error = new Error("BRANCH_ACCESS_DENIED");
    error.statusCode = 403;
    throw error;
  }

  return actor.branchId;
};

const generateQuotationCode = async (tx, branchCode, branchId) => {
  const existingQuotations = await tx.quotation.findMany({
    where: {
      branchId,
    },
    select: {
      quotationCode: true,
    },
  });

  let highestNumber = 0;

  for (const q of existingQuotations) {
    const raw = String(q.quotationCode || "").trim();
    const match = raw.match(/\d+$/);
    if (match) {
      const num = Number.parseInt(match[0], 10);
      if (!Number.isNaN(num) && num > highestNumber) {
        highestNumber = num;
      }
    }
  }

  let nextNumber = highestNumber + 1;
  let quotationCode = String(nextNumber).padStart(5, "0");

  while (
    await tx.quotation.findFirst({
      where: {
        branchId,
        quotationCode,
      },
      select: {
        id: true,
      },
    })
  ) {
    nextNumber += 1;
    quotationCode = String(nextNumber).padStart(5, "0");
  }

  return quotationCode;
};

const ensureBranchExists = async (tx, branchId) => {
  const branch = await tx.branch.findUnique({
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
    const error = new Error("BRANCH_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (branch.status !== "ACTIVE") {
    const error = new Error("BRANCH_INACTIVE");
    error.statusCode = 400;
    throw error;
  }

  return branch;
};

const getEligibleServiceStaff = async (actor, query = {}) => {
  const requestedBranchId = normalizeOptionalId(query.branchId);
  const branchId = resolveBranchIdForCreate(actor, requestedBranchId);

  await ensureBranchExists(prisma, branchId);

  return prisma.user.findMany({
    where: {
      branchId,
      status: "ACTIVE",
      role: {
        in: BRANCH_SCOPED_ROLES,
      },
    },
    orderBy: [
      { fullName: "asc" },
      { id: "asc" },
    ],
    select: SERVICE_DONE_BY_SELECT,
  });
};

const ensureCustomerBelongsToBranch = async (tx, customerId, branchId) => {
  if (!customerId) {
    return null;
  }

  const customer = await tx.customer.findFirst({
    where: {
      id: customerId,
      branchId,
    },
    select: {
      id: true,
      customerCode: true,
      fullName: true,
      status: true,
    },
  });

  if (!customer) {
    const error = new Error("CUSTOMER_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (customer.status !== "ACTIVE") {
    const error = new Error("CUSTOMER_INACTIVE");
    error.statusCode = 400;
    throw error;
  }

  return customer;
};

const ensurePreparedByBelongsToBranch = async (tx, preparedById, branchId) => {
  if (!preparedById) {
    return null;
  }

  const preparedBy = await tx.user.findFirst({
    where: {
      id: preparedById,
      status: "ACTIVE",
      OR: [
        { branchId },
        { role: "SUPER_OWNER" },
      ],
    },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      branchId: true,
    },
  });

  if (!preparedBy) {
    const error = new Error("PREPARED_BY_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return preparedBy;
};

const ensureServiceDoneByIsEligible = async (tx, serviceDoneById, branchId) => {
  if (!serviceDoneById) {
    return null;
  }

  const serviceDoneBy = await tx.user.findFirst({
    where: {
      id: serviceDoneById,
      branchId,
      status: "ACTIVE",
      role: {
        in: BRANCH_SCOPED_ROLES,
      },
    },
    select: SERVICE_DONE_BY_SELECT,
  });

  if (!serviceDoneBy) {
    const error = new Error("SERVICE_DONE_BY_NOT_ELIGIBLE");
    error.statusCode = 400;
    throw error;
  }

  return serviceDoneBy;
};

const buildQuotationItems = async (tx, actor, branchId, items) => {
  const quotationItems = [];
  let subtotal = 0;
  let totalDiscount = 0;

  for (let index = 0; index < items.length; index += 1) {
    const itemPayload = items[index];
    const quantity = toMoney(itemPayload.quantity);
    const discountAmount = toMoney(itemPayload.discountAmount || 0);

    let item = null;
    let unitPrice = 0;
    let baseUnitPriceSnapshot = null;
    let markupPercent = null;
    const hasExplicitMarkup = itemPayload.markupPercent !== undefined;
    let description = itemPayload.description ? String(itemPayload.description).trim() : "";

    if (itemPayload.itemId) {
      item = await tx.item.findFirst({
        where: {
          id: itemPayload.itemId,
          branchId,
          status: "ACTIVE",
        },
      });

      if (!item) {
        const error = new Error("ITEM_NOT_FOUND");
        error.statusCode = 404;
        throw error;
      }

      baseUnitPriceSnapshot = toMoney(
        getItemPriceByTier(item, itemPayload.priceTier)
      );
      markupPercent = resolveMarkupPercent(itemPayload.markupPercent);
      unitPrice = applyMarkupToBasePrice(baseUnitPriceSnapshot, markupPercent);
      description = description || item.itemName;

      if (
        !hasExplicitMarkup &&
        STAFF_ROLES.has(actor.role) &&
        itemPayload.unitPrice !== undefined
      ) {
        const error = new Error("STAFF_CUSTOM_PRICE_NOT_ALLOWED");
        error.statusCode = 403;
        throw error;
      }

      if (
        !hasExplicitMarkup &&
        OWNER_ADMIN_ROLES.has(actor.role) &&
        itemPayload.unitPrice !== undefined
      ) {
        unitPrice = toMoney(itemPayload.unitPrice);
        markupPercent = null;
      }
    } else {
      if (!description) {
        const error = new Error("DESCRIPTION_REQUIRED");
        error.statusCode = 400;
        throw error;
      }

      if (itemPayload.unitPrice === undefined) {
        const error = new Error("UNIT_PRICE_REQUIRED");
        error.statusCode = 400;
        throw error;
      }

      baseUnitPriceSnapshot = toMoney(itemPayload.unitPrice);
      markupPercent = resolveMarkupPercent(itemPayload.markupPercent);
      unitPrice = applyMarkupToBasePrice(
        baseUnitPriceSnapshot,
        markupPercent
      );
    }

    const grossLineTotal = toMoney(quantity * unitPrice);

    if (discountAmount > grossLineTotal) {
      const error = new Error("DISCOUNT_EXCEEDS_LINE_TOTAL");
      error.statusCode = 400;
      throw error;
    }

    const lineTotal = toMoney(grossLineTotal - discountAmount);

    subtotal += grossLineTotal;
    totalDiscount += discountAmount;

    quotationItems.push({
      lineNo: index + 1,
      description,
      itemCodeSnapshot: item ? item.itemCode : null,
      itemNameSnapshot: item ? item.itemName : null,
      brandSnapshot: item ? item.brand : null,
      modelSnapshot: item ? item.modelName : null,
      priceTier: itemPayload.priceTier,
      baseUnitPriceSnapshot:
        baseUnitPriceSnapshot !== null
          ? toMoneyString(baseUnitPriceSnapshot)
          : null,
      markupPercent:
        markupPercent !== null
          ? Number(markupPercent).toFixed(4)
          : null,
      quantity: toMoneyString(quantity),
      unitPrice: toMoneyString(unitPrice),
      discountAmount: toMoneyString(discountAmount),
      lineTotal: toMoneyString(lineTotal),
      isPcBuildPart: Boolean(itemPayload.isPcBuildPart),
      warrantyDuration: itemPayload.warrantyDuration ? String(itemPayload.warrantyDuration).trim() : null,
      remarks: itemPayload.remarks || null,
      itemId: item ? item.id : null,
    });
  }

  return {
    quotationItems,
    subtotal: toMoney(subtotal),
    totalDiscount: toMoney(totalDiscount),
    grandTotal: toMoney(subtotal - totalDiscount),
  };
};

const createQuotation = async (actor, payload) => {
  const branchId = resolveBranchIdForCreate(actor, payload.branchId);

  return prisma.$transaction(async (tx) => {
    const branch = await ensureBranchExists(tx, branchId);
    await ensureCustomerBelongsToBranch(tx, payload.customerId, branchId);

    const preparedById = actor.id;
    await ensurePreparedByBelongsToBranch(tx, preparedById, branchId);

    const { quotationItems, subtotal, totalDiscount, grandTotal } =
      await buildQuotationItems(tx, actor, branchId, payload.items);

    const requestedServiceDoneById = hasServiceLines(quotationItems)
      ? normalizeOptionalId(payload.serviceDoneById)
      : null;

    if (requestedServiceDoneById) {
      await ensureServiceDoneByIsEligible(tx, requestedServiceDoneById, branchId);
    }

    const quotationCode = await generateQuotationCode(tx, branch.code, branchId);

    const quotation = await tx.quotation.create({
      data: {
        quotationCode,
        title: payload.title || null,
        notes: payload.notes || null,
        internalNotes: payload.internalNotes || null,
        status: "DRAFT",
        subtotal: toMoneyString(subtotal),
        totalDiscount: toMoneyString(totalDiscount),
        grandTotal: toMoneyString(grandTotal),
        isPcBuild: Boolean(payload.isPcBuild),
        validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
        branchId,
        customerId: payload.customerId || null,
        preparedById,
        serviceDoneById: requestedServiceDoneById || null,
        createdById: actor.id,
        updatedById: actor.id,
        items: {
          create: quotationItems,
        },
      },
      include: {
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
            email: true,
          },
        },
        preparedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        serviceDoneBy: {
          select: SERVICE_DONE_BY_SELECT,
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        items: {
          orderBy: {
            lineNo: "asc",
          },
        },
      },
    });

    await createAuditLog({
      actor,
      branchId: quotation.branchId,
      action: "QUOTATION_CREATED",
      entityType: "Quotation",
      entityId: quotation.id,
      description: `Quotation ${quotation.quotationCode} created`,
      metadata: {
        quotationCode: quotation.quotationCode,
        customerId: quotation.customerId,
        preparedById: quotation.preparedById,
        serviceDoneById: quotation.serviceDoneById,
        status: quotation.status,
        grandTotal: String(quotation.grandTotal),
      },
    }, tx);

    return quotation;
  });
};


const canViewInternalNotes = (actor) => {
  return OWNER_ADMIN_ROLES.has(actor.role);
};

const hideInternalNotesIfNeeded = (quotation, actor) => {
  if (!quotation) {
    return quotation;
  }

  if (canViewInternalNotes(actor)) {
    return quotation;
  }

  const { internalNotes, ...safeQuotation } = quotation;
  return safeQuotation;
};

const resolveBranchFilterForRead = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
    return requestedBranchId || null;
  }

  if (!actor.branchId) {
    const error = new Error("BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }

  return actor.branchId;
};

const parsePagination = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
};

const getQuotations = async (actor, query) => {
  const branchId = resolveBranchFilterForRead(actor, query.branchId);
  const search = query.search ? String(query.search).trim() : "";

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.preparedById ? { preparedById: query.preparedById } : {}),
    ...(search
      ? {
          OR: [
            {
              quotationCode: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              title: {
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
              customer: {
                fullName: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              customer: {
                customerCode: {
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

  const [totalItems, quotations] = await Promise.all([
    prisma.quotation.count({ where }),
    prisma.quotation.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
      include: {
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
            email: true,
          },
        },
        preparedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        serviceDoneBy: {
          select: SERVICE_DONE_BY_SELECT,
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    }),
  ]);

  return {
    data: quotations.map((quotation) => hideInternalNotesIfNeeded(quotation, actor)),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

const getQuotationById = async (actor, quotationId) => {
  const branchId = resolveBranchFilterForRead(actor, null);

  const quotation = await prisma.quotation.findFirst({
    where: {
      id: quotationId,
      ...(branchId ? { branchId } : {}),
    },
    include: {
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
          email: true,
          address: true,
          companyName: true,
        },
      },
      preparedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      serviceDoneBy: {
        select: SERVICE_DONE_BY_SELECT,
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
        orderBy: {
          lineNo: "asc",
        },
        include: {
          item: {
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              brand: true,
              modelName: true,
              status: true,
              isSerialized: true,
            },
          },
        },
      },
    },
  });

  if (!quotation) {
    const error = new Error("QUOTATION_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return hideInternalNotesIfNeeded(quotation, actor);
};


const ensureCanAccessQuotationBranch = (actor, quotation) => {
  if (isSuperOwner(actor)) {
    return;
  }

  if (!actor.branchId || quotation.branchId !== actor.branchId) {
    const error = new Error("QUOTATION_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }
};

const lockQuotationForMutation = async (tx, quotationId) => {
  await tx.$queryRaw`
    SELECT "id"
    FROM "Quotation"
    WHERE "id" = ${quotationId}
    FOR UPDATE
  `;
};

const updateQuotation = async (actor, quotationId, payload) => {
  return prisma.$transaction(async (tx) => {
    await lockQuotationForMutation(tx, quotationId);

    const existingQuotation = await tx.quotation.findUnique({
      where: {
        id: quotationId,
      },
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
          },
        },
        items: {
          select: {
            itemId: true,
          },
        },
      },
    });

    if (!existingQuotation) {
      const error = new Error("QUOTATION_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessQuotationBranch(actor, existingQuotation);

    if (existingQuotation.status !== "DRAFT") {
      const error = new Error("QUOTATION_NOT_EDITABLE");
      error.statusCode = 400;
      throw error;
    }

    const updateData = {
      updatedById: actor.id,
    };

    if (payload.title !== undefined) {
      updateData.title = payload.title || null;
    }

    if (payload.notes !== undefined) {
      updateData.notes = payload.notes || null;
    }

    if (payload.internalNotes !== undefined) {
      updateData.internalNotes = payload.internalNotes || null;
    }

    if (payload.isPcBuild !== undefined) {
      updateData.isPcBuild = Boolean(payload.isPcBuild);
    }

    if (payload.validUntil !== undefined) {
      updateData.validUntil = payload.validUntil ? new Date(payload.validUntil) : null;
    }

    const normalizedCustomerId = normalizeOptionalId(payload.customerId);

    if (normalizedCustomerId !== undefined) {
      if (normalizedCustomerId === null) {
        updateData.customerId = null;
      } else {
        await ensureCustomerBelongsToBranch(tx, normalizedCustomerId, existingQuotation.branchId);
        updateData.customerId = normalizedCustomerId;
      }
    }

    let resultingHasServiceLines = hasServiceLines(existingQuotation.items);

    if (payload.items !== undefined) {
      const { quotationItems, subtotal, totalDiscount, grandTotal } =
        await buildQuotationItems(tx, actor, existingQuotation.branchId, payload.items);

      resultingHasServiceLines = hasServiceLines(quotationItems);

      updateData.subtotal = toMoneyString(subtotal);
      updateData.totalDiscount = toMoneyString(totalDiscount);
      updateData.grandTotal = toMoneyString(grandTotal);

      await tx.quotationItem.deleteMany({
        where: {
          quotationId: existingQuotation.id,
        },
      });

      updateData.items = {
        create: quotationItems,
      };
    }

    const normalizedServiceDoneById = normalizeOptionalId(payload.serviceDoneById);

    if (!resultingHasServiceLines) {
      updateData.serviceDoneById = null;
    } else if (normalizedServiceDoneById !== undefined) {
      if (normalizedServiceDoneById === null) {
        updateData.serviceDoneById = null;
      } else {
        await ensureServiceDoneByIsEligible(
          tx,
          normalizedServiceDoneById,
          existingQuotation.branchId
        );
        updateData.serviceDoneById = normalizedServiceDoneById;
      }
    }

    const quotation = await tx.quotation.update({
      where: {
        id: existingQuotation.id,
      },
      data: updateData,
      include: {
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
            email: true,
          },
        },
        preparedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        serviceDoneBy: {
          select: SERVICE_DONE_BY_SELECT,
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
          orderBy: {
            lineNo: "asc",
          },
        },
      },
    });

    await createAuditLog({
      actor,
      branchId: quotation.branchId,
      action: "QUOTATION_UPDATED",
      entityType: "Quotation",
      entityId: quotation.id,
      description: `Quotation ${quotation.quotationCode} updated`,
      metadata: {
        quotationCode: quotation.quotationCode,
        status: quotation.status,
        customerId: quotation.customerId,
        serviceDoneById: quotation.serviceDoneById,
        grandTotal: String(quotation.grandTotal),
      },
    }, tx);

    return hideInternalNotesIfNeeded(quotation, actor);
  });
};


const assertValidQuotationStatusTransition = (currentStatus, nextStatus) => {
  const allowedTransitions = {
    DRAFT: ["SENT", "CANCELLED"],
    SENT: ["APPROVED", "CANCELLED"],
    APPROVED: [],
    CANCELLED: [],
    CONVERTED: [],
  };

  const allowedNextStatuses = allowedTransitions[currentStatus] || [];

  if (!allowedNextStatuses.includes(nextStatus)) {
    const error = new Error("INVALID_QUOTATION_STATUS_TRANSITION");
    error.statusCode = 400;
    throw error;
  }
};

const updateQuotationStatus = async (actor, quotationId, payload) => {
  return prisma.$transaction(async (tx) => {
    await lockQuotationForMutation(tx, quotationId);

    const existingQuotation = await tx.quotation.findUnique({
      where: {
        id: quotationId,
      },
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!existingQuotation) {
      const error = new Error("QUOTATION_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessQuotationBranch(actor, existingQuotation);
    assertValidQuotationStatusTransition(existingQuotation.status, payload.status);

    const now = new Date();

    const updateData = {
      status: payload.status,
      updatedById: actor.id,
    };

    if (payload.status === "SENT") {
      updateData.sentAt = now;
    }

    if (payload.status === "APPROVED") {
      updateData.approvedAt = now;
    }

    if (payload.status === "CANCELLED") {
      updateData.cancelledAt = now;
      updateData.internalNotes = payload.remarks
        ? existingQuotation.internalNotes
          ? `${existingQuotation.internalNotes}\nCancellation remarks: ${payload.remarks}`
          : `Cancellation remarks: ${payload.remarks}`
        : existingQuotation.internalNotes;
    }

    const quotation = await tx.quotation.update({
      where: {
        id: existingQuotation.id,
      },
      data: updateData,
      include: {
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
            email: true,
          },
        },
        preparedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        serviceDoneBy: {
          select: SERVICE_DONE_BY_SELECT,
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
          orderBy: {
            lineNo: "asc",
          },
        },
      },
    });

    await createAuditLog({
      actor,
      branchId: quotation.branchId,
      action: "QUOTATION_STATUS_UPDATED",
      entityType: "Quotation",
      entityId: quotation.id,
      description: `Quotation ${quotation.quotationCode} status updated`,
      metadata: {
        quotationCode: quotation.quotationCode,
        previousStatus: existingQuotation.status,
        status: quotation.status,
        remarks: payload.remarks || null,
      },
    }, tx);

    return hideInternalNotesIfNeeded(quotation, actor);
  });
};

module.exports = {
  createQuotation,
  getQuotations,
  getEligibleServiceStaff,
  getQuotationById,
  updateQuotation,
  updateQuotationStatus,
  testInternals: {
    applyMarkupToBasePrice,
    buildQuotationItems,
    resolveMarkupPercent,
  },
};






