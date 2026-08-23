const BUSINESS_TIME_ZONE = "Asia/Manila";

const RECEIVABLE_PROVIDERS = Object.freeze([
  "CREDIT_CARD",
  "DEBIT_CARD",
  "HOMECREDIT",
  "SALMON",
  "KYRO",
  "OTHER_FINANCING",
  "IN_HOUSE_INSTALLMENT",
]);

const SETTLED_PAYMENT_METHODS = new Set([
  "CASH",
  "GCASH",
  "BANK_TRANSFER",
  "CARD",
  "OTHER",
]);

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const addMoney = (left, right) => roundMoney(toNumber(left) + toNumber(right));

const multiplyMoney = (left, right) =>
  roundMoney(toNumber(left) * toNumber(right));

const dateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isWithinPeriod = (value, bounds) => {
  const date = dateValue(value);
  if (!date) return false;
  if (bounds.startInclusive && date < bounds.startInclusive) return false;
  return date < bounds.endExclusive;
};

const isBefore = (value, boundary) => {
  const date = dateValue(value);
  return Boolean(date && date < boundary);
};

const emptyRevenue = () => ({
  itemBaseSales: 0,
  customServiceBaseSales: 0,
  ordinaryRepairBaseSales: 0,
  boardLevelRepairBaseSales: 0,
  productMarkupSales: 0,
  customServiceMarkupSales: 0,
  jobOrderServiceMarkupSales: 0,
  legacyProductRevenueUnclassified: 0,
  legacyCustomServiceRevenueUnclassified: 0,
  legacyJobOrderRevenueUnclassified: 0,
  legacyServiceChargeUnclassified: 0,
});

const emptyCost = () => ({
  operationalCogs: 0,
  acquisitionCogs: 0,
  operationalCogsUnclassified: 0,
  acquisitionCogsUnclassified: 0,
});

const emptyRepairAllocation = () => ({
  ordinary: {
    repairCostPool: 0,
    companyShare: 0,
    technicianRepairFees: 0,
    repairIncentives: 0,
    remainingUnallocatedRepairCostPool: 0,
  },
  boardLevel: {
    repairCostPool: 0,
    companyShare: 0,
    technicianRepairFees: 0,
    repairIncentives: 0,
    remainingUnallocatedRepairCostPool: 0,
  },
});

const emptyCoverage = () => ({
  saleLineCount: 0,
  saleLinesWithBaseSnapshot: 0,
  legacySaleLinesWithoutBaseSnapshot: 0,
  productLineCount: 0,
  productLinesWithOperationalCostSnapshot: 0,
  productLinesWithoutOperationalCostSnapshot: 0,
  productLinesWithAcquisitionCostSnapshot: 0,
  productLinesWithoutAcquisitionCostSnapshot: 0,
  jobOrderRevenueCount: 0,
  jobOrdersWithFinancialSnapshot: 0,
  legacyJobOrdersWithoutFinancialSnapshot: 0,
  jobOrdersWithCompleteRepairAllocation: 0,
  jobOrdersWithIncompleteRepairAllocation: 0,
  undatedSaleCancellations: 0,
  undatedCompletedReturns: 0,
  cancelledReceivablesWithoutCancellationDate: 0,
  legacyProviderLikeDirectPayments: 0,
  ignoredCreditPlaceholderPayments: 0,
});

const sumRevenue = (revenue) =>
  Object.values(revenue).reduce((sum, amount) => addMoney(sum, amount), 0);

const classifiedRevenue = (revenue) =>
  addMoney(
    addMoney(
      addMoney(revenue.itemBaseSales, revenue.customServiceBaseSales),
      addMoney(revenue.ordinaryRepairBaseSales, revenue.boardLevelRepairBaseSales)
    ),
    addMoney(
      addMoney(revenue.productMarkupSales, revenue.customServiceMarkupSales),
      revenue.jobOrderServiceMarkupSales
    )
  );

const legacyRevenue = (revenue) =>
  addMoney(
    addMoney(
      revenue.legacyProductRevenueUnclassified,
      revenue.legacyCustomServiceRevenueUnclassified
    ),
    addMoney(
      revenue.legacyJobOrderRevenueUnclassified,
      revenue.legacyServiceChargeUnclassified
    )
  );

const calculateSaleBreakdown = (sale) => {
  const revenue = emptyRevenue();
  const cost = emptyCost();
  const coverage = emptyCoverage();
  let lineDiscountTotal = 0;

  for (const item of sale.items || []) {
    const quantity = toNumber(item.quantity);
    const grossLineAmount = multiplyMoney(item.unitPrice, quantity);
    const discountAmount = roundMoney(item.discountAmount);
    const isProduct = Boolean(item.itemId);

    coverage.saleLineCount += 1;
    lineDiscountTotal = addMoney(lineDiscountTotal, discountAmount);

    if (isProduct) coverage.productLineCount += 1;

    if (item.baseUnitPriceSnapshot === null || item.baseUnitPriceSnapshot === undefined) {
      coverage.legacySaleLinesWithoutBaseSnapshot += 1;
      const legacyKey = isProduct
        ? "legacyProductRevenueUnclassified"
        : "legacyCustomServiceRevenueUnclassified";
      revenue[legacyKey] = addMoney(revenue[legacyKey], grossLineAmount);
    } else {
      coverage.saleLinesWithBaseSnapshot += 1;
      const baseAmount = multiplyMoney(item.baseUnitPriceSnapshot, quantity);
      const markupAmount = roundMoney(grossLineAmount - baseAmount);
      const baseKey = isProduct ? "itemBaseSales" : "customServiceBaseSales";
      const markupKey = isProduct
        ? "productMarkupSales"
        : "customServiceMarkupSales";
      revenue[baseKey] = addMoney(revenue[baseKey], baseAmount);
      revenue[markupKey] = addMoney(revenue[markupKey], markupAmount);
    }

    if (!isProduct) continue;

    if (
      item.operationalUnitCostSnapshot === null ||
      item.operationalUnitCostSnapshot === undefined
    ) {
      coverage.productLinesWithoutOperationalCostSnapshot += 1;
    } else {
      coverage.productLinesWithOperationalCostSnapshot += 1;
      cost.operationalCogs = addMoney(
        cost.operationalCogs,
        multiplyMoney(item.operationalUnitCostSnapshot, quantity)
      );
    }

    if (
      item.acquisitionUnitCostSnapshot === null ||
      item.acquisitionUnitCostSnapshot === undefined
    ) {
      coverage.productLinesWithoutAcquisitionCostSnapshot += 1;
    } else {
      coverage.productLinesWithAcquisitionCostSnapshot += 1;
      cost.acquisitionCogs = addMoney(
        cost.acquisitionCogs,
        multiplyMoney(item.acquisitionUnitCostSnapshot, quantity)
      );
    }
  }

  revenue.legacyServiceChargeUnclassified = roundMoney(sale.serviceCharge);
  const storedDiscount = roundMoney(sale.totalDiscount);
  const calculatedNet = roundMoney(sumRevenue(revenue) - storedDiscount);
  const storedNet = roundMoney(sale.grandTotal);

  return {
    revenue,
    cost,
    coverage,
    storedDiscount,
    lineDiscountTotal,
    discountSnapshotDifference: roundMoney(storedDiscount - lineDiscountTotal),
    calculatedNet,
    storedNet,
    reconciliationDifference: roundMoney(storedNet - calculatedNet),
  };
};

