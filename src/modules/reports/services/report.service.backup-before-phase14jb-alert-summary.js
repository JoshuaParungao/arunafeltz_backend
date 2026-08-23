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


const buildServiceSummaryRecord = (job) => {
  const paymentAmount = job.payment ? toNumber(job.payment.amount) : 0;

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
    branch: job.branch,
    customer: job.customer,
    assignedTechnician: job.assignedTechnician,
    estimatedServiceCharge: toNumber(job.estimatedServiceCharge),
    finalServiceCharge: toNumber(job.finalServiceCharge),
    isPaid: Boolean(job.payment),
    payment: job.payment
      ? {
          id: job.payment.id,
          paymentCode: job.payment.paymentCode,
          paymentMethod: job.payment.paymentMethod,
          status: job.payment.status,
          amount: paymentAmount,
          paidAt: job.payment.paidAt,
        }
      : null,
  };
};

const getServiceSummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const receivedAt = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.assignedTechnicianId
      ? { assignedTechnicianId: query.assignedTechnicianId }
      : {}),
    ...(receivedAt ? { receivedAt } : {}),
    ...(query.paymentMethod
      ? {
          payment: {
            paymentMethod: query.paymentMethod,
          },
        }
      : {}),
  };

  const allJobs = await prisma.serviceJob.findMany({
    where,
    orderBy: [
      {
        receivedAt: "desc",
      },
      {
        jobCode: "desc",
      },
    ],
    select: {
      id: true,
      jobCode: true,
      status: true,
      jobTitle: true,
      estimatedServiceCharge: true,
      finalServiceCharge: true,
      receivedAt: true,
      startedAt: true,
      readyAt: true,
      completedAt: true,
      cancelledAt: true,
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
      assignedTechnician: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      payment: {
        select: {
          id: true,
          paymentCode: true,
          paymentMethod: true,
          status: true,
          amount: true,
          paidAt: true,
        },
      },
    },
  });

  const records = allJobs.map(buildServiceSummaryRecord);

  const totals = records.reduce(
    (acc, job) => {
      acc.totalJobs += 1;
      acc.totalEstimatedServiceCharge += job.estimatedServiceCharge;
      acc.totalFinalServiceCharge += job.finalServiceCharge;

      if (job.isPaid) {
        acc.totalPaidJobs += 1;
        acc.totalPaidAmount += job.payment.amount;
        acc.paymentMethodTotals[job.payment.paymentMethod] =
          (acc.paymentMethodTotals[job.payment.paymentMethod] || 0) +
          job.payment.amount;
      } else {
        acc.totalUnpaidJobs += 1;
      }

      acc.statusCounts[job.status] = (acc.statusCounts[job.status] || 0) + 1;

      return acc;
    },
    {
      totalJobs: 0,
      totalEstimatedServiceCharge: 0,
      totalFinalServiceCharge: 0,
      totalPaidJobs: 0,
      totalUnpaidJobs: 0,
      totalPaidAmount: 0,
      statusCounts: {},
      paymentMethodTotals: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Service Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        status: query.status || null,
        paymentMethod: query.paymentMethod || null,
        assignedTechnicianId: query.assignedTechnicianId || null,
        customerId: query.customerId || null,
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


const buildStockTransferSummaryRecord = (transfer) => {
  const itemTotals = transfer.items.reduce(
    (acc, item) => {
      const serialCount = Array.isArray(item.serials) ? item.serials.length : 0;

      acc.totalLines += 1;
      acc.totalQuantity += toNumber(item.quantity);
      acc.totalSerials += serialCount;

      if (item.fromBatchId) {
        acc.totalWithBatch += 1;
      }

      return acc;
    },
    {
      totalLines: 0,
      totalQuantity: 0,
      totalSerials: 0,
      totalWithBatch: 0,
    }
  );

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
    ...itemTotals,
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
          item: {
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
          serials: {
            select: {
              id: true,
              serialNumberSnapshot: true,
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

  const records = allTransfers.map(buildStockTransferSummaryRecord);

  const totals = records.reduce(
    (acc, transfer) => {
      acc.totalTransfers += 1;
      acc.totalLines += transfer.totalLines;
      acc.totalQuantity += transfer.totalQuantity;
      acc.totalSerials += transfer.totalSerials;
      acc.totalWithBatch += transfer.totalWithBatch;

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
      statusCounts: {},
    }
  );

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
};
