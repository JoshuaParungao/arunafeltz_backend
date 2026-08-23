const { Prisma } = require("@prisma/client");

const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { createAuditLog } = require("../../../utils/auditLogger");

const DAY_MS = 24 * 60 * 60 * 1000;
const OWNER_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);
const RATE_CLASSIFICATIONS = [
  "SALES_AGENT",
  "SENIOR_SALES_AGENT",
  "TECHNICIAN",
  "SENIOR_TECHNICIAN",
];
const SERVICE_TYPES = new Set(["QUOTATION_SERVICE", "SERVICE_JOB"]);

const BRANCH_SELECT = { id: true, code: true, name: true };
const STAFF_SELECT = {
  id: true,
  employeeCode: true,
  fullName: true,
  role: true,
  incentiveClassification: true,
  branchId: true,
  createdAt: true,
};

const RATE_VERSION_INCLUDE = {
  rates: {
    orderBy: { classification: "asc" },
  },
  createdBy: {
    select: { id: true, fullName: true, role: true },
  },
};

const SCHEDULE_VERSION_INCLUDE = {
  createdBy: {
    select: { id: true, fullName: true, role: true },
  },
};

const CLAIM_INCLUDE = {
  cycle: {
    include: {
      scheduleVersion: true,
    },
  },
  staff: { select: STAFF_SELECT },
  branch: { select: BRANCH_SELECT },
  claimedBy: { select: { id: true, fullName: true, role: true } },
  approvedBy: { select: { id: true, fullName: true, role: true } },
  paidBy: { select: { id: true, fullName: true, role: true } },
  lines: {
    orderBy: [{ sourceDate: "asc" }, { id: "asc" }],
  },
};

const getVisibilityRules = async () => {
  const setting = await prisma.businessSetting.findUnique({
    where: { scopeKey: "GLOBAL:incentive.rules" },
    select: { value: true, isActive: true },
  });
  return {
    staffCanViewOwnIncentives:
      setting?.value?.staffCanViewOwnIncentives !== false,
    ownerCanViewAllIncentives:
      setting?.value?.ownerCanViewAllIncentives !== false,
    isActive: Boolean(setting?.isActive),
  };
};

const assertVisibility = async (actor, access) => {
  const rules = await getVisibilityRules();
  if (access.isOwnerView && !rules.ownerCanViewAllIncentives) {
    throw new AppError(
      "Owner incentive visibility is disabled",
      403,
      "INCENTIVE_ACCESS_DENIED"
    );
  }
  if (!access.isOwnerView && !rules.staffCanViewOwnIncentives) {
    throw new AppError(
      "Staff incentive visibility is disabled",
      403,
      "INCENTIVE_ACCESS_DENIED"
    );
  }
  return rules;
};

const decimal = (value) => new Prisma.Decimal(value || 0);
const money = (value) =>
  decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const rate = (value) =>
  decimal(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

const parseDateOnly = (value, fieldName = "date") => {
  const match =
    typeof value === "string"
      ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
      : null;
  if (!match) {
    throw new AppError(
      `${fieldName} must use YYYY-MM-DD format`,
      400,
      "INVALID_DATE_ONLY"
    );
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const valueDate = new Date(Date.UTC(year, month - 1, day));

  if (
    valueDate.getUTCFullYear() !== year ||
    valueDate.getUTCMonth() !== month - 1 ||
    valueDate.getUTCDate() !== day
  ) {
    throw new AppError(`${fieldName} is invalid`, 400, "INVALID_DATE_ONLY");
  }

  return valueDate;
};

const localDateOnly = (value = new Date()) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("Invalid source date", 400, "INVALID_SOURCE_DATE");
  }
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  );
};

const storedDateOnly = (value) => {
  const parsed = value instanceof Date ? value : new Date(value);
  return new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate()
    )
  );
};

const addDays = (value, days) => new Date(value.getTime() + days * DAY_MS);
const dateText = (value) => storedDateOnly(value).toISOString().slice(0, 10);
const daysBetween = (left, right) =>
  Math.floor((storedDateOnly(left).getTime() - storedDateOnly(right).getTime()) / DAY_MS);

const normalizeOptionalText = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const assertSuperOwner = (actor, action = "manage global incentive configuration") => {
  if (!actor || actor.role !== "SUPER_OWNER") {
    throw new AppError(
      `Only Super Owner can ${action}`,
      403,
      "INCENTIVE_GLOBAL_CONFIG_FORBIDDEN"
    );
  }
};

const resolveReadAccess = (actor, query = {}) => {
  if (!actor) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (OWNER_ROLES.has(actor.role)) {
    if (actor.role === "SUPER_OWNER") {
      return {
        branchId: query.branchId || undefined,
        staffId: query.staffId || undefined,
        isOwnerView: true,
      };
    }

    if (!actor.branchId) {
      throw new AppError(
        "User is not assigned to a branch",
        400,
        "USER_BRANCH_REQUIRED"
      );
    }

    if (query.branchId && query.branchId !== actor.branchId) {
      throw new AppError(
        "You can only view incentives for your branch",
        403,
        "BRANCH_ACCESS_DENIED"
      );
    }

    return {
      branchId: actor.branchId,
      staffId: query.staffId || undefined,
      isOwnerView: true,
    };
  }

  if (!actor.branchId) {
    throw new AppError(
      "User is not assigned to a branch",
      400,
      "USER_BRANCH_REQUIRED"
    );
  }

  if (
    (query.branchId && query.branchId !== actor.branchId) ||
    (query.staffId && query.staffId !== actor.id)
  ) {
    throw new AppError(
      "You can only view your own incentives",
      403,
      "INCENTIVE_ACCESS_DENIED"
    );
  }

  return {
    branchId: actor.branchId,
    staffId: actor.id,
    isOwnerView: false,
  };
};

const daysInUtcMonth = (year, monthIndex) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const monthlyBoundary = (year, monthIndex, anchorDay) => {
  const normalized = new Date(Date.UTC(year, monthIndex, 1));
  const boundaryYear = normalized.getUTCFullYear();
  const boundaryMonth = normalized.getUTCMonth();
  return new Date(
    Date.UTC(
      boundaryYear,
      boundaryMonth,
      Math.min(anchorDay, daysInUtcMonth(boundaryYear, boundaryMonth))
    )
  );
};

