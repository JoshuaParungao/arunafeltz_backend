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
  const productItems = sale.items.filter((item) => Boolean(item.itemId));
  const returnedQuantityBySaleItem = sale.returnRequests.reduce((map, request) => {
    for (const returnItem of request.items) {
      if (!returnItem.saleItemId) {
        continue;
      }

      map.set(
        returnItem.saleItemId,
        (map.get(returnItem.saleItemId) || 0) + toNumber(returnItem.quantity)
      );
    }

    return map;
  }, new Map());
  const productRevenue = productItems
    .reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
  const customServiceRevenue = sale.items
    .filter((item) => !item.itemId)
    .reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
  const serviceRevenue = customServiceRevenue + toNumber(sale.serviceCharge);
  const productRefundAmount = sale.returnRequests.reduce(
    (sum, request) => sum + request.items.reduce(
      (itemSum, item) => itemSum + toNumber(item.lineRefundAmount),
      0
    ),
    0
  );
  const totalRefundAmount = sale.returnRequests.reduce(
    (sum, request) => sum + toNumber(request.totalRefundAmount),
    0
  );
  const isCancelled = sale.status === "CANCELLED";
  const productCost = productItems.reduce(
    (costs, item) => {
      const soldQuantity = Math.max(toNumber(item.quantity), 0);
      const returnedQuantity = Math.min(
        Math.max(returnedQuantityBySaleItem.get(item.id) || 0, 0),
        soldQuantity
      );
      const operationalUnitCost = toNumber(
        item.operationalUnitCostSnapshot ??
          item.batch?.operationalUnitCost ??
          item.acquisitionUnitCostSnapshot ??
          item.batch?.unitCost
      );
      const acquisitionUnitCost = toNumber(
        item.acquisitionUnitCostSnapshot ?? item.batch?.unitCost
      );

      costs.grossOperational += soldQuantity * operationalUnitCost;
      costs.refundedOperational += returnedQuantity * operationalUnitCost;
      costs.grossAcquisition += soldQuantity * acquisitionUnitCost;
      costs.refundedAcquisition += returnedQuantity * acquisitionUnitCost;
      return costs;
    },
    {
      grossOperational: 0,
      refundedOperational: 0,
      grossAcquisition: 0,
      refundedAcquisition: 0,
    }
  );
  const netProductRevenue = isCancelled
    ? 0
    : Math.max(productRevenue - productRefundAmount, 0);
  const netCustomServiceRevenue = isCancelled ? 0 : customServiceRevenue;
  const netServiceRevenue = isCancelled ? 0 : serviceRevenue;
  const netGrandTotal = isCancelled
    ? 0
    : Math.max(toNumber(sale.grandTotal) - totalRefundAmount, 0);
  const netOperationalProductCost = isCancelled
    ? 0
    : Math.max(productCost.grossOperational - productCost.refundedOperational, 0);
  const netAcquisitionProductCost = isCancelled
    ? 0
    : Math.max(productCost.grossAcquisition - productCost.refundedAcquisition, 0);

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
    netGrandTotal,
    amountPaid: toNumber(sale.amountPaid),
    changeAmount: toNumber(sale.changeAmount),
    productRevenue,
    productRefundAmount,
    netProductRevenue,
    customServiceRevenue,
    netCustomServiceRevenue,
    serviceRevenue,
    netServiceRevenue,
    totalRefundAmount,
    grossOperationalProductCost: productCost.grossOperational,
    operationalProductCostRefund: productCost.refundedOperational,
    netOperationalProductCost,
    branchProductMargin: netProductRevenue - netOperationalProductCost,
    grossAcquisitionProductCost: productCost.grossAcquisition,
    acquisitionProductCostRefund: productCost.refundedAcquisition,
    netAcquisitionProductCost,
    consolidatedProductMargin: netProductRevenue - netAcquisitionProductCost,
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

  // --- Lightweight totals scan: only fields needed for aggregation ---
  const totalsSelect = {
    id: true,
    status: true,
    paymentStatus: true,
    subtotal: true,
    totalDiscount: true,
    serviceCharge: true,
    grandTotal: true,
    amountPaid: true,
    changeAmount: true,
    branchId: true,
    branch: {
      select: { id: true, code: true, name: true },
    },
    items: {
      select: {
        id: true,
        itemId: true,
        quantity: true,
        lineTotal: true,
        operationalUnitCostSnapshot: true,
        acquisitionUnitCostSnapshot: true,
        batch: {
          select: {
            unitCost: true,
            operationalUnitCost: true,
          },
        },
      },
    },
    payments: {
      select: {
        paymentMethod: true,
        amount: true,
      },
    },
    returnRequests: {
      where: { status: "COMPLETED" },
      select: {
        totalRefundAmount: true,
        items: {
          select: {
            saleItemId: true,
            quantity: true,
            lineRefundAmount: true,
          },
        },
      },
    },
  };

  // --- Full page select: all relations for display ---
  const pageSelect = {
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
      select: { id: true, code: true, name: true },
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
        itemId: true,
        quantity: true,
        lineTotal: true,
        operationalUnitCostSnapshot: true,
        acquisitionUnitCostSnapshot: true,
        batch: {
          select: {
            unitCost: true,
            operationalUnitCost: true,
          },
        },
      },
    },
    payments: {
      select: {
        id: true,
        paymentMethod: true,
        amount: true,
      },
    },
    returnRequests: {
      where: { status: "COMPLETED" },
      select: {
        totalRefundAmount: true,
        items: {
          select: {
            saleItemId: true,
            quantity: true,
            lineRefundAmount: true,
          },
        },
      },
    },
  };

  const orderBy = [{ saleDate: "desc" }, { receiptCode: "desc" }];

  const [totalCount, allSalesLite, pageSales, comparisonBranches] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      orderBy,
      select: totalsSelect,
    }),
    prisma.sale.findMany({
      where,
      orderBy,
      select: pageSelect,
      skip,
      take: limit,
    }),
    branchId
      ? Promise.resolve([])
      : prisma.branch.findMany({
          where: { status: "ACTIVE" },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true },
        }),
  ]);

  // Compute totals from the lightweight scan
  const totalsRecords = allSalesLite.map(buildSalesSummaryRecord);
  const totals = totalsRecords.reduce(
    (acc, sale) => {
      acc.totalSales += 1;
      acc.totalSubtotal += sale.subtotal;
      acc.totalDiscount += sale.totalDiscount;
      acc.totalServiceCharge += sale.serviceCharge;
      acc.totalGrossGrandTotal += sale.status === "CANCELLED" ? 0 : sale.grandTotal;
      acc.totalGrandTotal += sale.netGrandTotal;
      acc.netExternalSales += sale.netGrandTotal;
      acc.totalRefundAmount += sale.totalRefundAmount;
      acc.totalCancelledGrandTotal += sale.status === "CANCELLED" ? sale.grandTotal : 0;
      acc.totalAmountPaid += sale.amountPaid;
      acc.totalChangeAmount += sale.changeAmount;
      acc.totalItems += sale.itemCount;
      acc.totalGrossProductRevenue += sale.status === "CANCELLED" ? 0 : sale.productRevenue;
      acc.totalProductRefundAmount += sale.productRefundAmount;
      acc.totalProductRevenue += sale.netProductRevenue;
      acc.totalCustomServiceRevenue += sale.netCustomServiceRevenue;
      acc.totalServiceRevenue += sale.netServiceRevenue;
      acc.totalGrossOperationalProductCost += sale.status === "CANCELLED"
        ? 0
        : sale.grossOperationalProductCost;
      acc.totalOperationalProductCostRefund += sale.operationalProductCostRefund;
      acc.totalOperationalProductCost += sale.netOperationalProductCost;
      acc.totalBranchProductMargin += sale.branchProductMargin;
      acc.totalGrossAcquisitionProductCost += sale.status === "CANCELLED"
        ? 0
        : sale.grossAcquisitionProductCost;
      acc.totalAcquisitionProductCostRefund += sale.acquisitionProductCostRefund;
      acc.totalAcquisitionProductCost += sale.netAcquisitionProductCost;
      acc.totalConsolidatedProductMargin += sale.consolidatedProductMargin;

      const branchKey = sale.branch?.id || "unassigned";
      const branchTotal = acc.branchTotals[branchKey] || {
        branch: sale.branch || null,
        totalSales: 0,
        totalProductRevenue: 0,
        totalServiceRevenue: 0,
        totalGrandTotal: 0,
        totalOperationalProductCost: 0,
        totalAcquisitionProductCost: 0,
        branchProductMargin: 0,
        consolidatedProductMargin: 0,
      };
      branchTotal.totalSales += 1;
      branchTotal.totalProductRevenue += sale.netProductRevenue;
      branchTotal.totalServiceRevenue += sale.netServiceRevenue;
      branchTotal.totalGrandTotal += sale.netGrandTotal;
      branchTotal.totalOperationalProductCost += sale.netOperationalProductCost;
      branchTotal.totalAcquisitionProductCost += sale.netAcquisitionProductCost;
      branchTotal.branchProductMargin += sale.branchProductMargin;
      branchTotal.consolidatedProductMargin += sale.consolidatedProductMargin;
      acc.branchTotals[branchKey] = branchTotal;

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
      totalGrossGrandTotal: 0,
      totalGrandTotal: 0,
      netExternalSales: 0,
      totalRefundAmount: 0,
      totalCancelledGrandTotal: 0,
      totalAmountPaid: 0,
      totalChangeAmount: 0,
      totalItems: 0,
      totalGrossProductRevenue: 0,
      totalProductRefundAmount: 0,
      totalProductRevenue: 0,
      totalCustomServiceRevenue: 0,
      totalServiceRevenue: 0,
      totalGrossOperationalProductCost: 0,
      totalOperationalProductCostRefund: 0,
      totalOperationalProductCost: 0,
      totalBranchProductMargin: 0,
      totalGrossAcquisitionProductCost: 0,
      totalAcquisitionProductCostRefund: 0,
      totalAcquisitionProductCost: 0,
      totalConsolidatedProductMargin: 0,
      branchTotals: {},
      statusCounts: {},
      paymentStatusCounts: {},
      paymentMethodTotals: {},
    }
  );

  for (const branch of comparisonBranches) {
    if (!totals.branchTotals[branch.id]) {
      totals.branchTotals[branch.id] = {
        branch,
        totalSales: 0,
        totalProductRevenue: 0,
        totalServiceRevenue: 0,
        totalGrandTotal: 0,
        totalOperationalProductCost: 0,
        totalAcquisitionProductCost: 0,
        branchProductMargin: 0,
        consolidatedProductMargin: 0,
      };
    }
  }

  // Build page records from the paginated query (full relations)
  const paginatedRecords = pageSales.map(buildSalesSummaryRecord);
  const totalItems = totalCount;
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


