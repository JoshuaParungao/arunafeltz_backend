const assert = require("node:assert/strict");

const router = require("./src/modules/incentives/routes/incentive.routes");
const validation = require("./src/modules/incentives/validations/incentive.validation");
const engine = require("./src/modules/incentives/services/incentiveEngineV2.service");

let assertions = 0;

const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

const equal = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  assertions += 1;
};

const rejectsCode = async (promise, code, message) => {
  await assert.rejects(promise, (error) => error?.code === code, message);
  assertions += 1;
};

const throwsCode = (callback, code, message) => {
  assert.throws(callback, (error) => error?.code === code, message);
  assertions += 1;
};

const run = async () => {
  const registeredRoutes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort(),
    }));
  const hasRoute = (method, path) =>
    registeredRoutes.some(
      (entry) => entry.path === path && entry.methods.includes(method)
    );

  check(hasRoute("get", "/program-readiness"), "readiness API is registered");
  check(hasRoute("get", "/program-cycles"), "V2 cycle list API is registered");
  check(
    hasRoute("post", "/program-cycles/manual"),
    "manual per-program cycle API is registered"
  );
  check(
    hasRoute("post", "/program-cycles/item/materialize"),
    "item cycle materialization-by-date API is registered"
  );
  check(
    hasRoute("post", "/program-cycles/:id/materialize"),
    "item cycle revision API is registered"
  );
  check(
    hasRoute("post", "/program-cycles/:id/claim"),
    "V2 own-claim API is registered"
  );
  check(
    hasRoute("post", "/cycles/:id/claim"),
    "legacy claim compatibility API remains registered"
  );

  equal(
    validation.createManualProgramCycleSchema.safeParse({
      body: {
        branchId: "branch-a",
        programType: "BOARD_LEVEL_REPAIR",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      },
    }).success,
    true,
    "manual Board cycle validates"
  );
  equal(
    validation.createManualProgramCycleSchema.safeParse({
      body: {
        branchId: "branch-a",
        programType: "GLOBAL",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      },
    }).success,
    false,
    "legacy GLOBAL program cannot enter V2 cycle API"
  );
  equal(
    validation.materializeItemCycleForDateSchema.safeParse({
      body: {
        branchId: "branch-a",
        targetDate: "2026-08-31",
        unexpected: true,
      },
    }).success,
    false,
    "materialization payload rejects unknown fields"
  );
  equal(
    validation.claimProgramCycleSchema.safeParse({
      params: { id: "cycle-a" },
      body: { notes: "Claim my earned cycle" },
    }).success,
    true,
    "V2 own-claim payload validates"
  );

  await rejectsCode(
    engine.getProgramReadiness(
      { id: "cashier", role: "CASHIER", branchId: "branch-a" },
      {},
      {}
    ),
    "INCENTIVE_PROGRAM_READINESS_FORBIDDEN",
    "operational staff cannot inspect manager readiness details"
  );
  await rejectsCode(
    engine.getProgramReadiness(
      { id: "admin", role: "ADMIN", branchId: "branch-a" },
      { branchId: "branch-b" },
      {}
    ),
    "BRANCH_ACCESS_DENIED",
    "branch Admin cannot inspect another branch readiness"
  );
  await rejectsCode(
    engine.listProgramCycles(
      { id: "admin", role: "ADMIN", branchId: "branch-a" },
      { branchId: "branch-b" },
      {}
    ),
    "BRANCH_ACCESS_DENIED",
    "branch user cannot list another branch V2 cycles"
  );

  const cycleFixture = {
    id: "cycle-a",
    engineVersion: "V2",
    programType: "ITEM_SALE",
    periodCode: "V2:branch-a:ITEM_SALE:20260801-20260831",
    startDate: new Date("2026-08-01T00:00:00.000Z"),
    endDate: new Date("2026-08-31T00:00:00.000Z"),
    cutoffDate: new Date("2026-08-31T00:00:00.000Z"),
    claimOpenDate: new Date("2026-09-01T00:00:00.000Z"),
    claimCloseDate: new Date("2026-09-07T00:00:00.000Z"),
    status: "CLAIMABLE",
    closedAt: null,
    branchId: "branch-a",
    branch: { id: "branch-a", code: "A", name: "Branch A" },
    programScheduleVersionId: "schedule-a",
    programScheduleVersion: { id: "schedule-a", scheduleType: "WEEKLY" },
    itemCycleRevisions: [
      {
        id: "revision-sensitive",
        calculationFingerprint: "secret-fingerprint",
        branchBasisAmountSnapshot: "1000",
      },
    ],
    incentives: [
      {
        id: "award-own",
        type: "SALE_ITEM",
        status: "POSTED",
        sourceCode: "V2-CYCLE",
        sourceDate: new Date("2026-08-31T15:59:59.999Z"),
        basisAmount: "1000",
        ratePercent: "2",
        amount: "20",
        classificationSnapshot: "SALES_AGENT",
        postedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    ],
    claims: [
      {
        id: "claim-own",
        status: "CLAIMED",
        classificationSnapshot: "SALES_AGENT",
        productBasis: "1000",
        productRate: "2",
        productIncentive: "20",
        serviceBasis: "0",
        serviceRate: null,
        serviceIncentive: "0",
        totalIncentive: "20",
        lines: [],
      },
    ],
  };
  let staffCycleQuery;
  const staffCycles = await engine.listProgramCycles(
    { id: "cashier", role: "CASHIER", branchId: "branch-a" },
    {},
    {
      incentiveCycle: {
        findMany: async (query) => {
          staffCycleQuery = query;
          return [cycleFixture];
        },
      },
    }
  );
  equal(
    staffCycleQuery.include.incentives.where.staffId,
    "cashier",
    "staff cycle query is backend-scoped to the authenticated employee"
  );
  check(
    !Object.hasOwn(staffCycleQuery.include, "itemCycleRevisions"),
    "staff query does not load branch-wide revision details"
  );
  check(
    !Object.hasOwn(staffCycles[0], "itemCycleRevisions") &&
      !JSON.stringify(staffCycles[0]).includes("secret-fingerprint"),
    "staff response omits branch-wide basis revision and fingerprint"
  );
  equal(
    staffCycles[0].ownAwards[0].id,
    "award-own",
    "staff response exposes only its own award projection"
  );
  equal(
    staffCycles[0].ownClaim.id,
    "claim-own",
    "staff response exposes its own claim projection"
  );

  let managerCycleQuery;
  await engine.listProgramCycles(
    { id: "admin", role: "ADMIN", branchId: "branch-a" },
    {},
    {
      incentiveCycle: {
        findMany: async (query) => {
          managerCycleQuery = query;
          return [];
        },
      },
    }
  );
  check(
    Object.hasOwn(managerCycleQuery.include, "itemCycleRevisions"),
    "manager cycle view retains branch-wide active revision detail"
  );

  const emptyReadiness = await engine.getProgramReadiness(
    { id: "main", role: "SUPER_OWNER", branchId: null },
    {},
    {
      branch: {
        findMany: async () => [],
      },
    }
  );
  equal(emptyReadiness.engineVersion, "V2", "readiness is explicitly V2");
  equal(
    emptyReadiness.businessTimeZone,
    "Asia/Manila",
    "readiness exposes the business timezone"
  );
  equal(emptyReadiness.branches.length, 0, "global empty readiness is safe");

  const readinessDatabase = ({ eligiblePriceTiers, itemEnabled }) => ({
    branch: {
      findMany: async () => [
        { id: "branch-a", code: "A", name: "Branch A" },
      ],
    },
    incentiveProgramRuleVersion: {
      findMany: async () => [
        {
          id: "rule-item",
          branchId: "branch-a",
          programType: "ITEM_SALE",
          eligiblePriceTiers,
          repairCostPercent: null,
        },
      ],
    },
    incentiveProgramScheduleVersion: {
      findMany: async () => [
        {
          id: "schedule-item",
          branchId: "branch-a",
          programType: "ITEM_SALE",
          scheduleType: "WEEKLY",
        },
      ],
    },
    user: {
      findMany: async () => [
        {
          id: "cashier",
          role: "CASHIER",
          status: "ACTIVE",
          branchId: "branch-a",
          incentiveClassification: "SALES_AGENT",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    },
    incentiveCycle: { findMany: async () => [] },
    incentiveAccountConfigVersion: {
      findMany: async () => [
        {
          id: "config-item",
          accountId: "cashier",
          branchIdSnapshot: "branch-a",
          classificationSnapshot: "SALES_AGENT",
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          itemEnabled,
          itemRatePercent: itemEnabled ? "2" : null,
        },
      ],
    },
  });

  const noTierReadiness = await engine.getProgramReadiness(
    { id: "admin", role: "ADMIN", branchId: "branch-a" },
    {},
    readinessDatabase({ eligiblePriceTiers: [], itemEnabled: true })
  );
  const noTierItem = noTierReadiness.branches[0].programs.find(
    (program) => program.programType === "ITEM_SALE"
  );
  equal(
    noTierItem.configurationReady,
    false,
    "zero eligible ITEM tiers is not configuration-ready"
  );
  equal(
    noTierItem.payableRecipientReady,
    true,
    "recipient readiness is reported independently from rule readiness"
  );
  equal(
    noTierItem.readyForPosting,
    false,
    "zero eligible ITEM tiers cannot report payable posting readiness"
  );

  const noRecipientReadiness = await engine.getProgramReadiness(
    { id: "admin", role: "ADMIN", branchId: "branch-a" },
    {},
    readinessDatabase({ eligiblePriceTiers: [1], itemEnabled: false })
  );
  const noRecipientItem = noRecipientReadiness.branches[0].programs.find(
    (program) => program.programType === "ITEM_SALE"
  );
  equal(
    noRecipientItem.configurationReady,
    true,
    "valid rule and automatic schedule are configuration-ready"
  );
  equal(
    noRecipientItem.payableRecipientReady,
    false,
    "OFF recipients are not payable-recipient-ready"
  );
  equal(
    noRecipientItem.readyForPosting,
    false,
    "no enabled recipient cannot report payable posting readiness"
  );

  throwsCode(
    () =>
      engine.testInternals.assertPostedRepairPlan(
        { incentivePostingDisposition: "POSTED" },
        null
      ),
    "INCENTIVE_REPAIR_POSTED_PLAN_INVALID",
    "POSTED repair disposition cannot silently degrade to NOT_ELIGIBLE"
  );
  throwsCode(
    () =>
      engine.testInternals.assertRepairCycleProvenance(
        {
          incentivePostingDisposition: "POSTED",
          programScheduleVersionId: "schedule-a",
          incentiveCycleId: "cycle-a",
        },
        {
          disposition: "POSTED",
          schedule: { id: "schedule-a" },
          cycle: {
            id: "cycle-other",
            programScheduleVersionId: "schedule-a",
          },
        }
      ),
    "INCENTIVE_REPAIR_CYCLE_PROVENANCE_MISMATCH",
    "repair posting rejects a cycle that differs from the JO snapshot"
  );
  engine.testInternals.assertRepairCycleProvenance(
    {
      incentivePostingDisposition: "POSTED",
      programScheduleVersionId: "schedule-a",
      incentiveCycleId: "cycle-a",
    },
    {
      disposition: "POSTED",
      schedule: { id: "schedule-a" },
      cycle: {
        id: "cycle-a",
        programScheduleVersionId: "schedule-a",
      },
    }
  );
  assertions += 1;

  await rejectsCode(
    engine.testInternals.assertRevisionUnclaimed(
      {
        incentiveClaimLine: {
          findFirst: async () => ({ id: "line-1", claimId: "claim-1" }),
        },
      },
      "revision-1"
    ),
    "INCENTIVE_CLAIM_SETTLEMENT_REQUIRED",
    "claimed item revision cannot be reversed or restated"
  );

  console.log(`V2 incentive API regression: ${assertions} assertions passed.`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
