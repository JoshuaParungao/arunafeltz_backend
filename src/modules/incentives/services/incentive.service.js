const { Prisma } = require("@prisma/client");

const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { createAuditLog } = require("../../../utils/auditLogger");
const enterpriseIncentiveService = require("./enterpriseIncentive.service");

const RULE_SCOPE_KEY = "GLOBAL:incentive.rules";
const RULE_DESCRIPTION =
  "Controls source-linked product and service incentive posting, visibility, and payout safeguards.";
const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

const DEFAULT_RULES = Object.freeze({
  enableItemIncentives: false,
  enableServiceIncentives: false,
  defaultItemIncentivePercent: 0,
  defaultServiceIncentivePercent: 0,
  staffCanViewOwnIncentives: true,
  ownerCanViewAllIncentives: true,
  requireOwnerApprovalBeforePayout: true,
});

const BOOLEAN_RULE_FIELDS = [
  "enableItemIncentives",
  "enableServiceIncentives",
  "staffCanViewOwnIncentives",
  "ownerCanViewAllIncentives",
  "requireOwnerApprovalBeforePayout",
];

const PERCENT_RULE_FIELDS = [
  "defaultItemIncentivePercent",
  "defaultServiceIncentivePercent",
];

const RULE_FIELDS = new Set([...BOOLEAN_RULE_FIELDS, ...PERCENT_RULE_FIELDS]);

const INCENTIVE_INCLUDE = {
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  staff: {
    select: {
      id: true,
      fullName: true,
      role: true,
      incentiveClassification: true,
    },
  },
  sale: {
    select: {
      id: true,
      receiptCode: true,
      status: true,
    },
  },
  serviceJob: {
    select: {
      id: true,
      jobCode: true,
      status: true,
    },
  },
};

const SALE_INCENTIVE_INCLUDE = {
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  cashier: {
    select: {
      id: true,
      fullName: true,
      role: true,
      incentiveClassification: true,
    },
  },
  quotation: {
    select: {
      serviceDoneById: true,
      serviceDoneBy: {
        select: {
          id: true,
          fullName: true,
          role: true,
          incentiveClassification: true,
        },
      },
    },
  },
  items: {
    select: {
      itemId: true,
      lineTotal: true,
    },
  },
};

const SERVICE_JOB_INCENTIVE_INCLUDE = {
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  assignedTechnician: {
    select: {
      id: true,
      fullName: true,
      role: true,
      incentiveClassification: true,
    },
  },
};

const toDecimal = (value) => new Prisma.Decimal(value || 0);

const toMoneyDecimal = (value) =>
  toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

const toRateDecimal = (value) =>
  toDecimal(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

const calculateAmount = (basisAmount, ratePercent) =>
  toMoneyDecimal(
    toDecimal(basisAmount)
      .mul(toDecimal(ratePercent))
      .div(100)
  );

const assertIncentiveRules = (rules) => {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    throw new AppError(
      "Incentive rules must be a JSON object",
      400,
      "INVALID_INCENTIVE_RULES"
    );
  }

  if (Object.keys(rules).some((field) => !RULE_FIELDS.has(field))) {
    throw new AppError(
      "Incentive rules contain unsupported fields",
      400,
      "INVALID_INCENTIVE_RULES"
    );
  }

  for (const field of BOOLEAN_RULE_FIELDS) {
    if (typeof rules[field] !== "boolean") {
      throw new AppError(
        `Incentive rule ${field} must be a boolean`,
        400,
        "INVALID_INCENTIVE_RULES"
      );
    }
  }

  for (const field of PERCENT_RULE_FIELDS) {
    if (
      typeof rules[field] !== "number" ||
      !Number.isFinite(rules[field]) ||
      rules[field] < 0 ||
      rules[field] > 100
    ) {
      throw new AppError(
        `Incentive rule ${field} must be between 0 and 100`,
        400,
        "INVALID_INCENTIVE_RULES"
      );
    }
  }

  return rules;
};

