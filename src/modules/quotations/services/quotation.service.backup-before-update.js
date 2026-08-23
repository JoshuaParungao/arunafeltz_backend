const prisma = require("../../../config/prisma");

const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);
const STAFF_ROLES = new Set(["CASHIER", "TECHNICIAN"]);

const isSuperOwner = (actor) => actor.role === "SUPER_OWNER";

const toMoney = (value) => {
  return Math.round(Number(value) * 100) / 100;
};

const toMoneyString = (value) => {
  return toMoney(value).toFixed(2);
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
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `QT-${branchCode}-${datePart}`;

  const count = await tx.quotation.count({
    where: {
      branchId,
      quotationCode: {
        startsWith: prefix,
      },
    },
  });

  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
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
      branchId,
      status: "ACTIVE",
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

      unitPrice = getItemPriceByTier(item, itemPayload.priceTier);
      description = description || item.itemName;

      if (STAFF_ROLES.has(actor.role) && itemPayload.unitPrice !== undefined) {
        const error = new Error("STAFF_CUSTOM_PRICE_NOT_ALLOWED");
        error.statusCode = 403;
        throw error;
      }

      if (OWNER_ADMIN_ROLES.has(actor.role) && itemPayload.unitPrice !== undefined) {
        unitPrice = toMoney(itemPayload.unitPrice);
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

      unitPrice = toMoney(itemPayload.unitPrice);
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
      quantity: toMoneyString(quantity),
      unitPrice: toMoneyString(unitPrice),
      discountAmount: toMoneyString(discountAmount),
      lineTotal: toMoneyString(lineTotal),
      isPcBuildPart: Boolean(itemPayload.isPcBuildPart),
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

    const preparedById = payload.preparedById || (isSuperOwner(actor) ? null : actor.id);
    await ensurePreparedByBelongsToBranch(tx, preparedById, branchId);

    const { quotationItems, subtotal, totalDiscount, grandTotal } =
      await buildQuotationItems(tx, actor, branchId, payload.items);

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

module.exports = {
  createQuotation,
  getQuotations,
  getQuotationById,
};


