const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

const isSuperOwner = (actor) => actor && actor.role === "SUPER_OWNER";

const resolveBranchFilter = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
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
      "You can only view reports for your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return actor.branchId;
};

const parsePagination = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const rawLimit = Math.max(Number(query.limit) || 20, 1);
  const limit = Math.min(rawLimit, 100);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
};

const parseBoolean = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "true" || value === true) {
    return true;
  }

  if (value === "false" || value === false) {
    return false;
  }

  throw new AppError(
    "Invalid boolean filter. Use true or false.",
    400,
    "INVALID_BOOLEAN_FILTER"
  );
};

const parseDateRange = (query = {}) => {
  const dateFilter = {};

  if (query.dateFrom) {
    const dateFrom = new Date(query.dateFrom);

    if (Number.isNaN(dateFrom.getTime())) {
      throw new AppError("Invalid dateFrom value", 400, "INVALID_DATE_FROM");
    }

    dateFrom.setHours(0, 0, 0, 0);
    dateFilter.gte = dateFrom;
  }

  if (query.dateTo) {
    const dateTo = new Date(query.dateTo);

    if (Number.isNaN(dateTo.getTime())) {
      throw new AppError("Invalid dateTo value", 400, "INVALID_DATE_TO");
    }

    dateTo.setHours(23, 59, 59, 999);
    dateFilter.lte = dateTo;
  }

  return Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
};

const toNumber = (value) => Number(value || 0);

const buildInventorySummaryItem = (item) => {
  const quantityIn = item.inventoryBatches.reduce((sum, batch) => {
    return sum + Number(batch.quantityIn);
  }, 0);

  const quantityAvailable = item.inventoryBatches.reduce((sum, batch) => {
    return sum + Number(batch.quantityAvailable);
  }, 0);

  const activeBatchCount = item.inventoryBatches.filter((batch) => {
    return batch.status === "ACTIVE";
  }).length;

  const depletedBatchCount = item.inventoryBatches.filter((batch) => {
    return batch.status === "DEPLETED";
  }).length;

  const serialCounts = item.itemSerials.reduce((acc, serial) => {
    acc[serial.status] = (acc[serial.status] || 0) + 1;
    return acc;
  }, {});

  const minimumStock = Number(item.minimumStock || 0);
  const reorderLevel = Number(item.reorderLevel || 0);
  const isLowStock = reorderLevel > 0 ? quantityAvailable <= reorderLevel : false;
  const isZeroStock = quantityAvailable === 0;

  return {
    id: item.id,
    itemCode: item.itemCode,
    itemName: item.itemName,
    brand: item.brand,
    modelName: item.modelName,
    status: item.status,
    isSerialized: item.isSerialized,
    branch: item.branch,
    category: item.category,
    unit: item.unit,
    quantityIn,
    quantityAvailable,
    minimumStock,
    reorderLevel,
    isLowStock,
    isZeroStock,
    batchCount: item.inventoryBatches.length,
    activeBatchCount,
    depletedBatchCount,
    serialCount: item.itemSerials.length,
    serialCounts,
  };
};

const getInventorySummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const search = query.search ? String(query.search).trim() : "";
  const lowStockOnly = parseBoolean(query.lowStockOnly);
  const { page, limit, skip } = parsePagination(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            {
              itemCode: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              itemName: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              brand: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              modelName: {
                contains: search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const allItems = await prisma.item.findMany({
    where,
    orderBy: [
      {
        branch: {
          code: "asc",
        },
      },
      {
        itemCode: "asc",
      },
    ],
    select: {
      id: true,
      itemCode: true,
      itemName: true,
      brand: true,
      modelName: true,
      status: true,
      isSerialized: true,
      minimumStock: true,
      reorderLevel: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          categoryCode: true,
          name: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitCode: true,
          name: true,
        },
      },
      inventoryBatches: {
        select: {
          id: true,
          batchCode: true,
          quantityIn: true,
          quantityAvailable: true,
          status: true,
        },
        orderBy: {
          batchCode: "asc",
        },
      },
      itemSerials: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  let summaryItems = allItems.map(buildInventorySummaryItem);

  if (lowStockOnly === true) {
    summaryItems = summaryItems.filter((item) => item.isLowStock);
  }

  const totalItems = summaryItems.length;
  const paginatedItems = summaryItems.slice(skip, skip + limit);

  const totals = summaryItems.reduce(
    (acc, item) => {
      acc.totalQuantityIn += item.quantityIn;
      acc.totalQuantityAvailable += item.quantityAvailable;
      acc.totalBatches += item.batchCount;
      acc.totalSerials += item.serialCount;

      if (item.isLowStock) {
        acc.lowStockItems += 1;
      }

      if (item.isZeroStock) {
        acc.zeroStockItems += 1;
      }

      return acc;
    },
    {
      totalItems,
      totalQuantityIn: 0,
      totalQuantityAvailable: 0,
      totalBatches: 0,
      totalSerials: 0,
      lowStockItems: 0,
      zeroStockItems: 0,
    }
  );

  return {
    report: {
      name: "Inventory Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        categoryId: query.categoryId || null,
        status: query.status || null,
        search: search || null,
        lowStockOnly: lowStockOnly === undefined ? null : lowStockOnly,
      },
      totals,
    },
    records: paginatedItems,
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit) || 1,
      hasNextPage: page < (Math.ceil(totalItems / limit) || 1),
      hasPreviousPage: page > 1,
    },
  };
};

