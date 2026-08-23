const assert = require("node:assert/strict");

const {
  buildFinancialSummary,
  calculateSaleBreakdown,
} = require("./src/modules/reports/services/financialSummaryMath.service");
const {
  getFinancialSummary,
  parseManilaDateRange,
  resolveBranchFilter,
} = require("./src/modules/reports/services/financialSummary.service");

const branch = { id: "branch-a", code: "A", name: "Branch A" };
const bounds = {
  startInclusive: new Date("2026-08-01T00:00:00.000+08:00"),
  endExclusive: new Date("2026-09-01T00:00:00.000+08:00"),
};

const productLine = (overrides = {}) => ({
  id: "line-product",
  itemId: "item-1",
  quantity: 1,
  baseUnitPriceSnapshot: 30000,
  markupPercent: 25,
  unitPrice: 40000,
  discountAmount: 1000,
  lineTotal: 39000,
  operationalUnitCostSnapshot: 20000,
  acquisitionUnitCostSnapshot: 18000,
  ...overrides,
});

const customLine = (overrides = {}) => ({
  id: "line-custom",
  itemId: null,
  quantity: 1,
  baseUnitPriceSnapshot: 5000,
  markupPercent: 20,
  unitPrice: 6250,
  discountAmount: 250,
  lineTotal: 6000,
  operationalUnitCostSnapshot: null,
  acquisitionUnitCostSnapshot: null,
  ...overrides,
});

const saleOne = {
  id: "sale-1",
  receiptCode: "A-SALE-1",
  status: "PARTIALLY_REFUNDED",
  saleDate: new Date("2026-08-02T10:00:00.000+08:00"),
  cancelledAt: null,
  subtotal: 46250,
  totalDiscount: 1250,
  serviceCharge: 0,
  grandTotal: 45000,
  changeAmount: 0,
  branch,
  items: [productLine(), customLine()],
  payments: [
    { id: "sale-pay-cash", paymentMethod: "CASH", amount: 10000, paidAt: new Date("2026-08-02T10:00:00.000+08:00") },
    { id: "sale-pay-gcash", paymentMethod: "GCASH", amount: 35000, paidAt: new Date("2026-08-02T10:00:00.000+08:00") },
  ],
  returnRequests: [
    {
      id: "return-1",
      returnCode: "RET-1",
      status: "COMPLETED",
      refundMethod: "CASH",
      totalRefundAmount: 1000,
      completedAt: new Date("2026-08-05T09:00:00.000+08:00"),
      items: [{ saleItemId: "line-product", quantity: 0.1 }],
    },
  ],
};

const cancelledSale = {
  id: "sale-2",
  receiptCode: "A-SALE-2",
  status: "CANCELLED",
  saleDate: new Date("2026-07-31T14:00:00.000+08:00"),
  cancelledAt: new Date("2026-08-03T11:00:00.000+08:00"),
  subtotal: 120,
  totalDiscount: 0,
  serviceCharge: 0,
  grandTotal: 120,
  changeAmount: 0,
  branch,
  items: [
    productLine({
      id: "line-cancelled",
      quantity: 1,
      baseUnitPriceSnapshot: 100,
      unitPrice: 120,
      discountAmount: 0,
      lineTotal: 120,
      operationalUnitCostSnapshot: 80,
      acquisitionUnitCostSnapshot: 70,
    }),
  ],
  payments: [
    { id: "cancelled-pay", paymentMethod: "CASH", amount: 120, paidAt: new Date("2026-07-31T14:00:00.000+08:00") },
  ],
  returnRequests: [],
};

const legacySale = {
  id: "sale-legacy",
  receiptCode: "A-SALE-LEGACY",
  status: "COMPLETED",
  saleDate: new Date("2026-08-04T12:00:00.000+08:00"),
  cancelledAt: null,
  subtotal: 500,
  totalDiscount: 0,
  serviceCharge: 0,
  grandTotal: 500,
  changeAmount: 0,
  branch,
  items: [
    productLine({
      id: "legacy-line",
      baseUnitPriceSnapshot: null,
      markupPercent: null,
      unitPrice: 500,
      lineTotal: 500,
      discountAmount: 0,
      operationalUnitCostSnapshot: null,
      acquisitionUnitCostSnapshot: null,
    }),
  ],
  payments: [],
  returnRequests: [],
};