const applyNumericObject = (target, source, sign = 1) => {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "number") {
      target[key] = addMoney(target[key], sign * value);
    }
  }
};

const applyCoverage = (target, source) => {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + toNumber(value);
  }
};

const makeEvent = ({
  id,
  eventType,
  eventDate,
  sourceType,
  sourceId,
  sourceCode,
  branch,
  revenueEffect = 0,
  cashEffect = 0,
  settlementEffect = 0,
  arCollectionEffect = 0,
  arOriginatedEffect = 0,
  details = {},
}) => ({
  id,
  eventType,
  eventDate: dateValue(eventDate),
  sourceType,
  sourceId,
  sourceCode,
  branch: branch || null,
  revenueEffect: roundMoney(revenueEffect),
  cashEffect: roundMoney(cashEffect),
  settlementEffect: roundMoney(settlementEffect),
  arCollectionEffect: roundMoney(arCollectionEffect),
  arOriginatedEffect: roundMoney(arOriginatedEffect),
  details,
});

const createInitialSummary = () => ({
  revenue: emptyRevenue(),
  costs: {
    grossOperationalCogs: 0,
    saleCancellationOperationalCogsReversal: 0,
    returnOperationalCogsReversal: 0,
    netOperationalCogs: 0,
    grossAcquisitionCogs: 0,
    saleCancellationAcquisitionCogsReversal: 0,
    returnAcquisitionCogsReversal: 0,
    netAcquisitionCogs: 0,
  },
  repairAllocation: emptyRepairAllocation(),
  adjustments: {
    exactDiscountsUnallocated: 0,
    discountReversalsFromSaleCancellation: 0,
    returnRefundsUnallocated: 0,
    saleCancellationRevenueReversals: 0,
    legacyUndatedCancellationAmountUnplaced: 0,
    revenueReconciliationDifference: 0,
    discountSnapshotDifference: 0,
  },
  settlements: {
    directSettlementsReceived: 0,
    directSettlementReversals: 0,
    arCollectionsReceived: 0,
    arCollectionReversals: 0,
    partialSettlementCount: 0,
    partialSettlementAmount: 0,
    customerRefundsAndReturns: 0,
    actualCash: {
      directCashTenderReceived: 0,
      arCashCollectionsReceived: 0,
      changeReturned: 0,
      directCashReversals: 0,
      arCashCollectionReversals: 0,
      cashRefundsAndReturns: 0,
    },
    byMethod: {},
  },
  coverage: emptyCoverage(),
  events: [],
});

const addMethodSettlement = (settlements, method, amount) => {
  const key = method || "UNSPECIFIED";
  settlements.byMethod[key] = addMoney(settlements.byMethod[key] || 0, amount);
};

const applySaleRevenueEvent = (summary, sale, breakdown, sign, eventType, eventDate) => {
  applyNumericObject(summary.revenue, breakdown.revenue, sign);
  if (sign > 0) {
    summary.costs.grossOperationalCogs = addMoney(
      summary.costs.grossOperationalCogs,
      breakdown.cost.operationalCogs
    );
    summary.costs.grossAcquisitionCogs = addMoney(
      summary.costs.grossAcquisitionCogs,
      breakdown.cost.acquisitionCogs
    );
    summary.adjustments.exactDiscountsUnallocated = addMoney(
      summary.adjustments.exactDiscountsUnallocated,
      breakdown.storedDiscount
    );
    applyCoverage(summary.coverage, breakdown.coverage);
  } else {
    summary.costs.saleCancellationOperationalCogsReversal = addMoney(
      summary.costs.saleCancellationOperationalCogsReversal,
      breakdown.cost.operationalCogs
    );
    summary.costs.saleCancellationAcquisitionCogsReversal = addMoney(
      summary.costs.saleCancellationAcquisitionCogsReversal,
      breakdown.cost.acquisitionCogs
    );
    summary.adjustments.discountReversalsFromSaleCancellation = addMoney(
      summary.adjustments.discountReversalsFromSaleCancellation,
      breakdown.storedDiscount
    );
    summary.adjustments.saleCancellationRevenueReversals = addMoney(
      summary.adjustments.saleCancellationRevenueReversals,
      breakdown.storedNet
    );
  }

  summary.adjustments.revenueReconciliationDifference = addMoney(
    summary.adjustments.revenueReconciliationDifference,
    sign * breakdown.reconciliationDifference
  );
  summary.adjustments.discountSnapshotDifference = addMoney(
    summary.adjustments.discountSnapshotDifference,
    sign * breakdown.discountSnapshotDifference
  );

  summary.events.push(
    makeEvent({
      id: `${eventType}:${sale.id}`,
      eventType,
      eventDate,
      sourceType: "SALE",
      sourceId: sale.id,
      sourceCode: sale.receiptCode,
      branch: sale.branch,
      revenueEffect: sign * breakdown.storedNet,
      details: {
        direction: sign > 0 ? "RECOGNITION" : "REVERSAL",
        quotationOrigin: sale.quotation || null,
        ...Object.fromEntries(
          Object.entries(breakdown.revenue).map(([key, value]) => [key, roundMoney(sign * value)])
        ),
        unresolvedDiscountEffect: roundMoney(-sign * breakdown.storedDiscount),
        operationalCogsEffect: roundMoney(sign * breakdown.cost.operationalCogs),
        acquisitionCogsEffect: roundMoney(sign * breakdown.cost.acquisitionCogs),
        reconciliationDifference: roundMoney(sign * breakdown.reconciliationDifference),
      },
    })
  );
};

