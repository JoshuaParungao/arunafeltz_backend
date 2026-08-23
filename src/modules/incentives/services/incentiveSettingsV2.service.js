const { Prisma } = require("@prisma/client");

const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { createAuditLog } = require("../../../utils/auditLogger");
const scheduleMath = require("./incentiveScheduleMath.service");

const CONFIGURABLE_USER_ROLES = new Set([
  "CASHIER",
  "TECHNICIAN",
]);

const INCENTIVE_CLASSIFICATIONS = new Set([
  "SALES_AGENT",
  "SENIOR_SALES_AGENT",
  "TECHNICIAN",
  "SENIOR_TECHNICIAN",
]);

const TECHNICAL_CLASSIFICATIONS = new Set([
  "TECHNICIAN",
  "SENIOR_TECHNICIAN",
]);

const ACCOUNT_SELECT = {
  id: true,
  employeeCode: true,
  username: true,
  fullName: true,
  role: true,
  incentiveClassification: true,
  status: true,
  branchId: true,
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
  createdAt: true,
  updatedAt: true,
};

const resolveManageAccess = (actor) => {
  if (!actor) {
    throw new AppError(
      "Authentication required",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  }

  if (actor.role === "SUPER_OWNER") {
    return {
      isGlobal: true,
      branchId: null,
    };
  }

  if (actor.role === "ADMIN") {
    if (!actor.branchId) {
      throw new AppError(
        "Admin account is not assigned to a branch",
        403,
        "USER_BRANCH_REQUIRED"
      );
    }

    return {
      isGlobal: false,
      branchId: actor.branchId,
    };
  }

  throw new AppError(
    "Only Main Admin or branch Admin can manage incentive account configuration",
    403,
    "INCENTIVE_ACCOUNT_CONFIG_FORBIDDEN"
  );
};

const resolveEffectiveClassification = (account) => {
  if (
    account.incentiveClassification &&
    account.incentiveClassification !== "NONE"
  ) {
    return account.incentiveClassification;
  }

  // Legacy-safe fallback for existing staff rows.
  if (account.role === "CASHIER") return "SALES_AGENT";
  if (account.role === "TECHNICIAN") return "TECHNICIAN";

  return "NONE";
};

const getEligibility = (classification) => ({
  item: INCENTIVE_CLASSIFICATIONS.has(classification),
  ordinaryRepair: TECHNICAL_CLASSIFICATIONS.has(classification),
  boardLevelRepair: classification === "SENIOR_TECHNICIAN",
  repairFee: TECHNICAL_CLASSIFICATIONS.has(classification),
});

const numberOrNull = (value) =>
  value === null || value === undefined ? null : Number(value);

const formatSavedConfig = (version) =>
  version
    ? {
        id: version.id,
        effectiveFrom: version.effectiveFrom,
        branchIdSnapshot: version.branchIdSnapshot || null,
        classificationSnapshot: version.classificationSnapshot,

        itemEnabled: version.itemEnabled,
        itemRatePercent: numberOrNull(version.itemRatePercent),

        ordinaryRepairEnabled: version.ordinaryRepairEnabled,
        ordinaryRepairRatePercent: numberOrNull(
          version.ordinaryRepairRatePercent
        ),

        boardRepairEnabled: version.boardRepairEnabled,
        boardRepairRatePercent: numberOrNull(
          version.boardRepairRatePercent
        ),

        repairFee: numberOrNull(version.repairFee),

        notes: version.notes,
        createdAt: version.createdAt,
        createdBy: version.createdBy || null,
      }
    : null;

const buildDefaultConfiguration = (eligibility) => ({
  item: {
    available: eligibility.item,
    enabled: false,
    ratePercent: null,
  },

  ordinaryRepair: {
    available: eligibility.ordinaryRepair,
    enabled: false,
    ratePercent: null,
  },

  boardLevelRepair: {
    available: eligibility.boardLevelRepair,
    enabled: false,
    ratePercent: null,
  },

  repairFee: {
    available: eligibility.repairFee,
    amount: null,
  },
});

const buildEffectiveConfiguration = ({
  savedConfig,
  eligibility,
  classificationMatches,
  branchMatches = true,
}) => {
  if (!savedConfig || !classificationMatches || !branchMatches) {
    return buildDefaultConfiguration(eligibility);
  }

  return {
    item: {
      available: eligibility.item,
      enabled: eligibility.item && savedConfig.itemEnabled,
      ratePercent:
        eligibility.item && savedConfig.itemEnabled
          ? savedConfig.itemRatePercent
          : null,
    },

    ordinaryRepair: {
      available: eligibility.ordinaryRepair,
      enabled:
        eligibility.ordinaryRepair &&
        savedConfig.ordinaryRepairEnabled,
      ratePercent:
        eligibility.ordinaryRepair &&
        savedConfig.ordinaryRepairEnabled
          ? savedConfig.ordinaryRepairRatePercent
          : null,
    },

    boardLevelRepair: {
      available: eligibility.boardLevelRepair,
      enabled:
        eligibility.boardLevelRepair &&
        savedConfig.boardRepairEnabled,
      ratePercent:
        eligibility.boardLevelRepair &&
        savedConfig.boardRepairEnabled
          ? savedConfig.boardRepairRatePercent
          : null,
    },

    repairFee: {
      available: eligibility.repairFee,
      amount: eligibility.repairFee ? savedConfig.repairFee : null,
    },
  };
};

const normalizeOptionalText = (value) => {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized || null;
};

const rateDecimal = (value) =>
  new Prisma.Decimal(value).toDecimalPlaces(
    4,
    Prisma.Decimal.ROUND_HALF_UP
  );

const moneyDecimal = (value) =>
  new Prisma.Decimal(value).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP
  );

