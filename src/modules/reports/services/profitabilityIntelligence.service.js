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

// REPORT 06, 12, 13, 14: Product Profitability, Markup Analysis, Cost & Legacy Audit
const getProductProfitabilityReport = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const dateFilter = parseDateRange(query);

  const saleWhere = {
    status: { not: "CANCELLED" },
  };

  if (branchId) saleWhere.branchId = branchId;
  if (dateFilter) saleWhere.saleDate = dateFilter;

  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: saleWhere,
    },
    include: {
      item: {
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          category: true,
        },
      },
      sale: {
        select: {
          receiptCode: true,
          saleDate: true,
          branch: { select: { code: true } },
          cashier: { select: { fullName: true } },
        },
      },
    },
  });

  const productMap = {};
  let totalLegacyLines = 0;
  let totalLegacySales = 0;

  for (const line of saleItems) {
    const itemCode = line.itemCodeSnapshot || line.item?.itemCode || "CUSTOM_ITEM";
    const itemName = line.itemNameSnapshot || line.item?.itemName || line.description;
    const category = line.item?.category || "General";
    const qty = Number(line.quantity || 1);
    const unitPrice = Number(line.unitPrice || 0);
    const baseSrp = Number(line.baseUnitPriceSnapshot || unitPrice);
    const markupUnit = Math.max(0, unitPrice - baseSrp);
    const unitCost = line.acquisitionUnitCostSnapshot ? Number(line.acquisitionUnitCostSnapshot) : null;
    const opCost = line.operationalUnitCostSnapshot ? Number(line.operationalUnitCostSnapshot) : 0;

    const isLegacy = unitCost === null;
    if (isLegacy) {
      totalLegacyLines += 1;
      totalLegacySales += Number(line.lineTotal || unitPrice * qty);
    }

    const effectiveCost = unitCost !== null ? unitCost : opCost;

    if (!productMap[itemCode]) {
      productMap[itemCode] = {
        itemCode,
        itemName,
        category,
        quantitySold: 0,
        unitCost: effectiveCost,
        baseSrp,
        actualSellingPrice: unitPrice,
        totalCost: 0,
        totalBaseSales: 0,
        totalActualSales: 0,
        totalMarkup: 0,
        totalPureTubo: 0,
        totalTuboWithMarkup: 0,
        isLegacy,
      };
    }

    const entry = productMap[itemCode];
    entry.quantitySold += qty;
    entry.totalCost += effectiveCost * qty;
    entry.totalBaseSales += baseSrp * qty;
    entry.totalActualSales += unitPrice * qty;
    entry.totalMarkup += markupUnit * qty;

    const pureTuboLine = (baseSrp - effectiveCost) * qty;
    const tuboWithMarkupLine = (unitPrice - effectiveCost) * qty;

    entry.totalPureTubo += pureTuboLine;
    entry.totalTuboWithMarkup += tuboWithMarkupLine;
  }

  let records = Object.values(productMap);

  if (query.category) {
    records = records.filter((r) => r.category.toLowerCase().includes(query.category.toLowerCase()));
  }

  if (query.search) {
    const s = query.search.toLowerCase();
    records = records.filter((r) => r.itemCode.toLowerCase().includes(s) || r.itemName.toLowerCase().includes(s));
  }

  records.sort((a, b) => b.totalActualSales - a.totalActualSales);

  const totalCostAll = records.reduce((s, r) => s + r.totalCost, 0);
  const totalBaseSalesAll = records.reduce((s, r) => s + r.totalBaseSales, 0);
  const totalActualSalesAll = records.reduce((s, r) => s + r.totalActualSales, 0);
  const totalMarkupAll = records.reduce((s, r) => s + r.totalMarkup, 0);
  const totalPureTuboAll = records.reduce((s, r) => s + r.totalPureTubo, 0);
  const totalTuboWithMarkupAll = records.reduce((s, r) => s + r.totalTuboWithMarkup, 0);

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Number(query.limit) || 50, 200);
  const paginatedRecords = records.slice((page - 1) * limit, page * limit);

  return {
    records: paginatedRecords.map((r) => ({
      ...r,
      marginPercent: r.totalActualSales > 0 ? (r.totalTuboWithMarkup / r.totalActualSales) * 100 : 0,
      markupPercent: r.totalBaseSales > 0 ? (r.totalMarkup / r.totalBaseSales) * 100 : 0,
    })),
    summary: {
      totalProducts: records.length,
      totalQuantitySold: records.reduce((s, r) => s + r.quantitySold, 0),
      totalPuhunan: totalCostAll,
      totalBaseSales: totalBaseSalesAll,
      totalActualSales: totalActualSalesAll,
      totalMarkup: totalMarkupAll,
      totalPureTubo: totalPureTuboAll,
      totalTuboWithMarkup: totalTuboWithMarkupAll,
      overallMarginPercent: totalActualSalesAll > 0 ? (totalTuboWithMarkupAll / totalActualSalesAll) * 100 : 0,
      overallMarkupPercent: totalBaseSalesAll > 0 ? (totalMarkupAll / totalBaseSalesAll) * 100 : 0,
      legacyDataAudit: {
        legacyLinesCount: totalLegacyLines,
        legacySalesVolume: totalLegacySales,
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

// REPORT 07: Service Profitability
const getServiceProfitabilityReport = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const dateFilter = parseDateRange(query);

  const where = {
    status: { in: ["COMPLETED", "READY_FOR_RELEASE"] },
  };

  if (branchId) where.branchId = branchId;
  if (dateFilter) where.receivedAt = dateFilter;

  const jobs = await prisma.serviceJob.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    include: {
      assignedTechnician: { select: { id: true, fullName: true } },
      tasks: true,
      parts: true,
    },
  });

  const records = jobs.map((job) => {
    const finalSellingPrice = Number(job.finalServiceCharge || 0);
    const laborCost = Number(job.actualLaborCost || 0);
    const partsCost = Number(job.actualPartsCost || 0);
    const operationalCost = laborCost + partsCost;
    const profit = Math.max(0, finalSellingPrice - operationalCost);

    return {
      id: job.id,
      jobCode: job.jobCode,
      receivedAt: job.receivedAt,
      customer: job.customerNameSnapshot || "Walk-in",
      serviceTitle: job.jobTitle,
      repairType: job.repairType,
      technician: job.assignedTechnician?.fullName || "Unassigned",
      laborCost,
      partsCost,
      operationalCost,
      sellingPrice: finalSellingPrice,
      markup: 0,
      profit,
      marginPercent: finalSellingPrice > 0 ? (profit / finalSellingPrice) * 100 : 0,
    };
  });

  const totalSellingPrice = records.reduce((s, r) => s + r.sellingPrice, 0);
  const totalOpsCost = records.reduce((s, r) => s + r.operationalCost, 0);
  const totalProfit = records.reduce((s, r) => s + r.profit, 0);

  return {
    records,
    summary: {
      totalJobs: records.length,
      totalSellingPrice,
      totalLaborCost: records.reduce((s, r) => s + r.laborCost, 0),
      totalPartsCost: records.reduce((s, r) => s + r.partsCost, 0),
      totalOperationalCost: totalOpsCost,
      totalServiceProfit: totalProfit,
      averageServiceMarginPercent: totalSellingPrice > 0 ? (totalProfit / totalSellingPrice) * 100 : 0,
    },
  };
};