const applySaleRevenue = (summary, sale, bounds) => {
  const breakdown = calculateSaleBreakdown(sale);
  const hasUndatedCancellation = sale.status === "CANCELLED" && !dateValue(sale.cancelledAt);

  if (isWithinPeriod(sale.saleDate, bounds)) {
    if (hasUndatedCancellation) {
      summary.coverage.undatedSaleCancellations += 1;
      summary.adjustments.legacyUndatedCancellationAmountUnplaced = addMoney(
        summary.adjustments.legacyUndatedCancellationAmountUnplaced,
        breakdown.storedNet
      );
      summary.events.push(
        makeEvent({
          id: `SALE_CANCELLED_UNDATED:${sale.id}`,
          eventType: "SALE_CANCELLED_UNDATED",
          eventDate: sale.saleDate,
          sourceType: "SALE",
          sourceId: sale.id,
          sourceCode: sale.receiptCode,
          branch: sale.branch,
          details: {
            amountNotPlacedOnTimeline: breakdown.storedNet,
            reason: "Historical cancellation has no cancellation timestamp",
            quotationOrigin: sale.quotation || null,
          },
        })
      );
    } else {
      applySaleRevenueEvent(summary, sale, breakdown, 1, "SALE_RECOGNIZED", sale.saleDate);
    }
  }

  if (dateValue(sale.cancelledAt) && isWithinPeriod(sale.cancelledAt, bounds)) {
    applySaleRevenueEvent(
      summary,
      sale,
      breakdown,
      -1,
      "SALE_CANCELLED",
      sale.cancelledAt
    );
  }

  const itemById = new Map((sale.items || []).map((item) => [item.id, item]));
  for (const request of sale.returnRequests || []) {
    if (request.status !== "COMPLETED") continue;
    if (!dateValue(request.completedAt)) {
      summary.coverage.undatedCompletedReturns += 1;
      continue;
    }
    if (!isWithinPeriod(request.completedAt, bounds)) continue;

    const refundAmount = roundMoney(request.totalRefundAmount);
    let operationalCostReversal = 0;
    let acquisitionCostReversal = 0;

    for (const returnItem of request.items || []) {
      const saleItem = itemById.get(returnItem.saleItemId);
      if (!saleItem?.itemId) continue;
      const quantity = toNumber(returnItem.quantity);
      if (
        saleItem.operationalUnitCostSnapshot !== null &&
        saleItem.operationalUnitCostSnapshot !== undefined
      ) {
        operationalCostReversal = addMoney(
          operationalCostReversal,
          multiplyMoney(saleItem.operationalUnitCostSnapshot, quantity)
        );
      }
      if (
        saleItem.acquisitionUnitCostSnapshot !== null &&
        saleItem.acquisitionUnitCostSnapshot !== undefined
      ) {
        acquisitionCostReversal = addMoney(
          acquisitionCostReversal,
          multiplyMoney(saleItem.acquisitionUnitCostSnapshot, quantity)
        );
      }
    }

    summary.adjustments.returnRefundsUnallocated = addMoney(
      summary.adjustments.returnRefundsUnallocated,
      refundAmount
    );
    summary.costs.returnOperationalCogsReversal = addMoney(
      summary.costs.returnOperationalCogsReversal,
      operationalCostReversal
    );
    summary.costs.returnAcquisitionCogsReversal = addMoney(
      summary.costs.returnAcquisitionCogsReversal,
      acquisitionCostReversal
    );

    if (SETTLED_PAYMENT_METHODS.has(request.refundMethod)) {
      summary.settlements.customerRefundsAndReturns = addMoney(
        summary.settlements.customerRefundsAndReturns,
        refundAmount
      );
      addMethodSettlement(summary.settlements, request.refundMethod, -refundAmount);
      if (request.refundMethod === "CASH") {
        summary.settlements.actualCash.cashRefundsAndReturns = addMoney(
          summary.settlements.actualCash.cashRefundsAndReturns,
          refundAmount
        );
      }
    }

    summary.events.push(
      makeEvent({
        id: `SALE_RETURN_COMPLETED:${request.id}`,
        eventType: "SALE_RETURN_COMPLETED",
        eventDate: request.completedAt,
        sourceType: "RETURN_REQUEST",
        sourceId: request.id,
        sourceCode: request.returnCode,
        branch: sale.branch,
        revenueEffect: -refundAmount,
        cashEffect: request.refundMethod === "CASH" ? -refundAmount : 0,
        settlementEffect: SETTLED_PAYMENT_METHODS.has(request.refundMethod)
          ? -refundAmount
          : 0,
        details: {
          saleId: sale.id,
          saleCode: sale.receiptCode,
          quotationOrigin: sale.quotation || null,
          refundMethod: request.refundMethod,
          refundAllocation: "UNRESOLVED_NOT_ALLOCATED",
          operationalCogsReversal: operationalCostReversal,
          acquisitionCogsReversal: acquisitionCostReversal,
        },
      })
    );
  }
};

