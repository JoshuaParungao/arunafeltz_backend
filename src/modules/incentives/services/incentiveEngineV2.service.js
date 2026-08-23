const crypto = require("node:crypto");

const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { createAuditLog } = require("../../../utils/auditLogger");
const scheduleMath = require("./incentiveScheduleMath.service");
const math = require("./incentiveEngineV2Math.service");

const MANAGER_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);
const COMPLETED_REPAIR_OUTCOMES = new Set([
  "REPAIRED",
  "SERVICE_COMPLETED",
]);

const PROGRAM_SCHEDULE_INCLUDE = {
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
};

const V2_CYCLE_INCLUDE = {
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  programScheduleVersion: true,
};

const RECIPIENT_SELECT = {
  id: true,
  role: true,
  status: true,
  branchId: true,
  incentiveClassification: true,
  createdAt: true,
};

const CONFIG_VERSION_SELECT = {
  id: true,
  accountId: true,
  branchIdSnapshot: true,
  classificationSnapshot: true,
  effectiveFrom: true,
  createdAt: true,
  itemEnabled: true,
  itemRatePercent: true,
  ordinaryRepairEnabled: true,
  ordinaryRepairRatePercent: true,
  boardRepairEnabled: true,
  boardRepairRatePercent: true,
  repairFee: true,
};