// REPORT 08: Six-Layer Executive Profitability
const getSixLayerProfitability = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const dateFilter = parseDateRange(query);

  const saleWhere = { status: { not: "CANCELLED" } };
  if (branchId) saleWhere.branchId = branchId;
  if (dateFilter) saleWhere.saleDate = dateFilter;

  const saleItems = await prisma.saleItem.findMany({
    where: { sale: saleWhere },
    select: {
      quantity: true,
      unitPrice: true,
      baseUnitPriceSnapshot: true,
      acquisitionUnitCostSnapshot: true,
      operationalUnitCostSnapshot: true,
    },
  });

  let productCost = 0;
  let baseSales = 0;
  let productMarkup = 0;

  for (const it of saleItems) {
    const qty = Number(it.quantity || 1);
    const unitPrice = Number(it.unitPrice || 0);
    const baseSrp = Number(it.baseUnitPriceSnapshot || unitPrice);
    const unitCost = it.acquisitionUnitCostSnapshot
      ? Number(it.acquisitionUnitCostSnapshot)
      : Number(it.operationalUnitCostSnapshot || 0);

    productCost += unitCost * qty;
    baseSales += baseSrp * qty;
    productMarkup += Math.max(0, unitPrice - baseSrp) * qty;
  }

  // Service sales in period
  const serviceWhere = { status: { in: ["COMPLETED", "READY_FOR_RELEASE"] } };
  if (branchId) serviceWhere.branchId = branchId;
  if (dateFilter) serviceWhere.receivedAt = dateFilter;

  const services = await prisma.serviceJob.findMany({
    where: serviceWhere,
    select: {
      finalServiceCharge: true,
      actualLaborCost: true,
      actualPartsCost: true,
    },
  });

  let serviceSales = 0;
  let serviceCost = 0;
  for (const s of services) {
    serviceSales += Number(s.finalServiceCharge || 0);
    serviceCost += Number(s.actualLaborCost || 0) + Number(s.actualPartsCost || 0);
  }

  // Financing interest in period
  const creditWhere = { status: { not: "CANCELLED" } };
  if (branchId) creditWhere.branchId = branchId;
  if (dateFilter) creditWhere.createdAt = dateFilter;

  const credits = await prisma.creditAccount.findMany({
    where: creditWhere,
    select: {
      balanceAmount: true,
      cashPromoTotalAmount: true,
      regularPriceTotalAmount: true,
      downpaymentAmount: true,
    },
  });

  let financingInterest = 0;
  for (const c of credits) {
    const dp = Number(c.downpaymentAmount || 0);
    const bal = Number(c.balanceAmount || 0);
    const sourceTot = Number(c.cashPromoTotalAmount || c.regularPriceTotalAmount || bal);
    const principal = Math.max(0, sourceTot - dp);
    financingInterest += Math.max(0, bal - principal);
  }

  // Six-Layer Formulas:
  const totalPuhunan = productCost + serviceCost; // Layer A
  const pureBaseTubo = Math.max(0, (baseSales + serviceSales) - totalPuhunan); // Layer B
  const totalMarkup = productMarkup; // Layer C
  const tuboWithMarkup = Math.max(0, (baseSales + serviceSales + totalMarkup) - totalPuhunan); // Layer D
  const layerEInterest = financingInterest; // Layer E
  const overallTotalKita = (baseSales + serviceSales + totalMarkup + financingInterest) - totalPuhunan; // Layer F

  return {
    layers: {
      layerA: {
        label: "Layer A — Puhunan (Total Cost)",
        productCost,
        serviceCost,
        totalPuhunan,
        description: "Total Product Acquisition Cost plus Service Operational Cost",
      },
      layerB: {
        label: "Layer B — Base Sales & Pure Base Tubo",
        productBaseSales: baseSales,
        serviceBaseSales: serviceSales,
        totalBaseSales: baseSales + serviceSales,
        pureBaseTubo,
        description: "Pure trading profit: Base Sales minus Puhunan (no markup, no interest)",
      },
      layerC: {
        label: "Layer C — Mark-up Income",
        productMarkup,
        serviceMarkup: 0,
        totalMarkup,
        description: "Store mark-up additions over standard SRP",
      },
      layerD: {
        label: "Layer D — Tubo With Mark-up",
        tuboWithMarkup,
        marginWithMarkupPercent: (baseSales + serviceSales + totalMarkup) > 0 ? (tuboWithMarkup / (baseSales + serviceSales + totalMarkup)) * 100 : 0,
        description: "Merchandise profit: Base Sales + Mark-up minus Puhunan",
      },
      layerE: {
        label: "Layer E — Financing Interest Income",
        financingInterest: layerEInterest,
        description: "Installment interest yield generated from AR contracts",
      },
      layerF: {
        label: "Layer F — Overall Total Kita (Consolidated Profit)",
        overallTotalKita,
        consolidatedRevenue: baseSales + serviceSales + totalMarkup + financingInterest,
        netReturnOnCostPercent: totalPuhunan > 0 ? (overallTotalKita / totalPuhunan) * 100 : 0,
        description: "Consolidated enterprise earnings: Base Margin + Mark-up + Financing Interest",
      },
    },
  };
};