const calculateCycleBounds = (scheduleVersion, targetValue) => {
  const target = storedDateOnly(targetValue);
  const anchor = storedDateOnly(scheduleVersion.anchorDate);
  let startDate;
  let nextStartDate;

  if (
    scheduleVersion.scheduleType === "EVERY_N_DAYS" ||
    scheduleVersion.scheduleType === "WEEKLY"
  ) {
    const cycleDays =
      scheduleVersion.scheduleType === "WEEKLY"
        ? 7
        : Number(scheduleVersion.everyNDays);
    if (!Number.isInteger(cycleDays) || cycleDays < 1) {
      throw new AppError(
        "Schedule cycle length is invalid",
        500,
        "INVALID_INCENTIVE_SCHEDULE"
      );
    }
    const cycleIndex = Math.floor(daysBetween(target, anchor) / cycleDays);
    startDate = addDays(anchor, cycleIndex * cycleDays);
    nextStartDate = addDays(startDate, cycleDays);
  } else if (scheduleVersion.scheduleType === "MONTHLY") {
    const anchorDay = anchor.getUTCDate();
    startDate = monthlyBoundary(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      anchorDay
    );
    if (startDate > target) {
      startDate = monthlyBoundary(
        target.getUTCFullYear(),
        target.getUTCMonth() - 1,
        anchorDay
      );
    }
    nextStartDate = monthlyBoundary(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth() + 1,
      anchorDay
    );
  } else {
    return null;
  }

  const endDate = addDays(nextStartDate, -1);
  const claimOpenDate = addDays(
    endDate,
    Number(scheduleVersion.claimOpenAfterDays)
  );
  const claimCloseDate = addDays(
    claimOpenDate,
    Number(scheduleVersion.claimWindowDays) - 1
  );

  return {
    startDate,
    endDate,
    cutoffDate: endDate,
    claimOpenDate,
    claimCloseDate,
  };
};

const cycleStatusForDate = (cycle, today = localDateOnly()) => {
  const current = storedDateOnly(today);
  if (current <= storedDateOnly(cycle.endDate)) return "EARNING";
  if (current < storedDateOnly(cycle.claimOpenDate)) return "CUT_OFF";
  if (current <= storedDateOnly(cycle.claimCloseDate)) return "CLAIMABLE";
  return "CLOSED";
};

const refreshCycleStatus = async (tx, cycle, actor = null) => {
  const nextStatus = cycleStatusForDate(cycle);
  if (cycle.status === nextStatus) return cycle;

  const updated = await tx.incentiveCycle.update({
    where: { id: cycle.id },
    data: {
      status: nextStatus,
      ...(nextStatus === "CLOSED"
        ? {
            closedAt: cycle.closedAt || new Date(),
            closedById: cycle.closedById || actor?.id || null,
          }
        : {}),
    },
    include: {
      scheduleVersion: true,
    },
  });

  if (nextStatus === "CLOSED") {
    await tx.incentiveClaim.updateMany({
      where: { cycleId: cycle.id, status: "UNCLAIMED" },
      data: { status: "EXPIRED" },
    });
  }

  return updated;
};

const periodCodeForBounds = (bounds) =>
  `INC-${dateText(bounds.startDate).replaceAll("-", "")}-${dateText(
    bounds.endDate
  ).replaceAll("-", "")}`;

const findEffectiveRateVersion = (client, targetDate) =>
  client.incentiveRateVersion.findFirst({
    where: { effectiveFrom: { lte: storedDateOnly(targetDate) } },
    orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
    include: RATE_VERSION_INCLUDE,
  });

const findEffectiveScheduleVersion = (client, targetDate) =>
  client.incentiveScheduleVersion.findFirst({
    where: { effectiveFrom: { lte: storedDateOnly(targetDate) } },
    orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
    include: SCHEDULE_VERSION_INCLUDE,
  });

const ensureCycleForDate = async (tx, scheduleVersion, sourceDate) => {
  const target = storedDateOnly(sourceDate);

  if (scheduleVersion.scheduleType === "MANUAL") {
    const manualCycle = await tx.incentiveCycle.findFirst({
      where: {
        scheduleVersionId: scheduleVersion.id,
        startDate: { lte: target },
        endDate: { gte: target },
      },
      include: { scheduleVersion: true },
    });
    if (!manualCycle) {
      throw new AppError(
        "No manual incentive cycle covers this source date",
        409,
        "INCENTIVE_MANUAL_CYCLE_REQUIRED"
      );
    }
    return refreshCycleStatus(tx, manualCycle);
  }

  const bounds = calculateCycleBounds(scheduleVersion, target);
  if (!bounds || bounds.startDate < storedDateOnly(scheduleVersion.effectiveFrom)) {
    throw new AppError(
      "No effective incentive cycle covers this source date",
      409,
      "INCENTIVE_CYCLE_NOT_EFFECTIVE"
    );
  }

  let cycle = await tx.incentiveCycle.findUnique({
    where: {
      startDate_endDate: {
        startDate: bounds.startDate,
        endDate: bounds.endDate,
      },
    },
    include: { scheduleVersion: true },
  });

  if (cycle && cycle.scheduleVersionId !== scheduleVersion.id) {
    throw new AppError(
      "The incentive period overlaps an existing schedule version",
      409,
      "INCENTIVE_CYCLE_OVERLAP"
    );
  }

  if (!cycle) {
    try {
      cycle = await tx.incentiveCycle.create({
        data: {
          periodCode: periodCodeForBounds(bounds),
          ...bounds,
          scheduleVersionId: scheduleVersion.id,
        },
        include: { scheduleVersion: true },
      });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      cycle = await tx.incentiveCycle.findUnique({
        where: {
          startDate_endDate: {
            startDate: bounds.startDate,
            endDate: bounds.endDate,
          },
        },
        include: { scheduleVersion: true },
      });
      if (!cycle || cycle.scheduleVersionId !== scheduleVersion.id) throw error;
    }
  }

  return refreshCycleStatus(tx, cycle);
};

const getPostingContext = async (
  tx,
  { staffId, branchId, sourceDate, basisType }
) => {
  const postingDate = localDateOnly(sourceDate);
  const [staff, rateVersion, scheduleVersion] = await Promise.all([
    tx.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        status: true,
        branchId: true,
        incentiveClassification: true,
      },
    }),
    findEffectiveRateVersion(tx, postingDate),
    findEffectiveScheduleVersion(tx, postingDate),
  ]);

  if (!rateVersion || !scheduleVersion) {
    return {
      enterpriseConfigured: false,
      eligible: false,
      staff,
      missingConfiguration: {
        rateVersion: !rateVersion,
        scheduleVersion: !scheduleVersion,
      },
    };
  }

  if (
    !staff ||
    staff.status !== "ACTIVE" ||
    staff.branchId !== branchId ||
    staff.incentiveClassification === "NONE"
  ) {
    return {
      enterpriseConfigured: true,
      eligible: false,
      staff,
      rateVersion,
      scheduleVersion,
    };
  }

  const rateRow = rateVersion.rates.find(
    (entry) => entry.classification === staff.incentiveClassification
  );
  if (!rateRow) {
    throw new AppError(
      "The employee classification has no effective incentive rate",
      409,
      "INCENTIVE_RATE_NOT_CONFIGURED"
    );
  }

  const cycle = await ensureCycleForDate(tx, scheduleVersion, postingDate);
  if (cycle.status !== "EARNING") {
    throw new AppError(
      "The effective incentive cycle is no longer earning",
      409,
      "INCENTIVE_CYCLE_NOT_EARNING"
    );
  }

  return {
    enterpriseConfigured: true,
    eligible: true,
    staff,
    rateVersion,
    scheduleVersion,
    cycle,
    classification: staff.incentiveClassification,
    ratePercent:
      basisType === "PRODUCT" ? rateRow.productRate : rateRow.serviceRate,
  };
};

