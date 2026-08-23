const assert = require("node:assert/strict");

const math = require("./src/modules/incentives/services/incentiveEngineV2Math.service");
const engine = require("./src/modules/incentives/services/incentiveEngineV2.service");

let assertions = 0;

const equal = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  assertions += 1;
};

const notEqual = (actual, expected, message) => {
  assert.notEqual(actual, expected, message);
  assertions += 1;
};

const throwsCode = (callback, code, message) => {
  assert.throws(callback, (error) => error?.code === code, message);
  assertions += 1;
};

const cycle = {
  id: "cycle-item-a",
  engineVersion: "V2",
  programType: "ITEM_SALE",
  branchId: "branch-a",
  endDate: new Date("2026-08-10T00:00:00.000Z"),
  claimOpenDate: new Date("2026-08-12T00:00:00.000Z"),
  claimCloseDate: new Date("2026-08-15T00:00:00.000Z"),
};

const source = (overrides = {}) => ({
  saleId: "sale-1",
  saleItemId: "line-1",
  saleStatusSnapshot: "COMPLETED",
  saleCancelledAtSnapshot: null,
  inclusionState: "INCLUDED",
  priceTier: 1,
  grossQuantitySnapshot: math.moneyDecimal(2),
  returnedQuantitySnapshot: math.moneyDecimal(0),
  netQuantitySnapshot: math.moneyDecimal(2),
  baseUnitPriceSnapshot: math.moneyDecimal(100),
  basisAmount: math.moneyDecimal(200),
  returnSourcesSnapshot: [],
  ...overrides,
});

const recipient = (overrides = {}) => ({
  staffId: "staff-1",
  roleSnapshot: "CASHIER",
  classificationSnapshot: "SALES_AGENT",
  enabledSnapshot: true,
  ratePercentSnapshot: math.rateDecimal(5),
  amountSnapshot: math.moneyDecimal(10),
  accountConfigVersionId: "config-1",
  ...overrides,
});

const fingerprintPayload = (overrides = {}) => ({
  cycle,
  cutoffInstant: new Date("2026-08-10T15:59:59.999Z"),
  rule: { id: "rule-1" },
  plan: {
    eligiblePriceTiersSnapshot: [1, 3],
    branchBasisAmountSnapshot: math.moneyDecimal(200),
    basisSnapshots: [source()],
    recipientSnapshots: [recipient()],
  },
  ...overrides,
});