const applySaleSettlements = (summary, sale, bounds) => {
  let settledPaymentTotal = 0;
  let cashPaymentTotal = 0;

  for (const payment of sale.payments || []) {
    const amount = roundMoney(payment.amount);
    if (payment.paymentMethod === "CREDIT") {
      summary.coverage.ignoredCreditPlaceholderPayments += 1;
      continue;
    }
    if (!SETTLED_PAYMENT_METHODS.has(payment.paymentMethod)) continue;

    settledPaymentTotal = addMoney(settledPaymentTotal, amount);
    if (payment.paymentMethod === "CASH") cashPaymentTotal = addMoney(cashPaymentTotal, amount);
    if (["CARD"].includes(payment.paymentMethod)) {
      summary.coverage.legacyProviderLikeDirectPayments += 1;
    }
    if (!isWithinPeriod(payment.paidAt, bounds)) continue;

    summary.settlements.directSettlementsReceived = addMoney(
      summary.settlements.directSettlementsReceived,
      amount
    );
    addMethodSettlement(summary.settlements, payment.paymentMethod, amount);
    if (payment.paymentMethod === "CASH") {
      summary.settlements.actualCash.directCashTenderReceived = addMoney(
        summary.settlements.actualCash.directCashTenderReceived,
        amount
      );
    }
    summary.events.push(
      makeEvent({
        id: `SALE_PAYMENT_RECEIVED:${payment.id}`,
        eventType: "SALE_PAYMENT_RECEIVED",
        eventDate: payment.paidAt,
        sourceType: "SALE_PAYMENT",
        sourceId: payment.id,
        sourceCode: sale.receiptCode,
        branch: sale.branch,
        cashEffect: payment.paymentMethod === "CASH" ? amount : 0,
        settlementEffect: amount,
        details: {
          saleId: sale.id,
          paymentMethod: payment.paymentMethod,
          quotationOrigin: sale.quotation || null,
        },
      })
    );
  }

  const changeAmount = roundMoney(sale.changeAmount);
  if (changeAmount > 0 && isWithinPeriod(sale.saleDate, bounds)) {
    summary.settlements.actualCash.changeReturned = addMoney(
      summary.settlements.actualCash.changeReturned,
      changeAmount
    );
    summary.settlements.directSettlementsReceived = addMoney(
      summary.settlements.directSettlementsReceived,
      -changeAmount
    );
    addMethodSettlement(summary.settlements, "CASH", -changeAmount);
    summary.events.push(
      makeEvent({
        id: `SALE_CHANGE_RETURNED:${sale.id}`,
        eventType: "SALE_CHANGE_RETURNED",
        eventDate: sale.saleDate,
        sourceType: "SALE",
        sourceId: sale.id,
        sourceCode: sale.receiptCode,
        branch: sale.branch,
        cashEffect: -changeAmount,
        settlementEffect: -changeAmount,
      })
    );
  }

  if (dateValue(sale.cancelledAt) && isWithinPeriod(sale.cancelledAt, bounds)) {
    const retainedSettlement = roundMoney(Math.max(settledPaymentTotal - changeAmount, 0));
    const retainedCash = roundMoney(Math.max(cashPaymentTotal - changeAmount, 0));
    summary.settlements.directSettlementReversals = addMoney(
      summary.settlements.directSettlementReversals,
      retainedSettlement
    );
    summary.settlements.actualCash.directCashReversals = addMoney(
      summary.settlements.actualCash.directCashReversals,
      retainedCash
    );
    for (const payment of sale.payments || []) {
      if (payment.paymentMethod !== "CREDIT" && SETTLED_PAYMENT_METHODS.has(payment.paymentMethod)) {
        addMethodSettlement(summary.settlements, payment.paymentMethod, -roundMoney(payment.amount));
      }
    }
    if (changeAmount > 0) addMethodSettlement(summary.settlements, "CASH", changeAmount);

    summary.events.push(
      makeEvent({
        id: `SALE_SETTLEMENT_REVERSED:${sale.id}`,
        eventType: "SALE_SETTLEMENT_REVERSED",
        eventDate: sale.cancelledAt,
        sourceType: "SALE",
        sourceId: sale.id,
        sourceCode: sale.receiptCode,
        branch: sale.branch,
        cashEffect: -retainedCash,
        settlementEffect: -retainedSettlement,
        details: {
          changePreviouslyReturned: changeAmount,
          quotationOrigin: sale.quotation || null,
        },
      })
    );
  }
};

const hasCompleteRepairAllocation = (job) =>
  [
    job.repairCostPoolAmountSnapshot,
    job.companyShareAmountSnapshot,
    job.repairFeeSnapshot,
    job.repairIncentiveAmountSnapshot,
    job.unallocatedRepairCostPoolSnapshot,
  ].every((value) => value !== null && value !== undefined);