// REPORT 09: AR Profitability
const getArProfitabilityReport = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const dateFilter = parseDateRange(query);

  const where = {
    status: { not: "CANCELLED" },
    sale: { isNot: null },
  };

  if (branchId) where.branchId = branchId;
  if (dateFilter) where.createdAt = dateFilter;

  const accounts = await prisma.creditAccount.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { fullName: true } },
      sale: {
        include: {
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              baseUnitPriceSnapshot: true,
              acquisitionUnitCostSnapshot: true,
            },
          },
        },
      },
    },
  });

  const records = accounts.map((acc) => {
    const sale = acc.sale;
    let cost = 0;
    let base = 0;
    let markup = 0;

    for (const it of (sale?.items || [])) {
      const qty = Number(it.quantity || 1);
      const unitP = Number(it.unitPrice || 0);
      const baseP = Number(it.baseUnitPriceSnapshot || unitP);
      const c = Number(it.acquisitionUnitCostSnapshot || 0);

      cost += c * qty;
      base += baseP * qty;
      markup += Math.max(0, unitP - baseP) * qty;
    }

    const dp = Number(acc.downpaymentAmount || 0);
    const balance = Number(acc.balanceAmount || 0);
    const initialSourceTotal = Number(acc.cashPromoTotalAmount || acc.regularPriceTotalAmount || sale?.grandTotal || balance);
    const principal = Math.max(0, initialSourceTotal - dp);
    const interest = Math.max(0, balance - principal);

    const pureTubo = Math.max(0, base - cost);
    const tuboWithMarkup = Math.max(0, (base + markup) - cost);
    const overallKita = (base + markup + interest) - cost;

    return {
      creditCode: acc.creditCode,
      receiptCode: sale?.receiptCode || "—",
      customer: acc.customer?.fullName || "Walk-in",
      provider: acc.provider,
      term: acc.term,
      saleDate: sale?.saleDate || acc.createdAt,
      cost,
      baseSales: base,
      markup,
      pureTubo,
      tuboWithMarkup,
      principal,
      interest,
      overallKita,
    };
  });

  return {
    records,
    summary: {
      totalArSales: records.length,
      totalCost: records.reduce((s, r) => s + r.cost, 0),
      totalBaseSales: records.reduce((s, r) => s + r.baseSales, 0),
      totalMarkup: records.reduce((s, r) => s + r.markup, 0),
      totalPureTubo: records.reduce((s, r) => s + r.pureTubo, 0),
      totalInterest: records.reduce((s, r) => s + r.interest, 0),
      totalOverallKita: records.reduce((s, r) => s + r.overallKita, 0),
    },
  };
};