const run = () => {
  equal(
    engine.testInternals.cycleStatusForDate(
      cycle,
      new Date("2026-08-10T15:00:00.000Z")
    ),
    "EARNING",
    "cycle earns through Manila end date"
  );
  equal(
    engine.testInternals.cycleStatusForDate(
      cycle,
      new Date("2026-08-11T02:00:00.000Z")
    ),
    "CUT_OFF",
    "cycle is cut off before claim open date"
  );
  equal(
    engine.testInternals.cycleStatusForDate(
      cycle,
      new Date("2026-08-12T02:00:00.000Z")
    ),
    "CLAIMABLE",
    "cycle becomes claimable on its Manila claim date"
  );
  equal(
    engine.testInternals.cycleStatusForDate(
      cycle,
      new Date("2026-08-16T02:00:00.000Z")
    ),
    "CLOSED",
    "cycle closes after the Manila claim window"
  );

  const first = engine.testInternals.fingerprintItemPlan(fingerprintPayload());
  const reordered = engine.testInternals.fingerprintItemPlan(
    fingerprintPayload({
      plan: {
        ...fingerprintPayload().plan,
        basisSnapshots: [
          source({ saleId: "sale-2", saleItemId: "line-2" }),
          source(),
        ].reverse(),
        recipientSnapshots: [
          recipient({ staffId: "staff-2" }),
          recipient(),
        ].reverse(),
      },
    })
  );
  const reorderedAgain = engine.testInternals.fingerprintItemPlan(
    fingerprintPayload({
      plan: {
        ...fingerprintPayload().plan,
        basisSnapshots: [
          source(),
          source({ saleId: "sale-2", saleItemId: "line-2" }),
        ],
        recipientSnapshots: [
          recipient(),
          recipient({ staffId: "staff-2" }),
        ],
      },
    })
  );
  equal(
    reordered,
    reorderedAgain,
    "fingerprint is deterministic regardless of query ordering"
  );
  equal(first.length, 64, "revision fingerprint is SHA-256");

  const cancellationFingerprint = engine.testInternals.fingerprintItemPlan(
    fingerprintPayload({
      plan: {
        ...fingerprintPayload().plan,
        branchBasisAmountSnapshot: math.moneyDecimal(0),
        basisSnapshots: [
          source({
            saleStatusSnapshot: "CANCELLED",
            saleCancelledAtSnapshot: new Date("2026-08-11T02:00:00.000Z"),
            inclusionState: "EXCLUDED_CANCELLED",
            basisAmount: math.moneyDecimal(0),
          }),
        ],
        recipientSnapshots: [
          recipient({ amountSnapshot: math.moneyDecimal(0) }),
        ],
      },
    })
  );
  notEqual(
    first,
    cancellationFingerprint,
    "sale cancellation produces an immutable new calculation fingerprint"
  );

  const configRevisionFingerprint = engine.testInternals.fingerprintItemPlan(
    fingerprintPayload({
      plan: {
        ...fingerprintPayload().plan,
        recipientSnapshots: [
          recipient({
            accountConfigVersionId: "config-2",
            ratePercentSnapshot: math.rateDecimal(6),
            amountSnapshot: math.moneyDecimal(12),
          }),
        ],
      },
    })
  );
  notEqual(
    first,
    configRevisionFingerprint,
    "recipient config revision changes the calculation fingerprint"
  );

  engine.testInternals.assertManager(
    { id: "admin", role: "ADMIN", branchId: "branch-a" },
    "branch-a"
  );
  assertions += 1;
  throwsCode(
    () =>
      engine.testInternals.assertManager(
        { id: "admin", role: "ADMIN", branchId: "branch-a" },
        "branch-b"
      ),
    "BRANCH_ACCESS_DENIED",
    "branch Admin cannot manage another branch cycle"
  );
  throwsCode(
    () =>
      engine.testInternals.assertManager(
        { id: "cashier", role: "CASHIER", branchId: "branch-a" },
        "branch-a"
      ),
    "INCENTIVE_CYCLE_MANAGEMENT_FORBIDDEN",
    "operational staff cannot materialize cycles"
  );
  engine.testInternals.assertManager(
    { id: "main", role: "SUPER_OWNER", branchId: null },
    "branch-b"
  );
  assertions += 1;

  throwsCode(
    () =>
      engine.testInternals.assertItemCycleMaterializationState(
        { status: "EARNING" },
        null
      ),
    "INCENTIVE_ITEM_CYCLE_STILL_EARNING",
    "earning cycle cannot be materialized"
  );
  throwsCode(
    () =>
      engine.testInternals.assertItemCycleMaterializationState(
        { status: "CLOSED" },
        null
      ),
    "INCENTIVE_ITEM_CYCLE_CLOSED_UNMATERIALIZED",
    "closed cycle cannot receive a first materialization"
  );
  engine.testInternals.assertItemCycleMaterializationState(
    { status: "CLOSED" },
    { id: "existing-unclaimed-revision" }
  );
  assertions += 1;
  engine.testInternals.assertItemCycleMaterializationState(
    { status: "CUT_OFF" },
    null
  );
  assertions += 1;
  engine.testInternals.assertItemCycleMaterializationState(
    { status: "CLAIMABLE" },
    null
  );
  assertions += 1;

  equal(
    math.periodCodeForProgramCycle({
      branchId: "branch-a",
      programType: "ITEM_SALE",
      startDate: "2026-08-01",
      endDate: "2026-08-10",
    }) ===
      math.periodCodeForProgramCycle({
        branchId: "branch-a",
        programType: "ORDINARY_REPAIR",
        startDate: "2026-08-01",
        endDate: "2026-08-10",
      }),
    false,
    "ITEM and Ordinary schedules have independent period identities"
  );
  equal(
    math.periodCodeForProgramCycle({
      branchId: "branch-a",
      programType: "ORDINARY_REPAIR",
      startDate: "2026-08-01",
      endDate: "2026-08-10",
    }) ===
      math.periodCodeForProgramCycle({
        branchId: "branch-a",
        programType: "BOARD_LEVEL_REPAIR",
        startDate: "2026-08-01",
        endDate: "2026-08-10",
      }),
    false,
    "Ordinary and Board schedules have independent period identities"
  );

  console.log(`V2 incentive cycle regression: ${assertions} assertions passed.`);
};

run();