const applyJobOrderRevenue = (summary, job, bounds) => {
  const snapshotDate = dateValue(job.financialSnapshotAt);
  const legacyEventDate = dateValue(job.releasedAt) || dateValue(job.completedAt);
  const eventDate = snapshotDate || legacyEventDate;
  if (!eventDate || !isWithinPeriod(eventDate, bounds)) return;

  const finalAmount = roundMoney(job.finalServiceCharge);
  if (finalAmount <= 0) return;
  summary.coverage.jobOrderRevenueCount += 1;

  if (!snapshotDate) {
    summary.coverage.legacyJobOrdersWithoutFinancialSnapshot += 1;
    summary.revenue.legacyJobOrderRevenueUnclassified = addMoney(
      summary.revenue.legacyJobOrderRevenueUnclassified,
      finalAmount
    );
    summary.events.push(
      makeEvent({
        id: `JO_REVENUE_LEGACY_UNCLASSIFIED:${job.id}`,
        eventType: "JO_REVENUE_LEGACY_UNCLASSIFIED",
        eventDate,
        sourceType: "SERVICE_JOB",
        sourceId: job.id,
        sourceCode: job.jobCode,
        branch: job.branch,
        revenueEffect: finalAmount,
        details: {
          repairType: job.repairType || null,
          releaseOutcome: job.releaseOutcome || null,
          reason: "No transaction-time financial snapshot",
        },
      })
    );
    return;
  }

  summary.coverage.jobOrdersWithFinancialSnapshot += 1;
  const baseIsSnapshotted =
    job.baseServiceCharge !== null && job.baseServiceCharge !== undefined;
  const markupIsSnapshotted =
    job.serviceMarkupAmount !== null && job.serviceMarkupAmount !== undefined;
  const baseAmount = baseIsSnapshotted ? roundMoney(job.baseServiceCharge) : 0;
  const markupAmount = markupIsSnapshotted ? roundMoney(job.serviceMarkupAmount) : 0;
  let classifiedBase = 0;
  let classifiedMarkup = 0;
  let legacyRemainder = finalAmount;

  if (
    baseIsSnapshotted &&
    ["ORDINARY_REPAIR", "BOARD_LEVEL_REPAIR"].includes(job.repairType)
  ) {
    const baseKey =
      job.repairType === "ORDINARY_REPAIR"
        ? "ordinaryRepairBaseSales"
        : "boardLevelRepairBaseSales";
    summary.revenue[baseKey] = addMoney(summary.revenue[baseKey], baseAmount);
    classifiedBase = baseAmount;
    legacyRemainder = roundMoney(legacyRemainder - baseAmount);
  }

  if (markupIsSnapshotted) {
    summary.revenue.jobOrderServiceMarkupSales = addMoney(
      summary.revenue.jobOrderServiceMarkupSales,
      markupAmount
    );
    classifiedMarkup = markupAmount;
    legacyRemainder = roundMoney(legacyRemainder - markupAmount);
  }

  if (legacyRemainder !== 0) {
    summary.revenue.legacyJobOrderRevenueUnclassified = addMoney(
      summary.revenue.legacyJobOrderRevenueUnclassified,
      legacyRemainder
    );
  }

  const completeAllocation = hasCompleteRepairAllocation(job);
  if (completeAllocation && ["ORDINARY_REPAIR", "BOARD_LEVEL_REPAIR"].includes(job.repairType)) {
    summary.coverage.jobOrdersWithCompleteRepairAllocation += 1;
    const allocation =
      job.repairType === "ORDINARY_REPAIR"
        ? summary.repairAllocation.ordinary
        : summary.repairAllocation.boardLevel;
    allocation.repairCostPool = addMoney(
      allocation.repairCostPool,
      job.repairCostPoolAmountSnapshot
    );
    allocation.companyShare = addMoney(
      allocation.companyShare,
      job.companyShareAmountSnapshot
    );
    allocation.technicianRepairFees = addMoney(
      allocation.technicianRepairFees,
      job.repairFeeSnapshot
    );
    allocation.repairIncentives = addMoney(
      allocation.repairIncentives,
      job.repairIncentiveAmountSnapshot
    );
    allocation.remainingUnallocatedRepairCostPool = addMoney(
      allocation.remainingUnallocatedRepairCostPool,
      job.unallocatedRepairCostPoolSnapshot
    );
  } else {
    summary.coverage.jobOrdersWithIncompleteRepairAllocation += 1;
  }

  const reconciliationDifference = roundMoney(
    finalAmount - classifiedBase - classifiedMarkup - legacyRemainder
  );
  summary.adjustments.revenueReconciliationDifference = addMoney(
    summary.adjustments.revenueReconciliationDifference,
    reconciliationDifference
  );
  summary.events.push(
    makeEvent({
      id: `JO_FINANCIAL_SNAPSHOT:${job.id}`,
      eventType: "JO_FINANCIAL_SNAPSHOT",
      eventDate,
      sourceType: "SERVICE_JOB",
      sourceId: job.id,
      sourceCode: job.jobCode,
      branch: job.branch,
      revenueEffect: finalAmount,
      details: {
        repairType: job.repairType,
        baseServiceSales: classifiedBase,
        serviceMarkupSales: classifiedMarkup,
        legacyUnclassifiedRemainder: legacyRemainder,
        serviceDoneBy: job.serviceDoneBy || null,
        repairCostPool: roundMoney(job.repairCostPoolAmountSnapshot),
        companyShare: roundMoney(job.companyShareAmountSnapshot),
        technicianRepairFee: roundMoney(job.repairFeeSnapshot),
        repairIncentive: roundMoney(job.repairIncentiveAmountSnapshot),
        remainingUnallocatedRepairCostPool: roundMoney(
          job.unallocatedRepairCostPoolSnapshot
        ),
        allocationIsNonAdditive: true,
      },
    })
  );
};

const applyServiceSettlements = (summary, job, bounds) => {
  for (const payment of job.payments || []) {
    const amount = roundMoney(payment.amount);
    if (isWithinPeriod(payment.paidAt, bounds)) {
      summary.settlements.directSettlementsReceived = addMoney(
        summary.settlements.directSettlementsReceived,
        amount
      );
      addMethodSettlement(summary.settlements, payment.paymentMethod, amount);
      if (payment.paymentMethod === "CASH") {
        summary.settlements.actualCash.directCashTenderReceived = addMoney(
          summary.settlements.actualCash.directCashTenderReceived,
          amount
        );
      }
      if (payment.paymentMethod === "CARD") {
        summary.coverage.legacyProviderLikeDirectPayments += 1;
      }
      summary.events.push(
        makeEvent({
          id: `SERVICE_PAYMENT_RECEIVED:${payment.id}`,
          eventType: "SERVICE_PAYMENT_RECEIVED",
          eventDate: payment.paidAt,
          sourceType: "SERVICE_PAYMENT",
          sourceId: payment.id,
          sourceCode: payment.paymentCode,
          branch: job.branch,
          cashEffect: payment.paymentMethod === "CASH" ? amount : 0,
          settlementEffect: amount,
          details: { serviceJobId: job.id, serviceJobCode: job.jobCode, paymentMethod: payment.paymentMethod },
        })
      );
    }

    if (dateValue(payment.cancelledAt) && isWithinPeriod(payment.cancelledAt, bounds)) {
      summary.settlements.directSettlementReversals = addMoney(
        summary.settlements.directSettlementReversals,
        amount
      );
      addMethodSettlement(summary.settlements, payment.paymentMethod, -amount);
      if (payment.paymentMethod === "CASH") {
        summary.settlements.actualCash.directCashReversals = addMoney(
          summary.settlements.actualCash.directCashReversals,
          amount
        );
      }
      summary.events.push(
        makeEvent({
          id: `SERVICE_PAYMENT_CANCELLED:${payment.id}`,
          eventType: "SERVICE_PAYMENT_CANCELLED",
          eventDate: payment.cancelledAt,
          sourceType: "SERVICE_PAYMENT",
          sourceId: payment.id,
          sourceCode: payment.paymentCode,
          branch: job.branch,
          cashEffect: payment.paymentMethod === "CASH" ? -amount : 0,
          settlementEffect: -amount,
          details: { serviceJobId: job.id, serviceJobCode: job.jobCode, paymentMethod: payment.paymentMethod },
        })
      );
    }
  }
};