const formatRateVersion = (version) =>
  version
    ? {
        id: version.id,
        effectiveFrom: dateText(version.effectiveFrom),
        notes: version.notes,
        createdBy: version.createdBy || null,
        createdAt: version.createdAt,
        rates: version.rates.map((entry) => ({
          classification: entry.classification,
          productRate: Number(entry.productRate),
          serviceRate: Number(entry.serviceRate),
        })),
      }
    : null;

const formatScheduleVersion = (version) =>
  version
    ? {
        id: version.id,
        scheduleType: version.scheduleType,
        anchorDate: dateText(version.anchorDate),
        effectiveFrom: dateText(version.effectiveFrom),
        everyNDays: version.everyNDays,
        claimOpenAfterDays: version.claimOpenAfterDays,
        claimWindowDays: version.claimWindowDays,
        notes: version.notes,
        createdBy: version.createdBy || null,
        createdAt: version.createdAt,
      }
    : null;

const normalizeRateRows = (rows) => {
  if (!Array.isArray(rows) || rows.length !== RATE_CLASSIFICATIONS.length) {
    throw new AppError(
      "Rates are required for all four incentive classifications",
      400,
      "INVALID_INCENTIVE_RATE_MATRIX"
    );
  }

  const byClassification = new Map();
  for (const row of rows) {
    if (
      !RATE_CLASSIFICATIONS.includes(row.classification) ||
      byClassification.has(row.classification)
    ) {
      throw new AppError(
        "Each incentive classification must appear exactly once",
        400,
        "INVALID_INCENTIVE_RATE_MATRIX"
      );
    }
    const productRate = Number(row.productRate);
    const serviceRate = Number(row.serviceRate);
    if (
      !Number.isFinite(productRate) ||
      productRate < 0 ||
      productRate > 100 ||
      !Number.isFinite(serviceRate) ||
      serviceRate < 0 ||
      serviceRate > 100
    ) {
      throw new AppError(
        "Product and service rates must be between 0 and 100",
        400,
        "INVALID_INCENTIVE_RATE_MATRIX"
      );
    }
    byClassification.set(row.classification, {
      classification: row.classification,
      productRate: rate(productRate),
      serviceRate: rate(serviceRate),
    });
  }

  return RATE_CLASSIFICATIONS.map((classification) =>
    byClassification.get(classification)
  );
};

