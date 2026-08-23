const { Prisma } = require("@prisma/client");

const AppError = require("../../../utils/appError");
const scheduleMath = require("./incentiveScheduleMath.service");

const ENGINE_VERSION = "V2";
const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_MONEY = new Prisma.Decimal("9999999999.99");

const PROGRAM_TYPES = Object.freeze([
  "ITEM_SALE",
  "ORDINARY_REPAIR",
  "BOARD_LEVEL_REPAIR",
]);

const PROGRAM_TYPE_SET = new Set(PROGRAM_TYPES);
const OPERATIONAL_ROLES = new Set(["CASHIER", "TECHNICIAN"]);
const ITEM_CLASSIFICATIONS = new Set([
  "SALES_AGENT",
  "SENIOR_SALES_AGENT",
  "TECHNICIAN",
  "SENIOR_TECHNICIAN",
]);
const TECHNICAL_CLASSIFICATIONS = new Set([
  "TECHNICIAN",
  "SENIOR_TECHNICIAN",
]);

const decimal = (value) => new Prisma.Decimal(value ?? 0);

const moneyDecimal = (value) =>
  decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

const rateDecimal = (value) =>
  decimal(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

const numberOrNull = (value) =>
  value === null || value === undefined ? null : Number(value);

const assertMoneyRange = (value, fieldName) => {
  const normalized = moneyDecimal(value);

  if (normalized.lt(0) || normalized.gt(MAX_MONEY)) {
    throw new AppError(
      `${fieldName} is outside the supported money range`,
      409,
      "INCENTIVE_MONEY_RANGE_EXCEEDED"
    );
  }

  return normalized;
};

const assertProgramType = (programType) => {
  if (!PROGRAM_TYPE_SET.has(programType)) {
    throw new AppError(
      "Invalid V2 incentive program type",
      400,
      "INVALID_INCENTIVE_PROGRAM_TYPE"
    );
  }

  return programType;
};

const resolveEffectiveClassification = (account) => {
  if (
    account?.incentiveClassification &&
    account.incentiveClassification !== "NONE"
  ) {
    return account.incentiveClassification;
  }

  // Preserve the V2 Settings legacy-safe account mapping. A missing saved
  // configuration still means OFF; this fallback never enables an incentive.
  if (account?.role === "CASHIER") return "SALES_AGENT";
  if (account?.role === "TECHNICIAN") return "TECHNICIAN";

  return "NONE";
};

const isClassificationEligible = (classification, programType) => {
  assertProgramType(programType);

  if (programType === "ITEM_SALE") {
    return ITEM_CLASSIFICATIONS.has(classification);
  }

  if (programType === "ORDINARY_REPAIR") {
    return TECHNICAL_CLASSIFICATIONS.has(classification);
  }

  return classification === "SENIOR_TECHNICIAN";
};

const isOperationalRecipient = (account, programType, branchId) => {
  if (
    !account ||
    account.status !== "ACTIVE" ||
    !OPERATIONAL_ROLES.has(account.role) ||
    account.branchId !== branchId
  ) {
    return false;
  }

  return isClassificationEligible(
    resolveEffectiveClassification(account),
    programType
  );
};

const normalizeDateOnly = (value, fieldName) => {
  if (typeof value === "string") {
    return scheduleMath.parseDateOnly(value, fieldName);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(
      `${fieldName} is invalid`,
      400,
      "INVALID_DATE_ONLY"
    );
  }

  return scheduleMath.storedDateOnly(date);
};

const manilaBusinessInstantRange = (startDate, endDate) => {
  const start = normalizeDateOnly(startDate, "startDate");
  const end = normalizeDateOnly(endDate, "endDate");

  if (start > end) {
    throw new AppError(
      "Cycle start date cannot be later than end date",
      400,
      "INVALID_INCENTIVE_CYCLE_RANGE"
    );
  }

  const startInclusive = new Date(start.getTime() - MANILA_UTC_OFFSET_MS);
  const endExclusive = new Date(
    scheduleMath.addDays(end, 1).getTime() - MANILA_UTC_OFFSET_MS
  );

  return {
    startInclusive,
    endExclusive,
    cutoffInstant: new Date(endExclusive.getTime() - 1),
  };
};

const programTypeForRepairType = (repairType) => {
  if (repairType === "ORDINARY_REPAIR") return "ORDINARY_REPAIR";
  if (repairType === "BOARD_LEVEL_REPAIR") return "BOARD_LEVEL_REPAIR";

  throw new AppError(
    "Repair type is required for a V2 repair incentive",
    409,
    "INCENTIVE_REPAIR_TYPE_REQUIRED"
  );
};

const configFieldsForProgram = (programType) => {
  assertProgramType(programType);

  if (programType === "ITEM_SALE") {
    return {
      enabledField: "itemEnabled",
      rateField: "itemRatePercent",
    };
  }

  if (programType === "ORDINARY_REPAIR") {
    return {
      enabledField: "ordinaryRepairEnabled",
      rateField: "ordinaryRepairRatePercent",
    };
  }

  return {
    enabledField: "boardRepairEnabled",
    rateField: "boardRepairRatePercent",
  };
};

const selectLatestCompatibleConfig = ({
  account,
  versions = [],
  programType,
  branchId,
  effectiveAt,
}) => {
  assertProgramType(programType);

  if (!isOperationalRecipient(account, programType, branchId)) {
    return null;
  }

  const target = effectiveAt instanceof Date ? effectiveAt : new Date(effectiveAt);
  if (Number.isNaN(target.getTime())) {
    throw new AppError(
      "Incentive configuration effective instant is invalid",
      400,
      "INVALID_INCENTIVE_EFFECTIVE_INSTANT"
    );
  }

  const classification = resolveEffectiveClassification(account);

  return (
    versions
      .filter(
        (version) =>
          version.accountId === account.id &&
          // V2 does not infer the historical branch of a legacy version that
          // predates branchIdSnapshot.
          version.branchIdSnapshot === branchId &&
          version.classificationSnapshot === classification &&
          new Date(version.effectiveFrom).getTime() <= target.getTime()
      )
      .sort((left, right) => {
        const effectiveDifference =
          new Date(right.effectiveFrom).getTime() -
          new Date(left.effectiveFrom).getTime();

        if (effectiveDifference !== 0) return effectiveDifference;

        const createdDifference =
          new Date(right.createdAt || 0).getTime() -
          new Date(left.createdAt || 0).getTime();

        if (createdDifference !== 0) return createdDifference;
        return String(right.id).localeCompare(String(left.id));
      })[0] || null
  );
};

const calculateAwardAmount = (basisAmount, ratePercent) => {
  const basis = assertMoneyRange(basisAmount, "Incentive basis");
  const rate = rateDecimal(ratePercent);

  if (rate.lte(0) || rate.gt(100)) {
    throw new AppError(
      "Enabled incentive rate must be greater than 0 and not more than 100",
      409,
      "INVALID_INCENTIVE_RATE_SNAPSHOT"
    );
  }

  return assertMoneyRange(
    basis.mul(rate).div(100),
    "Calculated incentive"
  );
};

const buildRecipientSnapshot = ({
  account,
  configVersion,
  programType,
  branchId,
  basisAmount,
}) => {
  if (!isOperationalRecipient(account, programType, branchId)) {
    return null;
  }

  const classificationSnapshot = resolveEffectiveClassification(account);
  const { enabledField, rateField } = configFieldsForProgram(programType);
  const enabledSnapshot = Boolean(configVersion?.[enabledField]);
  const ratePercentSnapshot = enabledSnapshot
    ? rateDecimal(configVersion?.[rateField])
    : null;
  const normalizedBasis = assertMoneyRange(
    basisAmount,
    "Branch-wide item incentive basis"
  );
  const amountSnapshot = enabledSnapshot
    ? calculateAwardAmount(normalizedBasis, ratePercentSnapshot)
    : moneyDecimal(0);

  return {
    staffId: account.id,
    branchIdSnapshot: branchId,
    roleSnapshot: account.role,
    classificationSnapshot,
    enabledSnapshot,
    ratePercentSnapshot,
    amountSnapshot,
    // Preserve the exact effective configuration even when the program is
    // OFF. The zero award is still an immutable configuration decision, not
    // an absence of provenance.
    accountConfigVersionId: configVersion?.id || null,
  };
};

const buildItemRecipientSnapshots = ({
  accounts = [],
  configVersions = [],
  branchId,
  cutoffInstant,
  branchBasisAmount,
}) =>
  accounts
    .filter((account) =>
      isOperationalRecipient(account, "ITEM_SALE", branchId)
    )
    .map((account) => {
      const configVersion = selectLatestCompatibleConfig({
        account,
        versions: configVersions,
        programType: "ITEM_SALE",
        branchId,
        effectiveAt: cutoffInstant,
      });

      return buildRecipientSnapshot({
        account,
        configVersion,
        programType: "ITEM_SALE",
        branchId,
        basisAmount: branchBasisAmount,
      });
    });

const normalizePriceTiers = (eligiblePriceTiers) => {
  if (!Array.isArray(eligiblePriceTiers)) {
    throw new AppError(
      "Eligible Price Tiers snapshot is invalid",
      409,
      "INVALID_ELIGIBLE_PRICE_TIERS_SNAPSHOT"
    );
  }

  const normalized = eligiblePriceTiers.map(Number);
  if (
    normalized.some(
      (tier) => !Number.isInteger(tier) || tier < 1 || tier > 5
    ) ||
    new Set(normalized).size !== normalized.length
  ) {
    throw new AppError(
      "Eligible Price Tiers snapshot must contain unique P1 to P5 values",
      409,
      "INVALID_ELIGIBLE_PRICE_TIERS_SNAPSHOT"
    );
  }

  return [...normalized].sort((left, right) => left - right);
};

const analyzeItemBasisLines = ({
  saleItems = [],
  eligiblePriceTiers,
}) => {
  const tierSet = new Set(normalizePriceTiers(eligiblePriceTiers));
  const snapshots = [];
  const discounted = [];
  const missingBaseSnapshots = [];

  for (const saleItem of saleItems) {
    const priceTier = Number(saleItem.priceTier);

    if (!saleItem.itemId || !tierSet.has(priceTier)) continue;

    const saleStatusSnapshot = saleItem.sale?.status || null;
    const saleCancelledAtSnapshot = saleItem.sale?.cancelledAt || null;

    const grossQuantity = decimal(saleItem.quantity);
    if (grossQuantity.lte(0)) {
      throw new AppError(
        "Eligible sale item quantity snapshot is invalid",
        409,
        "INCENTIVE_ITEM_QUANTITY_INVALID"
      );
    }

    const completedReturnItems = (saleItem.returnItems || []).filter(
      (returnItem) => returnItem.returnRequest?.status === "COMPLETED"
    );
    const returnedQuantity = completedReturnItems.reduce(
      (sum, returnItem) => sum.plus(decimal(returnItem.quantity)),
      decimal(0)
    );

    if (returnedQuantity.lt(0) || returnedQuantity.gt(grossQuantity)) {
      throw new AppError(
        "Completed return quantity exceeds the original eligible sale quantity",
        409,
        "INCENTIVE_RETURN_QUANTITY_INVALID"
      );
    }

    const netQuantity = grossQuantity.minus(returnedQuantity);
    const sourceIdentity = {
      saleId: saleItem.saleId,
      saleItemId: saleItem.id,
      receiptCode: saleItem.sale?.receiptCode || null,
    };

    const isCancelled = saleStatusSnapshot === "CANCELLED";
    const isFullyReturned = netQuantity.eq(0);
    const inclusionState = isCancelled
      ? "EXCLUDED_CANCELLED"
      : isFullyReturned
        ? "EXCLUDED_FULLY_RETURNED"
        : "INCLUDED";
    const includedQuantity = inclusionState === "INCLUDED"
      ? netQuantity
      : decimal(0);

    // Once net quantity is zero, no discount-allocation or missing-base choice
    // can affect the branch basis. Cancelled sources are also retained at zero
    // so later materialization revisions never make them silently disappear.
    if (includedQuantity.gt(0) && decimal(saleItem.discountAmount).gt(0)) {
      discounted.push(sourceIdentity);
      continue;
    }

    if (
      includedQuantity.gt(0) &&
      (saleItem.baseUnitPriceSnapshot === null ||
        saleItem.baseUnitPriceSnapshot === undefined)
    ) {
      missingBaseSnapshots.push(sourceIdentity);
      continue;
    }

    const baseUnitPriceSnapshot =
      saleItem.baseUnitPriceSnapshot === null ||
      saleItem.baseUnitPriceSnapshot === undefined
        ? null
        : assertMoneyRange(
            saleItem.baseUnitPriceSnapshot,
            "Item base unit price snapshot"
          );
    const basisAmount = baseUnitPriceSnapshot
      ? assertMoneyRange(
          baseUnitPriceSnapshot.mul(includedQuantity),
          "Eligible item line basis"
        )
      : moneyDecimal(0);

    snapshots.push({
      saleId: saleItem.saleId,
      saleItemId: saleItem.id,
      sourceCode: saleItem.sale?.receiptCode || "",
      sourceDate: saleItem.sale?.saleDate || null,
      saleStatusSnapshot,
      saleCancelledAtSnapshot,
      inclusionState,
      inclusionReason:
        inclusionState === "EXCLUDED_CANCELLED"
          ? "Source sale was cancelled"
          : inclusionState === "EXCLUDED_FULLY_RETURNED"
            ? "Eligible quantity was fully returned"
            : null,
      priceTier,
      grossQuantitySnapshot: grossQuantity,
      returnedQuantitySnapshot: returnedQuantity,
      netQuantitySnapshot: netQuantity,
      baseUnitPriceSnapshot,
      basisAmount,
      returnSourcesSnapshot: completedReturnItems.map((returnItem) => ({
        returnRequestId: returnItem.returnRequestId,
        returnItemId: returnItem.id,
        returnCode: returnItem.returnRequest?.returnCode || null,
        completedAt: returnItem.returnRequest?.completedAt || null,
        quantity: decimal(returnItem.quantity).toFixed(2),
      })),
    });
  }

  const branchBasisAmount = snapshots.reduce(
    (sum, snapshot) => sum.plus(snapshot.basisAmount),
    moneyDecimal(0)
  );

  return {
    snapshots,
    branchBasisAmount: assertMoneyRange(
      branchBasisAmount,
      "Branch-wide eligible item sales basis"
    ),
    discounted,
    missingBaseSnapshots,
  };
};

const attachCoverageDetails = (error, sources) => {
  error.details = {
    count: sources.length,
    sources: sources.map((source) => ({
      saleId: source.saleId,
      saleItemId: source.saleItemId,
      receiptCode: source.receiptCode,
    })),
  };

  return error;
};

const assertItemBasisCoverage = (analysis) => {
  if (analysis.discounted.length > 0) {
    throw attachCoverageDetails(
      new AppError(
        "Eligible discounted item lines cannot be allocated while the item discount rule is unresolved",
        409,
        "ITEM_DISCOUNT_ALLOCATION_UNRESOLVED"
      ),
      analysis.discounted
    );
  }

  if (analysis.missingBaseSnapshots.length > 0) {
    throw attachCoverageDetails(
      new AppError(
        "Eligible item lines are missing transaction-time base price snapshots",
        409,
        "ITEM_BASE_SNAPSHOT_MISSING"
      ),
      analysis.missingBaseSnapshots
    );
  }

  return analysis;
};

const calculateItemCyclePlan = ({
  saleItems,
  eligiblePriceTiers,
  accounts,
  configVersions,
  branchId,
  cutoffInstant,
}) => {
  const analysis = assertItemBasisCoverage(
    analyzeItemBasisLines({ saleItems, eligiblePriceTiers })
  );
  const recipients = buildItemRecipientSnapshots({
    accounts,
    configVersions,
    branchId,
    cutoffInstant,
    branchBasisAmount: analysis.branchBasisAmount,
  });

  return {
    eligiblePriceTiersSnapshot: normalizePriceTiers(eligiblePriceTiers),
    branchBasisAmountSnapshot: analysis.branchBasisAmount,
    basisSnapshots: analysis.snapshots,
    recipientSnapshots: recipients,
    awards: recipients.filter(
      (recipient) => recipient.enabledSnapshot && recipient.amountSnapshot.gt(0)
    ),
  };
};

const buildRepairAwardPlan = ({ serviceJob, performer, configVersion }) => {
  if (!serviceJob || serviceJob.status !== "COMPLETED") return null;
  if (!serviceJob.releasedAt || !serviceJob.financialSnapshotAt) return null;
  if (!serviceJob.serviceDoneById || serviceJob.serviceDoneById !== performer?.id) {
    throw new AppError(
      "V2 repair incentive requires the snapshotted actual Service Done By",
      409,
      "INCENTIVE_SERVICE_PERFORMER_MISMATCH"
    );
  }

  const programType = programTypeForRepairType(serviceJob.repairType);
  if (!isOperationalRecipient(performer, programType, serviceJob.branchId)) {
    return null;
  }

  const { enabledField, rateField } = configFieldsForProgram(programType);
  if (!configVersion?.[enabledField]) return null;

  if (
    configVersion.accountId !== performer.id ||
    configVersion.branchIdSnapshot !== serviceJob.branchId ||
    configVersion.classificationSnapshot !==
      resolveEffectiveClassification(performer)
  ) {
    throw new AppError(
      "Repair incentive configuration provenance does not match the actual performer",
      409,
      "INCENTIVE_REPAIR_CONFIG_MISMATCH"
    );
  }

  const basisAmount = assertMoneyRange(
    serviceJob.baseServiceCharge,
    "Repair base price snapshot"
  );
  if (basisAmount.eq(0)) return null;

  const ratePercent = rateDecimal(configVersion[rateField]);
  const amount = calculateAwardAmount(basisAmount, ratePercent);

  if (
    serviceJob.incentivePostingDisposition === "POSTED" &&
    (serviceJob.configuredRepairIncentiveRateSnapshot === null ||
      serviceJob.configuredRepairIncentiveRateSnapshot === undefined ||
      !ratePercent.eq(serviceJob.configuredRepairIncentiveRateSnapshot))
  ) {
    throw new AppError(
      "Configured repair incentive rate does not match the effective account configuration",
      409,
      "INCENTIVE_REPAIR_CONFIGURED_RATE_SNAPSHOT_MISMATCH"
    );
  }

  if (
    (serviceJob.incentivePostingDisposition === "POSTED" &&
      (serviceJob.repairIncentiveRateSnapshot === null ||
        serviceJob.repairIncentiveRateSnapshot === undefined)) ||
    (serviceJob.repairIncentiveRateSnapshot !== null &&
      serviceJob.repairIncentiveRateSnapshot !== undefined &&
      !ratePercent.eq(serviceJob.repairIncentiveRateSnapshot))
  ) {
    throw new AppError(
      "Repair incentive rate does not match the ServiceJob financial snapshot",
      409,
      "INCENTIVE_REPAIR_RATE_SNAPSHOT_MISMATCH"
    );
  }

  if (
    (serviceJob.incentivePostingDisposition === "POSTED" &&
      (serviceJob.repairIncentiveAmountSnapshot === null ||
        serviceJob.repairIncentiveAmountSnapshot === undefined)) ||
    (serviceJob.repairIncentiveAmountSnapshot !== null &&
      serviceJob.repairIncentiveAmountSnapshot !== undefined &&
      !amount.eq(serviceJob.repairIncentiveAmountSnapshot))
  ) {
    throw new AppError(
      "Repair incentive amount does not match the ServiceJob financial snapshot",
      409,
      "INCENTIVE_REPAIR_AMOUNT_SNAPSHOT_MISMATCH"
    );
  }

  return {
    engineVersion: ENGINE_VERSION,
    programType,
    staffId: performer.id,
    classificationSnapshot: resolveEffectiveClassification(performer),
    accountConfigVersionId: configVersion.id,
    basisAmount,
    ratePercent,
    amount,
    sourceDate: serviceJob.releasedAt,
    sourceKey: `V2:REPAIR:${serviceJob.id}:${performer.id}`,
  };
};

const periodCodeForProgramCycle = ({
  branchId,
  programType,
  startDate,
  endDate,
}) => {
  assertProgramType(programType);

  if (!branchId) {
    throw new AppError(
      "Branch is required for a V2 incentive cycle",
      409,
      "INCENTIVE_CYCLE_BRANCH_REQUIRED"
    );
  }

  const start = scheduleMath.dateText(
    normalizeDateOnly(startDate, "startDate")
  ).replaceAll("-", "");
  const end = scheduleMath.dateText(
    normalizeDateOnly(endDate, "endDate")
  ).replaceAll("-", "");

  return `V2:${branchId}:${programType}:${start}-${end}`;
};

module.exports = {
  ENGINE_VERSION,
  PROGRAM_TYPES,
  buildItemRecipientSnapshots,
  buildRecipientSnapshot,
  buildRepairAwardPlan,
  calculateAwardAmount,
  calculateItemCyclePlan,
  configFieldsForProgram,
  isClassificationEligible,
  isOperationalRecipient,
  manilaBusinessInstantRange,
  moneyDecimal,
  normalizePriceTiers,
  periodCodeForProgramCycle,
  programTypeForRepairType,
  rateDecimal,
  resolveEffectiveClassification,
  selectLatestCompatibleConfig,

  testInternals: Object.freeze({
    analyzeItemBasisLines,
    assertItemBasisCoverage,
    assertMoneyRange,
    attachCoverageDetails,
    numberOrNull,
  }),
};