// REPORT 11: Payment Method Report
const getPaymentMethodReport = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const dateFilter = parseDateRange(query);

  const saleWhere = { status: { not: "CANCELLED" } };
  if (branchId) saleWhere.branchId = branchId;
  if (dateFilter) saleWhere.saleDate = dateFilter;

  const sales = await prisma.sale.findMany({
    where: saleWhere,
    include: {
      payments: true,
      creditAccount: true,
    },
  });

  const methods = {
    CASH: { method: "Cash", txCount: 0, grossAmount: 0, directCollected: 0, arGenerated: 0, outstanding: 0 },
    GCASH: { method: "GCash", txCount: 0, grossAmount: 0, directCollected: 0, arGenerated: 0, outstanding: 0 },
    BANK_TRANSFER: { method: "Bank Transfer", txCount: 0, grossAmount: 0, directCollected: 0, arGenerated: 0, outstanding: 0 },
    CREDIT_CARD: { method: "Credit Card (AR)", txCount: 0, grossAmount: 0, directCollected: 0, arGenerated: 0, outstanding: 0 },
    DEBIT_CARD: { method: "Debit Card (AR)", txCount: 0, grossAmount: 0, directCollected: 0, arGenerated: 0, outstanding: 0 },
    OTHER_FINANCING: { method: "Financing / Other", txCount: 0, grossAmount: 0, directCollected: 0, arGenerated: 0, outstanding: 0 },
  };

  for (const s of sales) {
    const gross = Number(s.grandTotal || 0);
    const cr = s.creditAccount;

    if (cr && cr.status !== "CANCELLED") {
      let mKey = "OTHER_FINANCING";
      if (cr.provider === "CREDIT_CARD") mKey = "CREDIT_CARD";
      else if (cr.provider === "DEBIT_CARD") mKey = "DEBIT_CARD";

      const row = methods[mKey];
      row.txCount += 1;
      row.grossAmount += gross;
      row.directCollected += Number(cr.downpaymentAmount || 0);
      row.arGenerated += Number(cr.balanceAmount || gross);
      row.outstanding += Number(cr.remainingBalance || 0);
    } else {
      const primaryPayment = s.payments[0]?.paymentMethod || "CASH";
      const key = methods[primaryPayment] ? primaryPayment : "CASH";
      const row = methods[key];
      row.txCount += 1;
      row.grossAmount += gross;
      row.directCollected += Number(s.amountPaid || gross);
    }
  }

  const records = Object.values(methods);

  return {
    records,
    summary: {
      totalGross: records.reduce((s, r) => s + r.grossAmount, 0),
      totalDirectCollected: records.reduce((s, r) => s + r.directCollected, 0),
      totalArGenerated: records.reduce((s, r) => s + r.arGenerated, 0),
      totalOutstanding: records.reduce((s, r) => s + r.outstanding, 0),
    },
  };
};