const outsideSale = {
  ...legacySale,
  id: "sale-outside",
  receiptCode: "A-SALE-OUTSIDE",
  saleDate: bounds.endExclusive,
};

const ordinaryJob = {
  id: "job-ordinary",
  jobCode: "JO-ORDINARY",
  status: "COMPLETED",
  repairType: "ORDINARY_REPAIR",
  releaseOutcome: "REPAIRED",
  releasedAt: new Date("2026-08-06T12:00:00.000+08:00"),
  completedAt: new Date("2026-08-06T12:00:00.000+08:00"),
  financialSnapshotAt: new Date("2026-08-06T12:00:00.000+08:00"),
  baseServiceCharge: 5000,
  markupPercent: 20,
  finalServiceCharge: 6250,
  serviceMarkupAmount: 1250,
  repairCostPoolAmountSnapshot: 3250,
  companyShareAmountSnapshot: 1750,
  repairFeeSnapshot: 500,
  repairIncentiveAmountSnapshot: 250,
  unallocatedRepairCostPoolSnapshot: 2500,
  branch,
  serviceDoneBy: { id: "tech-1", fullName: "Actual Technician" },
  payments: [
    {
      id: "service-pay-1",
      paymentCode: "SP-1",
      paymentMethod: "CASH",
      status: "POSTED",
      amount: 1000,
      paidAt: new Date("2026-08-06T13:00:00.000+08:00"),
      cancelledAt: null,
    },
  ],
};

const boardJob = {
  ...ordinaryJob,
  id: "job-board",
  jobCode: "JO-BOARD",
  repairType: "BOARD_LEVEL_REPAIR",
  baseServiceCharge: 10000,
  markupPercent: 0,
  finalServiceCharge: 10000,
  serviceMarkupAmount: 0,
  repairCostPoolAmountSnapshot: 6000,
  companyShareAmountSnapshot: 4000,
  repairFeeSnapshot: 600,
  repairIncentiveAmountSnapshot: 400,
  unallocatedRepairCostPoolSnapshot: 5000,
  payments: [],
};

const legacyJob = {
  ...ordinaryJob,
  id: "job-legacy",
  jobCode: "JO-LEGACY",
  status: "CANCELLED",
  repairType: null,
  releaseOutcome: "DECLINED",
  financialSnapshotAt: null,
  baseServiceCharge: null,
  markupPercent: null,
  finalServiceCharge: 350,
  serviceMarkupAmount: null,
  repairCostPoolAmountSnapshot: null,
  companyShareAmountSnapshot: null,
  repairFeeSnapshot: null,
  repairIncentiveAmountSnapshot: null,
  unallocatedRepairCostPoolSnapshot: null,
  payments: [
    {
      id: "service-pay-legacy",
      paymentCode: "SP-LEGACY",
      paymentMethod: "CASH",
      status: "POSTED",
      amount: 350,
      paidAt: new Date("2026-08-06T13:30:00.000+08:00"),
      cancelledAt: null,
    },
  ],
};