const UNREPAIRED_RELEASE_OUTCOMES = new Set([
  "UNREPAIRED",
  "CUSTOMER_PULL_OUT",
  "NO_FAULT_FOUND",
  "DECLINED",
  "OTHER",
]);

const buildServiceSummaryRecord = (job) => {
  const latestPayment = Array.isArray(job.payments)
    ? job.payments.find((p) => p.status === "POSTED") || job.payments[0] || null
    : null;
  const paymentAmount = latestPayment ? toNumber(latestPayment.amount) : 0;
  const finalServiceCharge = toNumber(job.finalServiceCharge);
  const isReleased = Boolean(job.releasedAt) || job.status === "COMPLETED";
  const isReleasedUnrepaired = isReleased && UNREPAIRED_RELEASE_OUTCOMES.has(
    job.releaseOutcome
  );
  const hasPostedPayment = latestPayment?.status === "POSTED";
  const paymentState = hasPostedPayment
    ? "PAID"
    : !isReleased
      ? "NOT_DUE"
      : finalServiceCharge > 0
        ? "UNPAID"
        : "NO_CHARGE";

  return {
    id: job.id,
    jobCode: job.jobCode,
    status: job.status,
    jobTitle: job.jobTitle,
    receivedAt: job.receivedAt,
    startedAt: job.startedAt,
    readyAt: job.readyAt,
    completedAt: job.completedAt,
    cancelledAt: job.cancelledAt,
    releasedAt: job.releasedAt,
    releaseOutcome: job.releaseOutcome,
    releaseNotes: job.releaseNotes,
    isQuickService: job.isQuickService,
    isReleased,
    isReleasedUnrepaired,
    branch: job.branch,
    customer: job.customer,
    customerNameSnapshot: job.customerNameSnapshot,
    customerContactSnapshot: job.customerContactSnapshot,
    receivedBy: job.createdBy,
    assignedTechnician: job.assignedTechnician,
    releasedBy: job.releasedBy,
    estimatedServiceCharge: toNumber(job.estimatedServiceCharge),
    finalServiceCharge,
    recognizedServiceCharge: hasPostedPayment ? finalServiceCharge : 0,
    isPaid: hasPostedPayment,
    paymentState,
    payment: latestPayment
      ? {
          id: latestPayment.id,
          paymentCode: latestPayment.paymentCode,
          paymentMethod: latestPayment.paymentMethod,
          status: latestPayment.status,
          amount: paymentAmount,
          paidAt: latestPayment.paidAt,
        }
      : null,
    paymentId: latestPayment?.id || null,
  };
};

const getServiceSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const receivedAt = parseDateRange(query);
  const isQuickService = parseBoolean(query.isQuickService);
  const releasedOnly = parseBoolean(query.releasedOnly);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.assignedTechnicianId
      ? { assignedTechnicianId: query.assignedTechnicianId }
      : {}),
    ...(isQuickService === undefined ? {} : { isQuickService }),
    ...(query.releaseOutcome ? { releaseOutcome: query.releaseOutcome } : {}),
    ...(releasedOnly === true
      ? {
          OR: [
            { releasedAt: { not: null } },
            { status: "COMPLETED" },
          ],
        }
      : releasedOnly === false
        ? {
            AND: [
              { releasedAt: null },
              { status: { not: "COMPLETED" } },
            ],
          }
        : {}),
    ...(receivedAt ? { receivedAt } : {}),
    ...(query.paymentMethod
      ? {
          payments: {
            some: {
              paymentMethod: query.paymentMethod,
            },
          },
        }
      : {}),
  };

  const totalsSelect = {
    id: true,
    status: true,
    isQuickService: true,
    estimatedServiceCharge: true,
    finalServiceCharge: true,
    receivedAt: true,
    releasedAt: true,
    releaseOutcome: true,
    payments: {
      select: {
        id: true,
        paymentCode: true,
        paymentMethod: true,
        status: true,
        amount: true,
        paidAt: true,
      },
    },
  };

  const pageSelect = {
    id: true,
    jobCode: true,
    status: true,
    jobTitle: true,
    customerNameSnapshot: true,
    customerContactSnapshot: true,
    isQuickService: true,
    estimatedServiceCharge: true,
    finalServiceCharge: true,
    receivedAt: true,
    startedAt: true,
    readyAt: true,
    completedAt: true,
    cancelledAt: true,
    releasedAt: true,
    releaseOutcome: true,
    releaseNotes: true,
    branch: {
      select: { id: true, code: true, name: true },
    },
    customer: {
      select: {
        id: true,
        customerCode: true,
        fullName: true,
        mobileNumber: true,
      },
    },
    assignedTechnician: {
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
      },
    },
    createdBy: {
      select: { id: true, fullName: true, role: true },
    },
    releasedBy: {
      select: { id: true, fullName: true, role: true },
    },
    payments: {
      select: {
        id: true,
        paymentCode: true,
        paymentMethod: true,
        status: true,
        amount: true,
        paidAt: true,
      },
    },
  };

  const orderBy = [{ receivedAt: "desc" }, { jobCode: "desc" }];

  const [totalCount, allJobsLite, pageJobs] = await Promise.all([
    prisma.serviceJob.count({ where }),
    prisma.serviceJob.findMany({
      where,
      orderBy,
      select: totalsSelect,
    }),
    prisma.serviceJob.findMany({
      where,
      orderBy,
      select: pageSelect,
      skip,
      take: limit,
    }),
  ]);

  // Compute totals from lightweight scan
  const totalsRecords = allJobsLite.map(buildServiceSummaryRecord);
  const totals = totalsRecords.reduce(
    (acc, job) => {
      acc.totalJobs += 1;
      acc.totalEstimatedServiceCharge += job.estimatedServiceCharge;
      acc.totalFinalServiceCharge += job.finalServiceCharge;
      acc.totalRecognizedServiceCharge += job.recognizedServiceCharge;
      acc.totalEnteredToday += (() => {
        const received = new Date(job.receivedAt);
        const now = new Date();
        return received.getFullYear() === now.getFullYear() &&
          received.getMonth() === now.getMonth() &&
          received.getDate() === now.getDate()
          ? 1
          : 0;
      })();
      acc.totalQuickJobs += job.isQuickService ? 1 : 0;
      acc.totalReleasedJobs += job.isReleased ? 1 : 0;
      acc.totalReleasedUnrepairedJobs += job.isReleasedUnrepaired ? 1 : 0;

      if (job.isPaid) {
        acc.totalPaidJobs += 1;
        acc.totalPaidAmount += job.payment.amount;
        acc.paymentMethodTotals[job.payment.paymentMethod] =
          (acc.paymentMethodTotals[job.payment.paymentMethod] || 0) +
          job.payment.amount;
      } else if (job.paymentState === "UNPAID") {
        acc.totalUnpaidJobs += 1;
      } else if (job.paymentState === "NO_CHARGE") {
        acc.totalNoChargeJobs += 1;
      } else {
        acc.totalNotDueJobs += 1;
      }

      acc.statusCounts[job.status] = (acc.statusCounts[job.status] || 0) + 1;

      return acc;
    },
    {
      totalJobs: 0,
      totalEstimatedServiceCharge: 0,
      totalFinalServiceCharge: 0,
      totalRecognizedServiceCharge: 0,
      totalEnteredToday: 0,
      totalQuickJobs: 0,
      totalReleasedJobs: 0,
      totalReleasedUnrepairedJobs: 0,
      totalPaidJobs: 0,
      totalUnpaidJobs: 0,
      totalNoChargeJobs: 0,
      totalNotDueJobs: 0,
      totalPaidAmount: 0,
      statusCounts: {},
      paymentMethodTotals: {},
    }
  );

  // Build page records from paginated query
  const paginatedRecords = pageJobs.map(buildServiceSummaryRecord);
  const paginatedIds = paginatedRecords.map((record) => record.id);
  const paymentJobIdByPaymentId = new Map(
    paginatedRecords
      .filter((record) => record.paymentId)
      .map((record) => [record.paymentId, record.id])
  );
  const latestActionByJobId = new Map();

  if (paginatedIds.length > 0) {
    const actionLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "ServiceJob", entityId: { in: paginatedIds } },
          ...(paymentJobIdByPaymentId.size > 0
            ? [
                {
                  entityType: "ServicePayment",
                  entityId: { in: [...paymentJobIdByPaymentId.keys()] },
                },
              ]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    for (const log of actionLogs) {
      const jobId =
        log.entityType === "ServicePayment"
          ? paymentJobIdByPaymentId.get(log.entityId)
          : log.entityId;
      if (jobId && !latestActionByJobId.has(jobId)) {
        latestActionByJobId.set(jobId, {
          action: log.action,
          actedAt: log.createdAt,
          actor: log.actor,
        });
      }
    }
  }

  const recordsWithLatestAction = paginatedRecords.map((record) => {
    const { paymentId, ...safeRecord } = record;
    return {
      ...safeRecord,
      lastAction: latestActionByJobId.get(record.id) || null,
    };
  });
  const totalItems = totalCount;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Services / Job Orders Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        status: query.status || null,
        paymentMethod: query.paymentMethod || null,
        assignedTechnicianId: query.assignedTechnicianId || null,
        customerId: query.customerId || null,
        isQuickService: isQuickService === undefined ? null : isQuickService,
        releaseOutcome: query.releaseOutcome || null,
        releasedOnly: releasedOnly === undefined ? null : releasedOnly,
        dateFrom: query.dateFrom || null,
        dateTo: query.dateTo || null,
      },
      totals,
    },
    records: recordsWithLatestAction,
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