const createProviderSummary = (provider) => ({
  provider,
  accountCount: 0,
  saleSourceAccounts: 0,
  serviceJobSourceAccounts: 0,
  originatedAccountCountInPeriod: 0,
  unpaidAccounts: 0,
  partiallySettledAccounts: 0,
  settledAccounts: 0,
  cancelledAccounts: 0,
  sourceTransactionTotal: 0,
  originatedSourceTransactionTotalInPeriod: 0,
  openingReceivable: 0,
  originatedReceivableInPeriod: 0,
  collectedAsOf: 0,
  outstandingAsOf: 0,
  cancelledOpeningReceivable: 0,
  contractVsSourceDifferenceUnclassified: 0,
  originatedContractVsSourceDifferenceInPeriodUnclassified: 0,
  overSettlementAmount: 0,
});

const buildAccountsReceivableAsOf = (creditAccounts, bounds, coverage) => {
  const byProvider = new Map(
    RECEIVABLE_PROVIDERS.map((provider) => [provider, createProviderSummary(provider)])
  );

  for (const account of creditAccounts || []) {
    if (!isBefore(account.createdAt, bounds.endExclusive)) continue;
    const provider = byProvider.get(account.provider) || createProviderSummary(account.provider || "UNKNOWN");
    if (!byProvider.has(provider.provider)) byProvider.set(provider.provider, provider);

    const opening = roundMoney(account.balanceAmount);
    const sourceTotal = roundMoney(account.sourceTotalAmountSnapshot);
    const contractTotal = addMoney(opening, account.downpaymentAmount);
    const cancellationDate = dateValue(account.cancelledAt);
    const isCancelledAsOf =
      (cancellationDate && cancellationDate < bounds.endExclusive) ||
      (account.status === "CANCELLED" && !cancellationDate);

    provider.accountCount += 1;
    if (account.sourceType === "SALE") provider.saleSourceAccounts += 1;
    if (account.sourceType === "SERVICE_JOB") provider.serviceJobSourceAccounts += 1;
    provider.sourceTransactionTotal = addMoney(provider.sourceTransactionTotal, sourceTotal);
    provider.contractVsSourceDifferenceUnclassified = addMoney(
      provider.contractVsSourceDifferenceUnclassified,
      roundMoney(contractTotal - sourceTotal)
    );
    if (isWithinPeriod(account.createdAt, bounds)) {
      provider.originatedAccountCountInPeriod += 1;
      provider.originatedSourceTransactionTotalInPeriod = addMoney(
        provider.originatedSourceTransactionTotalInPeriod,
        sourceTotal
      );
      provider.originatedReceivableInPeriod = addMoney(
        provider.originatedReceivableInPeriod,
        opening
      );
      provider.originatedContractVsSourceDifferenceInPeriodUnclassified = addMoney(
        provider.originatedContractVsSourceDifferenceInPeriodUnclassified,
        roundMoney(contractTotal - sourceTotal)
      );
    }

    if (account.status === "CANCELLED" && !cancellationDate) {
      coverage.cancelledReceivablesWithoutCancellationDate += 1;
    }
    if (isCancelledAsOf) {
      provider.cancelledAccounts += 1;
      provider.cancelledOpeningReceivable = addMoney(
        provider.cancelledOpeningReceivable,
        opening
      );
      continue;
    }

    let collectedAsOf = 0;
    for (const collection of account.collections || []) {
      if (!isBefore(collection.paidAt, bounds.endExclusive)) continue;
      const collectionCancelledAt = dateValue(collection.cancelledAt);
      if (collectionCancelledAt && collectionCancelledAt < bounds.endExclusive) continue;
      if (collection.status === "CANCELLED" && !collectionCancelledAt) continue;
      collectedAsOf = addMoney(collectedAsOf, collection.amount);
    }

    const rawRemaining = roundMoney(opening - collectedAsOf);
    const outstanding = roundMoney(Math.max(rawRemaining, 0));
    provider.openingReceivable = addMoney(provider.openingReceivable, opening);
    provider.collectedAsOf = addMoney(provider.collectedAsOf, collectedAsOf);
    provider.outstandingAsOf = addMoney(provider.outstandingAsOf, outstanding);
    if (rawRemaining < 0) {
      provider.overSettlementAmount = addMoney(provider.overSettlementAmount, -rawRemaining);
    }
    if (collectedAsOf <= 0 && outstanding > 0) provider.unpaidAccounts += 1;
    else if (outstanding > 0) provider.partiallySettledAccounts += 1;
    else provider.settledAccounts += 1;
  }

  const providers = Array.from(byProvider.values());
  const totals = providers.reduce(
    (acc, provider) => {
      for (const key of [
        "accountCount",
        "saleSourceAccounts",
        "serviceJobSourceAccounts",
        "originatedAccountCountInPeriod",
        "unpaidAccounts",
        "partiallySettledAccounts",
        "settledAccounts",
        "cancelledAccounts",
      ]) {
        acc[key] += provider[key];
      }
      for (const key of [
        "sourceTransactionTotal",
        "originatedSourceTransactionTotalInPeriod",
        "openingReceivable",
        "originatedReceivableInPeriod",
        "collectedAsOf",
        "outstandingAsOf",
        "cancelledOpeningReceivable",
        "contractVsSourceDifferenceUnclassified",
        "originatedContractVsSourceDifferenceInPeriodUnclassified",
        "overSettlementAmount",
      ]) {
        acc[key] = addMoney(acc[key], provider[key]);
      }
      return acc;
    },
    createProviderSummary("ALL")
  );
  totals.provider = "ALL";

  return { providers, totals };
};

