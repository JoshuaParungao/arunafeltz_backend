const assert = require("node:assert/strict");

const v2 = require("./src/modules/incentives/services/incentiveEngineV2Math.service");

let assertions = 0;

const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

const equal = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  assertions += 1;
};

const throwsCode = (callback, code, message) => {
  assert.throws(callback, (error) => error?.code === code, message);
  assertions += 1;
};

const account = (overrides = {}) => ({
  id: "sales-1",
  role: "CASHIER",
  status: "ACTIVE",
  branchId: "branch-a",
  incentiveClassification: "SALES_AGENT",
  ...overrides,
});

const config = (overrides = {}) => ({
  id: "config-1",
  accountId: "sales-1",
  branchIdSnapshot: "branch-a",
  classificationSnapshot: "SALES_AGENT",
  effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  itemEnabled: true,
  itemRatePercent: "2.5",
  ordinaryRepairEnabled: false,
  ordinaryRepairRatePercent: null,
  boardRepairEnabled: false,
  boardRepairRatePercent: null,
  ...overrides,
});

const saleItem = (overrides = {}) => ({
  id: "sale-item-1",
  saleId: "sale-1",
  itemId: "item-1",
  priceTier: 1,
  quantity: "2",
  baseUnitPriceSnapshot: "100",
  discountAmount: "0",
  sale: {
    receiptCode: "R-001",
    saleDate: new Date("2026-08-03T02:00:00.000Z"),
    status: "COMPLETED",
    cancelledAt: null,
  },
  returnItems: [],
  ...overrides,
});