const assertClassificationCompatible = (
  account,
  effectiveClassification
) => {
  const salesClassifications = new Set([
    "SALES_AGENT",
    "SENIOR_SALES_AGENT",
  ]);

  if (
    account.role === "CASHIER" &&
    !salesClassifications.has(effectiveClassification)
  ) {
    throw new AppError(
      "Sales staff account has an incompatible incentive classification",
      409,
      "INCENTIVE_ACCOUNT_CLASSIFICATION_INVALID"
    );
  }

  if (
    account.role === "TECHNICIAN" &&
    !TECHNICAL_CLASSIFICATIONS.has(effectiveClassification)
  ) {
    throw new AppError(
      "Technical staff account has an incompatible incentive classification",
      409,
      "INCENTIVE_ACCOUNT_CLASSIFICATION_INVALID"
    );
  }
};

const normalizeCategoryConfig = ({
  label,
  available,
  enabled,
  ratePercent,
}) => {
  if (typeof enabled !== "boolean") {
    throw new AppError(
      `${label} enabled state must be boolean`,
      400,
      "INVALID_INCENTIVE_ACCOUNT_CONFIG"
    );
  }

  const hasRate =
    ratePercent !== null &&
    ratePercent !== undefined;

  if (!available) {
    if (enabled || hasRate) {
      throw new AppError(
        `${label} is not available for this account classification`,
        400,
        "INCENTIVE_CATEGORY_NOT_ELIGIBLE"
      );
    }

    return {
      enabled: false,
      ratePercent: null,
    };
  }

  if (!enabled) {
    if (hasRate) {
      throw new AppError(
        `${label} rate must be null when the incentive is OFF`,
        400,
        "INCENTIVE_DISABLED_RATE_MUST_BE_NULL"
      );
    }

    return {
      enabled: false,
      ratePercent: null,
    };
  }

  const numericRate = Number(ratePercent);

  if (
    !Number.isFinite(numericRate) ||
    numericRate <= 0 ||
    numericRate > 100
  ) {
    throw new AppError(
      `${label} rate must be greater than 0 and not more than 100`,
      400,
      "INVALID_INCENTIVE_RATE"
    );
  }

  return {
    enabled: true,
    ratePercent: rateDecimal(numericRate),
  };
};

const normalizeRepairFee = ({
  available,
  repairFee,
}) => {
  const hasRepairFee =
    repairFee !== null &&
    repairFee !== undefined;

  if (!available) {
    if (hasRepairFee) {
      throw new AppError(
        "Repair Fee is only available for technical staff",
        400,
        "REPAIR_FEE_NOT_ELIGIBLE"
      );
    }

    return null;
  }

  if (!hasRepairFee) return null;

  const numericFee = Number(repairFee);

  if (
    !Number.isFinite(numericFee) ||
    numericFee < 0 ||
    numericFee > 9999999999.99
  ) {
    throw new AppError(
      "Repair Fee must be between 0 and 9,999,999,999.99",
      400,
      "INVALID_REPAIR_FEE"
    );
  }

  return moneyDecimal(numericFee);
};

const normalizeAccountConfigPayload = (
  payload,
  eligibility
) => {
  const item = normalizeCategoryConfig({
    label: "Item Incentive",
    available: eligibility.item,
    enabled: payload.itemEnabled,
    ratePercent: payload.itemRatePercent,
  });

  const ordinaryRepair = normalizeCategoryConfig({
    label: "Ordinary Repair Incentive",
    available: eligibility.ordinaryRepair,
    enabled: payload.ordinaryRepairEnabled,
    ratePercent: payload.ordinaryRepairRatePercent,
  });

  const boardRepair = normalizeCategoryConfig({
    label: "Board Level Repair Incentive",
    available: eligibility.boardLevelRepair,
    enabled: payload.boardRepairEnabled,
    ratePercent: payload.boardRepairRatePercent,
  });

  const repairFee = normalizeRepairFee({
    available: eligibility.repairFee,
    repairFee: payload.repairFee,
  });

  return {
    itemEnabled: item.enabled,
    itemRatePercent: item.ratePercent,

    ordinaryRepairEnabled: ordinaryRepair.enabled,
    ordinaryRepairRatePercent:
      ordinaryRepair.ratePercent,

    boardRepairEnabled: boardRepair.enabled,
    boardRepairRatePercent:
      boardRepair.ratePercent,

    repairFee,

    notes:
      normalizeOptionalText(payload.notes),
  };
};