const applyCreditCollections = (summary, creditAccounts, bounds) => {
  for (const account of creditAccounts || []) {
    if (isWithinPeriod(account.createdAt, bounds)) {
      const originatedReceivable = roundMoney(account.balanceAmount);
      summary.events.push(
        makeEvent({
          id: `AR_ORIGINATED:${account.id}`,
          eventType: "AR_ORIGINATED",
          eventDate: account.createdAt,
          sourceType: "CREDIT_ACCOUNT",
          sourceId: account.id,
          sourceCode: account.creditCode,
          branch: account.branch,
          arOriginatedEffect: originatedReceivable,
          details: {
            receivableSourceType: account.sourceType,
            provider: account.provider,
            saleId: account.saleId || null,
            serviceJobId: account.serviceJobId || null,
            sourceTransactionTotal: roundMoney(account.sourceTotalAmountSnapshot),
            initialSettlementSnapshot: roundMoney(account.downpaymentAmount),
            originatedReceivable,
            contractVsSourceDifferenceUnclassified: roundMoney(
              originatedReceivable +
                roundMoney(account.downpaymentAmount) -
                roundMoney(account.sourceTotalAmountSnapshot)
            ),
            nonAdditiveToRevenue: true,
          },
        })
      );
    }
    for (const collection of account.collections || []) {
      const amount = roundMoney(collection.amount);
      if (isWithinPeriod(collection.paidAt, bounds)) {
        summary.settlements.arCollectionsReceived = addMoney(
          summary.settlements.arCollectionsReceived,
          amount
        );
        if (toNumber(collection.newBalance) > 0) {
          summary.settlements.partialSettlementCount += 1;
          summary.settlements.partialSettlementAmount = addMoney(
            summary.settlements.partialSettlementAmount,
            amount
          );
        }
        addMethodSettlement(summary.settlements, collection.paymentMethod, amount);
        if (collection.paymentMethod === "CASH") {
          summary.settlements.actualCash.arCashCollectionsReceived = addMoney(
            summary.settlements.actualCash.arCashCollectionsReceived,
            amount
          );
        }
        summary.events.push(
          makeEvent({
            id: `AR_COLLECTION_RECEIVED:${collection.id}`,
            eventType: "AR_COLLECTION_RECEIVED",
            eventDate: collection.paidAt,
            sourceType: "CREDIT_COLLECTION",
            sourceId: collection.id,
            sourceCode: collection.collectionCode,
            branch: account.branch,
            cashEffect: collection.paymentMethod === "CASH" ? amount : 0,
            settlementEffect: amount,
            arCollectionEffect: amount,
            details: {
              creditAccountId: account.id,
              creditCode: account.creditCode,
              sourceType: account.sourceType,
              provider: account.provider,
              paymentMethod: collection.paymentMethod,
              previousBalance: roundMoney(collection.previousBalance),
              newBalance: roundMoney(collection.newBalance),
              isPartialSettlement: toNumber(collection.newBalance) > 0,
            },
          })
        );
      }

      if (dateValue(collection.cancelledAt) && isWithinPeriod(collection.cancelledAt, bounds)) {
        summary.settlements.arCollectionReversals = addMoney(
          summary.settlements.arCollectionReversals,
          amount
        );
        addMethodSettlement(summary.settlements, collection.paymentMethod, -amount);
        if (collection.paymentMethod === "CASH") {
          summary.settlements.actualCash.arCashCollectionReversals = addMoney(
            summary.settlements.actualCash.arCashCollectionReversals,
            amount
          );
        }
        summary.events.push(
          makeEvent({
            id: `AR_COLLECTION_CANCELLED:${collection.id}`,
            eventType: "AR_COLLECTION_CANCELLED",
            eventDate: collection.cancelledAt,
            sourceType: "CREDIT_COLLECTION",
            sourceId: collection.id,
            sourceCode: collection.collectionCode,
            branch: account.branch,
            cashEffect: collection.paymentMethod === "CASH" ? -amount : 0,
            settlementEffect: -amount,
            arCollectionEffect: -amount,
            details: {
              creditAccountId: account.id,
              creditCode: account.creditCode,
              provider: account.provider,
              paymentMethod: collection.paymentMethod,
            },
          })
        );
      }
    }
  }
};

const finalizeRepairAllocation = (allocation, serviceBase) => {
  const poolDetailTotal = addMoney(
    addMoney(allocation.technicianRepairFees, allocation.repairIncentives),
    allocation.remainingUnallocatedRepairCostPool
  );
  return {
    ...allocation,
    serviceBaseSales: roundMoney(serviceBase),
    baseAllocationReconciliationDifference: roundMoney(
      serviceBase - allocation.repairCostPool - allocation.companyShare
    ),
    poolDetailReconciliationDifference: roundMoney(
      allocation.repairCostPool - poolDetailTotal
    ),
    nonAdditive: true,
  };
};

