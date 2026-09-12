const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

const isSuperOwner = (actor) => actor && actor.role === "SUPER_OWNER";

const resolveBranchFilter = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
    return requestedBranchId || undefined;
  }

  if (!actor.branchId) {
    throw new AppError("User is not assigned to a branch", 400, "USER_BRANCH_REQUIRED");
  }

  if (requestedBranchId && requestedBranchId !== actor.branchId) {
    throw new AppError("You can only view reports for your assigned branch", 403, "BRANCH_ACCESS_DENIED");
  }

  return actor.branchId;
};

const parseDateRange = (query = {}) => {
  const dateFilter = {};

  if (query.dateFrom) {
    const dateFrom = new Date(query.dateFrom);
    if (!Number.isNaN(dateFrom.getTime())) {
      dateFrom.setHours(0, 0, 0, 0);
      dateFilter.gte = dateFrom;
    }
  }

  if (query.dateTo) {
    const dateTo = new Date(query.dateTo);
    if (!Number.isNaN(dateTo.getTime())) {
      dateTo.setHours(23, 59, 59, 999);
      dateFilter.lte = dateTo;
    }
  }

  return Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
};

// REPORT 01 & REPORT 16: Sales Settlement & Cash vs AR Comparison
const getSalesSettlementReport = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const dateFilter = parseDateRange(query);

  const where = {
    status: {
      not: "CANCELLED",
    },
  };

  if (branchId) where.branchId = branchId;
  if (dateFilter) where.saleDate = dateFilter;
  if (query.cashierId) where.cashierId = query.cashierId;
  if (query.customerId) where.customerId = query.customerId;

  const sales = await prisma.sale.findMany({
    where,
    orderBy: { saleDate: "desc" },
    include: {
      branch: { select: { id: true, code: true, name: true } },
      customer: { select: { id: true, fullName: true, mobileNumber: true } },
      cashier: { select: { id: true, fullName: true, username: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          baseUnitPriceSnapshot: true,
          lineTotal: true,
          item: { select: { id: true, itemCode: true, itemName: true, category: true } },
        },
      },
      payments: {
        select: {
          id: true,
          paymentMethod: true,
          amount: true,
          referenceNo: true,
          paidAt: true,
        },
      },
      creditAccount: {
        select: {
          id: true,
          creditCode: true,
          status: true,
          provider: true,
          term: true,
          cashPromoTotalAmount: true,
          regularPriceTotalAmount: true,
          downpaymentAmount: true,
          balanceAmount: true,
          totalCollected: true,
          remainingBalance: true,
        },
      },
    },
  });

  let totalGross = 0;
  let totalBase = 0;
  let totalMarkup = 0;
  let totalDownpayment = 0;
  let totalPrincipal = 0;
  let totalInterest = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;

  let cashSalesCount = 0;
  let cashSalesVolume = 0;
  let arSalesCount = 0;
  let arSalesVolume = 0;

  const records = [];

  for (const sale of sales) {
    const isAr = Boolean(sale.creditAccount && sale.creditAccount.status !== "CANCELLED");
    const settlementType = isAr ? "AR_FINANCING" : "GOOD_AS_CASH";

    if (query.settlementType && query.settlementType !== "ALL" && query.settlementType !== settlementType) {
      continue;
    }

    if (query.provider && sale.creditAccount?.provider !== query.provider) {
      continue;
    }

    if (query.term && sale.creditAccount?.term !== query.term) {
      continue;
    }

    const gross = Number(sale.grandTotal || 0);
    let base = 0;
    let markup = 0;

    for (const it of sale.items) {
      const qty = Number(it.quantity || 1);
      const unitP = Number(it.unitPrice || 0);
      const baseP = Number(it.baseUnitPriceSnapshot || unitP);
      base += baseP * qty;
      markup += Math.max(0, unitP - baseP) * qty;
    }

    let downpayment = 0;
    let principal = 0;
    let interest = 0;
    let collected = 0;
    let outstanding = 0;
    let downpaymentMethod = "NONE";

    if (isAr) {
      const cr = sale.creditAccount;
      downpayment = Number(cr.downpaymentAmount || 0);
      const initialTotal = Number(cr.cashPromoTotalAmount || cr.regularPriceTotalAmount || gross);
      principal = Math.max(0, initialTotal - downpayment);
      const balance = Number(cr.balanceAmount || 0);
      interest = Math.max(0, balance - principal);
      collected = Number(cr.totalCollected || 0) + downpayment;
      outstanding = Number(cr.remainingBalance || 0);

      const firstDpPayment = (sale.payments || []).find((p) => Number(p.amount) > 0 && p.paymentMethod !== "CREDIT");
      if (firstDpPayment) {
        downpaymentMethod = firstDpPayment.paymentMethod;
      } else if (downpayment > 0) {
        downpaymentMethod = "CASH";
      }

      arSalesCount += 1;
      arSalesVolume += gross;
    } else {
      collected = Number(sale.amountPaid || gross);
      cashSalesCount += 1;
      cashSalesVolume += gross;
      const primaryPayment = (sale.payments || [])[0];
      downpaymentMethod = primaryPayment?.paymentMethod || "CASH";
    }

    if (query.downpaymentMethod) {
      if (query.downpaymentMethod === "ZERO_DP" && downpayment > 0) continue;
      if (query.downpaymentMethod !== "ZERO_DP" && downpaymentMethod !== query.downpaymentMethod) continue;
    }

    totalGross += gross;
    totalBase += base;
    totalMarkup += markup;
    totalDownpayment += downpayment;
    totalPrincipal += principal;
    totalInterest += interest;
    totalCollected += collected;
    totalOutstanding += outstanding;

    records.push({
      saleId: sale.id,
      receiptCode: sale.receiptCode,
      date: sale.saleDate,
      customer: sale.customer?.fullName || "Walk-in",
      cashier: sale.cashier?.fullName || sale.cashier?.username || "—",
      branchCode: sale.branch?.code || "—",
      settlementType,
      primaryPaymentMethod: (sale.payments || [])[0]?.paymentMethod || (isAr ? "CREDIT" : "CASH"),
      downpaymentMethod,
      provider: sale.creditAccount?.provider || null,
      term: sale.creditAccount?.term || null,
      grossSales: gross,
      baseSales: base,
      markup,
      downpayment,
      financedPrincipal: principal,
      interest,
      collected,
      outstanding,
      itemCount: sale.items.length,
    });
  }

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Number(query.limit) || 50, 200);
  const paginatedRecords = records.slice((page - 1) * limit, page * limit);

  return {
    records: paginatedRecords,
    summary: {
      totalTransactions: records.length,
      grossSales: totalGross,
      baseSales: totalBase,
      totalMarkup,
      totalDownpayment,
      totalPrincipal,
      totalInterest,
      totalCollected,
      totalOutstandingAR: totalOutstanding,
      comparison: {
        goodAsCash: {
          count: cashSalesCount,
          volume: cashSalesVolume,
          sharePercent: totalGross > 0 ? (cashSalesVolume / totalGross) * 100 : 0,
        },
        arFinancing: {
          count: arSalesCount,
          volume: arSalesVolume,
          sharePercent: totalGross > 0 ? (arSalesVolume / totalGross) * 100 : 0,
        },
      },
    },
    meta: {
      page,
      limit,
      total: records.length,
      totalPages: Math.ceil(records.length / limit),
    },
  };
};

