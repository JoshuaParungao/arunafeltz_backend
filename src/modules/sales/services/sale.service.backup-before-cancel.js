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

const ensureQuotationBelongsToBranch = async (tx, quotationId, branchId) => {
  if (!quotationId) {
    return null;
  }

  const quotation = await tx.quotation.findFirst({
    where: {
      id: quotationId,
      branchId,
    },
    select: {
      id: true,
      quotationCode: true,
      status: true,
      branchId: true,
    },
  });

  if (!quotation) {
    const error = new Error("QUOTATION_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (quotation.status !== "APPROVED") {
    const error = new Error("QUOTATION_NOT_APPROVED");
    error.statusCode = 400;
    throw error;
  }

  return quotation;
};

const generateReceiptCode = async (tx, branchCode, branchId) => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `RCPT-${branchCode}-${datePart}`;

  const count = await tx.sale.count({
    where: {
      branchId,
      receiptCode: {
        startsWith: prefix,
      },
    },
  });

  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
};

const generateSaleInventoryMovementCode = async (tx, branchCode, itemCode, branchId) => {
  const prefix = `MOV-${branchCode}-${itemCode}-SALEOUT-`;

  const count = await tx.inventoryMovement.count({
    where: {
      branchId,
      movementCode: {
        startsWith: prefix,
      },
    },
  });

  return `${prefix}${String(count + 1).padStart(3, "0")}`;
};