const buildWarrantySummaryRecord = (claim) => {
  return {
    id: claim.id,
    claimCode: claim.claimCode,
    status: claim.status,
    issueDescription: claim.issueDescription,
    customerComplaint: claim.customerComplaint,
    diagnosis: claim.diagnosis,
    actionTaken: claim.actionTaken,
    supplierName: claim.supplierName,
    supplierReferenceNo: claim.supplierReferenceNo,
    receivedAt: claim.receivedAt,
    checkingAt: claim.checkingAt,
    sentToSupplierAt: claim.sentToSupplierAt,
    approvedAt: claim.approvedAt,
    rejectedAt: claim.rejectedAt,
    repairedAt: claim.repairedAt,
    replacedAt: claim.replacedAt,
    releasedAt: claim.releasedAt,
    isReleased: Boolean(claim.releasedAt) || claim.status === "OUT",
    branch: claim.branch,
    customer: claim.customer,
    item: claim.item,
    serial: claim.serial,
    sale: claim.sale,
  };
};

const getWarrantySummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const receivedAt = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.itemId ? { itemId: query.itemId } : {}),
    ...(query.serialId ? { serialId: query.serialId } : {}),
    ...(receivedAt ? { receivedAt } : {}),
    ...(query.supplierName
      ? {
          supplierName: {
            contains: String(query.supplierName).trim(),
            mode: "insensitive",
          },
        }
      : {}),
  };

  const allClaims = await prisma.warrantyClaim.findMany({
    where,
    orderBy: [
      {
        receivedAt: "desc",
      },
      {
        claimCode: "desc",
      },
    ],
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
      receivedAt: true,
      checkingAt: true,
      sentToSupplierAt: true,
      approvedAt: true,
      rejectedAt: true,
      repairedAt: true,
      replacedAt: true,
      releasedAt: true,
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
    },
  });

  const records = allClaims.map(buildWarrantySummaryRecord);

  const totals = records.reduce(
    (acc, claim) => {
      acc.totalClaims += 1;

      if (claim.isReleased) {
        acc.totalReleased += 1;
      } else {
        acc.totalOpen += 1;
      }

      if (claim.supplierName) {
        acc.totalWithSupplier += 1;
        acc.supplierCounts[claim.supplierName] =
          (acc.supplierCounts[claim.supplierName] || 0) + 1;
      }

      acc.statusCounts[claim.status] = (acc.statusCounts[claim.status] || 0) + 1;

      return acc;
    },
    {
      totalClaims: 0,
      totalOpen: 0,
      totalReleased: 0,
      totalWithSupplier: 0,
      statusCounts: {},
      supplierCounts: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Warranty Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        status: query.status || null,
        customerId: query.customerId || null,
        itemId: query.itemId || null,
        serialId: query.serialId || null,
        supplierName: query.supplierName || null,
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


const CASH_IN_TYPES = new Set([
  "CASH_IN",
  "SALE_PAYMENT",
  "CREDIT_COLLECTION",
  "ADJUSTMENT_IN",
  "SERVICE_PAYMENT",
]);

const CASH_OUT_TYPES = new Set([
  "CASH_OUT",
  "HANDOVER_OUT",
  "ADJUSTMENT_OUT",
]);

const buildCashSummaryRecord = (transaction) => {
  return {
    id: transaction.id,
    transactionCode: transaction.transactionCode,
    type: transaction.type,
    status: transaction.status,
    source: transaction.source,
    amount: toNumber(transaction.amount),
    balanceBefore: toNumber(transaction.balanceBefore),
    balanceAfter: toNumber(transaction.balanceAfter),
    description: transaction.description,
    referenceNo: transaction.referenceNo,
    sourceId: transaction.sourceId,
    sourceCode: transaction.sourceCode,
    transactionDate: transaction.transactionDate,
    cancelledAt: transaction.cancelledAt,
    cancellationReason: transaction.cancellationReason,
    cashBox: transaction.cashBox,
    branch: transaction.branch,
    createdBy: transaction.createdBy,
    cancelledBy: transaction.cancelledBy,
  };
};

const getCashSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const transactionDate = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.cashBoxId ? { cashBoxId: query.cashBoxId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(transactionDate ? { transactionDate } : {}),
  };

  const allTransactions = await prisma.cashTransaction.findMany({
    where,
    orderBy: [
      {
        transactionDate: "desc",
      },
      {
        transactionCode: "desc",
      },
    ],
    select: {
      id: true,
      transactionCode: true,
      type: true,
      status: true,
      source: true,
      amount: true,
      balanceBefore: true,
      balanceAfter: true,
      description: true,
      referenceNo: true,
      sourceId: true,
      sourceCode: true,
      transactionDate: true,
      cancelledAt: true,
      cancellationReason: true,
      cashBox: {
        select: {
          id: true,
          boxCode: true,
          name: true,
          status: true,
          currentBalance: true,
        },
      },
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
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
      cancelledBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
    },
  });

  const records = allTransactions.map(buildCashSummaryRecord);

  const totals = records.reduce(
    (acc, transaction) => {
      acc.totalTransactions += 1;
      acc.totalAmount += transaction.amount;

      if (transaction.status === "POSTED") {
        acc.totalPosted += 1;
        acc.totalPostedAmount += transaction.amount;

        if (CASH_IN_TYPES.has(transaction.type)) {
          acc.totalCashIn += transaction.amount;
        }

        if (CASH_OUT_TYPES.has(transaction.type)) {
          acc.totalCashOut += transaction.amount;
        }
      }

      if (transaction.status === "CANCELLED") {
        acc.totalCancelled += 1;
        acc.totalCancelledAmount += transaction.amount;
      }

      acc.typeTotals[transaction.type] =
        (acc.typeTotals[transaction.type] || 0) + transaction.amount;

      acc.statusCounts[transaction.status] =
        (acc.statusCounts[transaction.status] || 0) + 1;

      acc.sourceCounts[transaction.source] =
        (acc.sourceCounts[transaction.source] || 0) + 1;

      return acc;
    },
    {
      totalTransactions: 0,
      totalAmount: 0,
      totalPosted: 0,
      totalPostedAmount: 0,
      totalCancelled: 0,
      totalCancelledAmount: 0,
      totalCashIn: 0,
      totalCashOut: 0,
      netCashMovement: 0,
      typeTotals: {},
      statusCounts: {},
      sourceCounts: {},
    }
  );

  totals.netCashMovement = totals.totalCashIn - totals.totalCashOut;

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Cash Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        cashBoxId: query.cashBoxId || null,
        type: query.type || null,
        status: query.status || null,
        source: query.source || null,
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


const buildSupplierSummaryRecord = (supplier) => {
  const purchaseOrderTotals = supplier.purchaseOrders.reduce(
    (acc, order) => {
      acc.totalPurchaseOrders += 1;
      acc.totalPoSubtotal += toNumber(order.subtotal);
      acc.totalPoDiscount += toNumber(order.totalDiscount);
      acc.totalPoGrandTotal += toNumber(order.grandTotal);
      acc.poStatusCounts[order.status] = (acc.poStatusCounts[order.status] || 0) + 1;
      return acc;
    },
    {
      totalPurchaseOrders: 0,
      totalPoSubtotal: 0,
      totalPoDiscount: 0,
      totalPoGrandTotal: 0,
      poStatusCounts: {},
    }
  );

  const receivingTotals = supplier.purchaseReceivings.reduce(
    (acc, receiving) => {
      acc.totalReceivings += 1;
      acc.totalReceivingSubtotal += toNumber(receiving.subtotal);
      acc.totalReceivingDiscount += toNumber(receiving.totalDiscount);
      acc.totalReceivingGrandTotal += toNumber(receiving.grandTotal);
      acc.receivingStatusCounts[receiving.status] =
        (acc.receivingStatusCounts[receiving.status] || 0) + 1;
      return acc;
    },
    {
      totalReceivings: 0,
      totalReceivingSubtotal: 0,
      totalReceivingDiscount: 0,
      totalReceivingGrandTotal: 0,
      receivingStatusCounts: {},
    }
  );

  return {
    id: supplier.id,
    supplierCode: supplier.supplierCode,
    name: supplier.name,
    contactPerson: supplier.contactPerson,
    contactNo: supplier.contactNo,
    email: supplier.email,
    address: supplier.address,
    tin: supplier.tin,
    notes: supplier.notes,
    status: supplier.status,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
    branch: supplier.branch,
    createdBy: supplier.createdBy,
    updatedBy: supplier.updatedBy,
    ...purchaseOrderTotals,
    ...receivingTotals,
  };
};

const getSupplierSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const createdAt = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(query.search
      ? {
          OR: [
            {
              supplierCode: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              name: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              contactPerson: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              contactNo: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const allSuppliers = await prisma.supplier.findMany({
    where,
    orderBy: [
      {
        name: "asc",
      },
      {
        supplierCode: "asc",
      },
    ],
    select: {
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
      createdAt: true,
      updatedAt: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
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
      purchaseOrders: {
        select: {
          id: true,
          poCode: true,
          status: true,
          subtotal: true,
          totalDiscount: true,
          grandTotal: true,
          orderDate: true,
        },
      },
      purchaseReceivings: {
        select: {
          id: true,
          receivingCode: true,
          status: true,
          subtotal: true,
          totalDiscount: true,
          grandTotal: true,
          receivingDate: true,
        },
      },
    },
  });

  const records = allSuppliers.map(buildSupplierSummaryRecord);

  const totals = records.reduce(
    (acc, supplier) => {
      acc.totalSuppliers += 1;

      acc.statusCounts[supplier.status] =
        (acc.statusCounts[supplier.status] || 0) + 1;

      acc.totalPurchaseOrders += supplier.totalPurchaseOrders;
      acc.totalPoGrandTotal += supplier.totalPoGrandTotal;
      acc.totalReceivings += supplier.totalReceivings;
      acc.totalReceivingGrandTotal += supplier.totalReceivingGrandTotal;

      for (const [status, count] of Object.entries(supplier.poStatusCounts)) {
        acc.poStatusCounts[status] = (acc.poStatusCounts[status] || 0) + count;
      }

      for (const [status, count] of Object.entries(supplier.receivingStatusCounts)) {
        acc.receivingStatusCounts[status] =
          (acc.receivingStatusCounts[status] || 0) + count;
      }

      return acc;
    },
    {
      totalSuppliers: 0,
      statusCounts: {},
      totalPurchaseOrders: 0,
      totalPoGrandTotal: 0,
      totalReceivings: 0,
      totalReceivingGrandTotal: 0,
      poStatusCounts: {},
      receivingStatusCounts: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Supplier Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        status: query.status || null,
        search: query.search || null,
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


const buildPurchaseOrderSummaryRecord = (purchaseOrder) => {
  const itemTotals = purchaseOrder.items.reduce(
    (acc, item) => {
      acc.totalLines += 1;
      acc.totalQuantity += toNumber(item.quantity);
      acc.totalReceivedQuantity += toNumber(item.receivedQuantity);
      acc.totalLineDiscount += toNumber(item.discountAmount);
      acc.totalLineAmount += toNumber(item.lineTotal);
      return acc;
    },
    {
      totalLines: 0,
      totalQuantity: 0,
      totalReceivedQuantity: 0,
      totalLineDiscount: 0,
      totalLineAmount: 0,
    }
  );

  return {
    id: purchaseOrder.id,
    poCode: purchaseOrder.poCode,
    status: purchaseOrder.status,
    orderDate: purchaseOrder.orderDate,
    expectedDate: purchaseOrder.expectedDate,
    supplierNameSnapshot: purchaseOrder.supplierNameSnapshot,
    supplierContactSnapshot: purchaseOrder.supplierContactSnapshot,
    notes: purchaseOrder.notes,
    internalNotes: purchaseOrder.internalNotes,
    cancellationReason: purchaseOrder.cancellationReason,
    subtotal: toNumber(purchaseOrder.subtotal),
    totalDiscount: toNumber(purchaseOrder.totalDiscount),
    grandTotal: toNumber(purchaseOrder.grandTotal),
    orderedAt: purchaseOrder.orderedAt,
    receivedAt: purchaseOrder.receivedAt,
    cancelledAt: purchaseOrder.cancelledAt,
    branch: purchaseOrder.branch,
    supplier: purchaseOrder.supplier,
    createdBy: purchaseOrder.createdBy,
    updatedBy: purchaseOrder.updatedBy,
    orderedBy: purchaseOrder.orderedBy,
    cancelledBy: purchaseOrder.cancelledBy,
    ...itemTotals,
  };
};

const getPurchaseOrderSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const orderDate = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(orderDate ? { orderDate } : {}),
    ...(query.search
      ? {
          OR: [
            {
              poCode: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              supplierNameSnapshot: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              supplierContactSnapshot: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              notes: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const allPurchaseOrders = await prisma.purchaseOrder.findMany({
    where,
    orderBy: [
      {
        orderDate: "desc",
      },
      {
        poCode: "desc",
      },
    ],
    select: {
      id: true,
      poCode: true,
      status: true,
      orderDate: true,
      expectedDate: true,
      supplierNameSnapshot: true,
      supplierContactSnapshot: true,
      notes: true,
      internalNotes: true,
      cancellationReason: true,
      subtotal: true,
      totalDiscount: true,
      grandTotal: true,
      orderedAt: true,
      receivedAt: true,
      cancelledAt: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
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
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const records = allPurchaseOrders.map(buildPurchaseOrderSummaryRecord);

  const totals = records.reduce(
    (acc, purchaseOrder) => {
      acc.totalPurchaseOrders += 1;
      acc.totalSubtotal += purchaseOrder.subtotal;
      acc.totalDiscount += purchaseOrder.totalDiscount;
      acc.totalGrandTotal += purchaseOrder.grandTotal;
      acc.totalLines += purchaseOrder.totalLines;
      acc.totalQuantity += purchaseOrder.totalQuantity;
      acc.totalReceivedQuantity += purchaseOrder.totalReceivedQuantity;

      acc.statusCounts[purchaseOrder.status] =
        (acc.statusCounts[purchaseOrder.status] || 0) + 1;

      return acc;
    },
    {
      totalPurchaseOrders: 0,
      totalSubtotal: 0,
      totalDiscount: 0,
      totalGrandTotal: 0,
      totalLines: 0,
      totalQuantity: 0,
      totalReceivedQuantity: 0,
      statusCounts: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Purchase Order Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        supplierId: query.supplierId || null,
        status: query.status || null,
        search: query.search || null,
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


const buildPurchaseReceivingSummaryRecord = (receiving) => {
  const itemTotals = receiving.items.reduce(
    (acc, item) => {
      const serialCount = Array.isArray(item.serials) ? item.serials.length : 0;

      acc.totalLines += 1;
      acc.totalQuantityReceived += toNumber(item.quantityReceived);
      acc.totalLineDiscount += toNumber(item.discountAmount);
      acc.totalLineAmount += toNumber(item.lineTotal);
      acc.totalSerials += serialCount;

      if (item.batchCode) {
        acc.totalWithBatch += 1;
      }

      return acc;
    },
    {
      totalLines: 0,
      totalQuantityReceived: 0,
      totalLineDiscount: 0,
      totalLineAmount: 0,
      totalSerials: 0,
      totalWithBatch: 0,
    }
  );

  return {
    id: receiving.id,
    receivingCode: receiving.receivingCode,
    status: receiving.status,
    receivingDate: receiving.receivingDate,
    supplierDeliveryNo: receiving.supplierDeliveryNo,
    supplierInvoiceNo: receiving.supplierInvoiceNo,
    referenceNo: receiving.referenceNo,
    supplierNameSnapshot: receiving.supplierNameSnapshot,
    supplierContactSnapshot: receiving.supplierContactSnapshot,
    notes: receiving.notes,
    internalNotes: receiving.internalNotes,
    cancellationReason: receiving.cancellationReason,
    subtotal: toNumber(receiving.subtotal),
    totalDiscount: toNumber(receiving.totalDiscount),
    grandTotal: toNumber(receiving.grandTotal),
    postedAt: receiving.postedAt,
    cancelledAt: receiving.cancelledAt,
    branch: receiving.branch,
    supplier: receiving.supplier,
    purchaseOrder: receiving.purchaseOrder,
    createdBy: receiving.createdBy,
    updatedBy: receiving.updatedBy,
    postedBy: receiving.postedBy,
    cancelledBy: receiving.cancelledBy,
    ...itemTotals,
  };
};

const getPurchaseReceivingSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const receivingDate = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(receivingDate ? { receivingDate } : {}),
    ...(query.search
      ? {
          OR: [
            {
              receivingCode: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              supplierDeliveryNo: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              supplierInvoiceNo: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              referenceNo: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
            {
              supplierNameSnapshot: {
                contains: String(query.search).trim(),
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  const allReceivings = await prisma.purchaseReceiving.findMany({
    where,
    orderBy: [
      {
        receivingDate: "desc",
      },
      {
        receivingCode: "desc",
      },
    ],
    select: {
      id: true,
      receivingCode: true,
      status: true,
      receivingDate: true,
      supplierDeliveryNo: true,
      supplierInvoiceNo: true,
      referenceNo: true,
      supplierNameSnapshot: true,
      supplierContactSnapshot: true,
      notes: true,
      internalNotes: true,
      cancellationReason: true,
      subtotal: true,
      totalDiscount: true,
      grandTotal: true,
      postedAt: true,
      cancelledAt: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
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
        },
      },
      purchaseOrder: {
        select: {
          id: true,
          poCode: true,
          status: true,
          orderDate: true,
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
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              status: true,
              isSerialized: true,
            },
          },
          serials: {
            select: {
              id: true,
              serialNumber: true,
            },
          },
        },
      },
    },
  });

  const records = allReceivings.map(buildPurchaseReceivingSummaryRecord);

  const totals = records.reduce(
    (acc, receiving) => {
      acc.totalReceivings += 1;
      acc.totalSubtotal += receiving.subtotal;
      acc.totalDiscount += receiving.totalDiscount;
      acc.totalGrandTotal += receiving.grandTotal;
      acc.totalLines += receiving.totalLines;
      acc.totalQuantityReceived += receiving.totalQuantityReceived;
      acc.totalSerials += receiving.totalSerials;
      acc.totalWithBatch += receiving.totalWithBatch;

      acc.statusCounts[receiving.status] =
        (acc.statusCounts[receiving.status] || 0) + 1;

      return acc;
    },
    {
      totalReceivings: 0,
      totalSubtotal: 0,
      totalDiscount: 0,
      totalGrandTotal: 0,
      totalLines: 0,
      totalQuantityReceived: 0,
      totalSerials: 0,
      totalWithBatch: 0,
      statusCounts: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Purchase Receiving Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        supplierId: query.supplierId || null,
        purchaseOrderId: query.purchaseOrderId || null,
        status: query.status || null,
        search: query.search || null,
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


const buildStockTransferSummaryRecord = (transfer, filteredBranchId) => {
  const itemTotals = transfer.items.reduce(
    (acc, item) => {
      const serialCount = Array.isArray(item.serials) ? item.serials.length : 0;
      const quantity = toNumber(item.quantity);
      const proposedUnitPrice = item.proposedTransferUnitPrice === null
        ? null
        : toNumber(item.proposedTransferUnitPrice);
      const agreedUnitPrice = item.agreedTransferUnitPrice === null
        ? null
        : toNumber(item.agreedTransferUnitPrice);
      const proposedAmount = proposedUnitPrice === null
        ? 0
        : quantity * proposedUnitPrice;
      const agreedAmount = item.transferAmount === null
        ? (agreedUnitPrice === null ? 0 : quantity * agreedUnitPrice)
        : toNumber(item.transferAmount);
      const allocationTotals = item.allocations.reduce(
        (totals, allocation) => {
          const allocatedQuantity = toNumber(allocation.quantity);
          totals.quantity += allocatedQuantity;
          totals.acquisitionCost += allocatedQuantity *
            toNumber(allocation.acquisitionUnitCostSnapshot);
          totals.sourceOperationalCost += allocatedQuantity *
            toNumber(allocation.sourceOperationalUnitCostSnapshot);
          totals.destinationOperationalCost += allocatedQuantity *
            toNumber(allocation.destinationOperationalUnitCostSnapshot);
          totals.transferAmount += toNumber(allocation.transferAmount);
          return totals;
        },
        {
          quantity: 0,
          acquisitionCost: 0,
          sourceOperationalCost: 0,
          destinationOperationalCost: 0,
          transferAmount: 0,
        }
      );
      const postedTransferAmount = transfer.status === "POSTED"
        ? (item.allocations.length > 0 ? allocationTotals.transferAmount : agreedAmount)
        : 0;

      acc.totalLines += 1;
      acc.totalQuantity += quantity;
      acc.totalSerials += serialCount;
      acc.totalAllocations += item.allocations.length;
      acc.totalProposedAmount += proposedAmount;
      acc.totalAgreedAmount += agreedAmount;
      acc.totalPostedTransferAmount += postedTransferAmount;
      acc.totalAcquisitionCost += allocationTotals.acquisitionCost;
      acc.totalSourceOperationalCost += allocationTotals.sourceOperationalCost;
      acc.totalDestinationOperationalCost += allocationTotals.destinationOperationalCost;

      if (item.fromBatchId || item.allocations.length > 0) {
        acc.totalWithBatch += 1;
      }

      acc.lines.push({
        id: item.id,
        lineNo: item.lineNo,
        description: item.description,
        quantity,
        item: item.item,
        destinationItem: item.destinationItem,
        fromBatch: item.fromBatch,
        proposedTransferUnitPrice: proposedUnitPrice,
        agreedTransferUnitPrice: agreedUnitPrice,
        proposedAmount,
        agreedAmount,
        postedTransferAmount,
        priceProposedAt: item.priceProposedAt,
        priceProposedBy: item.priceProposedBy,
        priceSetAt: item.priceSetAt,
        priceSetBy: item.priceSetBy,
        priceLockedAt: item.priceLockedAt,
        allocations: item.allocations.map((allocation) => ({
          id: allocation.id,
          quantity: toNumber(allocation.quantity),
          acquisitionUnitCostSnapshot: toNumber(allocation.acquisitionUnitCostSnapshot),
          sourceOperationalUnitCostSnapshot: toNumber(allocation.sourceOperationalUnitCostSnapshot),
          destinationOperationalUnitCostSnapshot: toNumber(allocation.destinationOperationalUnitCostSnapshot),
          transferAmount: toNumber(allocation.transferAmount),
          sourceBatch: allocation.sourceBatch,
          destinationBatch: allocation.destinationBatch,
        })),
        serials: item.serials,
      });

      return acc;
    },
    {
      totalLines: 0,
      totalQuantity: 0,
      totalSerials: 0,
      totalWithBatch: 0,
      totalAllocations: 0,
      totalProposedAmount: 0,
      totalAgreedAmount: 0,
      totalPostedTransferAmount: 0,
      totalAcquisitionCost: 0,
      totalSourceOperationalCost: 0,
      totalDestinationOperationalCost: 0,
      lines: [],
    }
  );
  const isOutgoing = !filteredBranchId || transfer.fromBranch?.id === filteredBranchId;
  const isIncoming = !filteredBranchId || transfer.toBranch?.id === filteredBranchId;
  const sourceInternalMargin = itemTotals.totalPostedTransferAmount -
    itemTotals.totalSourceOperationalCost;

  return {
    id: transfer.id,
    transferCode: transfer.transferCode,
    status: transfer.status,
    transferDate: transfer.transferDate,
    requestedAt: transfer.requestedAt,
    approvedAt: transfer.approvedAt,
    rejectedAt: transfer.rejectedAt,
    postedAt: transfer.postedAt,
    cancelledAt: transfer.cancelledAt,
    notes: transfer.notes,
    internalNotes: transfer.internalNotes,
    rejectionReason: transfer.rejectionReason,
    cancellationReason: transfer.cancellationReason,
    fromBranch: transfer.fromBranch,
    toBranch: transfer.toBranch,
    requestedBy: transfer.requestedBy,
    approvedBy: transfer.approvedBy,
    rejectedBy: transfer.rejectedBy,
    postedBy: transfer.postedBy,
    cancelledBy: transfer.cancelledBy,
    createdBy: transfer.createdBy,
    updatedBy: transfer.updatedBy,
    items: itemTotals.lines,
    outgoingTransferSales: isOutgoing ? itemTotals.totalPostedTransferAmount : 0,
    incomingTransferPurchases: isIncoming ? itemTotals.totalPostedTransferAmount : 0,
    sourceInternalMargin,
    ...itemTotals,
    lines: undefined,
  };
};

const getStockTransferSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const transferDate = parseDateRange(query);

  const andConditions = [];

  if (branchId) {
    andConditions.push({
      OR: [
        {
          fromBranchId: branchId,
        },
        {
          toBranchId: branchId,
        },
      ],
    });
  }

  if (query.fromBranchId) {
    andConditions.push({
      fromBranchId: query.fromBranchId,
    });
  }

  if (query.toBranchId) {
    andConditions.push({
      toBranchId: query.toBranchId,
    });
  }

  if (query.status) {
    andConditions.push({
      status: query.status,
    });
  }

  if (transferDate) {
    andConditions.push({
      transferDate,
    });
  }

  if (query.search) {
    andConditions.push({
      OR: [
        {
          transferCode: {
            contains: String(query.search).trim(),
            mode: "insensitive",
          },
        },
        {
          notes: {
            contains: String(query.search).trim(),
            mode: "insensitive",
          },
        },
        {
          rejectionReason: {
            contains: String(query.search).trim(),
            mode: "insensitive",
          },
        },
        {
          cancellationReason: {
            contains: String(query.search).trim(),
            mode: "insensitive",
          },
        },
      ],
    });
  }

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  const allTransfers = await prisma.stockTransfer.findMany({
    where,
    orderBy: [
      {
        transferDate: "desc",
      },
      {
        transferCode: "desc",
      },
    ],
    select: {
      id: true,
      transferCode: true,
      status: true,
      transferDate: true,
      requestedAt: true,
      approvedAt: true,
      rejectedAt: true,
      postedAt: true,
      cancelledAt: true,
      notes: true,
      internalNotes: true,
      rejectionReason: true,
      cancellationReason: true,
      fromBranch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      toBranch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      requestedBy: {
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
      rejectedBy: {
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
        select: {
          id: true,
          lineNo: true,
          description: true,
          quantity: true,
          fromBatchId: true,
          proposedTransferUnitPrice: true,
          agreedTransferUnitPrice: true,
          transferAmount: true,
          priceProposedAt: true,
          priceSetAt: true,
          priceLockedAt: true,
          item: {
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              status: true,
              isSerialized: true,
            },
          },
          destinationItem: {
            select: {
              id: true,
              itemCode: true,
              itemName: true,
              status: true,
              isSerialized: true,
            },
          },
          fromBatch: {
            select: {
              id: true,
              batchCode: true,
              quantityAvailable: true,
              status: true,
            },
          },
          priceProposedBy: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
          priceSetBy: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
          allocations: {
            select: {
              id: true,
              quantity: true,
              acquisitionUnitCostSnapshot: true,
              sourceOperationalUnitCostSnapshot: true,
              destinationOperationalUnitCostSnapshot: true,
              transferAmount: true,
              sourceBatch: {
                select: {
                  id: true,
                  batchCode: true,
                },
              },
              destinationBatch: {
                select: {
                  id: true,
                  batchCode: true,
                },
              },
            },
          },
          serials: {
            select: {
              id: true,
              serialNumberSnapshot: true,
              allocationId: true,
              itemSerial: {
                select: {
                  id: true,
                  serialNumber: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const records = allTransfers.map((transfer) =>
    buildStockTransferSummaryRecord(transfer, branchId)
  );

  const totals = records.reduce(
    (acc, transfer) => {
      acc.totalTransfers += 1;
      acc.totalLines += transfer.totalLines;
      acc.totalQuantity += transfer.totalQuantity;
      acc.totalSerials += transfer.totalSerials;
      acc.totalWithBatch += transfer.totalWithBatch;
      acc.totalAllocations += transfer.totalAllocations;
      acc.totalProposedAmount += transfer.totalProposedAmount;
      acc.totalAgreedAmount += transfer.totalAgreedAmount;
      acc.totalPostedTransferAmount += transfer.totalPostedTransferAmount;
      acc.totalAcquisitionCost += transfer.totalAcquisitionCost;
      acc.totalSourceOperationalCost += transfer.totalSourceOperationalCost;
      acc.totalDestinationOperationalCost += transfer.totalDestinationOperationalCost;
      acc.totalSourceInternalMargin += transfer.sourceInternalMargin;
      acc.outgoingTransferSales += transfer.outgoingTransferSales;
      acc.incomingTransferPurchases += transfer.incomingTransferPurchases;

      acc.statusCounts[transfer.status] =
        (acc.statusCounts[transfer.status] || 0) + 1;

      return acc;
    },
    {
      totalTransfers: 0,
      totalLines: 0,
      totalQuantity: 0,
      totalSerials: 0,
      totalWithBatch: 0,
      totalAllocations: 0,
      totalProposedAmount: 0,
      totalAgreedAmount: 0,
      totalPostedTransferAmount: 0,
      totalAcquisitionCost: 0,
      totalSourceOperationalCost: 0,
      totalDestinationOperationalCost: 0,
      totalSourceInternalMargin: 0,
      outgoingTransferSales: 0,
      incomingTransferPurchases: 0,
      statusCounts: {},
    }
  );

  totals.consolidatedInternalElimination = branchId
    ? 0
    : totals.totalPostedTransferAmount;
  totals.consolidatedNetTransferRevenue = branchId
    ? totals.outgoingTransferSales - totals.incomingTransferPurchases
    : 0;

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Stock Transfer Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        fromBranchId: query.fromBranchId || null,
        toBranchId: query.toBranchId || null,
        status: query.status || null,
        search: query.search || null,
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


const getCreditSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const createdAt = parseDateRange(query);
  const overdueOnly = parseBoolean(query.overdueOnly);
  const search = query.search ? String(query.search).trim() : "";

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(search
      ? {
          OR: [
            { creditCode: { contains: search, mode: "insensitive" } },
            { remarks: { contains: search, mode: "insensitive" } },
            { customer: { fullName: { contains: search, mode: "insensitive" } } },
            { sale: { receiptCode: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const accounts = await prisma.creditAccount.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { creditCode: "desc" }],
    select: {
      id: true,
      creditCode: true,
      status: true,
      term: true,
      termBasis: true,
      cashPromoTotalAmount: true,
      regularPriceTotalAmount: true,
      downpaymentAmount: true,
      balanceAmount: true,
      monthlyDueAmount: true,
      totalCollected: true,
      remainingBalance: true,
      dueDay: true,
      firstDueDate: true,
      nextDueDate: true,
      paidAt: true,
      cancelledAt: true,
      createdAt: true,
      branch: { select: { id: true, code: true, name: true } },
      customer: { select: { id: true, customerCode: true, fullName: true, mobileNumber: true } },
      sale: { select: { id: true, receiptCode: true, saleDate: true, status: true } },
      _count: { select: { collections: true } },
    },
  });

  const now = Date.now();
  const records = accounts.map((account) => {
    const dueAt = account.nextDueDate ? new Date(account.nextDueDate).getTime() : null;
    const isOverdue = account.status === "ACTIVE" && dueAt !== null && dueAt < now;
    const arInterestAmount = Math.max(0, toNumber(account.regularPriceTotalAmount) - (toNumber(account.cashPromoTotalAmount) || 0));
    const badDebtLoss = account.status === "DEFAULTED" ? toNumber(account.remainingBalance) : 0;
    return {
      ...account,
      termBasis: toNumber(account.termBasis),
      cashPromoTotalAmount: toNumber(account.cashPromoTotalAmount),
      regularPriceTotalAmount: toNumber(account.regularPriceTotalAmount),
      arInterestAmount,
      badDebtLoss,
      downpaymentAmount: toNumber(account.downpaymentAmount),
      balanceAmount: toNumber(account.balanceAmount),
      monthlyDueAmount: toNumber(account.monthlyDueAmount),
      totalCollected: toNumber(account.totalCollected),
      remainingBalance: toNumber(account.remainingBalance),
      collectionCount: account._count.collections,
      isOverdue,
      _count: undefined,
    };
  }).filter((account) => overdueOnly !== true || account.isOverdue);

  const totals = records.reduce((summary, account) => {
    summary.totalAccounts += 1;
    summary.totalCashPrincipal += account.cashPromoTotalAmount;
    summary.totalArInterest += account.arInterestAmount;
    summary.totalRegularPrice += account.regularPriceTotalAmount;
    summary.totalBalance += account.balanceAmount;
    summary.totalCollected += account.totalCollected;
    summary.totalRemaining += account.remainingBalance;
    summary.totalBadDebtLoss += account.badDebtLoss;
    summary.statusCounts[account.status] = (summary.statusCounts[account.status] || 0) + 1;
    if (account.status === "DEFAULTED") {
      summary.defaultedAccounts += 1;
    }
    if (account.isOverdue) {
      summary.overdueAccounts += 1;
      summary.overdueBalance += account.remainingBalance;
    }
    return summary;
  }, {
    totalAccounts: 0,
    totalCashPrincipal: 0,
    totalArInterest: 0,
    totalRegularPrice: 0,
    totalBalance: 0,
    totalCollected: 0,
    totalRemaining: 0,
    totalBadDebtLoss: 0,
    defaultedAccounts: 0,
    overdueAccounts: 0,
    overdueBalance: 0,
    statusCounts: {},
  });

  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;
  return {
    report: {
      name: "Credit and Installment Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        status: query.status || null,
        customerId: query.customerId || null,
        search: search || null,
        overdueOnly: overdueOnly === undefined ? null : overdueOnly,
        dateFrom: query.dateFrom || null,
        dateTo: query.dateTo || null,
      },
      totals,
    },
    records: records.slice(skip, skip + limit),
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

const getStaffPerformanceSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const activityDate = parseDateRange(query);
  const search = query.search ? String(query.search).trim() : "";

  const users = await prisma.user.findMany({
    where: {
      username: { not: "calix" },
      ...(branchId ? { branchId } : {}),
      ...(query.staffId ? { id: query.staffId } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { employeeCode: { contains: search, mode: "insensitive" } },
              { username: { contains: search, mode: "insensitive" } },
              { fullName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      employeeCode: true,
      username: true,
      fullName: true,
      role: true,
      status: true,
      incentiveClassification: true,
      branch: { select: { id: true, code: true, name: true } },
      cashierSales: {
        where: activityDate ? { saleDate: activityDate } : undefined,
        select: {
          id: true,
          receiptCode: true,
          saleDate: true,
          customer: { select: { fullName: true } },
          status: true,
          grandTotal: true,
          payments: { select: { paymentMethod: true } },
          items: { select: { itemId: true, description: true, quantity: true, lineTotal: true, priceTier: true } },
          returnRequests: {
            where: { status: "COMPLETED" },
            select: {
              totalRefundAmount: true,
              items: { select: { lineRefundAmount: true } },
            },
          },
        },
      },
      assignedServiceJobs: {
        where: activityDate ? { receivedAt: activityDate } : undefined,
        select: {
          id: true,
          jobCode: true,
          receivedAt: true,
          customer: { select: { fullName: true } },
          deviceDescription: true,
          problemDescription: true,
          status: true,
          repairType: true,
          finalServiceCharge: true,
          repairCostPercentSnapshot: true,
          companySharePercentSnapshot: true,
          repairCostPoolAmountSnapshot: true,
          companyShareAmountSnapshot: true,
          repairIncentiveAmountSnapshot: true,
          releasedAt: true,
          releaseOutcome: true,
          payments: { select: { status: true } },
        },
      },
      preparedQuotations: {
        where: activityDate ? { createdAt: activityDate } : undefined,
        select: {
          id: true,
          quotationCode: true,
          createdAt: true,
          customer: { select: { fullName: true } },
          grandTotal: true,
          status: true,
        },
      },
      serviceDoneQuotations: {
        where: activityDate ? { createdAt: activityDate } : undefined,
        select: {
          id: true,
          quotationCode: true,
          createdAt: true,
          customer: { select: { fullName: true } },
          grandTotal: true,
          status: true,
        },
      },
      incentiveAccountConfigVersions: {
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      },
    },
  });

  const [incentiveSetting, itemProgramRules] = await Promise.all([
    prisma.businessSetting.findUnique({
      where: { scopeKey: "GLOBAL:incentive.rules" },
    }),
    prisma.incentiveProgramRuleVersion.findMany({
      where: { programType: "ITEM_SALE" },
      orderBy: { effectiveFrom: "desc" },
    }),
  ]);

  const eligibleTiersByBranch = new Map();
  for (const rule of itemProgramRules) {
    const key = rule.branchId || "GLOBAL";
    if (!eligibleTiersByBranch.has(key) && Array.isArray(rule.eligiblePriceTiers) && rule.eligiblePriceTiers.length > 0) {
      eligibleTiersByBranch.set(key, new Set(rule.eligiblePriceTiers.map(Number)));
    }
  }

  const soloSaleIncentivePercent =
    typeof incentiveSetting?.value?.defaultSoloSaleIncentivePercent === "number"
      ? incentiveSetting.value.defaultSoloSaleIncentivePercent
      : 1.0;
  const serviceIncentivePercent =
    typeof incentiveSetting?.value?.defaultServiceIncentivePercent === "number"
      ? incentiveSetting.value.defaultServiceIncentivePercent
      : 5.0;

  const records = users.map((staff) => {
    const revenueSales = staff.cashierSales.filter((sale) =>
      ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(sale.status)
    );
    const releasedServices = staff.assignedServiceJobs.filter(
      (job) => Boolean(job.releasedAt) || job.status === "COMPLETED"
    );

    const branchTierSet = eligibleTiersByBranch.get(staff.branch?.id) || eligibleTiersByBranch.get("GLOBAL") || null;

    const productRevenue = revenueSales.reduce((sum, sale) => {
      const grossProduct = sale.items
        .filter((item) => Boolean(item.itemId))
        .reduce((itemSum, item) => itemSum + toNumber(item.lineTotal), 0);
      const productRefunds = sale.returnRequests.reduce(
        (requestSum, request) => requestSum + request.items.reduce(
          (itemSum, item) => itemSum + toNumber(item.lineRefundAmount),
          0
        ),
        0
      );
      return sum + Math.max(grossProduct - productRefunds, 0);
    }, 0);

    const eligibleSoloRevenue = revenueSales.reduce((sum, sale) => {
      const grossEligible = sale.items
        .filter((item) => Boolean(item.itemId) && (!branchTierSet || branchTierSet.has(item.priceTier || 1)))
        .reduce((itemSum, item) => itemSum + toNumber(item.lineTotal), 0);
      const productRefunds = sale.returnRequests.reduce(
        (requestSum, request) => requestSum + request.items.reduce(
          (itemSum, item) => itemSum + toNumber(item.lineRefundAmount),
          0
        ),
        0
      );
      return sum + Math.max(grossEligible - productRefunds, 0);
    }, 0);

    const salesRevenue = revenueSales.reduce((sum, sale) => {
      const refunds = sale.returnRequests.reduce(
        (requestSum, request) => requestSum + toNumber(request.totalRefundAmount),
        0
      );
      return sum + Math.max(toNumber(sale.grandTotal) - refunds, 0);
    }, 0);

    const userConfig = staff.incentiveAccountConfigVersions?.[0];
    const soloIncentivePercent = userConfig
      ? userConfig.soloSaleEnabled && userConfig.soloSaleRatePercent !== null
        ? toNumber(userConfig.soloSaleRatePercent)
        : 0
      : soloSaleIncentivePercent;

    const itemIncentivePercent = userConfig
      ? userConfig.itemEnabled && userConfig.itemRatePercent !== null
        ? toNumber(userConfig.itemRatePercent)
        : 0
      : 0;

    const techServiceIncentivePercent = userConfig
      ? userConfig.ordinaryRepairEnabled && userConfig.ordinaryRepairRatePercent !== null
        ? toNumber(userConfig.ordinaryRepairRatePercent)
        : 0
      : serviceIncentivePercent;

    const boardIncentivePercent = userConfig
      ? userConfig.boardRepairEnabled && userConfig.boardRepairRatePercent !== null
        ? toNumber(userConfig.boardRepairRatePercent)
        : 0
      : 0;

    const pcBuildIncentivePercent = userConfig
      ? userConfig.pcBuildEnabled && userConfig.pcBuildRatePercent !== null
        ? toNumber(userConfig.pcBuildRatePercent)
        : 0
      : 0;

    const soloIncentiveAmount = Math.round(((eligibleSoloRevenue * soloIncentivePercent) / 100) * 100) / 100;

    let ordinaryServiceIncentiveTotal = 0;
    let boardServiceIncentiveTotal = 0;
    let serviceRevenue = 0;

    for (const job of releasedServices) {
      const isPaid = job.payments?.some((p) => p.status === "POSTED");
      const charge = isPaid ? toNumber(job.finalServiceCharge) : 0;
      serviceRevenue += charge;

      if (charge > 0) {
        if (job.repairIncentiveAmountSnapshot !== null && job.repairIncentiveAmountSnapshot !== undefined) {
          const snapAmount = toNumber(job.repairIncentiveAmountSnapshot);
          if (job.repairType === "BOARD_LEVEL_REPAIR") {
            boardServiceIncentiveTotal += snapAmount;
          } else {
            ordinaryServiceIncentiveTotal += snapAmount;
          }
        } else {
          // If cost pool percent snapshot exists, base pool is derived from it; default is charge
          const poolRate = job.repairCostPercentSnapshot !== null && job.repairCostPercentSnapshot !== undefined
            ? toNumber(job.repairCostPercentSnapshot) / 100
            : 1.0;
          const costPoolAmount = charge * poolRate;

          if (job.repairType === "BOARD_LEVEL_REPAIR") {
            boardServiceIncentiveTotal += (costPoolAmount * boardIncentivePercent) / 100;
          } else {
            ordinaryServiceIncentiveTotal += (costPoolAmount * techServiceIncentivePercent) / 100;
          }
        }
      }
    }

    const serviceIncentiveAmount = Math.round((ordinaryServiceIncentiveTotal + boardServiceIncentiveTotal) * 100) / 100;
    const totalIncentiveAmount = Math.round((soloIncentiveAmount + serviceIncentiveAmount) * 100) / 100;

    return {
      id: staff.id,
      employeeCode: staff.employeeCode,
      username: staff.username,
      fullName: staff.fullName,
      role: staff.role,
      status: staff.status,
      incentiveClassification: staff.incentiveClassification,
      branch: staff.branch,
      completedSales: revenueSales.length,
      cancelledSales: staff.cashierSales.filter((sale) => sale.status === "CANCELLED").length,
      salesRevenue,
      productRevenue,
      eligibleSoloRevenue,
      itemIncentivePercent,
      soloIncentivePercent,
      soloIncentiveAmount,
      serviceIncentivePercent: techServiceIncentivePercent,
      serviceIncentiveAmount,
      boardIncentivePercent,
      pcBuildIncentivePercent,
      totalIncentiveAmount,
      incentiveConfig: userConfig ? {
        id: userConfig.id,
        soloSaleEnabled: Boolean(userConfig.soloSaleEnabled),
        soloSaleRatePercent: userConfig.soloSaleRatePercent !== null ? Number(userConfig.soloSaleRatePercent) : null,
        itemEnabled: Boolean(userConfig.itemEnabled),
        itemRatePercent: userConfig.itemRatePercent !== null ? Number(userConfig.itemRatePercent) : null,
        ordinaryRepairEnabled: Boolean(userConfig.ordinaryRepairEnabled),
        ordinaryRepairRatePercent: userConfig.ordinaryRepairRatePercent !== null ? Number(userConfig.ordinaryRepairRatePercent) : null,
        boardRepairEnabled: Boolean(userConfig.boardRepairEnabled),
        boardRepairRatePercent: userConfig.boardRepairRatePercent !== null ? Number(userConfig.boardRepairRatePercent) : null,
        pcBuildEnabled: Boolean(userConfig.pcBuildEnabled),
        pcBuildRatePercent: userConfig.pcBuildRatePercent !== null ? Number(userConfig.pcBuildRatePercent) : null,
        notes: userConfig.notes || "",
      } : null,
      completedServices: releasedServices.filter((job) => job.status === "COMPLETED").length,
      releasedServices: releasedServices.length,
      releasedUnrepairedServices: releasedServices.filter(
        (job) => job.status === "CANCELLED" && job.releaseOutcome
      ).length,
      activeServices: staff.assignedServiceJobs.filter((job) => ["PENDING", "IN_PROGRESS", "READY_FOR_RELEASE"].includes(job.status)).length,
      serviceRevenue,
      preparedQuotations: staff.preparedQuotations.length,
      convertedPreparedQuotations: staff.preparedQuotations.filter((quotation) => quotation.status === "CONVERTED").length,
      serviceAssignments: staff.serviceDoneQuotations.length,
      convertedServiceAssignments: staff.serviceDoneQuotations.filter((quotation) => quotation.status === "CONVERTED").length,
      totalAttributedRevenue: salesRevenue + serviceRevenue,
      recentSales: revenueSales.map((s) => ({
        id: s.id,
        saleCode: s.receiptCode,
        receiptCode: s.receiptCode,
        saleDate: s.saleDate,
        customerName: s.customer?.fullName || "Walk-in Customer",
        status: s.status,
        itemCount: s.items?.length || 0,
        paymentMethod: s.payments?.[0]?.paymentMethod ? String(s.payments[0].paymentMethod).replaceAll("_", " ") : "CASH",
        grandTotal: toNumber(s.grandTotal),
        commission: Math.round(((toNumber(s.grandTotal) * soloIncentivePercent) / 100) * 100) / 100,
      })),
      recentServices: releasedServices.map((j) => ({
        id: j.id,
        jobCode: j.jobCode,
        receivedAt: j.receivedAt,
        releasedAt: j.releasedAt,
        customerName: j.customer?.fullName || "Walk-in Customer",
        deviceDescription: j.deviceDescription || "Service Job",
        problemDescription: j.problemDescription || "Repair",
        status: j.status,
        releaseOutcome: j.releaseOutcome || "COMPLETED",
        finalServiceCharge: toNumber(j.finalServiceCharge),
        commission: Math.round(((toNumber(j.finalServiceCharge) * techServiceIncentivePercent) / 100) * 100) / 100,
      })),
      recentQuotations: staff.preparedQuotations.map((q) => ({
        id: q.id,
        quotationCode: q.quotationCode,
        createdAt: q.createdAt,
        customerName: q.customer?.fullName || "Walk-in Customer",
        status: q.status,
        grandTotal: toNumber(q.grandTotal),
      })),
    };
  }).sort((left, right) => right.totalAttributedRevenue - left.totalAttributedRevenue || left.fullName.localeCompare(right.fullName));

  const totals = records.reduce((summary, staff) => {
    summary.totalStaff += 1;
    summary.completedSales += staff.completedSales;
    summary.salesRevenue += staff.salesRevenue;
    summary.productRevenue += staff.productRevenue;
    summary.totalSoloIncentiveAmount += staff.soloIncentiveAmount;
    summary.totalServiceIncentiveAmount += staff.serviceIncentiveAmount;
    summary.totalIncentiveAmount += staff.totalIncentiveAmount;
    summary.completedServices += staff.completedServices;
    summary.releasedServices += staff.releasedServices;
    summary.releasedUnrepairedServices += staff.releasedUnrepairedServices;
    summary.serviceRevenue += staff.serviceRevenue;
    summary.preparedQuotations += staff.preparedQuotations;
    summary.serviceAssignments += staff.serviceAssignments;
    summary.totalAttributedRevenue += staff.totalAttributedRevenue;
    return summary;
  }, {
    totalStaff: 0,
    completedSales: 0,
    salesRevenue: 0,
    productRevenue: 0,
    totalSoloIncentiveAmount: 0,
    totalServiceIncentiveAmount: 0,
    totalIncentiveAmount: 0,
    completedServices: 0,
    releasedServices: 0,
    releasedUnrepairedServices: 0,
    serviceRevenue: 0,
    preparedQuotations: 0,
    serviceAssignments: 0,
    totalAttributedRevenue: 0,
  });

  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;
  return {
    report: {
      name: "Staff Performance Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        staffId: query.staffId || null,
        role: query.role || null,
        status: query.status || null,
        search: search || null,
        dateFrom: query.dateFrom || null,
        dateTo: query.dateTo || null,
      },
      totals,
    },
    records: records.slice(skip, skip + limit),
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

const buildLowStockAlerts = (items) => {
  return items
    .map((item) => {
      const quantityAvailable = item.inventoryBatches.reduce((sum, batch) => {
        return sum + toNumber(batch.quantityAvailable);
      }, 0);

      const minimumStock = toNumber(item.minimumStock);
      const reorderLevel = toNumber(item.reorderLevel);
      const alertLevel = reorderLevel > 0 ? reorderLevel : minimumStock;

      const isZeroStock = quantityAvailable === 0;
      const isLowStock = alertLevel > 0 && quantityAvailable <= alertLevel;

      if (!isZeroStock && !isLowStock) {
        return null;
      }

      return {
        id: item.id,
        type: isZeroStock ? "ZERO_STOCK" : "LOW_STOCK",
        severity: isZeroStock ? "HIGH" : "MEDIUM",
        message: isZeroStock
          ? `${item.itemName} has zero available stock`
          : `${item.itemName} is at or below alert stock level`,
        item: {
          id: item.id,
          itemCode: item.itemCode,
          itemName: item.itemName,
          status: item.status,
          minimumStock,
          reorderLevel,
          quantityAvailable,
        },
        branch: item.branch,
      };
    })
    .filter(Boolean);
};

const getAlertSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const limit = query.limit ? Number(query.limit) : 10;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10;

  const branchWhere = branchId ? { branchId } : {};

  const [
    inventoryItems,
    stockTransfers,
    warrantyClaims,
    purchaseOrders,
    purchaseReceivings,
    cashHandovers,
    overdueCreditAccounts,
  ] = await Promise.all([
    prisma.item.findMany({
      where: {
        ...branchWhere,
        status: "ACTIVE",
      },
      orderBy: {
        itemName: "asc",
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        status: true,
        minimumStock: true,
        reorderLevel: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        inventoryBatches: {
          where: {
            status: {
              in: ["ACTIVE", "DEPLETED"],
            },
          },
          select: {
            quantityAvailable: true,
            status: true,
          },
        },
      },
    }),

    prisma.stockTransfer.findMany({
      where: {
        ...(branchId
          ? {
              OR: [
                {
                  fromBranchId: branchId,
                },
                {
                  toBranchId: branchId,
                },
              ],
            }
          : {}),
        status: {
          in: ["DRAFT", "REQUESTED", "APPROVED"],
        },
      },
      orderBy: {
        transferDate: "desc",
      },
      take: safeLimit,
      select: {
        id: true,
        transferCode: true,
        status: true,
        transferDate: true,
        requestedAt: true,
        approvedAt: true,
        fromBranch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        toBranch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    }),

    prisma.warrantyClaim.findMany({
      where: {
        ...branchWhere,
        status: {
          in: ["IN", "CHECKING", "SENT_TO_SUPPLIER", "APPROVED", "REPAIRED", "REPLACED"],
        },
      },
      orderBy: {
        receivedAt: "desc",
      },
      take: safeLimit,
      select: {
        id: true,
        claimCode: true,
        status: true,
        issueDescription: true,
        receivedAt: true,
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
            fullName: true,
            mobileNumber: true,
          },
        },
        item: {
          select: {
            id: true,
            itemCode: true,
            itemName: true,
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
    }),

    prisma.purchaseOrder.findMany({
      where: {
        ...branchWhere,
        status: {
          in: ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"],
        },
      },
      orderBy: {
        orderDate: "desc",
      },
      take: safeLimit,
      select: {
        id: true,
        poCode: true,
        status: true,
        orderDate: true,
        expectedDate: true,
        supplierNameSnapshot: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        supplier: {
          select: {
            id: true,
            supplierCode: true,
            name: true,
          },
        },
      },
    }),

    prisma.purchaseReceiving.findMany({
      where: {
        ...branchWhere,
        status: "DRAFT",
      },
      orderBy: {
        receivingDate: "desc",
      },
      take: safeLimit,
      select: {
        id: true,
        receivingCode: true,
        status: true,
        receivingDate: true,
        supplierDeliveryNo: true,
        supplierInvoiceNo: true,
        supplierNameSnapshot: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        supplier: {
          select: {
            id: true,
            supplierCode: true,
            name: true,
          },
        },
        purchaseOrder: {
          select: {
            id: true,
            poCode: true,
            status: true,
          },
        },
      },
    }),

    prisma.cashHandover.findMany({
      where: {
        ...branchWhere,
        status: "PENDING",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: safeLimit,
      select: {
        id: true,
        handoverCode: true,
        status: true,
        amount: true,
        remarks: true,
        createdAt: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        cashBox: {
          select: {
            id: true,
            boxCode: true,
            name: true,
          },
        },
        fromUser: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        toUser: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
      },
    }),

    prisma.creditAccount.findMany({
      where: {
        ...branchWhere,
        status: "ACTIVE",
        remainingBalance: { gt: 0 },
        nextDueDate: { lt: new Date() },
      },
      orderBy: { nextDueDate: "asc" },
      select: {
        id: true,
        creditCode: true,
        status: true,
        term: true,
        monthlyDueAmount: true,
        remainingBalance: true,
        nextDueDate: true,
        branch: { select: { id: true, code: true, name: true } },
        customer: { select: { id: true, customerCode: true, fullName: true, mobileNumber: true } },
        sale: { select: { id: true, receiptCode: true } },
      },
    }),
  ]);

  const lowStockAlerts = buildLowStockAlerts(inventoryItems);
  const limitedLowStockAlerts = lowStockAlerts.slice(0, safeLimit);

  const alertGroups = {
    inventory: {
      total: lowStockAlerts.length,
      zeroStock: lowStockAlerts.filter((alert) => alert.type === "ZERO_STOCK").length,
      lowStock: lowStockAlerts.filter((alert) => alert.type === "LOW_STOCK").length,
      records: limitedLowStockAlerts,
    },
    stockTransfers: {
      total: stockTransfers.length,
      requested: stockTransfers.filter((transfer) => transfer.status === "REQUESTED").length,
      approved: stockTransfers.filter((transfer) => transfer.status === "APPROVED").length,
      draft: stockTransfers.filter((transfer) => transfer.status === "DRAFT").length,
      records: stockTransfers,
    },
    warrantyClaims: {
      total: warrantyClaims.length,
      in: warrantyClaims.filter((claim) => claim.status === "IN").length,
      checking: warrantyClaims.filter((claim) => claim.status === "CHECKING").length,
      sentToSupplier: warrantyClaims.filter((claim) => claim.status === "SENT_TO_SUPPLIER").length,
      approved: warrantyClaims.filter((claim) => claim.status === "APPROVED").length,
      repaired: warrantyClaims.filter((claim) => claim.status === "REPAIRED").length,
      replaced: warrantyClaims.filter((claim) => claim.status === "REPLACED").length,
      records: warrantyClaims,
    },
    purchaseOrders: {
      total: purchaseOrders.length,
      draft: purchaseOrders.filter((order) => order.status === "DRAFT").length,
      ordered: purchaseOrders.filter((order) => order.status === "ORDERED").length,
      partiallyReceived: purchaseOrders.filter((order) => order.status === "PARTIALLY_RECEIVED").length,
      records: purchaseOrders,
    },
    purchaseReceivings: {
      total: purchaseReceivings.length,
      draft: purchaseReceivings.length,
      records: purchaseReceivings,
    },
    cashHandovers: {
      total: cashHandovers.length,
      pending: cashHandovers.length,
      records: cashHandovers.map((handover) => ({
        ...handover,
        amount: toNumber(handover.amount),
      })),
    },
    creditAccounts: {
      total: overdueCreditAccounts.length,
      overdue: overdueCreditAccounts.length,
      totalOverdueBalance: overdueCreditAccounts.reduce((sum, account) => sum + toNumber(account.remainingBalance), 0),
      records: overdueCreditAccounts.slice(0, safeLimit).map((account) => ({
        ...account,
        monthlyDueAmount: toNumber(account.monthlyDueAmount),
        remainingBalance: toNumber(account.remainingBalance),
      })),
    },
  };

  const totalAlerts = Object.values(alertGroups).reduce((sum, group) => {
    return sum + group.total;
  }, 0);

  return {
    report: {
      name: "Alert Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        limit: safeLimit,
      },
      totals: {
        totalAlerts,
        inventoryAlerts: alertGroups.inventory.total,
        stockTransferAlerts: alertGroups.stockTransfers.total,
        warrantyAlerts: alertGroups.warrantyClaims.total,
        purchaseOrderAlerts: alertGroups.purchaseOrders.total,
        purchaseReceivingAlerts: alertGroups.purchaseReceivings.total,
        cashHandoverAlerts: alertGroups.cashHandovers.total,
        overdueCreditAlerts: alertGroups.creditAccounts.total,
      },
    },
    alerts: alertGroups,
  };
};

const getShrinkageSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const search = query.search ? String(query.search).trim() : "";
  const dateRange = parseDateRange(query);
  const { page, limit, skip } = parsePagination(query);

  const where = {
    type: "ADJUSTMENT_OUT",
    ...(branchId ? { branchId } : {}),
    ...(dateRange ? { movementDate: dateRange } : {}),
    ...(search
      ? {
          OR: [
            { movementCode: { contains: search, mode: "insensitive" } },
            { referenceNo: { contains: search, mode: "insensitive" } },
            { remarks: { contains: search, mode: "insensitive" } },
            {
              item: {
                OR: [
                  { itemCode: { contains: search, mode: "insensitive" } },
                  { itemName: { contains: search, mode: "insensitive" } },
                  { brand: { contains: search, mode: "insensitive" } },
                  { modelName: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [totalItems, movements, allLossMovements] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      select: {
        id: true,
        movementCode: true,
        type: true,
        source: true,
        quantity: true,
        unitCost: true,
        referenceNo: true,
        remarks: true,
        movementDate: true,
        branch: { select: { id: true, code: true, name: true } },
        item: {
          select: {
            id: true,
            itemCode: true,
            itemName: true,
            brand: true,
            modelName: true,
            unit: { select: { id: true, unitCode: true, name: true } },
            category: { select: { id: true, name: true } },
          },
        },
        serial: { select: { id: true, serialNumber: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { movementDate: "desc" },
      skip,
      take: limit,
    }),
    prisma.inventoryMovement.findMany({
      where,
      select: {
        quantity: true,
        unitCost: true,
      },
    }),
  ]);

  const totalLossValue = allLossMovements.reduce((sum, m) => {
    return sum + (Number(m.quantity || 0) * Number(m.unitCost || 0));
  }, 0);

  const totalUnitsLost = allLossMovements.reduce((sum, m) => {
    return sum + Number(m.quantity || 0);
  }, 0);

  const records = movements.map((m) => {
    const qty = Number(m.quantity || 0);
    const cost = Number(m.unitCost || 0);
    const totalLoss = qty * cost;
    const unitLabel = m.item?.unit?.name || m.item?.unit?.unitCode || (typeof m.item?.unit === "string" ? m.item.unit : "PCS");
    return {
      id: m.id,
      movementCode: m.movementCode,
      date: m.movementDate,
      itemCode: m.item?.itemCode,
      itemName: m.item?.itemName,
      product: `${m.item?.brand || ""} ${m.item?.itemName || ""} ${m.item?.modelName || ""}`.trim(),
      category: m.item?.category?.name || "General",
      serialNumber: m.serial?.serialNumber || "—",
      quantity: qty,
      unit: unitLabel,
      unitCost: cost,
      totalLossMoney: totalLoss,
      reason: m.remarks || m.referenceNo || "Inventory write-off / shrinkage",
      adjustedBy: m.createdBy?.fullName || "System Admin",
      branch: m.branch,
    };
  });

  const totals = {
    totalLossValue,
    totalUnitsLost,
    totalEvents: totalItems,
  };

  return {
    report: {
      name: "Inventory Shrinkage & Loss Value Summary",
      generatedAt: new Date().toISOString(),
      totals,
      ...totals,
    },
    records,
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit) || 1,
      hasPreviousPage: page > 1,
      hasNextPage: page < (Math.ceil(totalItems / limit) || 1),
    },
  };
};

module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
  getCashSummary,
  getSupplierSummary,
  getPurchaseOrderSummary,
  getPurchaseReceivingSummary,
  getStockTransferSummary,
  getCreditSummary,
  getStaffPerformanceSummary,
  getAlertSummary,
  getShrinkageSummary,
};