// REPORT 02: Accounts Receivable Aging Report
const getArAgingReport = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const now = new Date();

  const where = {
    status: { in: ["ACTIVE", "DEFAULTED"] },
    remainingBalance: { gt: 0 },
  };

  if (branchId) where.branchId = branchId;
  if (query.provider) where.provider = query.provider;
  if (query.term) where.term = query.term;
  if (query.customerId) where.customerId = query.customerId;

  const accounts = await prisma.creditAccount.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      branch: { select: { id: true, code: true, name: true } },
      customer: { select: { id: true, fullName: true, mobileNumber: true } },
      sale: { select: { id: true, receiptCode: true, saleDate: true, grandTotal: true } },
      serviceJob: { select: { id: true, jobCode: true, finalServiceCharge: true } },
    },
  });

  const buckets = {
    CURRENT: { label: "Current", count: 0, amount: 0, accounts: [] },
    DAYS_1_30: { label: "1–30 Days", count: 0, amount: 0, accounts: [] },
    DAYS_31_60: { label: "31–60 Days", count: 0, amount: 0, accounts: [] },
    DAYS_61_90: { label: "61–90 Days", count: 0, amount: 0, accounts: [] },
    DAYS_91_120: { label: "91–120 Days", count: 0, amount: 0, accounts: [] },
    DAYS_120_PLUS: { label: "120+ Days", count: 0, amount: 0, accounts: [] },
  };

  let totalOutstanding = 0;
  let totalPrincipal = 0;
  let totalCollected = 0;

  for (const account of accounts) {
    const remaining = Number(account.remainingBalance || 0);
    const balance = Number(account.balanceAmount || 0);
    const downpayment = Number(account.downpaymentAmount || 0);
    const initialSourceTotal = Number(account.cashPromoTotalAmount || account.regularPriceTotalAmount || balance);
    const principal = Math.max(0, initialSourceTotal - downpayment);
    const collected = Number(account.totalCollected || 0);

    let ageDays = 0;
    let bucketKey = "CURRENT";

    const dueDate = account.nextDueDate ? new Date(account.nextDueDate) : null;

    if (dueDate && dueDate.getTime() < now.getTime()) {
      ageDays = Math.max(1, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

      if (ageDays <= 30) bucketKey = "DAYS_1_30";
      else if (ageDays <= 60) bucketKey = "DAYS_31_60";
      else if (ageDays <= 90) bucketKey = "DAYS_61_90";
      else if (ageDays <= 120) bucketKey = "DAYS_91_120";
      else bucketKey = "DAYS_120_PLUS";
    } else {
      bucketKey = "CURRENT";
      const originDate = new Date(account.createdAt);
      ageDays = Math.max(0, Math.floor((now.getTime() - originDate.getTime()) / (1000 * 60 * 60 * 24)));
    }

    if (query.bucket && query.bucket !== "ALL" && query.bucket !== bucketKey) {
      continue;
    }

    buckets[bucketKey].count += 1;
    buckets[bucketKey].amount += remaining;

    totalOutstanding += remaining;
    totalPrincipal += principal;
    totalCollected += collected;

    const formattedAccount = {
      id: account.id,
      creditCode: account.creditCode,
      status: account.status,
      customer: account.customer?.fullName || "—",
      contactNo: account.customer?.mobileNumber || "—",
      provider: account.provider,
      term: account.term,
      referenceCode: account.sale?.receiptCode || account.serviceJob?.jobCode || "—",
      dateOpened: account.createdAt,
      nextDueDate: account.nextDueDate,
      principal,
      balance,
      collected,
      remaining,
      ageDays,
      bucket: bucketKey,
      bucketLabel: buckets[bucketKey].label,
    };

    buckets[bucketKey].accounts.push(formattedAccount);
  }

  const allFilteredAccounts = Object.values(buckets).flatMap((b) => b.accounts);

  return {
    buckets: {
      current: { count: buckets.CURRENT.count, amount: buckets.CURRENT.amount, label: buckets.CURRENT.label },
      days1to30: { count: buckets.DAYS_1_30.count, amount: buckets.DAYS_1_30.amount, label: buckets.DAYS_1_30.label },
      days31to60: { count: buckets.DAYS_31_60.count, amount: buckets.DAYS_31_60.amount, label: buckets.DAYS_31_60.label },
      days61to90: { count: buckets.DAYS_61_90.count, amount: buckets.DAYS_61_90.amount, label: buckets.DAYS_61_90.label },
      days91to120: { count: buckets.DAYS_91_120.count, amount: buckets.DAYS_91_120.amount, label: buckets.DAYS_91_120.label },
      days120Plus: { count: buckets.DAYS_120_PLUS.count, amount: buckets.DAYS_120_PLUS.amount, label: buckets.DAYS_120_PLUS.label },
    },
    summary: {
      totalAccounts: allFilteredAccounts.length,
      totalOutstanding,
      totalPrincipal,
      totalCollected,
      recoveryRatePercent: (totalPrincipal + totalCollected) > 0 ? (totalCollected / (totalPrincipal + totalCollected)) * 100 : 0,
    },
    records: allFilteredAccounts,
  };
};