const createRateVersion = async (actor, payload) => {
  assertSuperOwner(actor, "create global incentive rate versions");
  const effectiveFrom = parseDateOnly(payload.effectiveFrom, "effectiveFrom");
  if (effectiveFrom < localDateOnly()) {
    throw new AppError(
      "A new rate version cannot begin in the past",
      400,
      "INCENTIVE_RATE_EFFECTIVE_DATE_PAST"
    );
  }
  const rates = normalizeRateRows(payload.rates);
  const notes = normalizeOptionalText(payload.notes);

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('incentive-rate-version'))`;
      const latest = await tx.incentiveRateVersion.findFirst({
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
        select: { effectiveFrom: true },
      });
      if (latest && effectiveFrom <= storedDateOnly(latest.effectiveFrom)) {
        throw new AppError(
          "New rate versions must begin after the latest saved version",
          409,
          "INCENTIVE_RATE_VERSION_NOT_APPEND_ONLY"
        );
      }
      const version = await tx.incentiveRateVersion.create({
        data: {
          effectiveFrom,
          notes,
          createdById: actor.id,
          rates: { create: rates },
        },
        include: RATE_VERSION_INCLUDE,
      });

      await createAuditLog(
        {
          actor,
          branchId: null,
          action: "INCENTIVE_RATE_VERSION_CREATED",
          entityType: "IncentiveRateVersion",
          entityId: version.id,
          description: `Incentive rate version effective ${dateText(
            version.effectiveFrom
          )} created`,
          metadata: {
            effectiveFrom: dateText(version.effectiveFrom),
            rates: formatRateVersion(version).rates,
            notes,
          },
        },
        tx
      );

      return formatRateVersion(version);
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError(
        "A rate version already exists for that effective date",
        409,
        "INCENTIVE_RATE_VERSION_EXISTS"
      );
    }
    throw error;
  }
};

const normalizeScheduleInput = (payload, { allowPast = false } = {}) => {
  const scheduleType = payload.scheduleType;
  const anchorDate = parseDateOnly(payload.anchorDate, "anchorDate");
  const effectiveFrom = parseDateOnly(payload.effectiveFrom, "effectiveFrom");
  const claimOpenAfterDays = Number(payload.claimOpenAfterDays);
  const claimWindowDays = Number(payload.claimWindowDays);
  const everyNDays =
    scheduleType === "EVERY_N_DAYS" ? Number(payload.everyNDays) : null;

  if (
    !["EVERY_N_DAYS", "WEEKLY", "MONTHLY", "MANUAL"].includes(
      scheduleType
    ) ||
    !Number.isInteger(claimOpenAfterDays) ||
    claimOpenAfterDays < 1 ||
    !Number.isInteger(claimWindowDays) ||
    claimWindowDays < 1 ||
    (scheduleType === "EVERY_N_DAYS" &&
      (!Number.isInteger(everyNDays) || everyNDays < 1))
  ) {
    throw new AppError(
      "Incentive schedule values are invalid",
      400,
      "INVALID_INCENTIVE_SCHEDULE"
    );
  }

  if (!allowPast && effectiveFrom < localDateOnly()) {
    throw new AppError(
      "A new schedule version cannot begin in the past",
      400,
      "INCENTIVE_SCHEDULE_EFFECTIVE_DATE_PAST"
    );
  }

  const normalized = {
    scheduleType,
    anchorDate,
    effectiveFrom,
    everyNDays,
    claimOpenAfterDays,
    claimWindowDays,
    notes: normalizeOptionalText(payload.notes),
  };

  if (scheduleType !== "MANUAL") {
    const firstBounds = calculateCycleBounds(normalized, effectiveFrom);
    if (!firstBounds || firstBounds.startDate.getTime() !== effectiveFrom.getTime()) {
      throw new AppError(
        "effectiveFrom must be a valid cycle boundary for the selected anchor",
        400,
        "INCENTIVE_SCHEDULE_BOUNDARY_REQUIRED"
      );
    }
  }

  return normalized;
};

const previewNormalizedSchedule = (
  schedule,
  count = 4,
  startValue = schedule.effectiveFrom
) => {
  if (schedule.scheduleType === "MANUAL") return [];
  const periods = [];
  const effectiveFrom = storedDateOnly(schedule.effectiveFrom);
  let cursor = storedDateOnly(startValue);
  if (cursor < effectiveFrom) cursor = effectiveFrom;
  for (let index = 0; index < count; index += 1) {
    const bounds = calculateCycleBounds(schedule, cursor);
    if (bounds.startDate < effectiveFrom) {
      cursor = effectiveFrom;
      continue;
    }
    periods.push({
      periodCode: periodCodeForBounds(bounds),
      startDate: dateText(bounds.startDate),
      endDate: dateText(bounds.endDate),
      cutoffDate: dateText(bounds.cutoffDate),
      claimOpenDate: dateText(bounds.claimOpenDate),
      claimCloseDate: dateText(bounds.claimCloseDate),
    });
    cursor = addDays(bounds.endDate, 1);
  }
  return periods;
};

const previewSchedule = async (actor, payload) => {
  const access = resolveReadAccess(actor);
  if (!access.isOwnerView) {
    throw new AppError(
      "Only owners and administrators can preview global incentive schedules",
      403,
      "INCENTIVE_CONFIGURATION_FORBIDDEN"
    );
  }
  const normalized = normalizeScheduleInput(payload, { allowPast: true });
  return {
    schedule: formatScheduleVersion({
      ...normalized,
      id: null,
      createdBy: null,
      createdAt: null,
    }),
    periods: previewNormalizedSchedule(normalized, Number(payload.count || 4)),
    manualRequired: normalized.scheduleType === "MANUAL",
  };
};

const createScheduleVersion = async (actor, payload) => {
  assertSuperOwner(actor, "create global incentive schedules");
  const schedule = normalizeScheduleInput(payload);

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('incentive-schedule-version'))`;
      const latestVersion = await tx.incentiveScheduleVersion.findFirst({
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
      });
      if (
        latestVersion &&
        schedule.effectiveFrom <= storedDateOnly(latestVersion.effectiveFrom)
      ) {
        throw new AppError(
          "New schedule versions must begin after the latest saved version",
          409,
          "INCENTIVE_SCHEDULE_NOT_APPEND_ONLY"
        );
      }
      if (latestVersion?.scheduleType === "MANUAL") {
        throw new AppError(
          "A manual schedule requires all of its explicit periods to be resolved before a later schedule can be safely activated",
          409,
          "INCENTIVE_MANUAL_SCHEDULE_SUPERSESSION_UNSUPPORTED"
        );
      }
      if (latestVersion) {
        const predecessorBounds = calculateCycleBounds(
          latestVersion,
          schedule.effectiveFrom
        );
        if (
          !predecessorBounds ||
          predecessorBounds.startDate.getTime() !==
            schedule.effectiveFrom.getTime()
        ) {
          throw new AppError(
            "The new schedule must begin on a valid boundary of the preceding schedule",
            409,
            "INCENTIVE_SCHEDULE_PREDECESSOR_BOUNDARY_REQUIRED"
          );
        }
      }
      const overlappingCycle = await tx.incentiveCycle.findFirst({
        where: { endDate: { gte: schedule.effectiveFrom } },
        select: { id: true, periodCode: true, endDate: true },
      });
      if (overlappingCycle) {
        throw new AppError(
          "The effective date overlaps an already-persisted incentive cycle",
          409,
          "INCENTIVE_SCHEDULE_OVERLAPS_HISTORY"
        );
      }

      const version = await tx.incentiveScheduleVersion.create({
        data: {
          ...schedule,
          createdById: actor.id,
        },
        include: SCHEDULE_VERSION_INCLUDE,
      });

      await createAuditLog(
        {
          actor,
          branchId: null,
          action: "INCENTIVE_SCHEDULE_VERSION_CREATED",
          entityType: "IncentiveScheduleVersion",
          entityId: version.id,
          description: `Incentive ${version.scheduleType} schedule effective ${dateText(
            version.effectiveFrom
          )} created`,
          metadata: formatScheduleVersion(version),
        },
        tx
      );

      return {
        ...formatScheduleVersion(version),
        preview: previewNormalizedSchedule(version, 4),
      };
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError(
        "A schedule version already exists for that effective date",
        409,
        "INCENTIVE_SCHEDULE_VERSION_EXISTS"
      );
    }
    throw error;
  }
};