const normalizeRules = (setting) => {
  if (!setting) {
    return {
      ...DEFAULT_RULES,
      isConfigured: false,
      isActive: false,
      updatedAt: null,
    };
  }

  try {
    assertIncentiveRules(setting.value);
  } catch (error) {
    throw new AppError(
      "Saved incentive rules are invalid",
      500,
      "INVALID_INCENTIVE_RULES"
    );
  }

  return {
    ...DEFAULT_RULES,
    ...setting.value,
    isConfigured: true,
    isActive: Boolean(setting.isActive),
    updatedAt: setting.updatedAt,
  };
};

const getRules = async (client = prisma, { lockForPosting = false } = {}) => {
  if (lockForPosting) {
    await client.$queryRaw`
      SELECT "id"
      FROM "BusinessSetting"
      WHERE "scopeKey" = ${RULE_SCOPE_KEY}
      FOR SHARE
    `;
  }

  const setting = await client.businessSetting.findUnique({
    where: {
      scopeKey: RULE_SCOPE_KEY,
    },
    select: {
      value: true,
      isActive: true,
      updatedAt: true,
    },
  });

  return normalizeRules(setting);
};

const parsePagination = (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const parseDateRange = (query = {}) => {
  const range = {};

  const parseDateOnly = (dateText, endOfDay, fieldName) => {
    const errorCode =
      fieldName === "dateFrom" ? "INVALID_DATE_FROM" : "INVALID_DATE_TO";
    const match =
      typeof dateText === "string"
        ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText)
        : null;
    if (!match) {
      throw new AppError(
        `Invalid ${fieldName} value`,
        400,
        errorCode
      );
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const value = new Date(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    );

    if (
      value.getFullYear() !== year ||
      value.getMonth() !== month - 1 ||
      value.getDate() !== day
    ) {
      throw new AppError(
        `Invalid ${fieldName} value`,
        400,
        errorCode
      );
    }

    return value;
  };

  if (query.dateFrom) {
    range.gte = parseDateOnly(query.dateFrom, false, "dateFrom");
  }

  if (query.dateTo) {
    range.lte = parseDateOnly(query.dateTo, true, "dateTo");
  }

  if (range.gte && range.lte && range.gte > range.lte) {
    throw new AppError(
      "dateFrom cannot be later than dateTo",
      400,
      "INVALID_DATE_RANGE"
    );
  }

  return Object.keys(range).length ? range : undefined;
};

const resolveAccess = (actor, query = {}) => {
  if (OWNER_ADMIN_ROLES.has(actor.role)) {
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

  if (query.branchId && query.branchId !== actor.branchId) {
    throw new AppError(
      "You can only view your own incentives",
      403,
      "INCENTIVE_ACCESS_DENIED"
    );
  }

  if (query.staffId && query.staffId !== actor.id) {
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

const formatEntry = (entry) => {
  const source = entry.sale || entry.serviceJob;
  const attribution = {
    SALE_ITEM: "Sale agent",
    QUOTATION_SERVICE: "Quotation service done by",
    SERVICE_JOB: "Assigned service technician",
  }[entry.type];

  return {
    id: entry.id,
    sourceType: entry.type,
    sourceId: entry.saleId || entry.serviceJobId,
    sourceCode: entry.sourceCode,
    sourceDate: entry.sourceDate,
    branch: entry.branch,
    staff: entry.staff,
    basisAmount: Number(entry.basisAmount),
    percent: Number(entry.ratePercent),
    amount: Number(entry.amount),
    classification: entry.classificationSnapshot,
    rateVersionId: entry.rateVersionId,
    cycleId: entry.cycleId,
    sourceStatus: source?.status || null,
    attribution,
    status: entry.status,
    postedAt: entry.postedAt,
    reversedAt: entry.reversedAt,
    reversalReason: entry.reversalReason,
  };
};

const createIncentive = async (tx, actor, input) => {
  const basisAmount = toMoneyDecimal(input.basisAmount);
  const ratePercent = toRateDecimal(input.ratePercent);

  if (basisAmount.lte(0) || ratePercent.lt(0)) {
    return null;
  }

  const hasEnterpriseSnapshot = Boolean(
    input.classificationSnapshot && input.rateVersionId && input.cycleId
  );
  if (!hasEnterpriseSnapshot && !input.allowLegacyProvenance) {
    throw new AppError(
      "Enterprise incentive provenance is required for new postings",
      500,
      "INCENTIVE_PROVENANCE_REQUIRED"
    );
  }

  const existing = await tx.incentive.findUnique({
    where: {
      sourceKey: input.sourceKey,
    },
    include: INCENTIVE_INCLUDE,
  });

  if (existing) {
    return existing;
  }

  const amount = calculateAmount(basisAmount, ratePercent);
  if (amount.lt(0)) {
    return null;
  }

  const incentive = await tx.incentive.create({
    data: {
      sourceKey: input.sourceKey,
      type: input.type,
      status: "POSTED",
      sourceCode: input.sourceCode,
      sourceDate: input.sourceDate,
      basisAmount,
      ratePercent,
      amount,
      classificationSnapshot: input.classificationSnapshot || null,
      rateVersionId: input.rateVersionId || null,
      cycleId: input.cycleId || null,
      branchId: input.branchId,
      staffId: input.staffId,
      saleId: input.saleId || null,
      serviceJobId: input.serviceJobId || null,
      postedById: actor?.id || null,
    },
    include: INCENTIVE_INCLUDE,
  });

  await createAuditLog(
    {
      actor,
      branchId: incentive.branchId,
      action: "INCENTIVE_POSTED",
      entityType: "Incentive",
      entityId: incentive.id,
      description: `${incentive.type} incentive posted from ${incentive.sourceCode}`,
      metadata: {
        sourceKey: incentive.sourceKey,
        sourceType: incentive.type,
        sourceCode: incentive.sourceCode,
        saleId: incentive.saleId,
        serviceJobId: incentive.serviceJobId,
        staffId: incentive.staffId,
        basisAmount: incentive.basisAmount.toFixed(2),
        ratePercent: incentive.ratePercent.toFixed(4),
        amount: incentive.amount.toFixed(2),
        classification: incentive.classificationSnapshot,
        rateVersionId: incentive.rateVersionId,
        cycleId: incentive.cycleId,
      },
    },
    tx
  );

  return incentive;
};

const postSaleIncentives = async (tx, actor, saleOrId) => {
  const saleId = typeof saleOrId === "string" ? saleOrId : saleOrId?.id;
  if (!saleId) {
    throw new AppError("Sale ID is required", 400, "SALE_ID_REQUIRED");
  }

  await tx.$queryRaw`
    SELECT "id"
    FROM "Sale"
    WHERE "id" = ${saleId}
    FOR UPDATE
  `;

  const sale = await tx.sale.findUnique({
    where: {
      id: saleId,
    },
    include: SALE_INCENTIVE_INCLUDE,
  });

  if (!sale) {
    throw new AppError("Sale not found", 404, "SALE_NOT_FOUND");
  }

  if (sale.status !== "COMPLETED") {
    return [];
  }

  const rules = await getRules(tx, { lockForPosting: true });
  if (!rules.isConfigured || !rules.isActive) {
    return [];
  }

  const posted = [];
  const itemBasis = sale.items
    .filter((item) => Boolean(item.itemId))
    .reduce((sum, item) => sum.plus(item.lineTotal), toDecimal(0));

  if (rules.enableItemIncentives && sale.cashierId) {
    const context = await enterpriseIncentiveService.getPostingContext(tx, {
      staffId: sale.cashierId,
      branchId: sale.branchId,
      sourceDate: sale.saleDate,
      basisType: "PRODUCT",
    });
    const incentive = context.eligible === false ? null : await createIncentive(tx, actor, {
      sourceKey: `SALE_ITEM:${sale.id}`,
      type: "SALE_ITEM",
      sourceCode: sale.receiptCode,
      sourceDate: sale.saleDate,
      basisAmount: itemBasis,
      ratePercent: context.ratePercent,
      branchId: sale.branchId,
      staffId: sale.cashierId,
      saleId: sale.id,
      classificationSnapshot: context.enterpriseConfigured
        ? context.classification
        : null,
      rateVersionId: context.enterpriseConfigured
        ? context.rateVersion?.id
        : null,
      cycleId: context.enterpriseConfigured ? context.cycle?.id : null,
    });
    if (incentive) posted.push(incentive);
  }

  const serviceStaffId = sale.quotation?.serviceDoneById;
  if (
    rules.enableServiceIncentives &&
    serviceStaffId &&
    sale.quotation?.serviceDoneBy
  ) {
    const context = await enterpriseIncentiveService.getPostingContext(tx, {
      staffId: serviceStaffId,
      branchId: sale.branchId,
      sourceDate: sale.saleDate,
      basisType: "SERVICE",
    });
    const serviceBasis = sale.items
      .filter((item) => !item.itemId)
      .reduce((sum, item) => sum.plus(item.lineTotal), toDecimal(sale.serviceCharge));

    const incentive = context.eligible === false ? null : await createIncentive(tx, actor, {
      sourceKey: `QUOTATION_SERVICE:${sale.id}`,
      type: "QUOTATION_SERVICE",
      sourceCode: sale.receiptCode,
      sourceDate: sale.saleDate,
      basisAmount: serviceBasis,
      ratePercent: context.ratePercent,
      branchId: sale.branchId,
      staffId: serviceStaffId,
      saleId: sale.id,
      classificationSnapshot: context.enterpriseConfigured
        ? context.classification
        : null,
      rateVersionId: context.enterpriseConfigured
        ? context.rateVersion?.id
        : null,
      cycleId: context.enterpriseConfigured ? context.cycle?.id : null,
    });
    if (incentive) posted.push(incentive);
  }

  return posted;
};

const postServiceJobIncentive = async (tx, actor, serviceJobOrId) => {
  const serviceJobId =
    typeof serviceJobOrId === "string" ? serviceJobOrId : serviceJobOrId?.id;
  if (!serviceJobId) {
    throw new AppError(
      "Service job ID is required",
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
    where: {
      id: serviceJobId,
    },
    include: SERVICE_JOB_INCENTIVE_INCLUDE,
  });

  if (
    !serviceJob ||
    serviceJob.status !== "COMPLETED" ||
    !serviceJob.assignedTechnicianId
  ) {
    return null;
  }

  const rules = await getRules(tx, { lockForPosting: true });
  if (
    !rules.isConfigured ||
    !rules.isActive ||
    !rules.enableServiceIncentives
  ) {
    return null;
  }

  const sourceDate = serviceJob.completedAt || new Date();
  const context = await enterpriseIncentiveService.getPostingContext(tx, {
    staffId: serviceJob.assignedTechnicianId,
    branchId: serviceJob.branchId,
    sourceDate,
    basisType: "SERVICE",
  });
  if (context.eligible === false) return null;

  return createIncentive(tx, actor, {
    sourceKey: `SERVICE_JOB:${serviceJob.id}`,
    type: "SERVICE_JOB",
    sourceCode: serviceJob.jobCode,
    sourceDate,
    basisAmount: serviceJob.finalServiceCharge,
    ratePercent: context.ratePercent,
    branchId: serviceJob.branchId,
    staffId: serviceJob.assignedTechnicianId,
    serviceJobId: serviceJob.id,
    classificationSnapshot: context.enterpriseConfigured
      ? context.classification
      : null,
    rateVersionId: context.enterpriseConfigured ? context.rateVersion?.id : null,
    cycleId: context.enterpriseConfigured ? context.cycle?.id : null,
  });
};

const reverseSaleIncentives = async (tx, actor, saleOrId, reason) => {
  const saleId = typeof saleOrId === "string" ? saleOrId : saleOrId?.id;
  if (!saleId) {
    throw new AppError("Sale ID is required", 400, "SALE_ID_REQUIRED");
  }

  await tx.$queryRaw`
    SELECT "id"
    FROM "Sale"
    WHERE "id" = ${saleId}
    FOR UPDATE
  `;

  await tx.$queryRaw`
    SELECT "id"
    FROM "Incentive"
    WHERE "saleId" = ${saleId}
    ORDER BY "id"
    FOR UPDATE
  `;

  const incentives = await tx.incentive.findMany({
    where: {
      saleId,
      status: "POSTED",
    },
    orderBy: {
      id: "asc",
    },
  });

  if (incentives.length > 0) {
    const claimedSource = await tx.incentiveClaimLine.findFirst({
      where: {
        incentiveId: { in: incentives.map((incentive) => incentive.id) },
      },
      select: { id: true },
    });
    if (claimedSource) {
      throw new AppError(
        "This sale incentive is already included in an incentive claim and requires an audited settlement before cancellation",
        409,
        "INCENTIVE_CLAIM_SETTLEMENT_REQUIRED"
      );
    }
  }

  const reversedAt = new Date();
  const reversalReason = reason?.trim() || "Source sale reversed";
  const reversed = [];

  for (const incentive of incentives) {
    const updated = await tx.incentive.update({
      where: {
        id: incentive.id,
      },
      data: {
        status: "REVERSED",
        reversedAt,
        reversedById: actor?.id || null,
        reversalReason,
      },
    });

    await createAuditLog(
      {
        actor,
        branchId: incentive.branchId,
        action: "INCENTIVE_REVERSED",
        entityType: "Incentive",
        entityId: incentive.id,
        description: `${incentive.type} incentive reversed from ${incentive.sourceCode}`,
        metadata: {
          sourceKey: incentive.sourceKey,
          sourceType: incentive.type,
          sourceCode: incentive.sourceCode,
          saleId: incentive.saleId,
          staffId: incentive.staffId,
          amount: incentive.amount.toFixed(2),
          reversalReason,
        },
      },
      tx
    );

    reversed.push(updated);
  }

  return reversed;
};

const assertSaleIncentivesUnclaimed = async (tx, saleOrId) => {
  const saleId = typeof saleOrId === "string" ? saleOrId : saleOrId?.id;
  if (!saleId) {
    throw new AppError("Sale ID is required", 400, "SALE_ID_REQUIRED");
  }

  await tx.$queryRaw`
    SELECT "id"
    FROM "Incentive"
    WHERE "saleId" = ${saleId}
    ORDER BY "id"
    FOR UPDATE
  `;
  const claimedSource = await tx.incentiveClaimLine.findFirst({
    where: {
      incentive: {
        saleId,
        status: "POSTED",
      },
    },
    select: { id: true },
  });
  if (claimedSource) {
    throw new AppError(
      "This sale incentive is already included in an incentive claim and requires an audited settlement before cancellation",
      409,
      "INCENTIVE_CLAIM_SETTLEMENT_REQUIRED"
    );
  }
};

const adjustSaleItemIncentiveForReturn = async (
  tx,
  actor,
  {
    saleId,
    returnRequestId,
    remainingBasisAmount,
    reason,
  }
) => {
  if (!saleId || !returnRequestId) {
    throw new AppError(
      "Sale and return request IDs are required",
      400,
      "INCENTIVE_RETURN_SOURCE_REQUIRED"
    );
  }

  await tx.$queryRaw`
    SELECT "id"
    FROM "Incentive"
    WHERE "saleId" = ${saleId}
    ORDER BY "id"
    FOR UPDATE
  `;

  const postedItemIncentives = await tx.incentive.findMany({
    where: {
      saleId,
      type: "SALE_ITEM",
      status: "POSTED",
    },
    orderBy: [{ postedAt: "asc" }, { id: "asc" }],
  });

  if (postedItemIncentives.length === 0) {
    return {
      reversed: null,
      replacement: null,
    };
  }

  if (postedItemIncentives.length > 1) {
    throw new AppError(
      "Sale has more than one payable product incentive",
      409,
      "INCENTIVE_LEDGER_INCONSISTENT"
    );
  }

  const current = postedItemIncentives[0];
  const settledClaimLine = await tx.incentiveClaimLine.findFirst({
    where: { incentiveId: current.id },
    select: {
      claim: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });
  if (settledClaimLine) {
    throw new AppError(
      "This product incentive is already included in an incentive claim and requires an audited settlement before the sale return can proceed",
      409,
      "INCENTIVE_CLAIM_SETTLEMENT_REQUIRED"
    );
  }
  const reversedAt = new Date();
  const reversalReason =
    reason?.trim() || "Product incentive adjusted for completed sale return";

  const reversed = await tx.incentive.update({
    where: {
      id: current.id,
    },
    data: {
      status: "REVERSED",
      reversedAt,
      reversedById: actor?.id || null,
      reversalReason,
    },
  });

  await createAuditLog(
    {
      actor,
      branchId: current.branchId,
      action: "INCENTIVE_REVERSED",
      entityType: "Incentive",
      entityId: current.id,
      description: `${current.type} incentive reversed from ${current.sourceCode}`,
      metadata: {
        sourceKey: current.sourceKey,
        sourceType: current.type,
        sourceCode: current.sourceCode,
        saleId: current.saleId,
        returnRequestId,
        staffId: current.staffId,
        amount: current.amount.toFixed(2),
        reversalReason,
      },
    },
    tx
  );

  const hasEnterpriseSnapshot = Boolean(
    current.classificationSnapshot && current.rateVersionId && current.cycleId
  );
  const replacement = await createIncentive(tx, actor, {
    sourceKey: `SALE_ITEM_RETURN:${saleId}:${returnRequestId}`,
    type: "SALE_ITEM",
    sourceCode: current.sourceCode,
    sourceDate: current.sourceDate,
    basisAmount: remainingBasisAmount,
    ratePercent: current.ratePercent,
    branchId: current.branchId,
    staffId: current.staffId,
    saleId,
    classificationSnapshot: current.classificationSnapshot,
    rateVersionId: current.rateVersionId,
    cycleId: current.cycleId,
    // Existing legacy ledger rows predate enterprise provenance. Their return
    // replacement must preserve the already-snapshotted rate and remaining
    // payable basis without manufacturing historical classification/version data.
    allowLegacyProvenance: !hasEnterpriseSnapshot,
  });

  return {
    reversed,
    replacement,
  };
};

const updateRules = async (actor, rules) => {
  if (actor.role !== "SUPER_OWNER") {
    throw new AppError(
      "Only Super Owner can manage the global incentive rules",
      403,
      "INCENTIVE_RULES_FORBIDDEN"
    );
  }

  assertIncentiveRules(rules);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "BusinessSetting"
      WHERE "scopeKey" = ${RULE_SCOPE_KEY}
      FOR UPDATE
    `;

    const existing = await tx.businessSetting.findUnique({
      where: {
        scopeKey: RULE_SCOPE_KEY,
      },
    });

    if (!existing) {
      throw new AppError(
        "Incentive rule setting not found",
        404,
        "INCENTIVE_RULES_NOT_FOUND"
      );
    }

    if (!existing.isEditable) {
      throw new AppError(
        "Incentive rule setting is not editable",
        400,
        "INCENTIVE_RULES_NOT_EDITABLE"
      );
    }

    const setting = await tx.businessSetting.update({
      where: {
        scopeKey: RULE_SCOPE_KEY,
      },
      data: {
        value: rules,
        description: RULE_DESCRIPTION,
        updatedById: actor.id,
      },
      select: {
        value: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await createAuditLog(
      {
        actor,
        branchId: null,
        action: "INCENTIVE_RULES_UPDATED",
        entityType: "BusinessSetting",
        entityId: existing.id,
        description: "Incentive rules updated",
        metadata: {
          scopeKey: RULE_SCOPE_KEY,
          previousValue: existing.value,
          value: rules,
          previousDescription: existing.description,
          description: RULE_DESCRIPTION,
        },
      },
      tx
    );

    return normalizeRules(setting);
  });
};

const getIncentives = async (actor, query = {}) => {
  const rules = await getRules();
  const enterprise =
    await enterpriseIncentiveService.getPostingConfigurationStatus();
  const access = resolveAccess(actor, query);

  if (!access.isOwnerView && !rules.staffCanViewOwnIncentives) {
    throw new AppError(
      "Staff incentive visibility is disabled",
      403,
      "INCENTIVE_ACCESS_DENIED"
    );
  }

  if (access.isOwnerView && !rules.ownerCanViewAllIncentives) {
    throw new AppError(
      "Owner incentive visibility is disabled",
      403,
      "INCENTIVE_ACCESS_DENIED"
    );
  }

  const sourceDate = parseDateRange(query);
  const where = {
    branchId: access.branchId,
    staffId: access.staffId,
    type: query.type,
    status: query.status,
    sourceDate,
  };
  const { page, limit, skip } = parsePagination(query);
  const postedWhere = {
    AND: [where, { status: "POSTED" }],
  };
  const reversedWhere = {
    AND: [where, { status: "REVERSED" }],
  };
  const postedItemWhere = {
    AND: [where, { status: "POSTED", type: "SALE_ITEM" }],
  };
  const postedServiceWhere = {
    AND: [
      where,
      {
        status: "POSTED",
        type: {
          in: ["QUOTATION_SERVICE", "SERVICE_JOB"],
        },
      },
    ],
  };

  const [
    records,
    total,
    postedCount,
    reversedCount,
    postedAggregate,
    reversedAggregate,
    postedItemAggregate,
    postedServiceAggregate,
  ] = await Promise.all([
    prisma.incentive.findMany({
      where,
      include: INCENTIVE_INCLUDE,
      orderBy: [{ sourceDate: "desc" }, { id: "desc" }],
      skip,
      take: limit,
    }),
    prisma.incentive.count({ where }),
    prisma.incentive.count({ where: postedWhere }),
    prisma.incentive.count({ where: reversedWhere }),
    prisma.incentive.aggregate({
      where: postedWhere,
      _sum: {
        basisAmount: true,
        amount: true,
      },
    }),
    prisma.incentive.aggregate({
      where: reversedWhere,
      _sum: {
        amount: true,
      },
    }),
    prisma.incentive.aggregate({
      where: postedItemWhere,
      _sum: {
        amount: true,
      },
    }),
    prisma.incentive.aggregate({
      where: postedServiceWhere,
      _sum: {
        amount: true,
      },
    }),
  ]);

  const totalAmount = toMoneyDecimal(postedAggregate._sum.amount || 0);
  const itemAmount = toMoneyDecimal(postedItemAggregate._sum.amount || 0);

  return {
    rules,
    enterprise,
    totals: {
      entries: total,
      postedEntries: postedCount,
      reversedEntries: reversedCount,
      totalBasis: Number(postedAggregate._sum.basisAmount || 0),
      totalAmount: Number(totalAmount),
      itemAmount: Number(itemAmount),
      serviceAmount: Number(postedServiceAggregate._sum.amount || 0),
      reversedAmount: Number(reversedAggregate._sum.amount || 0),
    },
    entries: records.map(formatEntry),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    disclosure: rules.requireOwnerApprovalBeforePayout
      ? "Posted incentive ledger amounts require owner approval before payout. Reversed entries are excluded from payable totals."
      : "Posted incentive ledger amounts are snapshotted from the rules active when each source completed. Reversed entries are excluded from payable totals.",
  };
};

module.exports = {
  assertIncentiveRules,
  getIncentives,
  getRules,
  adjustSaleItemIncentiveForReturn,
  assertSaleIncentivesUnclaimed,
  postSaleIncentives,
  postServiceJobIncentive,
  reverseSaleIncentives,
  updateRules,
};