// REPORT 15: Branch Financial Comparison
const getBranchFinancialComparison = async (actor, query = {}) => {
  const branches = await prisma.branch.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true, name: true },
  });

  const dateFilter = parseDateRange(query);

  const results = [];

  for (const b of branches) {
    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          branchId: b.id,
          status: { not: "CANCELLED" },
          ...(dateFilter ? { saleDate: dateFilter } : {}),
        },
      },
      select: {
        quantity: true,
        unitPrice: true,
        baseUnitPriceSnapshot: true,
        acquisitionUnitCostSnapshot: true,
      },
    });

    let salesVol = 0;
    let baseVol = 0;
    let markupVol = 0;
    let costVol = 0;

    for (const it of saleItems) {
      const q = Number(it.quantity || 1);
      const p = Number(it.unitPrice || 0);
      const bP = Number(it.baseUnitPriceSnapshot || p);
      const c = Number(it.acquisitionUnitCostSnapshot || 0);

      salesVol += p * q;
      baseVol += bP * q;
      markupVol += Math.max(0, p - bP) * q;
      costVol += c * q;
    }

    const credits = await prisma.creditAccount.findMany({
      where: {
        branchId: b.id,
        status: { not: "CANCELLED" },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      select: {
        balanceAmount: true,
        cashPromoTotalAmount: true,
        downpaymentAmount: true,
        totalCollected: true,
        remainingBalance: true,
      },
    });

    let interestVol = 0;
    let arBalanceVol = 0;
    let arCollectedVol = 0;
    let arRemainingVol = 0;

    for (const c of credits) {
      const dp = Number(c.downpaymentAmount || 0);
      const bal = Number(c.balanceAmount || 0);
      const src = Number(c.cashPromoTotalAmount || bal);
      const princ = Math.max(0, src - dp);
      interestVol += Math.max(0, bal - princ);
      arBalanceVol += bal;
      arCollectedVol += Number(c.totalCollected || 0);
      arRemainingVol += Number(c.remainingBalance || 0);
    }

    const pureTubo = Math.max(0, baseVol - costVol);
    const overallKita = (baseVol + markupVol + interestVol) - costVol;

    results.push({
      branchId: b.id,
      branchCode: b.code,
      branchName: b.name,
      sales: salesVol,
      baseSales: baseVol,
      markup: markupVol,
      cost: costVol,
      pureTubo,
      interest: interestVol,
      arBalance: arBalanceVol,
      collections: arCollectedVol,
      outstanding: arRemainingVol,
      overallKita,
      marginPercent: salesVol > 0 ? (overallKita / salesVol) * 100 : 0,
    });
  }

  return {
    records: results,
    summary: {
      totalBranches: results.length,
      totalSales: results.reduce((s, r) => s + r.sales, 0),
      totalCost: results.reduce((s, r) => s + r.cost, 0),
      totalPureTubo: results.reduce((s, r) => s + r.pureTubo, 0),
      totalMarkup: results.reduce((s, r) => s + r.markup, 0),
      totalInterest: results.reduce((s, r) => s + r.interest, 0),
      totalOverallKita: results.reduce((s, r) => s + r.overallKita, 0),
      totalOutstandingAR: results.reduce((s, r) => s + r.outstanding, 0),
    },
  };
};

module.exports = {
  getProductProfitabilityReport,
  getServiceProfitabilityReport,
  getSixLayerProfitability,
  getArProfitabilityReport,
  getPaymentMethodReport,
  getBranchFinancialComparison,
};