const createManualCycle = async (actor, payload) => {
  assertSuperOwner(actor, "create manual incentive cycles");
  const startDate = parseDateOnly(payload.startDate, "startDate");
  const endDate = parseDateOnly(payload.endDate, "endDate");
  if (endDate < startDate) {
    throw new AppError(
      "Manual cycle end date cannot precede its start date",
      400,
      "INVALID_INCENTIVE_CYCLE_RANGE"
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('incentive-cycle-period'))`;
    const version = await tx.incentiveScheduleVersion.findUnique({
      where: { id: payload.scheduleVersionId },
    });
    if (!version || version.scheduleType !== "MANUAL") {
      throw new AppError(
        "Manual schedule version not found",
        404,
        "INCENTIVE_MANUAL_SCHEDULE_NOT_FOUND"
      );
    }
    if (startDate < storedDateOnly(version.effectiveFrom)) {
      throw new AppError(
        "Manual cycle cannot begin before its schedule is effective",
        400,
        "INCENTIVE_CYCLE_NOT_EFFECTIVE"
      );
    }

    const overlap = await tx.incentiveCycle.findFirst({
      where: {
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { periodCode: true },
    });
    if (overlap) {
      throw new AppError(
        "Manual cycle overlaps an existing incentive period",
        409,
        "INCENTIVE_CYCLE_OVERLAP"
      );
    }

    const bounds = {
      startDate,
      endDate,
      cutoffDate: endDate,
      claimOpenDate: addDays(endDate, version.claimOpenAfterDays),
      claimCloseDate: addDays(
        addDays(endDate, version.claimOpenAfterDays),
        version.claimWindowDays - 1
      ),
    };
    const cycle = await tx.incentiveCycle.create({
      data: {
        periodCode: periodCodeForBounds(bounds),
        ...bounds,
        status: cycleStatusForDate(bounds),
        scheduleVersionId: version.id,
      },
      include: { scheduleVersion: true },
    });

    await createAuditLog(
      {
        actor,
        branchId: null,
        action: "INCENTIVE_MANUAL_CYCLE_CREATED",
        entityType: "IncentiveCycle",
        entityId: cycle.id,
        description: `Manual incentive cycle ${cycle.periodCode} created`,
        metadata: {
          periodCode: cycle.periodCode,
          startDate: dateText(cycle.startDate),
          endDate: dateText(cycle.endDate),
          claimOpenDate: dateText(cycle.claimOpenDate),
          claimCloseDate: dateText(cycle.claimCloseDate),
        },
      },
      tx
    );

    return formatCycleShell(cycle);
  });
};

const getConfiguration = async (actor) => {
  const access = resolveReadAccess(actor);
  if (!access.isOwnerView) {
    throw new AppError(
      "Only owners and administrators can view global incentive configuration",
      403,
      "INCENTIVE_CONFIGURATION_FORBIDDEN"
    );
  }
  if (actor.role !== "SUPER_OWNER") await assertVisibility(actor, access);
  const today = localDateOnly();
  const [rateVersions, scheduleVersions, currentRate, currentSchedule] =
    await Promise.all([
      prisma.incentiveRateVersion.findMany({
        include: RATE_VERSION_INCLUDE,
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
        take: 50,
      }),
      prisma.incentiveScheduleVersion.findMany({
        include: SCHEDULE_VERSION_INCLUDE,
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
        take: 50,
      }),
      findEffectiveRateVersion(prisma, today),
      findEffectiveScheduleVersion(prisma, today),
    ]);

  return {
    classifications: RATE_CLASSIFICATIONS,
    currentRateVersion: formatRateVersion(currentRate),
    currentScheduleVersion: formatScheduleVersion(currentSchedule),
    rateVersions: rateVersions.map(formatRateVersion),
    scheduleVersions: scheduleVersions.map(formatScheduleVersion),
    currentSchedulePreview: currentSchedule
      ? previewNormalizedSchedule(currentSchedule, 6, today)
      : [],
  };
};

const getPostingConfigurationStatus = async () => {
  const today = localDateOnly();
  const [rateVersion, scheduleVersion] = await Promise.all([
    findEffectiveRateVersion(prisma, today),
    findEffectiveScheduleVersion(prisma, today),
  ]);
  return {
    isReady: Boolean(rateVersion && scheduleVersion),
    effectiveRateVersionId: rateVersion?.id || null,
    effectiveRateDate: rateVersion ? dateText(rateVersion.effectiveFrom) : null,
    effectiveScheduleVersionId: scheduleVersion?.id || null,
    effectiveScheduleDate: scheduleVersion
      ? dateText(scheduleVersion.effectiveFrom)
      : null,
    disclosure:
      rateVersion && scheduleVersion
        ? "New eligible activity snapshots its employee classification, effective rate version, and persisted cycle."
        : "New incentive posting is safely paused until both an effective rate matrix and claim schedule are configured.",
  };
};

const initializeFromLegacyRules = async (actor, payload) => {
  assertSuperOwner(actor, "initialize enterprise incentives");
  const schedule = normalizeScheduleInput(payload);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('enterprise-incentive-initialization'))`;
    await tx.$queryRaw`
      SELECT "id" FROM "BusinessSetting"
      WHERE "scopeKey" = 'GLOBAL:incentive.rules'
      FOR UPDATE
    `;
    const setting = await tx.businessSetting.findUnique({
      where: { scopeKey: "GLOBAL:incentive.rules" },
      select: { value: true, isActive: true },
    });
    if (!setting?.isActive || !setting.value) {
      throw new AppError(
        "Active legacy incentive rules are required for one-time initialization",
        409,
        "INCENTIVE_LEGACY_RULES_REQUIRED"
      );
    }
    const rates = normalizeRateRows(
      RATE_CLASSIFICATIONS.map((incentiveClassification) => ({
        classification: incentiveClassification,
        productRate: Number(setting.value.defaultItemIncentivePercent),
        serviceRate: Number(setting.value.defaultServiceIncentivePercent),
      }))
    );
    const [existingRate, existingSchedule] = await Promise.all([
      tx.incentiveRateVersion.findFirst({ select: { id: true } }),
      tx.incentiveScheduleVersion.findFirst({ select: { id: true } }),
    ]);
    if (existingRate || existingSchedule) {
      throw new AppError(
        "Enterprise incentive versions already exist",
        409,
        "INCENTIVE_ALREADY_INITIALIZED"
      );
    }

    const rateVersion = await tx.incentiveRateVersion.create({
      data: {
        effectiveFrom: schedule.effectiveFrom,
        notes: "One-time audited initialization from the existing saved legacy rates.",
        createdById: actor.id,
        rates: { create: rates },
      },
      include: RATE_VERSION_INCLUDE,
    });
    const scheduleVersion = await tx.incentiveScheduleVersion.create({
      data: { ...schedule, createdById: actor.id },
      include: SCHEDULE_VERSION_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: null,
        action: "INCENTIVE_ENTERPRISE_INITIALIZED",
        entityType: "IncentiveScheduleVersion",
        entityId: scheduleVersion.id,
        description: "Enterprise incentive rates and schedule initialized atomically",
        metadata: {
          rateVersionId: rateVersion.id,
          scheduleVersionId: scheduleVersion.id,
          effectiveFrom: dateText(scheduleVersion.effectiveFrom),
          rates: formatRateVersion(rateVersion).rates,
        },
      },
      tx
    );

    return {
      rateVersion: formatRateVersion(rateVersion),
      scheduleVersion: {
        ...formatScheduleVersion(scheduleVersion),
        preview: previewNormalizedSchedule(scheduleVersion, 4),
      },
    };
  });
};

const formatClaimLine = (line) => ({
  id: line.id,
  incentiveId: line.incentiveId,
  sourceType: line.type,
  sourceCode: line.sourceCode,
  sourceDate: line.sourceDate,
  classification: line.classificationSnapshot,
  basisAmount: Number(line.basisAmount),
  ratePercent: Number(line.ratePercent),
  amount: Number(line.amount),
});