// REPORT 03: Financing Provider Performance
const getProviderPerformanceReport = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const dateFilter = parseDateRange(query);

  const where = { status: { not: "CANCELLED" } };
  if (branchId) where.branchId = branchId;
  if (dateFilter) where.createdAt = dateFilter;

  const accounts = await prisma.creditAccount.findMany({
    where,
    include: {
      sale: { select: { grandTotal: true } },
    },
  });

  const providerMap = {};

  const ALL_PROVIDERS = [
    "HOMECREDIT",
    "SALMON",
    "SKYRO",
    "IN_HOUSE_INSTALLMENT",
    "CREDIT_CARD",
    "DEBIT_CARD",
    "OTHER_FINANCING",
  ];

  ALL_PROVIDERS.forEach((p) => {
    providerMap[p] = {
      provider: p,
      accountCount: 0,
      grossSales: 0,
      principal: 0,
      interest: 0,
      downpayment: 0,
      collected: 0,
      outstanding: 0,
    };
  });

  for (const acc of accounts) {
    const prov = acc.provider;
    if (!providerMap[prov]) {
      providerMap[prov] = {
        provider: prov,
        accountCount: 0,
        grossSales: 0,
        principal: 0,
        interest: 0,
        downpayment: 0,
        collected: 0,
        outstanding: 0,
      };
    }

    const downpayment = Number(acc.downpaymentAmount || 0);
    const balance = Number(acc.balanceAmount || 0);
    const initialSourceTotal = Number(acc.cashPromoTotalAmount || acc.regularPriceTotalAmount || acc.sale?.grandTotal || balance);
    const principal = Math.max(0, initialSourceTotal - downpayment);
    const interest = Math.max(0, balance - principal);
    const collected = Number(acc.totalCollected || 0);
    const outstanding = Number(acc.remainingBalance || 0);
    const gross = initialSourceTotal;

    const row = providerMap[prov];
    row.accountCount += 1;
    row.grossSales += gross;
    row.principal += principal;
    row.interest += interest;
    row.downpayment += downpayment;
    row.collected += collected;
    row.outstanding += outstanding;
  }

  const records = Object.values(providerMap).filter((r) => r.accountCount > 0 || !query.activeOnly);

  return {
    records,
    summary: {
      totalProviders: records.filter((r) => r.accountCount > 0).length,
      totalAccounts: records.reduce((s, r) => s + r.accountCount, 0),
      totalGrossSales: records.reduce((s, r) => s + r.grossSales, 0),
      totalPrincipal: records.reduce((s, r) => s + r.principal, 0),
      totalInterest: records.reduce((s, r) => s + r.interest, 0),
      totalDownpayment: records.reduce((s, r) => s + r.downpayment, 0),
      totalCollected: records.reduce((s, r) => s + r.collected, 0),
      totalOutstanding: records.reduce((s, r) => s + r.outstanding, 0),
    },
  };
};