const createAccountConfigVersionInTransaction = async (
  tx,
  actor,
  accountId,
  payload
) => {
  const access = resolveManageAccess(actor);

  const account = await tx.user.findUnique({
    where: {
      id: accountId,
    },
    select: ACCOUNT_SELECT,
  });

  if (!account) {
    throw new AppError(
      "Staff account not found",
      404,
      "INCENTIVE_ACCOUNT_NOT_FOUND"
    );
  }

  if (!CONFIGURABLE_USER_ROLES.has(account.role)) {
    throw new AppError(
      "Only Sales Agent or Technician accounts can receive incentive configuration",
      400,
      "INCENTIVE_ACCOUNT_NOT_CONFIGURABLE"
    );
  }

  if (account.status !== "ACTIVE") {
    throw new AppError(
      "Only ACTIVE staff accounts can be configured",
      409,
      "INCENTIVE_ACCOUNT_NOT_ACTIVE"
    );
  }

  if (!account.branchId) {
    throw new AppError(
      "Staff account is not assigned to a branch",
      409,
      "INCENTIVE_ACCOUNT_BRANCH_REQUIRED"
    );
  }

  if (
    access.branchId &&
    account.branchId !== access.branchId
  ) {
    throw new AppError(
      "Admin can only configure staff in the assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  const effectiveClassification =
    resolveEffectiveClassification(account);

  assertClassificationCompatible(
    account,
    effectiveClassification
  );

  const eligibility =
    getEligibility(effectiveClassification);

  const normalized =
    normalizeAccountConfigPayload(
      payload,
      eligibility
    );

  const lockKey =
    `incentive-account-config:${account.id}`;

  const lockRows = await tx.$queryRaw`
    SELECT 1::int AS "lockAcquired"
    FROM pg_advisory_xact_lock(hashtext(${lockKey}))
  `;

  if (
    !Array.isArray(lockRows) ||
    lockRows.length !== 1 ||
    Number(lockRows[0].lockAcquired) !== 1
  ) {
    throw new AppError(
      "Unable to acquire incentive account configuration lock",
      500,
      "INCENTIVE_ACCOUNT_CONFIG_LOCK_FAILED"
    );
  }

  const previousVersion =
    await tx.incentiveAccountConfigVersion.findFirst({
      where: {
        accountId: account.id,
      },
      orderBy: [
        {
          effectiveFrom: "desc",
        },
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      select: {
        id: true,
        effectiveFrom: true,
      },
    });

  let effectiveFrom = new Date();

  if (
    previousVersion &&
    effectiveFrom.getTime() <=
      previousVersion.effectiveFrom.getTime()
  ) {
    effectiveFrom = new Date(
      previousVersion.effectiveFrom.getTime() + 1
    );
  }

  const version =
    await tx.incentiveAccountConfigVersion.create({
      data: {
        effectiveFrom,

        branchIdSnapshot:
          account.branchId,

        classificationSnapshot:
          effectiveClassification,

        itemEnabled:
          normalized.itemEnabled,

        itemRatePercent:
          normalized.itemRatePercent,

        ordinaryRepairEnabled:
          normalized.ordinaryRepairEnabled,

        ordinaryRepairRatePercent:
          normalized.ordinaryRepairRatePercent,

        boardRepairEnabled:
          normalized.boardRepairEnabled,

        boardRepairRatePercent:
          normalized.boardRepairRatePercent,

        repairFee:
          normalized.repairFee,

        notes:
          normalized.notes,

        accountId:
          account.id,

        createdById:
          actor.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

  await createAuditLog(
    {
      actor,
      branchId:
        account.branchId,

      action:
        "INCENTIVE_ACCOUNT_CONFIG_VERSION_CREATED",

      entityType:
        "IncentiveAccountConfigVersion",

      entityId:
        version.id,

      description:
        `Incentive account configuration saved for ${account.fullName}`,

      metadata: {
        accountId:
          account.id,

        employeeCode:
          account.employeeCode,

        classificationSnapshot:
          effectiveClassification,

        branchIdSnapshot:
          account.branchId,

        previousVersionId:
          previousVersion?.id || null,

        effectiveFrom:
          version.effectiveFrom.toISOString(),

        itemEnabled:
          version.itemEnabled,

        itemRatePercent:
          version.itemRatePercent === null
            ? null
            : version.itemRatePercent.toString(),

        ordinaryRepairEnabled:
          version.ordinaryRepairEnabled,

        ordinaryRepairRatePercent:
          version.ordinaryRepairRatePercent === null
            ? null
            : version.ordinaryRepairRatePercent.toString(),

        boardRepairEnabled:
          version.boardRepairEnabled,

        boardRepairRatePercent:
          version.boardRepairRatePercent === null
            ? null
            : version.boardRepairRatePercent.toString(),

        repairFee:
          version.repairFee === null
            ? null
            : version.repairFee.toString(),
      },
    },
    tx
  );

  const savedConfig =
    formatSavedConfig(version);

  return {
    account: {
      id:
        account.id,

      employeeCode:
        account.employeeCode,

      username:
        account.username,

      fullName:
        account.fullName,

      role:
        account.role,

      storedIncentiveClassification:
        account.incentiveClassification,

      effectiveIncentiveClassification:
        effectiveClassification,

      status:
        account.status,

      branchId:
        account.branchId,

      branch:
        account.branch,
    },

    eligibility,

    configurationState:
      "CONFIGURED",

    configuration:
      buildEffectiveConfiguration({
        savedConfig,
        eligibility,
        classificationMatches: true,
      }),

    latestSavedVersion:
      savedConfig,
  };
};

const createAccountConfigVersion = async (
  actor,
  accountId,
  payload
) => {
  try {
    return await prisma.$transaction((tx) =>
      createAccountConfigVersionInTransaction(
        tx,
        actor,
        accountId,
        payload
      )
    );
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError(
        "Another incentive configuration version was saved at the same time. Please retry.",
        409,
        "INCENTIVE_ACCOUNT_CONFIG_VERSION_CONFLICT"
      );
    }

    throw error;
  }
};

const PROGRAM_RULE_TYPES = Object.freeze([
  "ITEM_SALE",
  "ORDINARY_REPAIR",
  "BOARD_LEVEL_REPAIR",
]);

const PROGRAM_RULE_TYPE_SET =
  new Set(PROGRAM_RULE_TYPES);

const PROGRAM_RULE_BRANCH_SELECT = {
  id: true,
  code: true,
  name: true,
  status: true,
};

const assertProgramRuleType = (programType) => {
  if (!PROGRAM_RULE_TYPE_SET.has(programType)) {
    throw new AppError(
      "Invalid incentive program type",
      400,
      "INVALID_INCENTIVE_PROGRAM_TYPE"
    );
  }

  return programType;
};

const resolveProgramRuleAccess = (actor) => {
  if (!actor) {
    throw new AppError(
      "Authentication required",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  }

  if (actor.role === "SUPER_OWNER") {
    return {
      isGlobal: true,
      branchId: null,
    };
  }

  if (actor.role === "ADMIN") {
    if (!actor.branchId) {
      throw new AppError(
        "Admin account is not assigned to a branch",
        403,
        "USER_BRANCH_REQUIRED"
      );
    }

    return {
      isGlobal: false,
      branchId: actor.branchId,
    };
  }

  throw new AppError(
    "Only Main Admin or branch Admin can manage incentive program rules",
    403,
    "INCENTIVE_PROGRAM_RULES_FORBIDDEN"
  );
};

const resolveProgramRuleBranchId = (
  access,
  requestedBranchId,
  {
    requiredForGlobal = false,
  } = {}
) => {
  const normalizedBranchId =
    normalizeOptionalText(requestedBranchId);

  if (access.isGlobal) {
    if (
      requiredForGlobal &&
      !normalizedBranchId
    ) {
      throw new AppError(
        "Branch is required when Main Admin saves an incentive program rule",
        400,
        "INCENTIVE_PROGRAM_RULE_BRANCH_REQUIRED"
      );
    }

    return normalizedBranchId;
  }

  if (
    normalizedBranchId &&
    normalizedBranchId !== access.branchId
  ) {
    throw new AppError(
      "Admin can only manage incentive program rules for the assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return access.branchId;
};

const normalizeEligiblePriceTiers = (value) => {
  if (!Array.isArray(value)) {
    throw new AppError(
      "Eligible Price Tiers must be an array",
      400,
      "INVALID_ELIGIBLE_PRICE_TIERS"
    );
  }

  const normalized =
    value.map((tier) => Number(tier));

  if (
    normalized.some(
      (tier) =>
        !Number.isInteger(tier) ||
        tier < 1 ||
        tier > 5
    )
  ) {
    throw new AppError(
      "Eligible Price Tiers can only contain P1 to P5",
      400,
      "INVALID_ELIGIBLE_PRICE_TIER"
    );
  }

  if (
    new Set(normalized).size !==
    normalized.length
  ) {
    throw new AppError(
      "Eligible Price Tiers cannot contain duplicates",
      400,
      "DUPLICATE_ELIGIBLE_PRICE_TIER"
    );
  }

  return [...normalized].sort(
    (a, b) => a - b
  );
};

const normalizeProgramRulePayload = (
  programType,
  payload = {}
) => {
  assertProgramRuleType(programType);

  const eligiblePriceTiers =
    normalizeEligiblePriceTiers(
      payload.eligiblePriceTiers
    );

  const hasRepairCostPercent =
    payload.repairCostPercent !== null &&
    payload.repairCostPercent !== undefined;

  if (programType === "ITEM_SALE") {
    if (hasRepairCostPercent) {
      throw new AppError(
        "Item Sale program does not use Repair Cost Percent",
        400,
        "ITEM_RULE_REPAIR_COST_MUST_BE_NULL"
      );
    }

    return {
      eligiblePriceTiers,
      repairCostPercent: null,
      notes:
        normalizeOptionalText(
          payload.notes
        ),
    };
  }

  if (eligiblePriceTiers.length !== 0) {
    throw new AppError(
      "Repair programs do not use eligible Price Tiers",
      400,
      "REPAIR_RULE_PRICE_TIERS_MUST_BE_EMPTY"
    );
  }

  if (!hasRepairCostPercent) {
    throw new AppError(
      "Repair Cost Percent is required for repair programs",
      400,
      "REPAIR_COST_PERCENT_REQUIRED"
    );
  }

  const numericRepairCostPercent =
    Number(payload.repairCostPercent);

  if (
    !Number.isFinite(
      numericRepairCostPercent
    ) ||
    numericRepairCostPercent < 0 ||
    numericRepairCostPercent > 100
  ) {
    throw new AppError(
      "Repair Cost Percent must be between 0 and 100",
      400,
      "INVALID_REPAIR_COST_PERCENT"
    );
  }

  return {
    eligiblePriceTiers: [],
    repairCostPercent:
      rateDecimal(
        numericRepairCostPercent
      ),
    notes:
      normalizeOptionalText(
        payload.notes
      ),
  };
};

const formatProgramRuleVersion = (version) => {
  if (!version) return null;

  const repairCostPercent =
    numberOrNull(
      version.repairCostPercent
    );

  const companySharePercent =
    repairCostPercent === null
      ? null
      : Number(
          new Prisma.Decimal(100)
            .minus(
              version.repairCostPercent
            )
            .toDecimalPlaces(
              4,
              Prisma.Decimal.ROUND_HALF_UP
            )
        );

  return {
    id: version.id,
    branchId: version.branchId,
    programType: version.programType,
    effectiveFrom: version.effectiveFrom,

    eligiblePriceTiers:
      [...version.eligiblePriceTiers],

    repairCostPercent,
    companySharePercent,

    notes: version.notes,
    createdAt: version.createdAt,
    createdBy: version.createdBy || null,
  };
};

const buildProgramRuleConfiguration = (
  programType,
  savedVersion
) => {
  assertProgramRuleType(programType);

  if (programType === "ITEM_SALE") {
    return {
      eligiblePriceTiers:
        savedVersion
          ? [
              ...savedVersion
                .eligiblePriceTiers,
            ]
          : [],

      repairCostPercent: null,
      companySharePercent: null,
    };
  }

  return {
    eligiblePriceTiers: [],

    repairCostPercent:
      savedVersion
        ? savedVersion
            .repairCostPercent
        : null,

    companySharePercent:
      savedVersion
        ? savedVersion
            .companySharePercent
        : null,
  };
};

const getProgramRules = async (
  actor,
  query = {}
) => {
  const access =
    resolveProgramRuleAccess(actor);

  const targetBranchId =
    resolveProgramRuleBranchId(
      access,
      query.branchId,
      {
        requiredForGlobal: false,
      }
    );

  const branches =
    await prisma.branch.findMany({
      where: {
        status: "ACTIVE",

        ...(targetBranchId
          ? {
              id: targetBranchId,
            }
          : {}),
      },

      select:
        PROGRAM_RULE_BRANCH_SELECT,

      orderBy: [
        { code: "asc" },
        { id: "asc" },
      ],
    });

  if (
    targetBranchId &&
    branches.length === 0
  ) {
    throw new AppError(
      "Active branch not found",
      404,
      "INCENTIVE_PROGRAM_RULE_BRANCH_NOT_FOUND"
    );
  }

  const branchIds =
    branches.map(
      (branch) => branch.id
    );

  const versions =
    branchIds.length === 0
      ? []
      : await prisma
          .incentiveProgramRuleVersion
          .findMany({
            where: {
              branchId: {
                in: branchIds,
              },
            },

            include: {
              createdBy: {
                select: {
                  id: true,
                  fullName: true,
                  role: true,
                },
              },
            },

            orderBy: [
              { branchId: "asc" },
              { programType: "asc" },
              { effectiveFrom: "desc" },
              { createdAt: "desc" },
              { id: "desc" },
            ],
          });

  const latestByProgram =
    new Map();

  for (const version of versions) {
    const key =
      `${version.branchId}:${version.programType}`;

    if (!latestByProgram.has(key)) {
      latestByProgram.set(
        key,
        version
      );
    }
  }

  return {
    scope: {
      type:
        targetBranchId
          ? "BRANCH"
          : "GLOBAL",

      branchId:
        targetBranchId,
    },

    branches:
      branches.map((branch) => ({
        branch,

        programs:
          PROGRAM_RULE_TYPES.map(
            (programType) => {
              const key =
                `${branch.id}:${programType}`;

              const rawVersion =
                latestByProgram.get(key) ||
                null;

              const savedVersion =
                formatProgramRuleVersion(
                  rawVersion
                );

              return {
                programType,

                configurationState:
                  savedVersion
                    ? "CONFIGURED"
                    : "UNCONFIGURED",

                configuration:
                  buildProgramRuleConfiguration(
                    programType,
                    savedVersion
                  ),

                latestSavedVersion:
                  savedVersion,
              };
            }
          ),
      })),
  };
};

const createProgramRuleVersionInTransaction =
  async (
    tx,
    actor,
    programType,
    payload
  ) => {
    assertProgramRuleType(programType);

    const access =
      resolveProgramRuleAccess(actor);

    const branchId =
      resolveProgramRuleBranchId(
        access,
        payload.branchId,
        {
          requiredForGlobal: true,
        }
      );

    const branch =
      await tx.branch.findUnique({
        where: {
          id: branchId,
        },

        select:
          PROGRAM_RULE_BRANCH_SELECT,
      });

    if (!branch) {
      throw new AppError(
        "Branch not found",
        404,
        "INCENTIVE_PROGRAM_RULE_BRANCH_NOT_FOUND"
      );
    }

    if (branch.status !== "ACTIVE") {
      throw new AppError(
        "Only ACTIVE branches can be configured",
        409,
        "INCENTIVE_PROGRAM_RULE_BRANCH_NOT_ACTIVE"
      );
    }

    const normalized =
      normalizeProgramRulePayload(
        programType,
        payload
      );

    const lockKey =
      `incentive-program-rule:${branch.id}:${programType}`;

    const lockRows =
      await tx.$queryRaw`
        SELECT 1::int AS "lockAcquired"
        FROM pg_advisory_xact_lock(
          hashtext(${lockKey})
        )
      `;

    if (
      !Array.isArray(lockRows) ||
      lockRows.length !== 1 ||
      Number(
        lockRows[0].lockAcquired
      ) !== 1
    ) {
      throw new AppError(
        "Unable to acquire incentive program rule lock",
        500,
        "INCENTIVE_PROGRAM_RULE_LOCK_FAILED"
      );
    }

    const previousVersion =
      await tx
        .incentiveProgramRuleVersion
        .findFirst({
          where: {
            branchId:
              branch.id,

            programType,
          },

          orderBy: [
            { effectiveFrom: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],

          select: {
            id: true,
            effectiveFrom: true,
          },
        });

    let effectiveFrom =
      new Date();

    if (
      previousVersion &&
      effectiveFrom.getTime() <=
        previousVersion
          .effectiveFrom
          .getTime()
    ) {
      effectiveFrom =
        new Date(
          previousVersion
            .effectiveFrom
            .getTime() + 1
        );
    }

    const version =
      await tx
        .incentiveProgramRuleVersion
        .create({
          data: {
            branchId:
              branch.id,

            programType,
            effectiveFrom,

            eligiblePriceTiers:
              normalized
                .eligiblePriceTiers,

            repairCostPercent:
              normalized
                .repairCostPercent,

            notes:
              normalized.notes,

            createdById:
              actor.id,
          },

          include: {
            createdBy: {
              select: {
                id: true,
                fullName: true,
                role: true,
              },
            },
          },
        });

    const savedVersion =
      formatProgramRuleVersion(
        version
      );

    await createAuditLog(
      {
        actor,

        branchId:
          branch.id,

        action:
          "INCENTIVE_PROGRAM_RULE_VERSION_CREATED",

        entityType:
          "IncentiveProgramRuleVersion",

        entityId:
          version.id,

        description:
          `${programType} incentive program rule saved for ${branch.code}`,

        metadata: {
          branchId:
            branch.id,

          branchCode:
            branch.code,

          programType,

          previousVersionId:
            previousVersion?.id ||
            null,

          effectiveFrom:
            version.effectiveFrom
              .toISOString(),

          eligiblePriceTiers:
            version
              .eligiblePriceTiers,

          repairCostPercent:
            version
              .repairCostPercent ===
            null
              ? null
              : version
                  .repairCostPercent
                  .toString(),

          companySharePercent:
            savedVersion
              .companySharePercent,
        },
      },
      tx
    );

    return {
      branch,
      programType,

      configurationState:
        "CONFIGURED",

      configuration:
        buildProgramRuleConfiguration(
          programType,
          savedVersion
        ),

      latestSavedVersion:
        savedVersion,
    };
  };

const createProgramRuleVersion = async (
  actor,
  programType,
  payload
) => {
  try {
    return await prisma.$transaction(
      (tx) =>
        createProgramRuleVersionInTransaction(
          tx,
          actor,
          programType,
          payload
        )
    );
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError(
        "Another incentive program rule version was saved at the same time. Please retry.",
        409,
        "INCENTIVE_PROGRAM_RULE_VERSION_CONFLICT"
      );
    }

    throw error;
  }
};

const PROGRAM_SCHEDULE_TYPES =
  PROGRAM_RULE_TYPES;

const PROGRAM_SCHEDULE_TYPE_SET =
  PROGRAM_RULE_TYPE_SET;

const PROGRAM_SCHEDULE_BRANCH_SELECT =
  PROGRAM_RULE_BRANCH_SELECT;

const assertProgramScheduleType = (
  programType
) => {
  if (
    !PROGRAM_SCHEDULE_TYPE_SET.has(
      programType
    )
  ) {
    throw new AppError(
      "Invalid incentive program type",
      400,
      "INVALID_INCENTIVE_PROGRAM_TYPE"
    );
  }

  return programType;
};

const resolveProgramScheduleAccess = (
  actor
) => {
  if (!actor) {
    throw new AppError(
      "Authentication required",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  }

  if (
    actor.role ===
    "SUPER_OWNER"
  ) {
    return {
      isGlobal: true,
      branchId: null,
    };
  }

  if (
    actor.role === "ADMIN"
  ) {
    if (!actor.branchId) {
      throw new AppError(
        "Admin account is not assigned to a branch",
        403,
        "USER_BRANCH_REQUIRED"
      );
    }

    return {
      isGlobal: false,
      branchId:
        actor.branchId,
    };
  }

  throw new AppError(
    "Only Main Admin or branch Admin can manage incentive program schedules",
    403,
    "INCENTIVE_PROGRAM_SCHEDULES_FORBIDDEN"
  );
};

const resolveProgramScheduleBranchId = (
  access,
  requestedBranchId,
  {
    requiredForGlobal = false,
  } = {}
) => {
  const normalizedBranchId =
    normalizeOptionalText(
      requestedBranchId
    );

  if (access.isGlobal) {
    if (
      requiredForGlobal &&
      !normalizedBranchId
    ) {
      throw new AppError(
        "Branch is required when Main Admin manages an incentive program schedule",
        400,
        "INCENTIVE_PROGRAM_SCHEDULE_BRANCH_REQUIRED"
      );
    }

    return normalizedBranchId;
  }

  if (
    normalizedBranchId &&
    normalizedBranchId !==
      access.branchId
  ) {
    throw new AppError(
      "Admin can only manage incentive program schedules for the assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  return access.branchId;
};

const formatProgramScheduleVersion = (
  version
) => {
  if (!version) {
    return null;
  }

  return {
    id:
      version.id,

    branchId:
      version.branchId,

    programType:
      version.programType,

    scheduleType:
      version.scheduleType,

    anchorDate:
      scheduleMath.dateText(
        version.anchorDate
      ),

    effectiveFrom:
      scheduleMath.dateText(
        version.effectiveFrom
      ),

    everyNDays:
      version.everyNDays,

    claimOpenAfterDays:
      version.claimOpenAfterDays,

    claimWindowDays:
      version.claimWindowDays,

    notes:
      version.notes,

    manualRequired:
      version.scheduleType ===
      "MANUAL",

    preview:
      scheduleMath
        .previewNormalizedSchedule(
          version,
          4
        ),

    createdAt:
      version.createdAt,

    createdBy:
      version.createdBy ||
      null,
  };
};

const buildProgramScheduleConfiguration = (
  savedVersion
) => {
  if (!savedVersion) {
    return {
      scheduleType: null,
      anchorDate: null,
      effectiveFrom: null,
      everyNDays: null,
      claimOpenAfterDays: null,
      claimWindowDays: null,
      manualRequired: false,
      preview: [],
    };
  }

  return {
    scheduleType:
      savedVersion.scheduleType,

    anchorDate:
      savedVersion.anchorDate,

    effectiveFrom:
      savedVersion.effectiveFrom,

    everyNDays:
      savedVersion.everyNDays,

    claimOpenAfterDays:
      savedVersion
        .claimOpenAfterDays,

    claimWindowDays:
      savedVersion
        .claimWindowDays,

    manualRequired:
      savedVersion
        .manualRequired,

    preview:
      savedVersion.preview,
  };
};

const getProgramSchedules = async (
  actor,
  query = {}
) => {
  const access =
    resolveProgramScheduleAccess(
      actor
    );

  const targetBranchId =
    resolveProgramScheduleBranchId(
      access,
      query.branchId,
      {
        requiredForGlobal:
          false,
      }
    );

  const branches =
    await prisma.branch.findMany({
      where: {
        status: "ACTIVE",

        ...(targetBranchId
          ? {
              id:
                targetBranchId,
            }
          : {}),
      },

      select:
        PROGRAM_SCHEDULE_BRANCH_SELECT,

      orderBy: [
        {
          code: "asc",
        },
        {
          id: "asc",
        },
      ],
    });

  if (
    targetBranchId &&
    branches.length === 0
  ) {
    throw new AppError(
      "Active branch not found",
      404,
      "INCENTIVE_PROGRAM_SCHEDULE_BRANCH_NOT_FOUND"
    );
  }

  const branchIds =
    branches.map(
      (branch) =>
        branch.id
    );

  const versions =
    branchIds.length === 0
      ? []
      : await prisma
          .incentiveProgramScheduleVersion
          .findMany({
            where: {
              branchId: {
                in:
                  branchIds,
              },
            },

            include: {
              createdBy: {
                select: {
                  id: true,
                  fullName: true,
                  role: true,
                },
              },
            },

            orderBy: [
              {
                branchId:
                  "asc",
              },
              {
                programType:
                  "asc",
              },
              {
                effectiveFrom:
                  "desc",
              },
              {
                createdAt:
                  "desc",
              },
              {
                id: "desc",
              },
            ],
          });

  const latestByProgram =
    new Map();

  for (
    const version
    of versions
  ) {
    const key =
      `${version.branchId}:${version.programType}`;

    if (
      !latestByProgram.has(
        key
      )
    ) {
      latestByProgram.set(
        key,
        version
      );
    }
  }

  return {
    scope: {
      type:
        targetBranchId
          ? "BRANCH"
          : "GLOBAL",

      branchId:
        targetBranchId,
    },

    branches:
      branches.map(
        (branch) => ({
          branch,

          programs:
            PROGRAM_SCHEDULE_TYPES.map(
              (
                programType
              ) => {
                const key =
                  `${branch.id}:${programType}`;

                const rawVersion =
                  latestByProgram.get(
                    key
                  ) ||
                  null;

                const savedVersion =
                  formatProgramScheduleVersion(
                    rawVersion
                  );

                return {
                  programType,

                  configurationState:
                    savedVersion
                      ? "CONFIGURED"
                      : "UNCONFIGURED",

                  configuration:
                    buildProgramScheduleConfiguration(
                      savedVersion
                    ),

                  latestSavedVersion:
                    savedVersion,
                };
              }
            ),
        })
      ),
  };
};

const previewProgramSchedule = async (
  actor,
  programType,
  payload
) => {
  assertProgramScheduleType(
    programType
  );

  const access =
    resolveProgramScheduleAccess(
      actor
    );

  const branchId =
    resolveProgramScheduleBranchId(
      access,
      payload.branchId,
      {
        requiredForGlobal:
          true,
      }
    );

  const branch =
    await prisma.branch.findUnique({
      where: {
        id: branchId,
      },

      select:
        PROGRAM_SCHEDULE_BRANCH_SELECT,
    });

  if (
    !branch ||
    branch.status !== "ACTIVE"
  ) {
    throw new AppError(
      "Active branch not found",
      404,
      "INCENTIVE_PROGRAM_SCHEDULE_BRANCH_NOT_FOUND"
    );
  }

  const count =
    Number(
      payload.count ?? 4
    );

  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 12
  ) {
    throw new AppError(
      "Schedule preview count must be between 1 and 12",
      400,
      "INVALID_INCENTIVE_SCHEDULE_PREVIEW_COUNT"
    );
  }

  const normalized =
    scheduleMath
      .normalizeScheduleInput(
        payload,
        {
          allowPast:
            true,
        }
      );

  const preview =
    scheduleMath
      .previewNormalizedSchedule(
        normalized,
        count
      );

  return {
    branch,
    programType,

    schedule: {
      scheduleType:
        normalized.scheduleType,

      anchorDate:
        scheduleMath.dateText(
          normalized.anchorDate
        ),

      effectiveFrom:
        scheduleMath.dateText(
          normalized.effectiveFrom
        ),

      everyNDays:
        normalized.everyNDays,

      claimOpenAfterDays:
        normalized
          .claimOpenAfterDays,

      claimWindowDays:
        normalized
          .claimWindowDays,

      notes:
        normalized.notes,
    },

    periods:
      preview,

    manualRequired:
      normalized
        .scheduleType ===
      "MANUAL",
  };
};

const createProgramScheduleVersionInTransaction =
  async (
    tx,
    actor,
    programType,
    payload
  ) => {
    assertProgramScheduleType(
      programType
    );

    const access =
      resolveProgramScheduleAccess(
        actor
      );

    const branchId =
      resolveProgramScheduleBranchId(
        access,
        payload.branchId,
        {
          requiredForGlobal:
            true,
        }
      );

    const branch =
      await tx.branch.findUnique({
        where: {
          id: branchId,
        },

        select:
          PROGRAM_SCHEDULE_BRANCH_SELECT,
      });

    if (!branch) {
      throw new AppError(
        "Branch not found",
        404,
        "INCENTIVE_PROGRAM_SCHEDULE_BRANCH_NOT_FOUND"
      );
    }

    if (
      branch.status !==
      "ACTIVE"
    ) {
      throw new AppError(
        "Only ACTIVE branches can be configured",
        409,
        "INCENTIVE_PROGRAM_SCHEDULE_BRANCH_NOT_ACTIVE"
      );
    }

    const normalized =
      scheduleMath
        .normalizeScheduleInput(
          payload
        );

    const lockKey =
      `incentive-program-schedule:${branch.id}:${programType}`;

    const lockRows =
      await tx.$queryRaw`
        SELECT 1::int AS "lockAcquired"
        FROM pg_advisory_xact_lock(
          hashtext(${lockKey})
        )
      `;

    if (
      !Array.isArray(
        lockRows
      ) ||
      lockRows.length !== 1 ||
      Number(
        lockRows[0]
          .lockAcquired
      ) !== 1
    ) {
      throw new AppError(
        "Unable to acquire incentive program schedule lock",
        500,
        "INCENTIVE_PROGRAM_SCHEDULE_LOCK_FAILED"
      );
    }

    const previousVersion =
      await tx
        .incentiveProgramScheduleVersion
        .findFirst({
          where: {
            branchId:
              branch.id,

            programType,
          },

          orderBy: [
            {
              effectiveFrom:
                "desc",
            },
            {
              createdAt:
                "desc",
            },
            {
              id:
                "desc",
            },
          ],
        });

    if (
      previousVersion &&
      normalized
        .effectiveFrom <=
        scheduleMath
          .storedDateOnly(
            previousVersion
              .effectiveFrom
          )
    ) {
      throw new AppError(
        "New schedule versions must begin after the latest saved version for this branch and program",
        409,
        "INCENTIVE_PROGRAM_SCHEDULE_NOT_APPEND_ONLY"
      );
    }

    /*
     * Preserve the verified legacy predecessor-boundary
     * safety for automatic schedules.
     *
     * MANUAL has explicit periods and does not have
     * automatic cycle boundaries. Its actual period
     * overlap rules will be enforced later when V2
     * cycles are connected to the posting engine.
     */
    if (
      previousVersion &&
      previousVersion
        .scheduleType !==
        "MANUAL"
    ) {
      const predecessorBounds =
        scheduleMath
          .calculateCycleBounds(
            previousVersion,
            normalized
              .effectiveFrom
          );

      if (
        !predecessorBounds ||
        predecessorBounds
          .startDate
          .getTime() !==
          normalized
            .effectiveFrom
            .getTime()
      ) {
        throw new AppError(
          "The new schedule must begin on a valid boundary of the preceding schedule",
          409,
          "INCENTIVE_PROGRAM_SCHEDULE_PREDECESSOR_BOUNDARY_REQUIRED"
        );
      }
    }

    const version =
      await tx
        .incentiveProgramScheduleVersion
        .create({
          data: {
            branchId:
              branch.id,

            programType,

            scheduleType:
              normalized
                .scheduleType,

            anchorDate:
              normalized
                .anchorDate,

            effectiveFrom:
              normalized
                .effectiveFrom,

            everyNDays:
              normalized
                .everyNDays,

            claimOpenAfterDays:
              normalized
                .claimOpenAfterDays,

            claimWindowDays:
              normalized
                .claimWindowDays,

            notes:
              normalized.notes,

            createdById:
              actor.id,
          },

          include: {
            createdBy: {
              select: {
                id: true,
                fullName: true,
                role: true,
              },
            },
          },
        });

    const savedVersion =
      formatProgramScheduleVersion(
        version
      );

    await createAuditLog(
      {
        actor,

        branchId:
          branch.id,

        action:
          "INCENTIVE_PROGRAM_SCHEDULE_VERSION_CREATED",

        entityType:
          "IncentiveProgramScheduleVersion",

        entityId:
          version.id,

        description:
          `${programType} incentive schedule saved for ${branch.code}`,

        metadata: {
          branchId:
            branch.id,

          branchCode:
            branch.code,

          programType,

          previousVersionId:
            previousVersion?.id ||
            null,

          scheduleType:
            version.scheduleType,

          anchorDate:
            scheduleMath
              .dateText(
                version
                  .anchorDate
              ),

          effectiveFrom:
            scheduleMath
              .dateText(
                version
                  .effectiveFrom
              ),

          everyNDays:
            version.everyNDays,

          claimOpenAfterDays:
            version
              .claimOpenAfterDays,

          claimWindowDays:
            version
              .claimWindowDays,

          manualRequired:
            version
              .scheduleType ===
            "MANUAL",
        },
      },
      tx
    );

    return {
      branch,
      programType,

      configurationState:
        "CONFIGURED",

      configuration:
        buildProgramScheduleConfiguration(
          savedVersion
        ),

      latestSavedVersion:
        savedVersion,
    };
  };

const createProgramScheduleVersion =
  async (
    actor,
    programType,
    payload
  ) => {
    try {
      return await prisma
        .$transaction(
          (tx) =>
            createProgramScheduleVersionInTransaction(
              tx,
              actor,
              programType,
              payload
            )
        );
    } catch (error) {
      if (
        error?.code ===
        "P2002"
      ) {
        throw new AppError(
          "Another incentive schedule version was saved at the same effective date. Please retry.",
          409,
          "INCENTIVE_PROGRAM_SCHEDULE_VERSION_CONFLICT"
        );
      }

      throw error;
    }
  };

const getAccountConfigurations = async (actor) => {
  const access = resolveManageAccess(actor);

  const accounts = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: {
        in: [...CONFIGURABLE_USER_ROLES],
      },
      ...(access.branchId
        ? {
            branchId: access.branchId,
          }
        : {}),
    },
    select: ACCOUNT_SELECT,
    orderBy: [
      { branchId: "asc" },
      { fullName: "asc" },
      { id: "asc" },
    ],
  });

  const accountIds = accounts.map((account) => account.id);

  const versions =
    accountIds.length === 0
      ? []
      : await prisma.incentiveAccountConfigVersion.findMany({
          where: {
            accountId: {
              in: accountIds,
            },
          },
          include: {
            createdBy: {
              select: {
                id: true,
                fullName: true,
                role: true,
              },
            },
          },
          orderBy: [
            { accountId: "asc" },
            { effectiveFrom: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
        });

  const latestVersionByAccount = new Map();

  for (const version of versions) {
    if (!latestVersionByAccount.has(version.accountId)) {
      latestVersionByAccount.set(version.accountId, version);
    }
  }

  return {
    scope: {
      type: access.isGlobal ? "GLOBAL" : "BRANCH",
      branchId: access.branchId,
    },

    accounts: accounts.map((account) => {
      const effectiveClassification =
        resolveEffectiveClassification(account);

      const eligibility = getEligibility(effectiveClassification);

      const rawVersion =
        latestVersionByAccount.get(account.id) || null;

      const savedConfig = formatSavedConfig(rawVersion);

      const classificationMatches = Boolean(
        savedConfig &&
          savedConfig.classificationSnapshot ===
            effectiveClassification
      );

      const branchMatches = Boolean(
        savedConfig &&
          savedConfig.branchIdSnapshot ===
            account.branchId
      );

      const configurationState = !savedConfig
        ? "UNCONFIGURED"
        : !branchMatches
          ? "STALE_BRANCH"
          : classificationMatches
            ? "CONFIGURED"
            : "STALE_CLASSIFICATION";

      return {
        id: account.id,
        employeeCode: account.employeeCode,
        username: account.username,
        fullName: account.fullName,

        role: account.role,
        storedIncentiveClassification:
          account.incentiveClassification,
        effectiveIncentiveClassification:
          effectiveClassification,

        status: account.status,
        branchId: account.branchId,
        branch: account.branch,

        canEarnNow: account.status === "ACTIVE",
        eligibility,

        configurationState,
        configuration: buildEffectiveConfiguration({
          savedConfig,
          eligibility,
          classificationMatches,
          branchMatches,
        }),

        latestSavedVersion: savedConfig,

        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      };
    }),
  };
};

module.exports = {
  createAccountConfigVersion,
  createProgramRuleVersion,
  createProgramScheduleVersion,
  getAccountConfigurations,
  getProgramRules,
  getProgramSchedules,
  previewProgramSchedule,

  testInternals: Object.freeze({
    createAccountConfigVersionInTransaction,
    createProgramRuleVersionInTransaction,
    createProgramScheduleVersionInTransaction,
    resolveProgramScheduleAccess,
    resolveProgramScheduleBranchId,
    buildProgramScheduleConfiguration,
    resolveProgramRuleAccess,
    resolveProgramRuleBranchId,
    normalizeProgramRulePayload,
    buildProgramRuleConfiguration,
    resolveManageAccess,
    resolveEffectiveClassification,
    getEligibility,
    buildDefaultConfiguration,
    buildEffectiveConfiguration,
  }),
};