const formatClaim = (claim) => ({
  id: claim.id,
  status: claim.status,
  classification: claim.classificationSnapshot,
  productBasis: Number(claim.productBasis),
  productRate:
    claim.productRate === null ? null : Number(claim.productRate),
  productIncentive: Number(claim.productIncentive),
  serviceBasis: Number(claim.serviceBasis),
  serviceRate:
    claim.serviceRate === null ? null : Number(claim.serviceRate),
  serviceIncentive: Number(claim.serviceIncentive),
  totalIncentive: Number(claim.totalIncentive),
  claimedAt: claim.claimedAt,
  approvedAt: claim.approvedAt,
  paidAt: claim.paidAt,
  payoutReference: claim.payoutReference,
  notes: claim.notes,
  cycle: claim.cycle ? formatCycleShell(claim.cycle) : null,
  staff: claim.staff,
  branch: claim.branch,
  claimedBy: claim.claimedBy,
  approvedBy: claim.approvedBy,
  paidBy: claim.paidBy,
  lines: (claim.lines || []).map(formatClaimLine),
  createdAt: claim.createdAt,
  updatedAt: claim.updatedAt,
});

function formatCycleShell(cycle) {
  return {
    id: cycle.id,
    periodCode: cycle.periodCode,
    startDate: dateText(cycle.startDate),
    endDate: dateText(cycle.endDate),
    cutoffDate: dateText(cycle.cutoffDate),
    claimOpenDate: dateText(cycle.claimOpenDate),
    claimCloseDate: dateText(cycle.claimCloseDate),
    status: cycle.status || cycleStatusForDate(cycle),
    scheduleType: cycle.scheduleVersion?.scheduleType || null,
    scheduleVersionId: cycle.scheduleVersionId,
    closedAt: cycle.closedAt || null,
  };
}

const buildStaffBreakdowns = (cycle, eligibleStaff = []) => {
  const byStaff = new Map();
  const claimsByStaff = new Map(
    (cycle.claims || []).map((claim) => [claim.staffId, claim])
  );

  for (const entry of cycle.incentives || []) {
    let summary = byStaff.get(entry.staffId);
    if (!summary) {
      summary = {
        staff: entry.staff,
        branch: entry.branch,
        classifications: new Set(),
        productBasis: decimal(0),
        productIncentive: decimal(0),
        productRates: new Set(),
        serviceBasis: decimal(0),
        serviceIncentive: decimal(0),
        serviceRates: new Set(),
        totalIncentive: decimal(0),
        sources: [],
      };
      byStaff.set(entry.staffId, summary);
    }

    if (entry.classificationSnapshot) {
      summary.classifications.add(entry.classificationSnapshot);
    }
    const isProduct = entry.type === "SALE_ITEM";
    if (isProduct) {
      summary.productBasis = summary.productBasis.plus(entry.basisAmount);
      summary.productIncentive = summary.productIncentive.plus(entry.amount);
      summary.productRates.add(Number(entry.ratePercent));
    } else {
      summary.serviceBasis = summary.serviceBasis.plus(entry.basisAmount);
      summary.serviceIncentive = summary.serviceIncentive.plus(entry.amount);
      summary.serviceRates.add(Number(entry.ratePercent));
    }
    summary.totalIncentive = summary.totalIncentive.plus(entry.amount);
    summary.sources.push({
      id: entry.id,
      sourceType: entry.type,
      sourceCode: entry.sourceCode,
      sourceDate: entry.sourceDate,
      classification: entry.classificationSnapshot,
      basisAmount: Number(entry.basisAmount),
      ratePercent: Number(entry.ratePercent),
      amount: Number(entry.amount),
      status: entry.status,
    });
  }

  for (const staff of eligibleStaff) {
    if (byStaff.has(staff.id)) continue;
    byStaff.set(staff.id, {
      staff: {
        id: staff.id,
        employeeCode: staff.employeeCode,
        fullName: staff.fullName,
        role: staff.role,
        incentiveClassification: staff.incentiveClassification,
        branchId: staff.branchId,
      },
      branch: staff.branch,
      classifications: new Set([staff.incentiveClassification]),
      productBasis: decimal(0),
      productIncentive: decimal(0),
      productRates: new Set(),
      serviceBasis: decimal(0),
      serviceIncentive: decimal(0),
      serviceRates: new Set(),
      totalIncentive: decimal(0),
      sources: [],
    });
  }

  return [...byStaff.entries()].map(([staffId, summary]) => {
    const classifications = [...summary.classifications];
    const productRates = [...summary.productRates];
    const serviceRates = [...summary.serviceRates];
    const claim = claimsByStaff.get(staffId);
    return {
      staff: summary.staff,
      branch: summary.branch,
      classification:
        classifications.length === 1 ? classifications[0] : null,
      mixedClassifications: classifications.length > 1,
      productBasis: Number(summary.productBasis),
      productRate: productRates.length === 1 ? productRates[0] : null,
      productIncentive: Number(summary.productIncentive),
      serviceBasis: Number(summary.serviceBasis),
      serviceRate: serviceRates.length === 1 ? serviceRates[0] : null,
      serviceIncentive: Number(summary.serviceIncentive),
      totalIncentive: Number(summary.totalIncentive),
      claim: claim ? formatClaim(claim) : null,
      claimStatus:
        claim?.status || (cycle.status === "CLOSED" ? "EXPIRED" : "UNCLAIMED"),
      sources: summary.sources,
    };
  });
};