// REPORT 04: Installment Term Analysis
const getTermAnalysisReport = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const dateFilter = parseDateRange(query);

  const where = { status: { not: "CANCELLED" } };
  if (branchId) where.branchId = branchId;
  if (dateFilter) where.createdAt = dateFilter;

  const accounts = await prisma.creditAccount.findMany({ where });

  const termMap = {};
  const ALL_TERMS = [
    "CASH_PROMO",
    "STRAIGHT",
    "MONTH_3",
    "MONTH_6",
    "MONTH_9",
    "MONTH_12",
    "MONTH_18",
    "MONTH_24",
  ];

  ALL_TERMS.forEach((t) => {
    termMap[t] = {
      term: t,
      accountCount: 0,
      sales: 0,
      principal: 0,
      interest: 0,
      downpayments: 0,
      collected: 0,
      outstanding: 0,
    };
  });

  for (const acc of accounts) {
    const t = acc.term || "STRAIGHT";
    if (!termMap[t]) {
      termMap[t] = {
        term: t,
        accountCount: 0,
        sales: 0,
        principal: 0,
        interest: 0,
        downpayments: 0,
        collected: 0,
        outstanding: 0,
      };
    }

    const dp = Number(acc.downpaymentAmount || 0);
    const balance = Number(acc.balanceAmount || 0);
    const initialSourceTotal = Number(acc.cashPromoTotalAmount || acc.regularPriceTotalAmount || balance);
    const principal = Math.max(0, initialSourceTotal - dp);
    const interest = Math.max(0, balance - principal);

    const row = termMap[t];
    row.accountCount += 1;
    row.sales += initialSourceTotal;
    row.principal += principal;
    row.interest += interest;
    row.downpayments += dp;
    row.collected += Number(acc.totalCollected || 0);
    row.outstanding += Number(acc.remainingBalance || 0);
  }

  const records = Object.values(termMap).map((row) => ({
    ...row,
    averageInterest: row.accountCount > 0 ? row.interest / row.accountCount : 0,
    effectiveYieldPercent: row.principal > 0 ? (row.interest / row.principal) * 100 : 0,
  }));

  return {
    records,
    summary: {
      totalAccounts: records.reduce((s, r) => s + r.accountCount, 0),
      totalSales: records.reduce((s, r) => s + r.sales, 0),
      totalPrincipal: records.reduce((s, r) => s + r.principal, 0),
      totalInterest: records.reduce((s, r) => s + r.interest, 0),
      totalDownpayments: records.reduce((s, r) => s + r.downpayments, 0),
      totalCollected: records.reduce((s, r) => s + r.collected, 0),
      totalOutstanding: records.reduce((s, r) => s + r.outstanding, 0),
    },
  };
};