const deductBatchStock = async ({
  tx,
  actor,
  branchId,
  item,
  batchId,
  quantity,
}) => {
  const batch = await tx.inventoryBatch.findFirst({
    where: {
      id: batchId,
      branchId,
      itemId: item.id,
      status: "ACTIVE",
    },
  });

  if (!batch) {
    const error = new Error("BATCH_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  const previousQuantity = Number(batch.quantityAvailable);
  const newQuantity = toMoney(previousQuantity - quantity);

  if (newQuantity < 0) {
    const error = new Error("INSUFFICIENT_BATCH_QUANTITY");
    error.statusCode = 400;
    throw error;
  }

  await tx.inventoryBatch.update({
    where: {
      id: batch.id,
    },
    data: {
      quantityAvailable: toMoneyString(newQuantity),
      status: newQuantity === 0 ? "DEPLETED" : "ACTIVE",
      updatedById: actor.id,
    },
  });

  return {
    batch,
    previousQuantity,
    newQuantity,
  };
};

const buildSaleItems = async (tx, actor, branchId, items) => {
  const saleItems = [];
  const stockDeductions = [];
  let subtotal = 0;
  let totalDiscount = 0;

  for (let index = 0; index < items.length; index += 1) {
    const itemPayload = items[index];
    const quantity = toMoney(itemPayload.quantity);
    const discountAmount = toMoney(itemPayload.discountAmount || 0);

    let item = null;
    let unitPrice = 0;
    let description = itemPayload.description ? String(itemPayload.description).trim() : "";
    let priceTier = itemPayload.priceTier || null;
    let resolvedBatchId = itemPayload.batchId || null;
    let resolvedSerialId = itemPayload.serialId || null;
    let stockDeduction = null;

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

      if (!priceTier) {
        const error = new Error("PRICE_TIER_REQUIRED");
        error.statusCode = 400;
        throw error;
      }

      unitPrice = getItemPriceByTier(item, priceTier);
      description = description || item.itemName;

      if (STAFF_ROLES.has(actor.role) && itemPayload.unitPrice !== undefined) {
        const error = new Error("STAFF_CUSTOM_PRICE_NOT_ALLOWED");
        error.statusCode = 403;
        throw error;
      }

      if (OWNER_ADMIN_ROLES.has(actor.role) && itemPayload.unitPrice !== undefined) {
        unitPrice = toMoney(itemPayload.unitPrice);
      }

      if (item.isSerialized) {
        if (quantity !== 1) {
          const error = new Error("SERIALIZED_QUANTITY_MUST_BE_ONE");
          error.statusCode = 400;
          throw error;
        }

        if (!resolvedSerialId) {
          const error = new Error("SERIAL_REQUIRED");
          error.statusCode = 400;
          throw error;
        }

        const serial = await tx.itemSerial.findFirst({
          where: {
            id: resolvedSerialId,
            branchId,
            itemId: item.id,
          },
        });

        if (!serial) {
          const error = new Error("SERIAL_NOT_FOUND");
          error.statusCode = 404;
          throw error;
        }

        if (serial.status !== "AVAILABLE") {
          const error = new Error("SERIAL_NOT_AVAILABLE");
          error.statusCode = 400;
          throw error;
        }

        if (!serial.batchId) {
          const error = new Error("SERIAL_BATCH_REQUIRED");
          error.statusCode = 400;
          throw error;
        }

        if (resolvedBatchId && resolvedBatchId !== serial.batchId) {
          const error = new Error("SERIAL_BATCH_MISMATCH");
          error.statusCode = 400;
          throw error;
        }

        resolvedBatchId = serial.batchId;

        const deduction = await deductBatchStock({
          tx,
          actor,
          branchId,
          item,
          batchId: resolvedBatchId,
          quantity,
        });

        await tx.itemSerial.update({
          where: {
            id: serial.id,
          },
          data: {
            status: "SOLD",
            updatedById: actor.id,
          },
        });

        stockDeduction = {
          branchId,
          itemId: item.id,
          itemCode: item.itemCode,
          batchId: deduction.batch.id,
          serialId: serial.id,
          quantity,
          previousQuantity: deduction.previousQuantity,
          newQuantity: deduction.newQuantity,
          unitCost: deduction.batch.unitCost,
        };
      } else {
        if (resolvedSerialId) {
          const error = new Error("SERIAL_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM");
          error.statusCode = 400;
          throw error;
        }

        if (!resolvedBatchId) {
          const error = new Error("BATCH_REQUIRED");
          error.statusCode = 400;
          throw error;
        }

        const deduction = await deductBatchStock({
          tx,
          actor,
          branchId,
          item,
          batchId: resolvedBatchId,
          quantity,
        });

        stockDeduction = {
          branchId,
          itemId: item.id,
          itemCode: item.itemCode,
          batchId: deduction.batch.id,
          serialId: null,
          quantity,
          previousQuantity: deduction.previousQuantity,
          newQuantity: deduction.newQuantity,
          unitCost: deduction.batch.unitCost,
        };
      }
    } else {
      if (resolvedBatchId || resolvedSerialId) {
        const error = new Error("CUSTOM_LINE_INVENTORY_LINK_NOT_ALLOWED");
        error.statusCode = 400;
        throw error;
      }

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

    if (stockDeduction) {
      stockDeductions.push(stockDeduction);
    }

    saleItems.push({
      lineNo: index + 1,
      description,
      itemCodeSnapshot: item ? item.itemCode : null,
      itemNameSnapshot: item ? item.itemName : null,
      brandSnapshot: item ? item.brand : null,
      modelSnapshot: item ? item.modelName : null,
      priceTier,
      quantity: toMoneyString(quantity),
      unitPrice: toMoneyString(unitPrice),
      discountAmount: toMoneyString(discountAmount),
      lineTotal: toMoneyString(lineTotal),
      itemId: item ? item.id : null,
      batchId: resolvedBatchId,
      serialId: resolvedSerialId,
    });
  }

  return {
    saleItems,
    stockDeductions,
    subtotal: toMoney(subtotal),
    totalDiscount: toMoney(totalDiscount),
  };
};

const buildSalePayments = (actor, payments) => {
  let amountPaid = 0;

  const salePayments = payments.map((payment) => {
    const amount = toMoney(payment.amount);
    amountPaid += amount;

    return {
      paymentMethod: payment.paymentMethod,
      amount: toMoneyString(amount),
      referenceNo: payment.referenceNo || null,
      remarks: payment.remarks || null,
      createdById: actor.id,
    };
  });

  return {
    salePayments,
    amountPaid: toMoney(amountPaid),
  };
};

const computePaymentStatus = (amountPaid, grandTotal) => {
  if (amountPaid <= 0) {
    return "UNPAID";
  }

  if (amountPaid < grandTotal) {
    return "PARTIALLY_PAID";
  }

  return "PAID";
};

const createSale = async (actor, payload) => {
  const branchId = resolveBranchIdForCreate(actor, payload.branchId);

  return prisma.$transaction(async (tx) => {
    const branch = await ensureBranchExists(tx, branchId);
    await ensureCustomerBelongsToBranch(tx, payload.customerId, branchId);
    await ensureQuotationBelongsToBranch(tx, payload.quotationId, branchId);

    const { saleItems, stockDeductions, subtotal, totalDiscount } = await buildSaleItems(
      tx,
      actor,
      branchId,
      payload.items
    );

    const serviceCharge = toMoney(payload.serviceCharge || 0);
    const grandTotal = toMoney(subtotal - totalDiscount + serviceCharge);

    const { salePayments, amountPaid } = buildSalePayments(actor, payload.payments);
    const paymentStatus = computePaymentStatus(amountPaid, grandTotal);
    const changeAmount = toMoney(Math.max(amountPaid - grandTotal, 0));
    const receiptCode = await generateReceiptCode(tx, branch.code, branchId);

    for (const deduction of stockDeductions) {
      const movementCode = await generateSaleInventoryMovementCode(
        tx,
        branch.code,
        deduction.itemCode,
        branchId
      );

      await tx.inventoryMovement.create({
        data: {
          branchId,
          itemId: deduction.itemId,
          batchId: deduction.batchId,
          serialId: deduction.serialId,
          movementCode,
          type: "SALE_OUT",
          source: "SALE",
          quantity: toMoneyString(deduction.quantity),
          previousQuantity: toMoneyString(deduction.previousQuantity),
          newQuantity: toMoneyString(deduction.newQuantity),
          unitCost: deduction.unitCost.toString(),
          referenceNo: receiptCode,
          remarks: `Sale stock deduction for ${receiptCode}.`,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
    }

    const sale = await tx.sale.create({
      data: {
        receiptCode,
        status: "COMPLETED",
        paymentStatus,
        subtotal: toMoneyString(subtotal),
        totalDiscount: toMoneyString(totalDiscount),
        serviceCharge: toMoneyString(serviceCharge),
        grandTotal: toMoneyString(grandTotal),
        amountPaid: toMoneyString(amountPaid),
        changeAmount: toMoneyString(changeAmount),
        remarks: payload.remarks || null,
        branchId,
        customerId: payload.customerId || null,
        quotationId: payload.quotationId || null,
        cashierId: actor.id,
        createdById: actor.id,
        updatedById: actor.id,
        items: {
          create: saleItems,
        },
        payments: {
          create: salePayments,
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
        quotation: {
          select: {
            id: true,
            quotationCode: true,
            status: true,
          },
        },
        cashier: {
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
        payments: {
          orderBy: {
            paidAt: "asc",
          },
        },
      },
    });

    return sale;
  });
};


const parsePagination = (query) => {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
};

const resolveBranchFilterForRead = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
    return requestedBranchId || undefined;
  }

  return actor.branchId;
};

const ensureCanAccessSaleBranch = (actor, sale) => {
  if (isSuperOwner(actor)) {
    return;
  }

  if (!actor.branchId || sale.branchId !== actor.branchId) {
    const error = new Error("SALE_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }
};

const getSales = async (actor, query) => {
  const { page, limit, skip } = parsePagination(query);
  const branchId = resolveBranchFilterForRead(actor, query.branchId);

  const where = {};

  if (branchId) {
    where.branchId = branchId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.paymentStatus) {
    where.paymentStatus = query.paymentStatus;
  }

  if (query.customerId) {
    where.customerId = query.customerId;
  }

  if (query.cashierId) {
    where.cashierId = query.cashierId;
  }

  if (query.search) {
    const search = String(query.search).trim();

    where.OR = [
      {
        receiptCode: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        remarks: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        saleDate: "desc",
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
        quotation: {
          select: {
            id: true,
            quotationCode: true,
            status: true,
          },
        },
        cashier: {
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
            payments: true,
          },
        },
      },
    }),
    prisma.sale.count({
      where,
    }),
  ]);

  return {
    data: sales,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getSaleById = async (actor, saleId) => {
  const sale = await prisma.sale.findUnique({
    where: {
      id: saleId,
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
      quotation: {
        select: {
          id: true,
          quotationCode: true,
          status: true,
        },
      },
      cashier: {
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
      cancelledBy: {
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
      payments: {
        orderBy: {
          paidAt: "asc",
        },
      },
    },
  });

  if (!sale) {
    const error = new Error("SALE_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  ensureCanAccessSaleBranch(actor, sale);

  return sale;
};

module.exports = {
  createSale,
  getSales,
  getSaleById,
};