const getCycles = async (actor, query = {}) => {
  const access = resolveReadAccess(actor, query);
  await assertVisibility(actor, access);
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const dateFrom = query.dateFrom
    ? parseDateOnly(query.dateFrom, "dateFrom")
    : null;
  const dateTo = query.dateTo ? parseDateOnly(query.dateTo, "dateTo") : null;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new AppError(
      "dateFrom cannot be later than dateTo",
      400,
      "INVALID_DATE_RANGE"
    );
  }

  // Materialize the authoritative current automatic period even when nobody
  // has earned yet, so owner/staff views can show a genuine zero-activity
  // current cycle. Manual schedules remain explicit owner-created periods.
  await prisma.$transaction((tx) => materializeCurrentAutomaticCycle(tx));

  const [cycles, eligibleStaff] = await Promise.all([
    prisma.incentiveCycle.findMany({
    where: {
      ...(dateFrom || dateTo
        ? {
            startDate: { ...(dateTo ? { lte: dateTo } : {}) },
            endDate: { ...(dateFrom ? { gte: dateFrom } : {}) },
          }
        : {}),
    },
    include: {
      scheduleVersion: true,
      incentives: {
        where: {
          status: "POSTED",
          branchId: access.branchId,
          staffId: access.staffId,
        },
        include: {
          staff: { select: STAFF_SELECT },
          branch: { select: BRANCH_SELECT },
        },
        orderBy: [{ sourceDate: "asc" }, { id: "asc" }],
      },
      claims: {
        where: {
          branchId: access.branchId,
          staffId: access.staffId,
        },
        include: CLAIM_INCLUDE,
      },
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    }),
    prisma.user.findMany({
      where: {
        id: access.staffId,
        branchId: access.branchId,
        status: "ACTIVE",
        incentiveClassification: { not: "NONE" },
      },
      select: {
        ...STAFF_SELECT,
        branch: { select: BRANCH_SELECT },
      },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
    }),
  ]);

  const refreshed = [];
  for (const cycle of cycles) {
    const nextStatus = cycleStatusForDate(cycle);
    if (cycle.status !== nextStatus) {
      const updated = await prisma.$transaction((tx) =>
        refreshCycleStatus(tx, cycle)
      );
      cycle.status = updated.status;
      cycle.closedAt = updated.closedAt;
    }
    if (!query.status || cycle.status === query.status) refreshed.push(cycle);
  }

  const total = refreshed.length;
  const selected = refreshed.slice((page - 1) * limit, page * limit);
  return {
    cycles: selected.map((cycle) => ({
      ...formatCycleShell(cycle),
      // Zero-source rows use the employee's current classification because the
      // schema has no historical eligibility roster. Ledger-backed rows always
      // use their immutable classification snapshots.
      employees: buildStaffBreakdowns(
        cycle,
        eligibleStaff.filter(
          (staff) => storedDateOnly(staff.createdAt) <= storedDateOnly(cycle.endDate)
        )
      ),
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getCalendar = async (actor, query = {}) => {
  const access = resolveReadAccess(actor, query);
  await assertVisibility(actor, access);
  const currentSchedule = await findEffectiveScheduleVersion(
    prisma,
    localDateOnly()
  );
  const limit = Math.min(Math.max(Number(query.limit || 12), 1), 50);
  const persisted = await prisma.incentiveCycle.findMany({
    include: { scheduleVersion: true },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    take: limit,
  });

  return {
    currentScheduleVersion: formatScheduleVersion(currentSchedule),
    upcoming: currentSchedule
      ? previewNormalizedSchedule(currentSchedule, 6, localDateOnly())
      : [],
    persisted: persisted.map((cycle) => ({
      ...formatCycleShell(cycle),
      status: cycleStatusForDate(cycle),
    })),
  };
};

const materializeCurrentAutomaticCycle = async (
  tx,
  targetDate = localDateOnly()
) => {
  const effectiveSchedule = await findEffectiveScheduleVersion(tx, targetDate);
  if (!effectiveSchedule || effectiveSchedule.scheduleType === "MANUAL") {
    return null;
  }
  return ensureCycleForDate(tx, effectiveSchedule, targetDate);
};

const getClaims = async (actor, query = {}) => {
  const access = resolveReadAccess(actor, query);
  await assertVisibility(actor, access);
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const dateFrom = query.dateFrom
    ? parseDateOnly(query.dateFrom, "dateFrom")
    : null;
  const dateTo = query.dateTo ? parseDateOnly(query.dateTo, "dateTo") : null;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new AppError(
      "dateFrom cannot be later than dateTo",
      400,
      "INVALID_DATE_RANGE"
    );
  }
  const where = {
    branchId: access.branchId,
    staffId: access.staffId,
    status: query.status,
    cycleId: query.cycleId,
    ...(query.classification
      ? {
          OR: [
            { classificationSnapshot: query.classification },
            {
              lines: {
                some: { classificationSnapshot: query.classification },
              },
            },
          ],
        }
      : {}),
    ...((dateFrom || dateTo) && {
      cycle: {
        startDate: {
          ...(dateTo ? { lte: dateTo } : {}),
        },
        endDate: {
          ...(dateFrom ? { gte: dateFrom } : {}),
        },
      },
    }),
  };
  const [claims, total, aggregate] = await Promise.all([
    prisma.incentiveClaim.findMany({
      where,
      include: CLAIM_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.incentiveClaim.count({ where }),
    prisma.incentiveClaim.aggregate({
      where,
      _sum: {
        productBasis: true,
        productIncentive: true,
        serviceBasis: true,
        serviceIncentive: true,
        totalIncentive: true,
      },
    }),
  ]);

  return {
    claims: claims.map(formatClaim),
    totals: {
      claims: total,
      productBasis: Number(aggregate._sum.productBasis || 0),
      productIncentive: Number(aggregate._sum.productIncentive || 0),
      serviceBasis: Number(aggregate._sum.serviceBasis || 0),
      serviceIncentive: Number(aggregate._sum.serviceIncentive || 0),
      totalIncentive: Number(aggregate._sum.totalIncentive || 0),
    },
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const uniqueNumberOrNull = (values) => {
  const unique = [...new Set(values.map(Number))];
  return unique.length === 1 ? unique[0] : null;
};

const claimCycleInTransaction = async (tx, actor, cycleId, payload = {}) => {
  if (!actor?.id || !actor.branchId) {
    throw new AppError(
      "A branch-assigned employee is required",
      403,
      "INCENTIVE_CLAIM_FORBIDDEN"
    );
  }
  await tx.$queryRaw`
      SELECT "id" FROM "IncentiveCycle" WHERE "id" = ${cycleId} FOR UPDATE
    `;
    let cycle = await tx.incentiveCycle.findUnique({
      where: { id: cycleId },
      include: { scheduleVersion: true },
    });
    if (!cycle) {
      throw new AppError(
        "Incentive cycle not found",
        404,
        "INCENTIVE_CYCLE_NOT_FOUND"
      );
    }
    cycle = await refreshCycleStatus(tx, cycle);
    if (cycle.status !== "CLAIMABLE") {
      throw new AppError(
        "This incentive cycle is not currently claimable",
        409,
        "INCENTIVE_CYCLE_NOT_CLAIMABLE"
      );
    }

    const existing = await tx.incentiveClaim.findUnique({
      where: { cycleId_staffId: { cycleId, staffId: actor.id } },
      include: CLAIM_INCLUDE,
    });
    if (existing) return formatClaim(existing);

    const entries = await tx.incentive.findMany({
      where: {
        cycleId,
        staffId: actor.id,
        branchId: actor.branchId,
        status: "POSTED",
      },
      orderBy: [{ sourceDate: "asc" }, { id: "asc" }],
    });
    if (!entries.length) {
      throw new AppError(
        "No payable incentive sources exist for this cycle",
        409,
        "INCENTIVE_CLAIM_EMPTY"
      );
    }

    const productEntries = entries.filter((entry) => entry.type === "SALE_ITEM");
    const serviceEntries = entries.filter((entry) => SERVICE_TYPES.has(entry.type));
    const classifications = [
      ...new Set(
        entries
          .map((entry) => entry.classificationSnapshot)
          .filter(Boolean)
      ),
    ];
    const productBasis = productEntries.reduce(
      (sum, entry) => sum.plus(entry.basisAmount),
      decimal(0)
    );
    const productIncentive = productEntries.reduce(
      (sum, entry) => sum.plus(entry.amount),
      decimal(0)
    );
    const serviceBasis = serviceEntries.reduce(
      (sum, entry) => sum.plus(entry.basisAmount),
      decimal(0)
    );
    const serviceIncentive = serviceEntries.reduce(
      (sum, entry) => sum.plus(entry.amount),
      decimal(0)
    );

    const claim = await tx.incentiveClaim.create({
      data: {
        status: "CLAIMED",
        classificationSnapshot:
          classifications.length === 1 ? classifications[0] : null,
        productBasis: money(productBasis),
        productRate: uniqueNumberOrNull(
          productEntries.map((entry) => entry.ratePercent)
        ),
        productIncentive: money(productIncentive),
        serviceBasis: money(serviceBasis),
        serviceRate: uniqueNumberOrNull(
          serviceEntries.map((entry) => entry.ratePercent)
        ),
        serviceIncentive: money(serviceIncentive),
        totalIncentive: money(productIncentive.plus(serviceIncentive)),
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
      include: CLAIM_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: actor.branchId,
        action: "INCENTIVE_CLAIM_SUBMITTED",
        entityType: "IncentiveClaim",
        entityId: claim.id,
        description: `Incentive claim for ${cycle.periodCode} submitted`,
        metadata: {
          cycleId,
          periodCode: cycle.periodCode,
          staffId: actor.id,
          totalIncentive: claim.totalIncentive.toFixed(2),
          sourceCount: claim.lines.length,
        },
      },
      tx
    );

  return formatClaim(claim);
};

const claimCycle = async (actor, cycleId, payload = {}) => {
  // Claiming is an employee-own action even when that employee also holds a
  // branch management role; it follows the saved staff visibility switch.
  const visibility = await getVisibilityRules();
  if (!visibility.staffCanViewOwnIncentives) {
    throw new AppError(
      "Staff incentive visibility is disabled",
      403,
      "INCENTIVE_ACCESS_DENIED"
    );
  }
  return prisma.$transaction((tx) =>
    claimCycleInTransaction(tx, actor, cycleId, payload)
  );
};

const assertClaimManager = (actor, claim) => {
  if (!actor || !OWNER_ROLES.has(actor.role)) {
    throw new AppError(
      "You are not authorized to manage incentive claims",
      403,
      "INCENTIVE_CLAIM_MANAGEMENT_FORBIDDEN"
    );
  }
  if (actor.role !== "SUPER_OWNER" && claim.branchId !== actor.branchId) {
    throw new AppError(
      "You can only manage claims for your branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const transitionClaimInTransaction = async (
  tx,
  actor,
  claimId,
  action,
  payload = {}
) => {
  await tx.$queryRaw`
      SELECT "id" FROM "IncentiveClaim" WHERE "id" = ${claimId} FOR UPDATE
    `;
    const claim = await tx.incentiveClaim.findUnique({
      where: { id: claimId },
      include: {
        ...CLAIM_INCLUDE,
        lines: {
          include: {
            incentive: { select: { id: true, status: true } },
          },
          orderBy: [{ sourceDate: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!claim) {
      throw new AppError(
        "Incentive claim not found",
        404,
        "INCENTIVE_CLAIM_NOT_FOUND"
      );
    }
    assertClaimManager(actor, claim);

    if (action === "APPROVE") {
      if (claim.status === "APPROVED" || claim.status === "PAID") {
        return formatClaim(claim);
      }
      if (claim.status !== "CLAIMED") {
        throw new AppError(
          "Only a submitted claim can be approved",
          409,
          "INVALID_INCENTIVE_CLAIM_TRANSITION"
        );
      }
      if (claim.lines.some((line) => line.incentive.status !== "POSTED")) {
        throw new AppError(
          "A claimed source was reversed and requires owner review",
          409,
          "INCENTIVE_CLAIM_SOURCE_REVERSED"
        );
      }
    } else if (action === "PAID") {
      if (claim.status === "PAID") return formatClaim(claim);
      if (claim.status !== "APPROVED") {
        throw new AppError(
          "Only an approved claim can be marked paid",
          409,
          "INVALID_INCENTIVE_CLAIM_TRANSITION"
        );
      }
    }

    const nextStatus = action === "APPROVE" ? "APPROVED" : "PAID";
    const updated = await tx.incentiveClaim.update({
      where: { id: claim.id },
      data:
        action === "APPROVE"
          ? {
              status: nextStatus,
              approvedAt: new Date(),
              approvedById: actor.id,
              ...(payload.notes !== undefined
                ? { notes: normalizeOptionalText(payload.notes) }
                : {}),
            }
          : {
              status: nextStatus,
              paidAt: new Date(),
              paidById: actor.id,
              payoutReference: normalizeOptionalText(payload.payoutReference),
              ...(payload.notes !== undefined
                ? { notes: normalizeOptionalText(payload.notes) }
                : {}),
            },
      include: CLAIM_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: claim.branchId,
        action: `INCENTIVE_CLAIM_${nextStatus}`,
        entityType: "IncentiveClaim",
        entityId: claim.id,
        description: `Incentive claim ${nextStatus.toLowerCase()}`,
        metadata: {
          previousStatus: claim.status,
          status: nextStatus,
          cycleId: claim.cycleId,
          staffId: claim.staffId,
          totalIncentive: claim.totalIncentive.toFixed(2),
          payoutReference: updated.payoutReference,
          metadataOnly: action === "PAID",
        },
      },
      tx
    );

  return formatClaim(updated);
};

const transitionClaim = (actor, claimId, action, payload = {}) =>
  prisma.$transaction((tx) =>
    transitionClaimInTransaction(tx, actor, claimId, action, payload)
  );

const approveClaim = (actor, claimId, payload) =>
  transitionClaim(actor, claimId, "APPROVE", payload);
const markClaimPaid = (actor, claimId, payload) =>
  transitionClaim(actor, claimId, "PAID", payload);

module.exports = {
  RATE_CLASSIFICATIONS,
  approveClaim,
  claimCycle,
  createManualCycle,
  createRateVersion,
  createScheduleVersion,
  getCalendar,
  getClaims,
  getConfiguration,
  getCycles,
  getPostingContext,
  getPostingConfigurationStatus,
  initializeFromLegacyRules,
  markClaimPaid,
  previewSchedule,
  resolveReadAccess,
  testInternals: Object.freeze({
    buildStaffBreakdowns,
    calculateCycleBounds,
    claimCycleInTransaction,
    cycleStatusForDate,
    materializeCurrentAutomaticCycle,
    previewNormalizedSchedule,
    transitionClaimInTransaction,
  }),
};