// REPORT 05: Downpayment Analysis
const getDownpaymentAnalysisReport = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const dateFilter = parseDateRange(query);

  const where = { status: { not: "CANCELLED" } };
  if (branchId) where.branchId = branchId;
  if (dateFilter) where.createdAt = dateFilter;

  const accounts = await prisma.creditAccount.findMany({
    where,
    include: {
      sale: {
        include: {
          payments: {
            where: { paymentMethod: { not: "CREDIT" } },
          },
        },
      },
    },
  });

  const dpMethods = {
    CASH_DP: { method: "Cash Downpayment", accounts: 0, grossSales: 0, downpayment: 0, principal: 0, interest: 0, collected: 0, outstanding: 0 },
    GCASH_DP: { method: "GCash Downpayment", accounts: 0, grossSales: 0, downpayment: 0, principal: 0, interest: 0, collected: 0, outstanding: 0 },
    BANK_DP: { method: "Bank Transfer Downpayment", accounts: 0, grossSales: 0, downpayment: 0, principal: 0, interest: 0, collected: 0, outstanding: 0 },
    ZERO_DP: { method: "Zero Downpayment", accounts: 0, grossSales: 0, downpayment: 0, principal: 0, interest: 0, collected: 0, outstanding: 0 },
  };

  for (const acc of accounts) {
    const dp = Number(acc.downpaymentAmount || 0);
    const balance = Number(acc.balanceAmount || 0);
    const initialSourceTotal = Number(acc.cashPromoTotalAmount || acc.regularPriceTotalAmount || balance);
    const principal = Math.max(0, initialSourceTotal - dp);
    const interest = Math.max(0, balance - principal);

    let key = "ZERO_DP";
    if (dp > 0) {
      const pMethod = acc.sale?.payments?.[0]?.paymentMethod;
      if (pMethod === "GCASH") key = "GCASH_DP";
      else if (pMethod === "BANK_TRANSFER") key = "BANK_DP";
      else key = "CASH_DP";
    }

    const row = dpMethods[key];
    row.accounts += 1;
    row.grossSales += initialSourceTotal;
    row.downpayment += dp;
    row.principal += principal;
    row.interest += interest;
    row.collected += Number(acc.totalCollected || 0);
    row.outstanding += Number(acc.remainingBalance || 0);
  }

  const records = Object.values(dpMethods);

  return {
    records,
    summary: {
      totalAccounts: records.reduce((s, r) => s + r.accounts, 0),
      totalGrossSales: records.reduce((s, r) => s + r.grossSales, 0),
      totalDownpayment: records.reduce((s, r) => s + r.downpayment, 0),
      totalPrincipal: records.reduce((s, r) => s + r.principal, 0),
      totalInterest: records.reduce((s, r) => s + r.interest, 0),
      totalOutstanding: records.reduce((s, r) => s + r.outstanding, 0),
    },
  };
};