const creditAccounts = [
  {
    id: "ar-card",
    creditCode: "AR-CARD",
    status: "ACTIVE",
    sourceType: "SERVICE_JOB",
    provider: "CREDIT_CARD",
    sourceTotalAmountSnapshot: 6250,
    balanceAmount: 5250,
    downpaymentAmount: 1000,
    createdAt: new Date("2026-08-06T13:00:00.000+08:00"),
    cancelledAt: null,
    branch,
    collections: [
      {
        id: "collection-partial",
        collectionCode: "COL-PARTIAL",
        status: "POSTED",
        amount: 2000,
        previousBalance: 5250,
        newBalance: 3250,
        paymentMethod: "CASH",
        paidAt: new Date("2026-08-10T10:00:00.000+08:00"),
        cancelledAt: null,
      },
      {
        id: "collection-reversed",
        collectionCode: "COL-REVERSED",
        status: "CANCELLED",
        amount: 500,
        previousBalance: 3250,
        newBalance: 2750,
        paymentMethod: "CASH",
        paidAt: new Date("2026-07-20T10:00:00.000+08:00"),
        cancelledAt: new Date("2026-08-12T10:00:00.000+08:00"),
      },
    ],
  },
  {
    id: "ar-homecredit",
    creditCode: "AR-HC",
    status: "ACTIVE",
    sourceType: "SERVICE_JOB",
    provider: "HOMECREDIT",
    sourceTotalAmountSnapshot: 10000,
    balanceAmount: 10000,
    downpaymentAmount: 0,
    createdAt: new Date("2026-07-15T13:00:00.000+08:00"),
    cancelledAt: null,
    branch,
    collections: [],
  },
  {
    id: "ar-in-house",
    creditCode: "AR-IH",
    status: "PAID",
    sourceType: "SALE",
    provider: "IN_HOUSE_INSTALLMENT",
    sourceTotalAmountSnapshot: 10000,
    balanceAmount: 12000,
    downpaymentAmount: 2000,
    createdAt: new Date("2026-08-01T13:00:00.000+08:00"),
    cancelledAt: null,
    branch,
    collections: [
      {
        id: "collection-paid",
        collectionCode: "COL-PAID",
        status: "POSTED",
        amount: 12000,
        previousBalance: 12000,
        newBalance: 0,
        paymentMethod: "BANK_TRANSFER",
        paidAt: new Date("2026-08-20T10:00:00.000+08:00"),
        cancelledAt: null,
      },
    ],
  },
];

const breakdown = calculateSaleBreakdown(saleOne);
assert.equal(breakdown.revenue.itemBaseSales, 30000);
assert.equal(breakdown.revenue.productMarkupSales, 10000);
assert.equal(breakdown.revenue.customServiceBaseSales, 5000);
assert.equal(breakdown.revenue.customServiceMarkupSales, 1250);
assert.equal(breakdown.storedDiscount, 1250);
assert.equal(breakdown.calculatedNet, 45000);

const result = buildFinancialSummary({
  sales: [saleOne, cancelledSale, legacySale, outsideSale],
  serviceJobs: [ordinaryJob, boardJob, legacyJob],
  creditAccounts,
  bounds,
});
const { sections } = result;

assert.equal(sections.itemSales.baseSales, 29900);
assert.equal(sections.itemSales.netCogs, 17920);
assert.equal(
  sections.itemSales.itemProfitBeforeUnresolvedDiscountAndReturnAllocation,
  11980
);
assert.equal(sections.serviceSales.posCustomServiceBaseSales, 5000);
assert.equal(sections.serviceSales.ordinaryRepairBaseSales, 5000);
assert.equal(sections.serviceSales.boardLevelRepairBaseSales, 10000);
assert.equal(sections.markupSales.productMarkupSales, 9980);
assert.equal(sections.markupSales.totalServiceMarkupSales, 2500);
assert.equal(sections.gross.classifiedGross, 62380);
assert.equal(sections.gross.legacyUnclassifiedGross, 850);
assert.equal(sections.gross.exactDiscountContraUnallocated, 1250);
assert.equal(sections.gross.returnRefundContraUnallocated, 1000);
assert.equal(sections.gross.netRevenueEffect, 60980);

assert.equal(
  sections.serviceSales.repairAllocation.ordinary.repairCostPool,
  3250
);
assert.equal(
  sections.serviceSales.repairAllocation.ordinary.companyShare,
  1750
);
assert.equal(
  sections.serviceSales.repairAllocation.ordinary.remainingUnallocatedRepairCostPool,
  2500
);
assert.equal(
  sections.serviceSales.repairAllocation.ordinary.baseAllocationReconciliationDifference,
  0
);
assert.equal(
  sections.serviceSales.repairAllocation.ordinary.poolDetailReconciliationDifference,
  0
);
assert.equal(sections.serviceSales.repairAllocation.ordinary.nonAdditive, true);