const finalizeSummary = (summary, receivables, bounds) => {
  summary.costs.netOperationalCogs = roundMoney(
    summary.costs.grossOperationalCogs -
      summary.costs.saleCancellationOperationalCogsReversal -
      summary.costs.returnOperationalCogsReversal
  );
  summary.costs.netAcquisitionCogs = roundMoney(
    summary.costs.grossAcquisitionCogs -
      summary.costs.saleCancellationAcquisitionCogsReversal -
      summary.costs.returnAcquisitionCogsReversal
  );

  const itemBaseSales = roundMoney(summary.revenue.itemBaseSales);
  const posCustomBaseSales = roundMoney(summary.revenue.customServiceBaseSales);
  const ordinaryBaseSales = roundMoney(summary.revenue.ordinaryRepairBaseSales);
  const boardBaseSales = roundMoney(summary.revenue.boardLevelRepairBaseSales);
  const jobOrderBaseSales = addMoney(ordinaryBaseSales, boardBaseSales);
  const serviceBaseSales = addMoney(posCustomBaseSales, jobOrderBaseSales);
  const productMarkupSales = roundMoney(summary.revenue.productMarkupSales);
  const serviceMarkupSales = addMoney(
    summary.revenue.customServiceMarkupSales,
    summary.revenue.jobOrderServiceMarkupSales
  );
  const markupSales = addMoney(productMarkupSales, serviceMarkupSales);
  const classifiedGross = addMoney(addMoney(itemBaseSales, serviceBaseSales), markupSales);
  const unclassifiedGross = legacyRevenue(summary.revenue);
  const grossBeforeAdjustments = addMoney(classifiedGross, unclassifiedGross);
  const netDiscountContra = roundMoney(
    summary.adjustments.exactDiscountsUnallocated -
      summary.adjustments.discountReversalsFromSaleCancellation
  );
  const netRevenueEffect = roundMoney(
    grossBeforeAdjustments -
      netDiscountContra -
      summary.adjustments.returnRefundsUnallocated +
      summary.adjustments.revenueReconciliationDifference
  );

  const directSettlementsNet = roundMoney(
    summary.settlements.directSettlementsReceived -
      summary.settlements.directSettlementReversals -
      summary.settlements.customerRefundsAndReturns
  );
  const arCollectionsNet = roundMoney(
    summary.settlements.arCollectionsReceived - summary.settlements.arCollectionReversals
  );
  const cash = summary.settlements.actualCash;
  const actualCashReceivedNet = roundMoney(
    cash.directCashTenderReceived +
      cash.arCashCollectionsReceived -
      cash.changeReturned -
      cash.directCashReversals -
      cash.arCashCollectionReversals -
      cash.cashRefundsAndReturns
  );

  summary.events.sort((left, right) => {
    const timeDifference = toNumber(right.eventDate?.getTime()) - toNumber(left.eventDate?.getTime());
    return timeDifference || String(left.id).localeCompare(String(right.id));
  });

  return {
    itemSales: {
      baseSales: itemBaseSales,
      grossOperationalCogs: summary.costs.grossOperationalCogs,
      saleCancellationCogsReversal: summary.costs.saleCancellationOperationalCogsReversal,
      returnCogsReversal: summary.costs.returnOperationalCogsReversal,
      netCogs: summary.costs.netOperationalCogs,
      itemProfitBeforeUnresolvedDiscountAndReturnAllocation: roundMoney(
        itemBaseSales - summary.costs.netOperationalCogs
      ),
      acquisitionCogsForCompanyView: summary.costs.netAcquisitionCogs,
    },
    serviceSales: {
      posCustomServiceBaseSales: posCustomBaseSales,
      ordinaryRepairBaseSales: ordinaryBaseSales,
      boardLevelRepairBaseSales: boardBaseSales,
      jobOrderBaseSales,
      totalServiceBaseSales: serviceBaseSales,
      repairAllocation: {
        ordinary: finalizeRepairAllocation(
          summary.repairAllocation.ordinary,
          ordinaryBaseSales
        ),
        boardLevel: finalizeRepairAllocation(
          summary.repairAllocation.boardLevel,
          boardBaseSales
        ),
        note: "Repair pool and company share are nested allocations of JO base sales, not gross addends. Remaining repair cost pool is intentionally unclassified.",
      },
    },
    markupSales: {
      productMarkupSales,
      customServiceMarkupSales: roundMoney(summary.revenue.customServiceMarkupSales),
      jobOrderServiceMarkupSales: roundMoney(summary.revenue.jobOrderServiceMarkupSales),
      totalServiceMarkupSales: serviceMarkupSales,
      totalMarkupSales: markupSales,
    },
    accountsReceivable: {
      asOfExclusive: bounds.endExclusive,
      byProvider: receivables.providers,
      totals: receivables.totals,
      originatedInPeriod: {
        accountCount: receivables.totals.originatedAccountCountInPeriod,
        receivable: receivables.totals.originatedReceivableInPeriod,
        sourceTransactionTotal:
          receivables.totals.originatedSourceTransactionTotalInPeriod,
        contractVsSourceDifferenceUnclassified:
          receivables.totals
            .originatedContractVsSourceDifferenceInPeriodUnclassified,
        nonAdditiveToRevenue: true,
      },
      note: "Provider receivables are an as-of balance. AR originated in the period is an auditable financing classification of source transactions, not additional revenue. Contract-versus-source differences remain unclassified.",
    },
    settlements: {
      directSettlementsReceived: summary.settlements.directSettlementsReceived,
      directSettlementReversals: summary.settlements.directSettlementReversals,
      customerRefundsAndReturns: summary.settlements.customerRefundsAndReturns,
      directSettlementsNet,
      arCollectionsReceived: summary.settlements.arCollectionsReceived,
      arCollectionReversals: summary.settlements.arCollectionReversals,
      arCollectionsNet,
      partialSettlementCount: summary.settlements.partialSettlementCount,
      partialSettlementAmount: summary.settlements.partialSettlementAmount,
      totalSettledNet: addMoney(directSettlementsNet, arCollectionsNet),
      actualCash: {
        ...cash,
        actualCashReceivedNet,
        note: "Actual cash includes cash AR collections. AR collections are a classification breakdown and must not be added to actual cash again.",
      },
      byMethod: summary.settlements.byMethod,
    },
    gross: {
      itemBaseSales,
      serviceBaseSales,
      markupSales,
      classifiedGross,
      legacyUnclassifiedGross: unclassifiedGross,
      grossBeforeAdjustments,
      exactDiscountContraUnallocated: netDiscountContra,
      returnRefundContraUnallocated: summary.adjustments.returnRefundsUnallocated,
      reconciliationDifference: summary.adjustments.revenueReconciliationDifference,
      netRevenueEffect,
      formula: "item base + service base + markup + legacy unclassified - unresolved discounts - unresolved returns + reconciliation difference",
    },
    adjustments: summary.adjustments,
    coverage: summary.coverage,
  };
};

const buildFinancialSummary = ({
  sales = [],
  serviceJobs = [],
  creditAccounts = [],
  bounds,
}) => {
  const summary = createInitialSummary();

  for (const sale of sales) {
    applySaleRevenue(summary, sale, bounds);
    applySaleSettlements(summary, sale, bounds);
  }
  for (const job of serviceJobs) {
    applyJobOrderRevenue(summary, job, bounds);
    applyServiceSettlements(summary, job, bounds);
  }
  applyCreditCollections(summary, creditAccounts, bounds);
  const receivables = buildAccountsReceivableAsOf(
    creditAccounts,
    bounds,
    summary.coverage
  );

  return {
    sections: finalizeSummary(summary, receivables, bounds),
    events: summary.events,
  };
};

module.exports = {
  BUSINESS_TIME_ZONE,
  RECEIVABLE_PROVIDERS,
  addMoney,
  buildAccountsReceivableAsOf,
  buildFinancialSummary,
  calculateSaleBreakdown,
  isWithinPeriod,
  roundMoney,
};