// REPORT 10: Collection Performance (Movement: Opening + New - Collected = Closing)
const getCollectionPerformanceReport = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const now = new Date();
  const dateFilter = parseDateRange(query);

  const startInclusive = dateFilter?.gte || new Date(now.getFullYear(), now.getMonth(), 1);
  const endInclusive = dateFilter?.lte || now;

  const baseWhere = { status: { not: "CANCELLED" } };
  if (branchId) baseWhere.branchId = branchId;

  // New AR originated in period
  const newArAccounts = await prisma.creditAccount.findMany({
    where: {
      ...baseWhere,
      createdAt: { gte: startInclusive, lte: endInclusive },
    },
    select: { balanceAmount: true },
  });
  const newArAmount = newArAccounts.reduce((sum, a) => sum + Number(a.balanceAmount || 0), 0);

  // Collections received in period
  const collectionsInPeriod = await prisma.creditCollection.findMany({
    where: {
      status: "POSTED",
      paidAt: { gte: startInclusive, lte: endInclusive },
      creditAccount: branchId ? { branchId } : undefined,
    },
    select: { amount: true },
  });
  const totalCollectedInPeriod = collectionsInPeriod.reduce((sum, c) => sum + Number(c.amount || 0), 0);

  // Current Outstanding closing AR
  const currentActiveAccounts = await prisma.creditAccount.findMany({
    where: {
      ...baseWhere,
      status: { in: ["ACTIVE", "DEFAULTED"] },
    },
    select: { remainingBalance: true },
  });
  const closingArAmount = currentActiveAccounts.reduce((sum, a) => sum + Number(a.remainingBalance || 0), 0);

  // Derived opening AR
  const openingArAmount = Math.max(0, closingArAmount + totalCollectedInPeriod - newArAmount);

  return {
    summary: {
      openingAR: openingArAmount,
      newAR: newArAmount,
      collections: totalCollectedInPeriod,
      closingAR: closingArAmount,
      collectionEfficiencyPercent: (openingArAmount + newArAmount) > 0 ? (totalCollectedInPeriod / (openingArAmount + newArAmount)) * 100 : 0,
    },
  };
};

// REPORT 19: Financing Interest Report
const getFinancingInterestReport = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const dateFilter = parseDateRange(query);

  const where = { status: { not: "CANCELLED" } };
  if (branchId) where.branchId = branchId;
  if (dateFilter) where.createdAt = dateFilter;

  const accounts = await prisma.creditAccount.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { fullName: true } },
    },
  });

  const records = accounts.map((acc) => {
    const dp = Number(acc.downpaymentAmount || 0);
    const balance = Number(acc.balanceAmount || 0);
    const initialSourceTotal = Number(acc.cashPromoTotalAmount || acc.regularPriceTotalAmount || balance);
    const principal = Math.max(0, initialSourceTotal - dp);
    const interest = Math.max(0, balance - principal);
    const interestRate = principal > 0 ? (interest / principal) * 100 : 0;

    return {
      creditCode: acc.creditCode,
      customer: acc.customer?.fullName || "—",
      provider: acc.provider,
      term: acc.term,
      termBasis: Number(acc.termBasis || 1).toFixed(4),
      principal,
      interest,
      interestRatePercent: interestRate,
      balance,
      collected: Number(acc.totalCollected || 0),
      outstanding: Number(acc.remainingBalance || 0),
      date: acc.createdAt,
    };
  });

  const totalPrincipal = records.reduce((s, r) => s + r.principal, 0);
  const totalInterest = records.reduce((s, r) => s + r.interest, 0);

  return {
    records,
    summary: {
      totalAccounts: records.length,
      totalPrincipal,
      totalInterest,
      averageInterestRatePercent: totalPrincipal > 0 ? (totalInterest / totalPrincipal) * 100 : 0,
      totalCollected: records.reduce((s, r) => s + r.collected, 0),
      totalOutstanding: records.reduce((s, r) => s + r.outstanding, 0),
    },
  };
};