assert.equal(sections.accountsReceivable.totals.openingReceivable, 27250);
assert.equal(sections.accountsReceivable.totals.collectedAsOf, 14000);
assert.equal(sections.accountsReceivable.totals.outstandingAsOf, 13250);
assert.equal(
  sections.accountsReceivable.totals.contractVsSourceDifferenceUnclassified,
  4000
);
assert.equal(sections.accountsReceivable.totals.unpaidAccounts, 1);
assert.equal(sections.accountsReceivable.totals.partiallySettledAccounts, 1);
assert.equal(sections.accountsReceivable.totals.settledAccounts, 1);
assert.equal(sections.accountsReceivable.totals.saleSourceAccounts, 1);
assert.equal(sections.accountsReceivable.totals.serviceJobSourceAccounts, 2);
assert.equal(sections.accountsReceivable.originatedInPeriod.accountCount, 2);
assert.equal(sections.accountsReceivable.originatedInPeriod.receivable, 17250);
assert.equal(
  sections.accountsReceivable.originatedInPeriod.sourceTransactionTotal,
  16250
);
assert.equal(
  sections.accountsReceivable.byProvider.find(
    (provider) => provider.provider === "HOMECREDIT"
  ).originatedReceivableInPeriod,
  0
);
assert.equal(
  result.events
    .filter((event) => event.eventType === "AR_ORIGINATED")
    .reduce((sum, event) => sum + event.arOriginatedEffect, 0),
  17250
);

assert.equal(sections.settlements.directSettlementsNet, 45230);
assert.equal(sections.settlements.arCollectionsReceived, 14000);
assert.equal(sections.settlements.arCollectionReversals, 500);
assert.equal(sections.settlements.arCollectionsNet, 13500);
assert.equal(sections.settlements.partialSettlementCount, 1);
assert.equal(sections.settlements.partialSettlementAmount, 2000);
assert.equal(sections.settlements.totalSettledNet, 58730);
assert.equal(sections.settlements.actualCash.actualCashReceivedNet, 11730);

assert.equal(sections.coverage.legacySaleLinesWithoutBaseSnapshot, 1);
assert.equal(sections.coverage.legacyJobOrdersWithoutFinancialSnapshot, 1);
assert.equal(sections.coverage.productLinesWithoutOperationalCostSnapshot, 1);
assert.equal(
  result.events.some((event) => event.sourceId === outsideSale.id),
  false
);
assert.equal(
  result.events.some(
    (event) =>
      event.eventType === "JO_FINANCIAL_SNAPSHOT" &&
      event.details.serviceDoneBy?.id === "tech-1"
  ),
  true
);

const parsedBounds = parseManilaDateRange(
  { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
  new Date("2026-08-14T12:00:00.000Z")
);
assert.equal(parsedBounds.startInclusive.toISOString(), "2026-07-31T16:00:00.000Z");
assert.equal(parsedBounds.endExclusive.toISOString(), "2026-08-31T16:00:00.000Z");
assert.equal(
  resolveBranchFilter({ role: "ADMIN", branchId: "branch-a" }, "branch-a"),
  "branch-a"
);
assert.throws(
  () => resolveBranchFilter({ role: "ADMIN", branchId: "branch-a" }, "branch-b"),
  (error) => error.code === "BRANCH_ACCESS_DENIED"
);
assert.throws(
  () => parseManilaDateRange({ dateFrom: "2026-02-30" }),
  (error) => error.code === "INVALID_DATE_FROM"
);
assert.throws(
  () => parseManilaDateRange({ dateFrom: "2026-08-31", dateTo: "2026-08-01" }),
  (error) => error.code === "INVALID_DATE_RANGE"
);
assert.equal(resolveBranchFilter({ role: "SUPER_OWNER" }), undefined);

const queryCalls = [];
const emptyDatabase = {
  sale: {
    findMany: async (query) => {
      queryCalls.push(query);
      return [];
    },
  },
  serviceJob: {
    findMany: async (query) => {
      queryCalls.push(query);
      return [];
    },
  },
  creditAccount: {
    findMany: async (query) => {
      queryCalls.push(query);
      return [];
    },
  },
};

getFinancialSummary(
  { id: "admin-1", role: "ADMIN", branchId: "branch-a" },
  { dateFrom: "2026-08-01", dateTo: "2026-08-31" },
  emptyDatabase,
  new Date("2026-08-14T12:00:00.000Z")
)
  .then((emptyResult) => {
    assert.equal(emptyResult.report.name, "Unified Financial Summary");
    assert.equal(emptyResult.report.timeZone, "Asia/Manila");
    assert.equal(emptyResult.records.length, 0);
    assert.equal(
      queryCalls.every((query) => query.where.branchId === "branch-a"),
      true
    );
    console.log("financial summary regression: 63 assertions passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