const run = () => {
  const range = v2.manilaBusinessInstantRange("2026-08-01", "2026-08-31");
  equal(
    range.startInclusive.toISOString(),
    "2026-07-31T16:00:00.000Z",
    "Manila cycle starts at local midnight"
  );
  equal(
    range.endExclusive.toISOString(),
    "2026-08-31T16:00:00.000Z",
    "Manila cycle uses a half-open end boundary"
  );
  equal(
    range.cutoffInstant.toISOString(),
    "2026-08-31T15:59:59.999Z",
    "config selection uses the Manila end-of-business cutoff instant"
  );

  const sales = account();
  const technician = account({
    id: "tech-1",
    role: "TECHNICIAN",
    incentiveClassification: "TECHNICIAN",
  });
  const admin = account({
    id: "admin-1",
    role: "ADMIN",
    incentiveClassification: "NONE",
  });
  const inactive = account({ id: "inactive-1", status: "DISABLED" });
  const otherBranch = account({ id: "other-1", branchId: "branch-b" });

  const olderConfig = config({ id: "config-old", itemRatePercent: "2" });
  const cutoffConfig = config({
    id: "config-cutoff",
    effectiveFrom: new Date("2026-08-31T15:59:59.999Z"),
    createdAt: new Date("2026-08-31T15:59:59.999Z"),
    itemRatePercent: "2.5",
  });
  const afterCutoffConfig = config({
    id: "config-after",
    effectiveFrom: new Date("2026-08-31T16:00:00.000Z"),
    createdAt: new Date("2026-08-31T16:00:00.000Z"),
    itemRatePercent: "99",
  });
  const technicianOffConfig = config({
    id: "config-tech-off",
    accountId: "tech-1",
    classificationSnapshot: "TECHNICIAN",
    itemEnabled: false,
    itemRatePercent: null,
  });

  const returnedLine = saleItem({
    id: "sale-item-returned",
    saleId: "sale-returned",
    quantity: "3",
    baseUnitPriceSnapshot: "50",
    sale: {
      receiptCode: "R-002",
      saleDate: new Date("2026-08-04T02:00:00.000Z"),
      status: "PARTIALLY_REFUNDED",
      cancelledAt: null,
    },
    returnItems: [
      {
        id: "return-item-1",
        returnRequestId: "return-1",
        quantity: "1",
        returnRequest: {
          returnCode: "RET-001",
          status: "COMPLETED",
          completedAt: new Date("2026-08-05T02:00:00.000Z"),
        },
      },
      {
        id: "return-item-draft",
        returnRequestId: "return-draft",
        quantity: "1",
        returnRequest: {
          returnCode: "RET-DRAFT",
          status: "DRAFT",
          completedAt: null,
        },
      },
    ],
  });
  const excludedTierLine = saleItem({
    id: "sale-item-p2",
    saleId: "sale-p2",
    priceTier: 2,
    quantity: "99",
    baseUnitPriceSnapshot: "999",
  });
  const customLine = saleItem({
    id: "custom-line",
    saleId: "sale-custom",
    itemId: null,
    quantity: "99",
    baseUnitPriceSnapshot: "999",
  });

  const plan = v2.calculateItemCyclePlan({
    saleItems: [saleItem(), returnedLine, excludedTierLine, customLine],
    eligiblePriceTiers: [1],
    accounts: [sales, technician, admin, inactive, otherBranch],
    configVersions: [
      olderConfig,
      cutoffConfig,
      afterCutoffConfig,
      technicianOffConfig,
    ],
    branchId: "branch-a",
    cutoffInstant: range.cutoffInstant,
  });

  equal(
    plan.branchBasisAmountSnapshot.toFixed(2),
    "300.00",
    "branch basis sums base price times net eligible quantity"
  );
  equal(plan.basisSnapshots.length, 2, "only eligible product tiers contribute");
  equal(
    plan.basisSnapshots[1].returnedQuantitySnapshot.toFixed(2),
    "1.00",
    "only completed returns reduce eligible quantity"
  );
  equal(
    plan.basisSnapshots[1].returnSourcesSnapshot[0].returnRequestId,
    "return-1",
    "completed return source identity is snapshotted"
  );
  equal(plan.recipientSnapshots.length, 2, "Admin, inactive, and other-branch users are excluded");

  const salesSnapshot = plan.recipientSnapshots.find(
    (recipient) => recipient.staffId === "sales-1"
  );
  const techSnapshot = plan.recipientSnapshots.find(
    (recipient) => recipient.staffId === "tech-1"
  );
  equal(
    salesSnapshot.accountConfigVersionId,
    "config-cutoff",
    "latest compatible config effective at cutoff is selected"
  );
  equal(
    salesSnapshot.ratePercentSnapshot.toFixed(4),
    "2.5000",
    "post-cutoff config does not rewrite the cycle rate"
  );
  equal(
    salesSnapshot.amountSnapshot.toFixed(2),
    "7.50",
    "recipient award uses branch-wide basis and configured rate"
  );
  equal(techSnapshot.enabledSnapshot, false, "OFF account snapshots zero");
  equal(techSnapshot.amountSnapshot.toFixed(2), "0.00", "OFF account earns zero");
  equal(
    techSnapshot.accountConfigVersionId,
    "config-tech-off",
    "OFF account retains the resolved configuration provenance"
  );
  equal(plan.awards.length, 1, "only enabled positive awards enter the payable ledger");
  check(
    !Object.hasOwn(plan, "cashierId"),
    "item incentive plan has no personal cashier attribution"
  );

  const noBranchSnapshot = v2.selectLatestCompatibleConfig({
    account: sales,
    versions: [config({ branchIdSnapshot: null })],
    programType: "ITEM_SALE",
    branchId: "branch-a",
    effectiveAt: range.cutoffInstant,
  });
  equal(
    noBranchSnapshot,
    null,
    "legacy config without branch snapshot is never inferred for V2"
  );

  const discountedAnalysis = v2.testInternals.analyzeItemBasisLines({
    saleItems: [saleItem({ discountAmount: "10" })],
    eligiblePriceTiers: [1],
  });
  try {
    v2.testInternals.assertItemBasisCoverage(discountedAnalysis);
    assert.fail("discounted eligible line should block materialization");
  } catch (error) {
    equal(error.code, "ITEM_DISCOUNT_ALLOCATION_UNRESOLVED");
    equal(error.details.count, 1, "discount coverage error includes count");
    equal(
      error.details.sources[0].saleItemId,
      "sale-item-1",
      "discount coverage error includes API-safe source identity"
    );
  }

  const missingAnalysis = v2.testInternals.analyzeItemBasisLines({
    saleItems: [saleItem({ baseUnitPriceSnapshot: null })],
    eligiblePriceTiers: [1],
  });
  throwsCode(
    () => v2.testInternals.assertItemBasisCoverage(missingAnalysis),
    "ITEM_BASE_SNAPSHOT_MISSING",
    "missing base snapshots block materialization"
  );

  const fullyReturnedAnalysis = v2.testInternals.assertItemBasisCoverage(
    v2.testInternals.analyzeItemBasisLines({
      saleItems: [
        saleItem({
          baseUnitPriceSnapshot: null,
          discountAmount: "50",
          returnItems: [
            {
              id: "return-full-item",
              returnRequestId: "return-full",
              quantity: "2",
              returnRequest: {
                returnCode: "RET-FULL",
                status: "COMPLETED",
                completedAt: new Date("2026-08-05T02:00:00.000Z"),
              },
            },
          ],
        }),
      ],
      eligiblePriceTiers: [1],
    })
  );
  equal(
    fullyReturnedAnalysis.branchBasisAmount.toFixed(2),
    "0.00",
    "fully returned line safely snapshots zero without allocating discount"
  );
  equal(
    fullyReturnedAnalysis.snapshots[0].inclusionState,
    "EXCLUDED_FULLY_RETURNED",
    "fully returned source remains explicit in the immutable basis snapshot"
  );

  const cancelledAnalysis = v2.testInternals.assertItemBasisCoverage(
    v2.testInternals.analyzeItemBasisLines({
      saleItems: [
        saleItem({
          baseUnitPriceSnapshot: null,
          discountAmount: "50",
          sale: {
            receiptCode: "R-CANCELLED",
            saleDate: new Date("2026-08-03T02:00:00.000Z"),
            status: "CANCELLED",
            cancelledAt: new Date("2026-08-06T02:00:00.000Z"),
          },
        }),
      ],
      eligiblePriceTiers: [1],
    })
  );
  equal(
    cancelledAnalysis.branchBasisAmount.toFixed(2),
    "0.00",
    "cancelled source contributes zero without guessing discount allocation"
  );
  equal(
    cancelledAnalysis.snapshots[0].inclusionState,
    "EXCLUDED_CANCELLED",
    "cancelled source remains explicit in the revision"
  );
  equal(
    cancelledAnalysis.snapshots[0].saleCancelledAtSnapshot.toISOString(),
    "2026-08-06T02:00:00.000Z",
    "sale cancellation timestamp is snapshotted"
  );

  const senior = account({
    id: "senior-tech",
    role: "TECHNICIAN",
    incentiveClassification: "SENIOR_TECHNICIAN",
  });
  const boardConfig = config({
    id: "board-config",
    accountId: "senior-tech",
    classificationSnapshot: "SENIOR_TECHNICIAN",
    itemEnabled: false,
    itemRatePercent: null,
    boardRepairEnabled: true,
    boardRepairRatePercent: "10",
  });
  const boardJob = {
    id: "job-board",
    jobCode: "JO-BOARD",
    status: "COMPLETED",
    branchId: "branch-a",
    repairType: "BOARD_LEVEL_REPAIR",
    serviceDoneById: "senior-tech",
    baseServiceCharge: "5000",
    markupPercent: "20",
    finalServiceCharge: "6250",
    configuredRepairIncentiveRateSnapshot: "10",
    repairIncentiveRateSnapshot: "10",
    repairIncentiveAmountSnapshot: "500",
    incentivePostingDisposition: "POSTED",
    programScheduleVersionId: "schedule-board",
    incentiveCycleId: "cycle-board",
    releasedAt: new Date("2026-08-10T02:00:00.000Z"),
    financialSnapshotAt: new Date("2026-08-10T02:00:00.000Z"),
  };
  const repairPlan = v2.buildRepairAwardPlan({
    serviceJob: boardJob,
    performer: senior,
    configVersion: boardConfig,
  });
  equal(repairPlan.programType, "BOARD_LEVEL_REPAIR");
  equal(
    repairPlan.basisAmount.toFixed(2),
    "5000.00",
    "repair award uses base service price, excluding markup"
  );
  equal(repairPlan.amount.toFixed(2), "500.00", "repair rate reconciles to JO snapshot");
  equal(repairPlan.staffId, "senior-tech", "repair is attributed to actual Service Done By");

  const regularTech = account({
    id: "regular-tech",
    role: "TECHNICIAN",
    incentiveClassification: "TECHNICIAN",
  });
  equal(
    v2.buildRepairAwardPlan({
      serviceJob: { ...boardJob, serviceDoneById: "regular-tech" },
      performer: regularTech,
      configVersion: {
        ...boardConfig,
        accountId: "regular-tech",
        classificationSnapshot: "TECHNICIAN",
      },
    }),
    null,
    "regular Technician cannot earn Board Level incentive"
  );
  throwsCode(
    () =>
      v2.buildRepairAwardPlan({
        serviceJob: boardJob,
        performer: { ...senior, id: "assigned-but-not-performer" },
        configVersion: boardConfig,
      }),
    "INCENTIVE_SERVICE_PERFORMER_MISMATCH",
    "assigned/other identity cannot replace Service Done By"
  );
  throwsCode(
    () =>
      v2.buildRepairAwardPlan({
        serviceJob: { ...boardJob, repairIncentiveAmountSnapshot: "625" },
        performer: senior,
        configVersion: boardConfig,
      }),
    "INCENTIVE_REPAIR_AMOUNT_SNAPSHOT_MISMATCH",
    "repair award must reconcile to immutable JO amount snapshot"
  );
  throwsCode(
    () =>
      v2.buildRepairAwardPlan({
        serviceJob: {
          ...boardJob,
          configuredRepairIncentiveRateSnapshot: "9",
        },
        performer: senior,
        configVersion: boardConfig,
      }),
    "INCENTIVE_REPAIR_CONFIGURED_RATE_SNAPSHOT_MISMATCH",
    "configured JO rate must reconcile to the selected account config"
  );
  equal(
    v2.buildRepairAwardPlan({
      serviceJob: {
        ...boardJob,
        baseServiceCharge: "0",
        repairIncentiveAmountSnapshot: "0",
      },
      performer: senior,
      configVersion: boardConfig,
    }),
    null,
    "no-charge repair earns no incentive"
  );

  equal(
    v2.periodCodeForProgramCycle({
      branchId: "branch-a",
      programType: "ITEM_SALE",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    }),
    "V2:branch-a:ITEM_SALE:20260801-20260831",
    "V2 period identity includes branch and independent program"
  );

  console.log(`V2 incentive engine regression: ${assertions} assertions passed.`);
};

run();