// REPORT 20: Customer AR Statement
const getCustomerArStatement = async (actor, customerId, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      customerCode: true,
      fullName: true,
      mobileNumber: true,
      email: true,
      address: true,
      companyName: true,
    },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
  }

  const accounts = await prisma.creditAccount.findMany({
    where: {
      customerId,
      status: { not: "CANCELLED" },
      ...(branchId ? { branchId } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      branch: { select: { code: true, name: true } },
      sale: {
        select: {
          receiptCode: true,
          saleDate: true,
          items: {
            select: {
              id: true,
              description: true,
              quantity: true,
              unitPrice: true,
              lineTotal: true,
            },
          },
        },
      },
      collections: {
        where: { status: "POSTED" },
        orderBy: { paidAt: "asc" },
        include: {
          receivedBy: { select: { fullName: true } },
        },
      },
    },
  });

  let totalObligationAll = 0;
  let totalCollectedAll = 0;
  let totalRemainingAll = 0;

  const statementAccounts = accounts.map((acc) => {
    const dp = Number(acc.downpaymentAmount || 0);
    const balance = Number(acc.balanceAmount || 0);
    const initialSourceTotal = Number(acc.cashPromoTotalAmount || acc.regularPriceTotalAmount || balance);
    const principal = Math.max(0, initialSourceTotal - dp);
    const interest = Math.max(0, balance - principal);
    const totalObligation = balance;

    totalObligationAll += totalObligation;
    totalCollectedAll += Number(acc.totalCollected || 0);
    totalRemainingAll += Number(acc.remainingBalance || 0);

    let runningBalance = balance;
    const ledger = [];

    ledger.push({
      date: acc.createdAt,
      type: "CONTRACT_ORIGINATION",
      reference: acc.creditCode,
      description: `Installment contract opened (${acc.provider} - ${acc.term || "Straight"})`,
      debit: balance,
      credit: 0,
      runningBalance,
    });

    for (const col of acc.collections) {
      const colAmt = Number(col.amount || 0);
      runningBalance = Math.max(0, runningBalance - colAmt);

      ledger.push({
        date: col.paidAt,
        type: "PAYMENT_COLLECTION",
        reference: col.collectionCode || col.receiptNo || "COLLECTION",
        paymentMethod: col.paymentMethod,
        description: `Installment collection received by ${col.receivedBy?.fullName || "Cashier"}`,
        debit: 0,
        credit: colAmt,
        runningBalance,
      });
    }

    return {
      id: acc.id,
      creditCode: acc.creditCode,
      status: acc.status,
      branch: acc.branch?.name || "—",
      provider: acc.provider,
      term: acc.term,
      saleDate: acc.sale?.saleDate || acc.createdAt,
      receiptCode: acc.sale?.receiptCode || "—",
      items: acc.sale?.items || [],
      principal,
      downpayment: dp,
      interest,
      totalObligation,
      totalCollected: Number(acc.totalCollected || 0),
      remainingBalance: Number(acc.remainingBalance || 0),
      nextDueDate: acc.nextDueDate,
      ledger,
    };
  });

  return {
    customer,
    summary: {
      totalAccounts: statementAccounts.length,
      totalObligation: totalObligationAll,
      totalCollected: totalCollectedAll,
      totalRemainingBalance: totalRemainingAll,
    },
    accounts: statementAccounts,
  };
};

module.exports = {
  getSalesSettlementReport,
  getArAgingReport,
  getProviderPerformanceReport,
  getTermAnalysisReport,
  getDownpaymentAnalysisReport,
  getCollectionPerformanceReport,
  getFinancingInterestReport,
  getCustomerArStatement,
};