const normalizeOptionalText = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const assertManager = (actor, branchId) => {
  if (!actor || !MANAGER_ROLES.has(actor.role)) {
    throw new AppError(
      "Owner or Admin access is required to manage V2 incentive cycles",
      403,
      "INCENTIVE_CYCLE_MANAGEMENT_FORBIDDEN"
    );
  }

  if (!branchId) {
    throw new AppError(
      "Branch is required to manage a V2 incentive cycle",
      400,
      "INCENTIVE_CYCLE_BRANCH_REQUIRED"
    );
  }

  if (actor.role !== "SUPER_OWNER" && actor.branchId !== branchId) {
    throw new AppError(
      "You can only manage V2 incentive cycles for your branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const cycleStatusForDate = (cycle, now = new Date()) => {
  const today = scheduleMath.localDateOnly(now);
  const endDate = scheduleMath.storedDateOnly(cycle.endDate);
  const claimOpenDate = scheduleMath.storedDateOnly(cycle.claimOpenDate);
  const claimCloseDate = scheduleMath.storedDateOnly(cycle.claimCloseDate);

  if (today <= endDate) return "EARNING";
  if (today < claimOpenDate) return "CUT_OFF";
  if (today <= claimCloseDate) return "CLAIMABLE";
  return "CLOSED";
};

const refreshCycleStatusInTransaction = async (
  tx,
  cycle,
  actor = null,
  now = new Date()
) => {
  const nextStatus = cycleStatusForDate(cycle, now);
  if (cycle.status === nextStatus) return cycle;

  const updated = await tx.incentiveCycle.update({
    where: { id: cycle.id },
    data: {
      status: nextStatus,
      ...(nextStatus === "CLOSED"
        ? {
            closedAt: cycle.closedAt || now,
            closedById: cycle.closedById || actor?.id || null,
          }
        : {}),
    },
    include: V2_CYCLE_INCLUDE,
  });

  if (nextStatus === "CLOSED") {
    await tx.incentiveClaim.updateMany({
      where: {
        cycleId: cycle.id,
        status: "UNCLAIMED",
      },
      data: { status: "EXPIRED" },
    });
  }

  return updated;
};

const findEffectiveProgramSchedule = (tx, {
  branchId,
  programType,
  sourceDate,
}) => {
  const businessDate = scheduleMath.localDateOnly(sourceDate);

  return tx.incentiveProgramScheduleVersion.findFirst({
    where: {
      branchId,
      programType,
      effectiveFrom: { lte: businessDate },
    },
    include: PROGRAM_SCHEDULE_INCLUDE,
    orderBy: [
      { effectiveFrom: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
  });
};

const findEffectiveProgramRule = (tx, {
  branchId,
  programType,
  effectiveAt,
}) =>
  tx.incentiveProgramRuleVersion.findFirst({
    where: {
      branchId,
      programType,
      effectiveFrom: { lte: effectiveAt },
    },
    orderBy: [
      { effectiveFrom: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
  });

const ensureProgramCycleInTransaction = async (
  tx,
  actor,
  {
    branchId,
    programType,
    sourceDate,
    scheduleVersion = null,
    allowMissing = false,
  }
) => {
  math.isClassificationEligible("NONE", programType);

  const schedule =
    scheduleVersion ||
    (await findEffectiveProgramSchedule(tx, {
      branchId,
      programType,
      sourceDate,
    }));

  if (!schedule) {
    if (allowMissing) return null;

    throw new AppError(
      "No effective V2 program schedule is configured",
      409,
      "INCENTIVE_PROGRAM_SCHEDULE_REQUIRED"
    );
  }

  const businessDate = scheduleMath.localDateOnly(sourceDate);

  if (schedule.scheduleType === "MANUAL") {
    const manualCycle = await tx.incentiveCycle.findFirst({
      where: {
        engineVersion: math.ENGINE_VERSION,
        branchId,
        programType,
        programScheduleVersionId: schedule.id,
        startDate: { lte: businessDate },
        endDate: { gte: businessDate },
      },
      include: V2_CYCLE_INCLUDE,
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
    });

    if (!manualCycle) {
      if (allowMissing) return null;

      throw new AppError(
        "No manual V2 incentive cycle covers this source date",
        409,
        "INCENTIVE_MANUAL_CYCLE_REQUIRED"
      );
    }

    return refreshCycleStatusInTransaction(tx, manualCycle, actor);
  }

  const bounds = scheduleMath.calculateCycleBounds(schedule, businessDate);
  if (
    !bounds ||
    bounds.startDate < scheduleMath.storedDateOnly(schedule.effectiveFrom)
  ) {
    if (allowMissing) return null;

    throw new AppError(
      "No effective V2 incentive cycle covers this source date",
      409,
      "INCENTIVE_CYCLE_NOT_EFFECTIVE"
    );
  }

  let cycle = await tx.incentiveCycle.findFirst({
    where: {
      engineVersion: math.ENGINE_VERSION,
      branchId,
      programType,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
    },
    include: V2_CYCLE_INCLUDE,
  });

  if (cycle && cycle.programScheduleVersionId !== schedule.id) {
    throw new AppError(
      "The V2 program period overlaps a different schedule version",
      409,
      "INCENTIVE_PROGRAM_CYCLE_OVERLAP"
    );
  }

  if (!cycle) {
    try {
      cycle = await tx.incentiveCycle.create({
        data: {
          engineVersion: math.ENGINE_VERSION,
          programType,
          branchId,
          periodCode: math.periodCodeForProgramCycle({
            branchId,
            programType,
            startDate: bounds.startDate,
            endDate: bounds.endDate,
          }),
          ...bounds,
          scheduleVersionId: null,
          programScheduleVersionId: schedule.id,
        },
        include: V2_CYCLE_INCLUDE,
      });
    } catch (error) {
      if (error?.code !== "P2002") throw error;

      cycle = await tx.incentiveCycle.findFirst({
        where: {
          engineVersion: math.ENGINE_VERSION,
          branchId,
          programType,
          startDate: bounds.startDate,
          endDate: bounds.endDate,
        },
        include: V2_CYCLE_INCLUDE,
      });

      if (!cycle || cycle.programScheduleVersionId !== schedule.id) {
        throw error;
      }
    }

    await createAuditLog(
      {
        actor,
        branchId,
        action: "INCENTIVE_V2_CYCLE_CREATED",
        entityType: "IncentiveCycle",
        entityId: cycle.id,
        description: `${programType} V2 incentive cycle ${cycle.periodCode} created`,
        metadata: {
          engineVersion: math.ENGINE_VERSION,
          programType,
          programScheduleVersionId: schedule.id,
          startDate: scheduleMath.dateText(bounds.startDate),
          endDate: scheduleMath.dateText(bounds.endDate),
        },
      },
      tx
    );
  }

  return refreshCycleStatusInTransaction(tx, cycle, actor);
};

const resolveRepairCycleContextInTransaction = async (
  tx,
  actor,
  { branchId, repairType, releasedAt }
) => {
  math.programTypeForRepairType(repairType);

  const schedule = await findEffectiveProgramSchedule(tx, {
    branchId,
    programType: repairType,
    sourceDate: releasedAt,
  });
  if (!schedule) {
    return {
      disposition: "SKIPPED_SCHEDULE_UNCONFIGURED",
      schedule: null,
      cycle: null,
      warning: {
        code: "PROGRAM_SCHEDULE_UNCONFIGURED",
        message:
          "Repair incentive was not posted because no effective V2 program schedule was configured at release.",
      },
    };
  }

  const cycle = await ensureProgramCycleInTransaction(tx, actor, {
    branchId,
    programType: repairType,
    sourceDate: releasedAt,
    scheduleVersion: schedule,
    allowMissing: true,
  });
  if (!cycle) {
    return {
      disposition: "SKIPPED_CYCLE_UNAVAILABLE",
      schedule,
      cycle: null,
      warning: {
        code: "PROGRAM_CYCLE_UNAVAILABLE",
        message:
          "Repair incentive was not posted because no V2 manual cycle covered the release date.",
      },
    };
  }

  if (cycle.status !== "EARNING") {
    return {
      disposition: "SKIPPED_CYCLE_NOT_EARNING",
      schedule,
      cycle,
      warning: {
        code: "PROGRAM_CYCLE_NOT_EARNING",
        message:
          "Repair incentive was not posted because the effective V2 cycle was no longer earning.",
      },
    };
  }

  return {
    disposition: "POSTED",
    schedule,
    cycle,
    warning: null,
  };
};

const auditRepairPostingDispositionInTransaction = async (
  tx,
  actor,
  serviceJob,
  context
) => {
  if (!context || context.disposition === "POSTED") return null;

  return createAuditLog(
    {
      actor,
      branchId: serviceJob.branchId,
      action: "INCENTIVE_V2_REPAIR_NOT_POSTED",
      entityType: "ServiceJob",
      entityId: serviceJob.id,
      description: `${serviceJob.jobCode} repair incentive disposition: ${context.disposition}`,
      metadata: {
        engineVersion: math.ENGINE_VERSION,
        programType: serviceJob.repairType,
        serviceDoneById: serviceJob.serviceDoneById,
        disposition: context.disposition,
        warningCode: context.warning?.code || null,
        configuredRepairIncentiveRateSnapshot:
          serviceJob.configuredRepairIncentiveRateSnapshot === null ||
          serviceJob.configuredRepairIncentiveRateSnapshot === undefined
            ? null
            : Number(
                serviceJob.configuredRepairIncentiveRateSnapshot
              ).toFixed(4),
        payableRepairIncentiveRateSnapshot:
          serviceJob.repairIncentiveRateSnapshot === null ||
          serviceJob.repairIncentiveRateSnapshot === undefined
            ? null
            : Number(serviceJob.repairIncentiveRateSnapshot).toFixed(4),
        repairIncentiveAmountSnapshot:
          serviceJob.repairIncentiveAmountSnapshot === null ||
          serviceJob.repairIncentiveAmountSnapshot === undefined
            ? null
            : Number(serviceJob.repairIncentiveAmountSnapshot).toFixed(2),
        accountConfigVersionId: serviceJob.accountConfigVersionId,
        programRuleVersionId: serviceJob.programRuleVersionId,
        programScheduleVersionId: context.schedule?.id || null,
        cycleId: context.cycle?.id || null,
      },
    },
    tx
  );
};

const createManualProgramCycleInTransaction = async (
  tx,
  actor,
  { branchId, programType, startDate, endDate }
) => {
  assertManager(actor, branchId);

  const start = scheduleMath.parseDateOnly(startDate, "startDate");
  const end = scheduleMath.parseDateOnly(endDate, "endDate");
  if (start > end) {
    throw new AppError(
      "Manual cycle start date cannot be later than end date",
      400,
      "INVALID_INCENTIVE_CYCLE_RANGE"
    );
  }

  const sourceInstant = math.manilaBusinessInstantRange(start, start).startInclusive;
  const schedule = await findEffectiveProgramSchedule(tx, {
    branchId,
    programType,
    sourceDate: sourceInstant,
  });

  if (!schedule || schedule.scheduleType !== "MANUAL") {
    throw new AppError(
      "An effective MANUAL V2 program schedule is required",
      409,
      "INCENTIVE_MANUAL_SCHEDULE_REQUIRED"
    );
  }

  const overlapping = await tx.incentiveCycle.findFirst({
    where: {
      engineVersion: math.ENGINE_VERSION,
      branchId,
      programType,
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { id: true },
  });
  if (overlapping) {
    throw new AppError(
      "Manual V2 incentive cycle overlaps an existing program cycle",
      409,
      "INCENTIVE_PROGRAM_CYCLE_OVERLAP"
    );
  }

  const claimOpenDate = scheduleMath.addDays(
    end,
    Number(schedule.claimOpenAfterDays)
  );
  const claimCloseDate = scheduleMath.addDays(
    claimOpenDate,
    Number(schedule.claimWindowDays) - 1
  );
  const cycle = await tx.incentiveCycle.create({
    data: {
      engineVersion: math.ENGINE_VERSION,
      programType,
      branchId,
      periodCode: math.periodCodeForProgramCycle({
        branchId,
        programType,
        startDate: start,
        endDate: end,
      }),
      startDate: start,
      endDate: end,
      cutoffDate: end,
      claimOpenDate,
      claimCloseDate,
      scheduleVersionId: null,
      programScheduleVersionId: schedule.id,
    },
    include: V2_CYCLE_INCLUDE,
  });

  await createAuditLog(
    {
      actor,
      branchId,
      action: "INCENTIVE_V2_MANUAL_CYCLE_CREATED",
      entityType: "IncentiveCycle",
      entityId: cycle.id,
      description: `${programType} manual V2 cycle ${cycle.periodCode} created`,
      metadata: {
        engineVersion: math.ENGINE_VERSION,
        programType,
        programScheduleVersionId: schedule.id,
        startDate,
        endDate,
      },
    },
    tx
  );

  return refreshCycleStatusInTransaction(tx, cycle, actor);
};

const createManualProgramCycle = (actor, payload, database = prisma) =>
  database.$transaction((tx) =>
    createManualProgramCycleInTransaction(tx, actor, payload)
  );

const serializePlanForFingerprint = ({ cycle, cutoffInstant, rule, plan }) => ({
  cycleId: cycle.id,
  cutoffInstant: cutoffInstant.toISOString(),
  programRuleVersionId: rule.id,
  eligiblePriceTiers: plan.eligiblePriceTiersSnapshot,
  branchBasisAmount: plan.branchBasisAmountSnapshot.toFixed(2),
  sources: [...plan.basisSnapshots]
    .sort((left, right) => left.saleItemId.localeCompare(right.saleItemId))
    .map((source) => ({
      saleId: source.saleId,
      saleItemId: source.saleItemId,
      saleStatus: source.saleStatusSnapshot,
      saleCancelledAt: source.saleCancelledAtSnapshot
        ? new Date(source.saleCancelledAtSnapshot).toISOString()
        : null,
      inclusionState: source.inclusionState,
      priceTier: source.priceTier,
      grossQuantity: source.grossQuantitySnapshot.toString(),
      returnedQuantity: source.returnedQuantitySnapshot.toString(),
      netQuantity: source.netQuantitySnapshot.toString(),
      baseUnitPrice: source.baseUnitPriceSnapshot?.toFixed(2) || null,
      basisAmount: source.basisAmount.toFixed(2),
      returns: source.returnSourcesSnapshot,
    })),
  recipients: [...plan.recipientSnapshots]
    .sort((left, right) => left.staffId.localeCompare(right.staffId))
    .map((recipient) => ({
      staffId: recipient.staffId,
      role: recipient.roleSnapshot,
      classification: recipient.classificationSnapshot,
      enabled: recipient.enabledSnapshot,
      rate: recipient.ratePercentSnapshot?.toFixed(4) || null,
      amount: recipient.amountSnapshot.toFixed(2),
      accountConfigVersionId: recipient.accountConfigVersionId,
    })),
});

const fingerprintItemPlan = (payload) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(serializePlanForFingerprint(payload)))
    .digest("hex");

const assertRevisionUnclaimed = async (tx, revisionId) => {
  const claimed = await tx.incentiveClaimLine.findFirst({
    where: {
      incentive: {
        itemCycleRevisionId: revisionId,
      },
    },
    select: {
      id: true,
      claimId: true,
    },
  });

  if (claimed) {
    const error = new AppError(
      "This item incentive revision is already claimed and requires an audited settlement before restatement",
      409,
      "INCENTIVE_CLAIM_SETTLEMENT_REQUIRED"
    );
    error.details = { claimId: claimed.claimId };
    throw error;
  }
};

const assertItemCycleMaterializationState = (cycle, currentRevision) => {
  if (cycle.status === "EARNING") {
    throw new AppError(
      "ITEM_SALE cycle cannot be materialized before its Manila cutoff",
      409,
      "INCENTIVE_ITEM_CYCLE_STILL_EARNING"
    );
  }

  if (cycle.status === "CLOSED" && !currentRevision) {
    throw new AppError(
      "A closed ITEM_SALE cycle cannot be materialized for the first time without a future audited settlement workflow",
      409,
      "INCENTIVE_ITEM_CYCLE_CLOSED_UNMATERIALIZED"
    );
  }
};

const loadItemMaterializationInputs = async (tx, cycle, materializedAt) => {
  const range = math.manilaBusinessInstantRange(cycle.startDate, cycle.endDate);
  const rule = await findEffectiveProgramRule(tx, {
    branchId: cycle.branchId,
    programType: "ITEM_SALE",
    effectiveAt: range.cutoffInstant,
  });

  if (!rule) {
    throw new AppError(
      "No ITEM_SALE program rule is effective at this cycle cutoff",
      409,
      "INCENTIVE_ITEM_RULE_REQUIRED"
    );
  }

  const eligiblePriceTiers = math.normalizePriceTiers(rule.eligiblePriceTiers);
  const saleItems =
    eligiblePriceTiers.length === 0
      ? []
      : await tx.saleItem.findMany({
          where: {
            itemId: { not: null },
            priceTier: { in: eligiblePriceTiers },
            sale: {
              branchId: cycle.branchId,
              saleDate: {
                gte: range.startInclusive,
                lt: range.endExclusive,
              },
            },
          },
          select: {
            id: true,
            saleId: true,
            itemId: true,
            priceTier: true,
            quantity: true,
            baseUnitPriceSnapshot: true,
            discountAmount: true,
            sale: {
              select: {
                receiptCode: true,
                saleDate: true,
                status: true,
                cancelledAt: true,
              },
            },
            returnItems: {
              where: {
                returnRequest: {
                  status: "COMPLETED",
                  completedAt: { lte: materializedAt },
                },
              },
              select: {
                id: true,
                returnRequestId: true,
                quantity: true,
                returnRequest: {
                  select: {
                    returnCode: true,
                    status: true,
                    completedAt: true,
                  },
                },
              },
              orderBy: [{ returnRequestId: "asc" }, { id: "asc" }],
            },
          },
          orderBy: [{ saleId: "asc" }, { id: "asc" }],
        });

  const accounts = await tx.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["CASHIER", "TECHNICIAN"] },
      branchId: cycle.branchId,
      createdAt: { lte: range.cutoffInstant },
    },
    select: RECIPIENT_SELECT,
    orderBy: [{ id: "asc" }],
  });
  const accountIds = accounts.map((account) => account.id);
  const configVersions =
    accountIds.length === 0
      ? []
      : await tx.incentiveAccountConfigVersion.findMany({
          where: {
            accountId: { in: accountIds },
            branchIdSnapshot: cycle.branchId,
            effectiveFrom: { lte: range.cutoffInstant },
          },
          select: CONFIG_VERSION_SELECT,
          orderBy: [
            { accountId: "asc" },
            { effectiveFrom: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
        });

  const plan = math.calculateItemCyclePlan({
    saleItems,
    eligiblePriceTiers,
    accounts,
    configVersions,
    branchId: cycle.branchId,
    cutoffInstant: range.cutoffInstant,
  });

  return {
    range,
    rule,
    plan,
  };
};

const materializeItemCycleInTransaction = async (
  tx,
  actor,
  cycleId,
  payload = {},
  now = new Date()
) => {
  await tx.$queryRaw`
    SELECT "id"
    FROM "IncentiveCycle"
    WHERE "id" = ${cycleId}
    FOR UPDATE
  `;

  let cycle = await tx.incentiveCycle.findUnique({
    where: { id: cycleId },
    include: V2_CYCLE_INCLUDE,
  });
  if (
    !cycle ||
    cycle.engineVersion !== math.ENGINE_VERSION ||
    cycle.programType !== "ITEM_SALE" ||
    !cycle.branchId
  ) {
    throw new AppError(
      "V2 ITEM_SALE cycle not found",
      404,
      "INCENTIVE_ITEM_CYCLE_NOT_FOUND"
    );
  }

  assertManager(actor, cycle.branchId);
  cycle = await refreshCycleStatusInTransaction(tx, cycle, actor, now);

  const currentRevision = await tx.incentiveItemCycleRevision.findFirst({
    where: {
      cycleId,
      status: "POSTED",
    },
    include: {
      recipientSnapshots: {
        include: {
          incentive: {
            select: { id: true, staffId: true },
          },
        },
      },
    },
    orderBy: [{ revisionNumber: "desc" }, { id: "desc" }],
  });

  assertItemCycleMaterializationState(cycle, currentRevision);

  const materializedAt = now;
  const { range, rule, plan } = await loadItemMaterializationInputs(
    tx,
    cycle,
    materializedAt
  );
  const calculationFingerprint = fingerprintItemPlan({
    cycle,
    cutoffInstant: range.cutoffInstant,
    rule,
    plan,
  });

  if (currentRevision?.calculationFingerprint === calculationFingerprint) {
    return {
      cycle,
      revision: currentRevision,
      idempotent: true,
      warnings: [],
    };
  }

  const supersededIncentiveByStaff = new Map();
  if (currentRevision) {
    await assertRevisionUnclaimed(tx, currentRevision.id);

    for (const recipient of currentRevision.recipientSnapshots) {
      if (recipient.incentive) {
        supersededIncentiveByStaff.set(
          recipient.staffId,
          recipient.incentive.id
        );
      }
    }

    const reversalReason =
      normalizeOptionalText(payload.reason) ||
      "V2 item cycle sources or recipient configuration changed";

    await tx.incentive.updateMany({
      where: {
        itemCycleRevisionId: currentRevision.id,
        status: "POSTED",
      },
      data: {
        status: "REVERSED",
        reversedAt: materializedAt,
        reversedById: actor.id,
        reversalReason,
      },
    });
    await tx.incentiveItemCycleRevision.update({
      where: { id: currentRevision.id },
      data: {
        status: "REVERSED",
        reversedAt: materializedAt,
        reversedById: actor.id,
        reversalReason,
      },
    });

    await createAuditLog(
      {
        actor,
        branchId: cycle.branchId,
        action: "INCENTIVE_V2_ITEM_REVISION_REVERSED",
        entityType: "IncentiveItemCycleRevision",
        entityId: currentRevision.id,
        description: `${cycle.periodCode} item incentive revision ${currentRevision.revisionNumber} reversed`,
        metadata: {
          cycleId,
          revisionNumber: currentRevision.revisionNumber,
          calculationFingerprint: currentRevision.calculationFingerprint,
          reversalReason,
        },
      },
      tx
    );
  }

  const revisionNumber = (currentRevision?.revisionNumber || 0) + 1;
  const revision = await tx.incentiveItemCycleRevision.create({
    data: {
      cycleId,
      revisionNumber,
      status: "POSTED",
      cutoffInstant: range.cutoffInstant,
      calculationFingerprint,
      eligiblePriceTiersSnapshot: plan.eligiblePriceTiersSnapshot,
      branchBasisAmountSnapshot: plan.branchBasisAmountSnapshot,
      programRuleVersionId: rule.id,
      materializedAt,
      createdById: actor.id,
    },
  });

  if (plan.basisSnapshots.length > 0) {
    await tx.incentiveItemBasisSnapshot.createMany({
      data: plan.basisSnapshots.map((source) => ({
        revisionId: revision.id,
        saleId: source.saleId,
        saleItemId: source.saleItemId,
        sourceCode: source.sourceCode,
        sourceDate: source.sourceDate,
        saleStatusSnapshot: source.saleStatusSnapshot,
        saleCancelledAtSnapshot: source.saleCancelledAtSnapshot,
        inclusionState: source.inclusionState,
        inclusionReason: source.inclusionReason,
        priceTier: source.priceTier,
        grossQuantitySnapshot: source.grossQuantitySnapshot,
        returnedQuantitySnapshot: source.returnedQuantitySnapshot,
        netQuantitySnapshot: source.netQuantitySnapshot,
        baseUnitPriceSnapshot: source.baseUnitPriceSnapshot,
        basisAmount: source.basisAmount,
        returnSourcesSnapshot: source.returnSourcesSnapshot,
      })),
    });
  }

  const postedAwards = [];
  for (const recipient of plan.recipientSnapshots) {
    const recipientSnapshot =
      await tx.incentiveItemRecipientSnapshot.create({
        data: {
          revisionId: revision.id,
          staffId: recipient.staffId,
          branchIdSnapshot: recipient.branchIdSnapshot,
          roleSnapshot: recipient.roleSnapshot,
          classificationSnapshot: recipient.classificationSnapshot,
          enabledSnapshot: recipient.enabledSnapshot,
          ratePercentSnapshot: recipient.ratePercentSnapshot,
          amountSnapshot: recipient.amountSnapshot,
          accountConfigVersionId: recipient.accountConfigVersionId,
        },
      });

    if (!recipient.enabledSnapshot || recipient.amountSnapshot.lte(0)) continue;

    const incentive = await tx.incentive.create({
      data: {
        sourceKey: `V2:ITEM:${cycle.id}:R${revisionNumber}:${recipient.staffId}`,
        type: "SALE_ITEM",
        status: "POSTED",
        sourceCode: cycle.periodCode,
        sourceDate: range.cutoffInstant,
        basisAmount: plan.branchBasisAmountSnapshot,
        ratePercent: recipient.ratePercentSnapshot,
        amount: recipient.amountSnapshot,
        classificationSnapshot: recipient.classificationSnapshot,
        engineVersion: math.ENGINE_VERSION,
        programType: "ITEM_SALE",
        branchId: cycle.branchId,
        staffId: recipient.staffId,
        saleId: null,
        serviceJobId: null,
        cycleId: cycle.id,
        programScheduleVersionId: cycle.programScheduleVersionId,
        programRuleVersionId: rule.id,
        accountConfigVersionId: recipient.accountConfigVersionId,
        itemCycleRevisionId: revision.id,
        itemRecipientSnapshotId: recipientSnapshot.id,
        supersedesIncentiveId:
          supersededIncentiveByStaff.get(recipient.staffId) || null,
        postedById: actor.id,
      },
    });

    postedAwards.push(incentive);

    await createAuditLog(
      {
        actor,
        branchId: cycle.branchId,
        action: "INCENTIVE_V2_POSTED",
        entityType: "Incentive",
        entityId: incentive.id,
        description: `${cycle.periodCode} branch-wide item incentive posted`,
        metadata: {
          engineVersion: math.ENGINE_VERSION,
          programType: "ITEM_SALE",
          cycleId: cycle.id,
          revisionId: revision.id,
          revisionNumber,
          staffId: recipient.staffId,
          accountConfigVersionId: recipient.accountConfigVersionId,
          programRuleVersionId: rule.id,
          programScheduleVersionId: cycle.programScheduleVersionId,
          eligiblePriceTiers: plan.eligiblePriceTiersSnapshot,
          branchBasisAmount: plan.branchBasisAmountSnapshot.toFixed(2),
          ratePercent: recipient.ratePercentSnapshot.toFixed(4),
          amount: recipient.amountSnapshot.toFixed(2),
          supersedesIncentiveId:
            supersededIncentiveByStaff.get(recipient.staffId) || null,
        },
      },
      tx
    );
  }

  await createAuditLog(
    {
      actor,
      branchId: cycle.branchId,
      action: "INCENTIVE_V2_ITEM_CYCLE_MATERIALIZED",
      entityType: "IncentiveItemCycleRevision",
      entityId: revision.id,
      description: `${cycle.periodCode} item incentive revision ${revisionNumber} materialized`,
      metadata: {
        engineVersion: math.ENGINE_VERSION,
        cycleId: cycle.id,
        revisionNumber,
        cutoffInstant: range.cutoffInstant.toISOString(),
        calculationFingerprint,
        programRuleVersionId: rule.id,
        eligiblePriceTiers: plan.eligiblePriceTiersSnapshot,
        branchBasisAmount: plan.branchBasisAmountSnapshot.toFixed(2),
        basisSourceCount: plan.basisSnapshots.length,
        recipientCount: plan.recipientSnapshots.length,
        postedAwardCount: postedAwards.length,
      },
    },
    tx
  );

  return {
    cycle,
    revision,
    plan,
    postedAwards,
    idempotent: false,
    warnings: [],
  };
};

const materializeItemCycle = (
  actor,
  cycleId,
  payload = {},
  database = prisma
) =>
  database.$transaction((tx) =>
    materializeItemCycleInTransaction(tx, actor, cycleId, payload)
  );

const materializeItemCycleForDate = (
  actor,
  payload,
  database = prisma
) =>
  database.$transaction(async (tx) => {
    assertManager(actor, payload.branchId);

    const sourceDate = math.manilaBusinessInstantRange(
      payload.targetDate,
      payload.targetDate
    ).startInclusive;
    const cycle = await ensureProgramCycleInTransaction(tx, actor, {
      branchId: payload.branchId,
      programType: "ITEM_SALE",
      sourceDate,
    });

    return materializeItemCycleInTransaction(
      tx,
      actor,
      cycle.id,
      payload
    );
  });

const assertPostedRepairPlan = (serviceJob, plan) => {
  if (serviceJob?.incentivePostingDisposition === "POSTED" && !plan) {
    throw new AppError(
      "A ServiceJob marked POSTED no longer reconciles to a payable V2 repair award",
      409,
      "INCENTIVE_REPAIR_POSTED_PLAN_INVALID"
    );
  }
};

const assertRepairCycleProvenance = (serviceJob, cycleContext) => {
  if (serviceJob?.incentivePostingDisposition !== "POSTED") return;

  const resolvedScheduleId = cycleContext?.schedule?.id || null;
  const resolvedCycleId = cycleContext?.cycle?.id || null;
  const cycleScheduleId =
    cycleContext?.cycle?.programScheduleVersionId || null;

  if (
    cycleContext?.disposition !== "POSTED" ||
    !resolvedScheduleId ||
    !resolvedCycleId ||
    serviceJob.programScheduleVersionId !== resolvedScheduleId ||
    serviceJob.incentiveCycleId !== resolvedCycleId ||
    cycleScheduleId !== resolvedScheduleId
  ) {
    throw new AppError(
      "Resolved repair cycle does not match the immutable ServiceJob posting provenance",
      409,
      "INCENTIVE_REPAIR_CYCLE_PROVENANCE_MISMATCH"
    );
  }
};

const postRepairIncentiveInTransaction = async (
  tx,
  actor,
  serviceJobOrId
) => {
  const serviceJobId =
    typeof serviceJobOrId === "string" ? serviceJobOrId : serviceJobOrId?.id;
  if (!serviceJobId) {
    throw new AppError(
      "ServiceJob ID is required for V2 incentive posting",
      400,
      "SERVICE_JOB_ID_REQUIRED"
    );
  }

  await tx.$queryRaw`
    SELECT "id"
    FROM "ServiceJob"
    WHERE "id" = ${serviceJobId}
    FOR UPDATE
  `;

  const serviceJob = await tx.serviceJob.findUnique({
    where: { id: serviceJobId },
    include: {
      serviceDoneBy: {
        select: RECIPIENT_SELECT,
      },
      accountConfigVersion: {
        select: CONFIG_VERSION_SELECT,
      },
      programRuleVersion: {
        select: {
          id: true,
          branchId: true,
          programType: true,
        },
      },
    },
  });

  if (!serviceJob) {
    return {
      disposition: "NOT_ELIGIBLE",
      incentive: null,
      warning: null,
    };
  }

  if (serviceJob.incentivePostingDisposition !== "POSTED") {
    return {
      disposition:
        serviceJob.incentivePostingDisposition || "NOT_ELIGIBLE",
      incentive: null,
      warning: null,
    };
  }

  const plan = math.buildRepairAwardPlan({
    serviceJob,
    performer: serviceJob.serviceDoneBy,
    configVersion: serviceJob.accountConfigVersion,
  });
  assertPostedRepairPlan(serviceJob, plan);
  if (!plan) {
    return {
      disposition: "NOT_ELIGIBLE",
      incentive: null,
      warning: null,
    };
  }

  if (
    !serviceJob.programRuleVersion ||
    serviceJob.programRuleVersion.branchId !== serviceJob.branchId ||
    serviceJob.programRuleVersion.programType !== plan.programType
  ) {
    throw new AppError(
      "Repair program rule provenance is missing or inconsistent",
      409,
      "INCENTIVE_REPAIR_RULE_PROVENANCE_INVALID"
    );
  }

  const cycleContext = await resolveRepairCycleContextInTransaction(tx, actor, {
    branchId: serviceJob.branchId,
    repairType: plan.programType,
    releasedAt: serviceJob.releasedAt,
  });
  assertRepairCycleProvenance(serviceJob, cycleContext);
  if (cycleContext.disposition !== "POSTED") {
    return {
      disposition: cycleContext.disposition,
      incentive: null,
      warning: cycleContext.warning,
      configuredRatePercent: plan.ratePercent,
    };
  }
  const cycle = cycleContext.cycle;

  const existing = await tx.incentive.findUnique({
    where: {
      sourceKey: `V2:REPAIR:${serviceJob.id}:${serviceJob.serviceDoneById}`,
    },
  });
  if (existing) {
    return {
      disposition: "POSTED",
      incentive: existing,
      warning: null,
      idempotent: true,
    };
  }

  const incentive = await tx.incentive.create({
    data: {
      sourceKey: plan.sourceKey,
      type: "SERVICE_JOB",
      status: "POSTED",
      sourceCode: serviceJob.jobCode,
      sourceDate: plan.sourceDate,
      basisAmount: plan.basisAmount,
      ratePercent: plan.ratePercent,
      amount: plan.amount,
      classificationSnapshot: plan.classificationSnapshot,
      engineVersion: math.ENGINE_VERSION,
      programType: plan.programType,
      branchId: serviceJob.branchId,
      staffId: plan.staffId,
      saleId: null,
      serviceJobId: serviceJob.id,
      cycleId: cycle.id,
      programScheduleVersionId: cycle.programScheduleVersionId,
      programRuleVersionId: serviceJob.programRuleVersionId,
      accountConfigVersionId: serviceJob.accountConfigVersionId,
      postedById: actor?.id || null,
    },
  });

  await tx.serviceJob.update({
    where: { id: serviceJob.id },
    data: {
      programScheduleVersionId: cycle.programScheduleVersionId,
      incentiveCycleId: cycle.id,
      incentivePostingDisposition: "POSTED",
    },
  });

  await createAuditLog(
    {
      actor,
      branchId: serviceJob.branchId,
      action: "INCENTIVE_V2_POSTED",
      entityType: "Incentive",
      entityId: incentive.id,
      description: `${plan.programType} V2 incentive posted from ${serviceJob.jobCode}`,
      metadata: {
        engineVersion: math.ENGINE_VERSION,
        programType: plan.programType,
        serviceJobId: serviceJob.id,
        serviceDoneById: plan.staffId,
        basisAmount: plan.basisAmount.toFixed(2),
        ratePercent: plan.ratePercent.toFixed(4),
        amount: plan.amount.toFixed(2),
        accountConfigVersionId: serviceJob.accountConfigVersionId,
        programRuleVersionId: serviceJob.programRuleVersionId,
        programScheduleVersionId: cycle.programScheduleVersionId,
        cycleId: cycle.id,
      },
    },
    tx
  );

  return {
    disposition: "POSTED",
    incentive,
    warning: null,
    idempotent: false,
  };
};

const restateItemCyclesForSaleInTransaction = async (
  tx,
  actor,
  saleId,
  reason
) => {
  const revisions = await tx.incentiveItemCycleRevision.findMany({
    where: {
      status: "POSTED",
      basisSnapshots: {
        some: { saleId },
      },
    },
    select: {
      id: true,
      cycleId: true,
    },
    orderBy: [{ cycleId: "asc" }, { revisionNumber: "desc" }],
  });
  const uniqueCycleIds = [...new Set(revisions.map((entry) => entry.cycleId))];
  const results = [];

  for (const cycleId of uniqueCycleIds) {
    results.push(
      await materializeItemCycleInTransaction(
        tx,
        actor,
        cycleId,
        { reason }
      )
    );
  }

  return results;
};

const claimProgramCycleInTransaction = async (
  tx,
  actor,
  cycleId,
  payload = {}
) => {
  if (!actor?.id || !actor.branchId) {
    throw new AppError(
      "A branch-assigned employee is required",
      403,
      "INCENTIVE_CLAIM_FORBIDDEN"
    );
  }

  await tx.$queryRaw`
    SELECT "id"
    FROM "IncentiveCycle"
    WHERE "id" = ${cycleId}
    FOR UPDATE
  `;
  let cycle = await tx.incentiveCycle.findUnique({
    where: { id: cycleId },
    include: V2_CYCLE_INCLUDE,
  });
  if (!cycle || cycle.engineVersion !== math.ENGINE_VERSION) {
    throw new AppError(
      "V2 incentive cycle not found",
      404,
      "INCENTIVE_CYCLE_NOT_FOUND"
    );
  }
  if (cycle.branchId !== actor.branchId) {
    throw new AppError(
      "You can only claim a V2 incentive for your branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  cycle = await refreshCycleStatusInTransaction(tx, cycle, actor);
  if (cycle.status !== "CLAIMABLE") {
    throw new AppError(
      "This V2 incentive cycle is not currently claimable",
      409,
      "INCENTIVE_CYCLE_NOT_CLAIMABLE"
    );
  }

  const existing = await tx.incentiveClaim.findUnique({
    where: {
      cycleId_staffId: {
        cycleId,
        staffId: actor.id,
      },
    },
    include: { lines: true },
  });
  if (existing) return existing;

  const entries = await tx.incentive.findMany({
    where: {
      engineVersion: math.ENGINE_VERSION,
      cycleId,
      staffId: actor.id,
      branchId: actor.branchId,
      status: "POSTED",
    },
    orderBy: [{ sourceDate: "asc" }, { id: "asc" }],
  });
  if (entries.length === 0) {
    throw new AppError(
      "No payable V2 incentive sources exist for this cycle",
      409,
      "INCENTIVE_CLAIM_EMPTY"
    );
  }

  const productEntries = entries.filter((entry) => entry.type === "SALE_ITEM");
  const serviceEntries = entries.filter(
    (entry) => entry.type === "SERVICE_JOB"
  );
  const sum = (rows, field) =>
    rows.reduce(
      (total, row) => total.plus(row[field]),
      math.moneyDecimal(0)
    );
  const uniqueRate = (rows) => {
    const values = [...new Set(rows.map((row) => Number(row.ratePercent)))];
    return values.length === 1 ? values[0] : null;
  };
  const productIncentive = sum(productEntries, "amount");
  const serviceIncentive = sum(serviceEntries, "amount");
  const classifications = [
    ...new Set(entries.map((entry) => entry.classificationSnapshot)),
  ];

  const claim = await tx.incentiveClaim.create({
    data: {
      status: "CLAIMED",
      classificationSnapshot:
        classifications.length === 1 ? classifications[0] : null,
      productBasis: sum(productEntries, "basisAmount"),
      productRate: uniqueRate(productEntries),
      productIncentive,
      serviceBasis: sum(serviceEntries, "basisAmount"),
      serviceRate: uniqueRate(serviceEntries),
      serviceIncentive,
      totalIncentive: productIncentive.plus(serviceIncentive),
      claimedAt: new Date(),
      notes: normalizeOptionalText(payload.notes),
      cycleId,
      staffId: actor.id,
      branchId: actor.branchId,
      claimedById: actor.id,
      lines: {
        create: entries.map((entry) => ({
          type: entry.type,
          sourceCode: entry.sourceCode,
          sourceDate: entry.sourceDate,
          classificationSnapshot: entry.classificationSnapshot,
          basisAmount: entry.basisAmount,
          ratePercent: entry.ratePercent,
          amount: entry.amount,
          incentiveId: entry.id,
        })),
      },
    },
    include: { lines: true },
  });

  await createAuditLog(
    {
      actor,
      branchId: actor.branchId,
      action: "INCENTIVE_V2_CLAIM_SUBMITTED",
      entityType: "IncentiveClaim",
      entityId: claim.id,
      description: `${cycle.periodCode} V2 incentive claim submitted`,
      metadata: {
        engineVersion: math.ENGINE_VERSION,
        programType: cycle.programType,
        cycleId,
        staffId: actor.id,
        sourceCount: claim.lines.length,
        totalIncentive: claim.totalIncentive.toFixed(2),
      },
    },
    tx
  );

  return claim;
};

const claimProgramCycle = (
  actor,
  cycleId,
  payload = {},
  database = prisma
) =>
  database.$transaction((tx) =>
    claimProgramCycleInTransaction(tx, actor, cycleId, payload)
  );

const formatCycle = (cycle) => ({
  ...cycle,
  startDate: scheduleMath.dateText(cycle.startDate),
  endDate: scheduleMath.dateText(cycle.endDate),
  cutoffDate: scheduleMath.dateText(cycle.cutoffDate),
  claimOpenDate: scheduleMath.dateText(cycle.claimOpenDate),
  claimCloseDate: scheduleMath.dateText(cycle.claimCloseDate),
  itemCycleRevisions: (cycle.itemCycleRevisions || []).map((revision) => ({
    ...revision,
    branchBasisAmountSnapshot: Number(revision.branchBasisAmountSnapshot),
  })),
});

const formatOwnAward = (award) => ({
  ...award,
  basisAmount: Number(award.basisAmount),
  ratePercent: Number(award.ratePercent),
  amount: Number(award.amount),
});

const formatOwnClaim = (claim) =>
  claim
    ? {
        ...claim,
        productBasis: Number(claim.productBasis),
        productRate:
          claim.productRate === null ? null : Number(claim.productRate),
        productIncentive: Number(claim.productIncentive),
        serviceBasis: Number(claim.serviceBasis),
        serviceRate:
          claim.serviceRate === null ? null : Number(claim.serviceRate),
        serviceIncentive: Number(claim.serviceIncentive),
        totalIncentive: Number(claim.totalIncentive),
        lines: (claim.lines || []).map((line) => ({
          ...line,
          basisAmount: Number(line.basisAmount),
          ratePercent: Number(line.ratePercent),
          amount: Number(line.amount),
        })),
      }
    : null;

const formatStaffCycle = (cycle) => ({
  id: cycle.id,
  engineVersion: cycle.engineVersion,
  programType: cycle.programType,
  periodCode: cycle.periodCode,
  startDate: scheduleMath.dateText(cycle.startDate),
  endDate: scheduleMath.dateText(cycle.endDate),
  cutoffDate: scheduleMath.dateText(cycle.cutoffDate),
  claimOpenDate: scheduleMath.dateText(cycle.claimOpenDate),
  claimCloseDate: scheduleMath.dateText(cycle.claimCloseDate),
  status: cycle.status,
  closedAt: cycle.closedAt || null,
  branch: cycle.branch,
  scheduleType: cycle.programScheduleVersion?.scheduleType || null,
  programScheduleVersionId: cycle.programScheduleVersionId,
  ownAwards: (cycle.incentives || []).map(formatOwnAward),
  ownClaim: formatOwnClaim((cycle.claims || [])[0] || null),
});

const listProgramCycles = async (actor, query = {}, database = prisma) => {
  if (!actor) {
    throw new AppError(
      "Authentication required",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  }

  const branchId = actor.role === "SUPER_OWNER" ? query.branchId : actor.branchId;
  if (!branchId) {
    throw new AppError(
      "Branch is required to list V2 incentive cycles",
      400,
      "USER_BRANCH_REQUIRED"
    );
  }
  if (
    actor.role !== "SUPER_OWNER" &&
    query.branchId &&
    query.branchId !== actor.branchId
  ) {
    throw new AppError(
      "You can only view V2 incentive cycles for your branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  const where = {
    engineVersion: math.ENGINE_VERSION,
    branchId,
    ...(query.programType ? { programType: query.programType } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const managerView = MANAGER_ROLES.has(actor.role);
  const cycles = await database.incentiveCycle.findMany({
    where,
    include: managerView
      ? {
          ...V2_CYCLE_INCLUDE,
          itemCycleRevisions: {
            where: { status: "POSTED" },
            orderBy: [{ revisionNumber: "desc" }],
            take: 1,
          },
        }
      : {
          ...V2_CYCLE_INCLUDE,
          incentives: {
            where: {
              engineVersion: math.ENGINE_VERSION,
              staffId: actor.id,
              branchId,
              status: "POSTED",
            },
            select: {
              id: true,
              type: true,
              status: true,
              sourceCode: true,
              sourceDate: true,
              basisAmount: true,
              ratePercent: true,
              amount: true,
              classificationSnapshot: true,
              postedAt: true,
            },
            orderBy: [{ sourceDate: "asc" }, { id: "asc" }],
          },
          claims: {
            where: {
              staffId: actor.id,
              branchId,
            },
            select: {
              id: true,
              status: true,
              classificationSnapshot: true,
              productBasis: true,
              productRate: true,
              productIncentive: true,
              serviceBasis: true,
              serviceRate: true,
              serviceIncentive: true,
              totalIncentive: true,
              claimedAt: true,
              approvedAt: true,
              paidAt: true,
              payoutReference: true,
              notes: true,
              createdAt: true,
              updatedAt: true,
              lines: {
                select: {
                  id: true,
                  type: true,
                  sourceCode: true,
                  sourceDate: true,
                  classificationSnapshot: true,
                  basisAmount: true,
                  ratePercent: true,
                  amount: true,
                  incentiveId: true,
                },
                orderBy: [{ sourceDate: "asc" }, { id: "asc" }],
              },
            },
            take: 1,
          },
        },
    orderBy: [{ startDate: "desc" }, { programType: "asc" }],
    take: Math.min(Math.max(Number(query.limit) || 50, 1), 100),
  });

  return cycles.map(managerView ? formatCycle : formatStaffCycle);
};

const getProgramReadiness = async (actor, query = {}, database = prisma) => {
  if (!actor || !MANAGER_ROLES.has(actor.role)) {
    throw new AppError(
      "Owner or Admin access is required to view V2 incentive readiness",
      403,
      "INCENTIVE_PROGRAM_READINESS_FORBIDDEN"
    );
  }

  const requestedBranchId = query.branchId || null;
  if (
    actor.role !== "SUPER_OWNER" &&
    requestedBranchId &&
    requestedBranchId !== actor.branchId
  ) {
    throw new AppError(
      "You can only view V2 incentive readiness for your branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
  const targetBranchId =
    actor.role === "SUPER_OWNER" ? requestedBranchId : actor.branchId;
  if (actor.role !== "SUPER_OWNER" && !targetBranchId) {
    throw new AppError(
      "Branch is required to view V2 incentive readiness",
      400,
      "USER_BRANCH_REQUIRED"
    );
  }

  const now = new Date();
  const businessDate = scheduleMath.localDateOnly(now);
  const branches = await database.branch.findMany({
    where: {
      status: "ACTIVE",
      ...(targetBranchId ? { id: targetBranchId } : {}),
    },
    select: { id: true, code: true, name: true },
    orderBy: [{ code: "asc" }, { id: "asc" }],
  });
  const branchIds = branches.map((branch) => branch.id);
  if (targetBranchId && branchIds.length === 0) {
    throw new AppError(
      "Active branch not found",
      404,
      "INCENTIVE_PROGRAM_BRANCH_NOT_FOUND"
    );
  }

  const [rules, schedules, accounts, earningCycles] =
    branchIds.length === 0
      ? [[], [], [], []]
      : await Promise.all([
          database.incentiveProgramRuleVersion.findMany({
            where: {
              branchId: { in: branchIds },
              effectiveFrom: { lte: now },
            },
            orderBy: [
              { branchId: "asc" },
              { programType: "asc" },
              { effectiveFrom: "desc" },
              { createdAt: "desc" },
              { id: "desc" },
            ],
          }),
          database.incentiveProgramScheduleVersion.findMany({
            where: {
              branchId: { in: branchIds },
              effectiveFrom: { lte: businessDate },
            },
            orderBy: [
              { branchId: "asc" },
              { programType: "asc" },
              { effectiveFrom: "desc" },
              { createdAt: "desc" },
              { id: "desc" },
            ],
          }),
          database.user.findMany({
            where: {
              branchId: { in: branchIds },
              status: "ACTIVE",
              role: { in: ["CASHIER", "TECHNICIAN"] },
            },
            select: RECIPIENT_SELECT,
            orderBy: [{ branchId: "asc" }, { id: "asc" }],
          }),
          database.incentiveCycle.findMany({
            where: {
              engineVersion: math.ENGINE_VERSION,
              branchId: { in: branchIds },
              status: "EARNING",
              startDate: { lte: businessDate },
              endDate: { gte: businessDate },
            },
            select: {
              id: true,
              branchId: true,
              programType: true,
              startDate: true,
              endDate: true,
            },
          }),
        ]);

  const accountIds = accounts.map((account) => account.id);
  const configVersions =
    accountIds.length === 0
      ? []
      : await database.incentiveAccountConfigVersion.findMany({
          where: {
            accountId: { in: accountIds },
            branchIdSnapshot: { in: branchIds },
            effectiveFrom: { lte: now },
          },
          select: CONFIG_VERSION_SELECT,
          orderBy: [
            { accountId: "asc" },
            { effectiveFrom: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
        });

  const latestByKey = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const key = `${row.branchId}:${row.programType}`;
      if (!map.has(key)) map.set(key, row);
    }
    return map;
  };
  const ruleByKey = latestByKey(rules);
  const scheduleByKey = latestByKey(schedules);
  const earningCycleByKey = latestByKey(earningCycles);

  return {
    engineVersion: math.ENGINE_VERSION,
    businessTimeZone: scheduleMath.BUSINESS_TIME_ZONE,
    checkedAt: now,
    branches: branches.map((branch) => ({
      branch,
      programs: math.PROGRAM_TYPES.map((programType) => {
        const key = `${branch.id}:${programType}`;
        const rule = ruleByKey.get(key) || null;
        const schedule = scheduleByKey.get(key) || null;
        const earningCycle = earningCycleByKey.get(key) || null;
        const ruleValid = Boolean(
          rule &&
            (programType === "ITEM_SALE" ||
              rule.repairCostPercent !== null)
        );
        const eligibleAccounts = accounts.filter((account) =>
          math.isOperationalRecipient(account, programType, branch.id)
        );
        const enabledRecipients = eligibleAccounts.filter((account) => {
          const version = math.selectLatestCompatibleConfig({
            account,
            versions: configVersions,
            programType,
            branchId: branch.id,
            effectiveAt: now,
          });
          if (!version) return false;
          const { enabledField } = math.configFieldsForProgram(programType);
          return Boolean(version[enabledField]);
        });
        const warnings = [];
        if (!rule) warnings.push("PROGRAM_RULE_UNCONFIGURED");
        if (
          rule &&
          programType === "ITEM_SALE" &&
          rule.eligiblePriceTiers.length === 0
        ) {
          warnings.push("NO_ELIGIBLE_PRICE_TIERS");
        }
        if (rule && !ruleValid) {
          warnings.push("REPAIR_COST_PERCENT_UNCONFIGURED");
        }
        if (!schedule) warnings.push("PROGRAM_SCHEDULE_UNCONFIGURED");
        if (schedule?.scheduleType === "MANUAL" && !earningCycle) {
          warnings.push("MANUAL_PROGRAM_CYCLE_UNAVAILABLE");
        }
        if (enabledRecipients.length === 0) {
          warnings.push("NO_ENABLED_RECIPIENTS");
        }

        const hasPayableItemTier = Boolean(
          programType !== "ITEM_SALE" ||
            (rule && rule.eligiblePriceTiers.length > 0)
        );
        const configurationReady = Boolean(
          ruleValid && hasPayableItemTier && schedule
        );
        const cycleReady = Boolean(
          schedule &&
            (schedule.scheduleType !== "MANUAL" || earningCycle)
        );
        const payableRecipientReady = enabledRecipients.length > 0;

        return {
          programType,
          readyForPosting: Boolean(
            configurationReady && cycleReady && payableRecipientReady
          ),
          configurationReady,
          cycleReady,
          payableRecipientReady,
          ruleVersionId: rule?.id || null,
          scheduleVersionId: schedule?.id || null,
          scheduleType: schedule?.scheduleType || null,
          earningCycleId: earningCycle?.id || null,
          eligibleRecipientCount: eligibleAccounts.length,
          enabledRecipientCount: enabledRecipients.length,
          warnings,
        };
      }),
    })),
  };
};

module.exports = {
  claimProgramCycle,
  createManualProgramCycle,
  getProgramReadiness,
  listProgramCycles,
  materializeItemCycle,
  materializeItemCycleForDate,

  // Transaction hooks composed by Sale and ServiceJob workflows.
  postRepairIncentiveInTransaction,
  restateItemCyclesForSaleInTransaction,
  resolveRepairCycleContextInTransaction,
  auditRepairPostingDispositionInTransaction,

  testInternals: Object.freeze({
    assertManager,
    assertItemCycleMaterializationState,
    assertRevisionUnclaimed,
    createManualProgramCycleInTransaction,
    cycleStatusForDate,
    ensureProgramCycleInTransaction,
    findEffectiveProgramRule,
    findEffectiveProgramSchedule,
    fingerprintItemPlan,
    materializeItemCycleInTransaction,
    claimProgramCycleInTransaction,
    refreshCycleStatusInTransaction,
    resolveRepairCycleContextInTransaction,
    assertPostedRepairPlan,
    assertRepairCycleProvenance,
    serializePlanForFingerprint,
  }),
};