const buildSalesSummaryRecord = (sale) => {
  return {
    id: sale.id,
    receiptCode: sale.receiptCode,
    status: sale.status,
    paymentStatus: sale.paymentStatus,
    saleDate: sale.saleDate,
    branch: sale.branch,
    customer: sale.customer,
    cashier: sale.cashier,
    subtotal: toNumber(sale.subtotal),
    totalDiscount: toNumber(sale.totalDiscount),
    serviceCharge: toNumber(sale.serviceCharge),
    grandTotal: toNumber(sale.grandTotal),
    amountPaid: toNumber(sale.amountPaid),
    changeAmount: toNumber(sale.changeAmount),
    itemCount: sale.items.length,
    paymentCount: sale.payments.length,
    paymentMethods: sale.payments.reduce((acc, payment) => {
      acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + toNumber(payment.amount);
      return acc;
    }, {}),
  };
};

const getSalesSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const saleDate = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(saleDate ? { saleDate } : {}),
  };

  const allSales = await prisma.sale.findMany({
    where,
    orderBy: [
      {
        saleDate: "desc",
      },
      {
        receiptCode: "desc",
      },
    ],
    select: {
      id: true,
      receiptCode: true,
      status: true,
      paymentStatus: true,
      saleDate: true,
      subtotal: true,
      totalDiscount: true,
      serviceCharge: true,
      grandTotal: true,
      amountPaid: true,
      changeAmount: true,
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
      cashier: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      items: {
        select: {
          id: true,
        },
      },
      payments: {
        select: {
          id: true,
          paymentMethod: true,
          amount: true,
        },
      },
    },
  });

  const records = allSales.map(buildSalesSummaryRecord);

  const totals = records.reduce(
    (acc, sale) => {
      acc.totalSales += 1;
      acc.totalSubtotal += sale.subtotal;
      acc.totalDiscount += sale.totalDiscount;
      acc.totalServiceCharge += sale.serviceCharge;
      acc.totalGrandTotal += sale.grandTotal;
      acc.totalAmountPaid += sale.amountPaid;
      acc.totalChangeAmount += sale.changeAmount;
      acc.totalItems += sale.itemCount;

      acc.statusCounts[sale.status] = (acc.statusCounts[sale.status] || 0) + 1;
      acc.paymentStatusCounts[sale.paymentStatus] =
        (acc.paymentStatusCounts[sale.paymentStatus] || 0) + 1;

      for (const [method, amount] of Object.entries(sale.paymentMethods)) {
        acc.paymentMethodTotals[method] =
          (acc.paymentMethodTotals[method] || 0) + amount;
      }

      return acc;
    },
    {
      totalSales: 0,
      totalSubtotal: 0,
      totalDiscount: 0,
      totalServiceCharge: 0,
      totalGrandTotal: 0,
      totalAmountPaid: 0,
      totalChangeAmount: 0,
      totalItems: 0,
      statusCounts: {},
      paymentStatusCounts: {},
      paymentMethodTotals: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Sales Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        status: query.status || null,
        paymentStatus: query.paymentStatus || null,
        dateFrom: query.dateFrom || null,
        dateTo: query.dateTo || null,
      },
      totals,
    },
    records: paginatedRecords,
    meta: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

module.exports = {
  getInventorySummary,
  getSalesSummary,
};
