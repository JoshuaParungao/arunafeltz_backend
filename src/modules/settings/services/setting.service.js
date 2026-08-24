const prisma = require("../../../config/prisma");
const cache = require("../../../config/cache");
const AppError = require("../../../utils/appError");
const { createAuditLog } = require("../../../utils/auditLogger");

const SETTINGS_CACHE_TTL = 2 * 60 * 1000;

const buildSettingsListCacheKey = (filters = {}, actor = null) => {
  const normalizedFilters = { ...filters };

  if (actor && actor.role !== "SUPER_OWNER" && !normalizedFilters.branchId) {
    normalizedFilters.branchId = actor.branchId || "UNASSIGNED";
  }

  const hashSource = Object.entries(normalizedFilters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("|");

  return `settings:list:${hashSource || "all"}`;
};

const buildSettingsRequiredCacheKey = (scopeKeys = []) => {
  const cleanKeys = [...new Set(scopeKeys.filter(Boolean))].sort();
  return `settings:required:${cleanKeys.join("|") || "none"}`;
};

const QUOTATION_SETTING_SCOPE_KEYS = {
  CASH_DISCOUNTED_AMOUNT_FORMULA:
    "GLOBAL:quotation.cash_discounted_amount_formula",
  TOTAL_CASH_DISCOUNTED_PRICE_FORMULA:
    "GLOBAL:quotation.total_cash_discounted_price_formula",
  SUGGESTED_RETAIL_PRICE_BASIS:
    "GLOBAL:quotation.suggested_retail_price_basis",
  REGULAR_PRICE_BASIS:
    "GLOBAL:quotation.regular_price_basis",
};

const INSTALLMENT_SETTING_SCOPE_KEYS = {
  TERM_BASIS: "GLOBAL:installment.term_basis",
  BALANCE_FORMULA: "GLOBAL:installment.balance_formula",
};

const WARRANTY_SETTING_SCOPE_KEYS = {
  MAJOR_PARTS_MONTHS: "GLOBAL:warranty.major_parts_months",
  ACCESSORIES_DAYS: "GLOBAL:warranty.accessories_days",
  OUTRIGHT_REPLACEMENT_DAYS: "GLOBAL:warranty.outright_replacement_days",
};

const CASH_BOX_SETTING_SCOPE_KEYS = {
  REQUIRE_HANDOVER_CONFIRMATION:
    "GLOBAL:cash_box.require_handover_confirmation",
  DEFAULT_PAYMENT_STATUS:
    "GLOBAL:cash_box.default_payment_status",
};

const CASH_BOX_STATUSES = {
  PENDING_HANDOVER: "PENDING_HANDOVER",
  CONFIRMED_RECEIVED: "CONFIRMED_RECEIVED",
};

const INCENTIVE_RULE_SCOPE_KEY = "GLOBAL:incentive.rules";

const SETTING_SELECT = {
  id: true,
  scopeKey: true,
  key: true,
  category: true,
  valueType: true,
  value: true,
  label: true,
  description: true,
  isEditable: true,
  isActive: true,
  branchId: true,
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
  updatedById: true,
  updatedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  createdAt: true,
  updatedAt: true,
};

const DEFAULT_SETTINGS_LIST = [
  {
    scopeKey: "GLOBAL:quotation.cash_discounted_amount_formula",
    key: "quotation.cash_discounted_amount_formula",
    category: "BUSINESS_RULE",
    valueType: "STRING",
    value: "quantity * cashDiscountedPrice",
    label: "Quotation Cash Discounted Amount Formula",
    description: "Formula used for item amount in quotation: QTY multiplied by Cash Discounted Price.",
  },
  {
    scopeKey: "GLOBAL:quotation.total_cash_discounted_price_formula",
    key: "quotation.total_cash_discounted_price_formula",
    category: "BUSINESS_RULE",
    valueType: "STRING",
    value: "sum(itemAmounts)",
    label: "Total Cash Discounted Price Formula",
    description: "Formula used to compute quotation total cash discounted price.",
  },
  {
    scopeKey: "GLOBAL:quotation.suggested_retail_price_basis",
    key: "quotation.suggested_retail_price_basis",
    category: "BUSINESS_RULE",
    valueType: "NUMBER",
    value: 0.96,
    label: "Suggested Retail Price Basis",
    description: "Client formula: Suggested Retail Price = Total Cash Discounted Price / 0.96.",
  },
  {
    scopeKey: "GLOBAL:quotation.regular_price_basis",
    key: "quotation.regular_price_basis",
    category: "BUSINESS_RULE",
    valueType: "NUMBER",
    value: 0.875,
    label: "Regular Price Basis",
    description: "Client formula: Regular Price = Total Cash Discounted Price / 0.875.",
  },
  {
    scopeKey: "GLOBAL:installment.term_basis",
    key: "installment.term_basis",
    category: "BUSINESS_RULE",
    valueType: "JSON",
    value: {
      STRAIGHT: 0.96,
      MONTH_3: 0.96,
      MONTH_6: 0.935,
      MONTH_9: 0.905,
      MONTH_12: 0.875,
      MONTH_18: 0.815,
      MONTH_24: 0.755,
    },
    label: "Installment Term Basis",
    description: "Client installment basis values used for credit-card or installment computations.",
  },
  {
    scopeKey: "GLOBAL:installment.balance_formula",
    key: "installment.balance_formula",
    category: "BUSINESS_RULE",
    valueType: "STRING",
    value: "(cashPromoTotalAmount - cashDownpayment) / termBasis",
    label: "Installment Balance Formula",
    description: "Client formula for installment balance after cash downpayment.",
  },
  {
    scopeKey: "GLOBAL:warranty.major_parts_months",
    key: "warranty.major_parts_months",
    category: "BUSINESS_RULE",
    valueType: "NUMBER",
    value: 12,
    label: "Major Parts Warranty Months",
    description: "Default warranty duration for major parts.",
  },
  {
    scopeKey: "GLOBAL:warranty.accessories_days",
    key: "warranty.accessories_days",
    category: "BUSINESS_RULE",
    valueType: "NUMBER",
    value: 30,
    label: "Accessories Warranty Days",
    description: "Default warranty duration for accessories.",
  },
  {
    scopeKey: "GLOBAL:warranty.outright_replacement_days",
    key: "warranty.outright_replacement_days",
    category: "BUSINESS_RULE",
    valueType: "NUMBER",
    value: 7,
    label: "Outright Replacement Days",
    description: "Default outright replacement period except excluded products such as printers.",
  },
  {
    scopeKey: "GLOBAL:cash_box.require_handover_confirmation",
    key: "cash_box.require_handover_confirmation",
    category: "OPERATION",
    valueType: "BOOLEAN",
    value: true,
    label: "Require Cash Handover Confirmation",
    description: "Requires cash custodian confirmation before cash is considered received.",
  },
  {
    scopeKey: "GLOBAL:cash_box.default_payment_status",
    key: "cash_box.default_payment_status",
    category: "OPERATION",
    valueType: "STRING",
    value: "PENDING_HANDOVER",
    label: "Default Payment Status",
    description: "Default cash status after cashier or technician records a payment.",
  },
  {
    scopeKey: "GLOBAL:receipt.business_name",
    key: "receipt.business_name",
    category: "DOCUMENT",
    valueType: "STRING",
    value: "Arunafeltz",
    label: "Receipt Business Name",
    description: "Default business name shown on receipts and printable documents.",
  },
  {
    scopeKey: "GLOBAL:receipt.default_footer_notes",
    key: "receipt.default_footer_notes",
    category: "DOCUMENT",
    valueType: "ARRAY",
    value: [
      "Thank you for your purchase.",
      "Please keep this receipt for warranty purposes.",
    ],
    label: "Receipt Default Footer Notes",
    description: "Default footer notes shown on receipts.",
  },
  {
    scopeKey: "GLOBAL:system.allow_branch_specific_settings",
    key: "system.allow_branch_specific_settings",
    category: "SYSTEM_ADMIN",
    valueType: "BOOLEAN",
    value: true,
    label: "Allow Branch Specific Settings",
    description: "Allows future branch-level overrides for selected settings.",
  },
  {
    scopeKey: "GLOBAL:document.numbering",
    key: "document.numbering",
    category: "DOCUMENT",
    valueType: "JSON",
    value: {
      quotationPrefix: "QT-",
      quotationNextNumber: 10001,
      salePrefix: "INV-",
      saleNextNumber: 10001,
      orderPrefix: "PO-",
      orderNextNumber: 10001,
      transferPrefix: "TR-",
      transferNextNumber: 10001,
    },
    label: "Document Numbering Sequences",
    description: "Default prefixes and sequence starting points for generated documents.",
  },
  {
    scopeKey: "GLOBAL:price.tier_labels",
    key: "price.tier_labels",
    category: "BUSINESS_RULE",
    valueType: "JSON",
    value: {
      price1: "Price 1",
      price2: "Price 2",
      price3: "Price 3",
      price4: "Price 4",
      price5: "Price 5",
    },
    label: "Price Tier Labels",
    description: "Configurable labels for price tiers 1 through 5.",
  },
  {
    scopeKey: "GLOBAL:payment.methods",
    key: "payment.methods",
    category: "OPERATION",
    valueType: "JSON",
    value: {
      cash: true,
      gcash: true,
      maya: true,
      bankTransfer: true,
      card: true,
    },
    label: "Enabled Payment Methods",
    description: "Configurable payment methods accepted at checkout.",
  },
  {
    scopeKey: "GLOBAL:discount.rules",
    key: "discount.rules",
    category: "BUSINESS_RULE",
    valueType: "JSON",
    value: {
      maxStaffDiscountPercent: 5,
      requireApprovalAbovePercent: 5,
      allowCustomPriceOverride: false,
    },
    label: "Discount Rules & Limitations",
    description: "Staff discount caps and manager approval thresholds.",
  },
  {
    scopeKey: "GLOBAL:inventory.rules",
    key: "inventory.rules",
    category: "OPERATION",
    valueType: "JSON",
    value: {
      defaultLowStockThreshold: 5,
      preventNegativeStock: true,
      autoTrackSerialMovements: true,
    },
    label: "Inventory Rules & Controls",
    description: "Low stock alert levels, negative stock prevention, and serial audit toggles.",
  },
  {
    scopeKey: "GLOBAL:service.rules",
    key: "service.rules",
    category: "OPERATION",
    valueType: "JSON",
    value: {
      defaultDiagnosticFee: 0,
      requireTechnicianAssignment: true,
    },
    label: "Service Job Rules",
    description: "Default diagnostic fee and service workflow requirements.",
  },
  {
    scopeKey: "GLOBAL:incentive.rules",
    key: "incentive.rules",
    category: "BUSINESS_RULE",
    valueType: "JSON",
    value: {
      enableItemIncentives: true,
      enableServiceIncentives: true,
      staffCanViewOwnIncentives: true,
      ownerCanViewAllIncentives: true,
      requireOwnerApprovalBeforePayout: true,
      defaultItemIncentivePercent: 1,
      defaultServiceIncentivePercent: 5,
    },
    label: "Incentive System Rules",
    description: "Commission and incentive calculation and payout rules.",
  },
];

const ensureDefaultSettings = async () => {
  try {
    for (const item of DEFAULT_SETTINGS_LIST) {
      await prisma.businessSetting.upsert({
        where: { scopeKey: item.scopeKey },
        update: {
          key: item.key,
          category: item.category,
          valueType: item.valueType,
          label: item.label,
          description: item.description,
          isEditable: true,
          isActive: true,
        },
        create: {
          scopeKey: item.scopeKey,
          key: item.key,
          category: item.category,
          valueType: item.valueType,
          value: item.value,
          label: item.label,
          description: item.description,
          isEditable: true,
          isActive: true,
        },
      });
    }
  } catch (err) {
    // Non-blocking logger
  }
};

const assertSettingBranchAccess = (setting, actor) => {
  if (!actor || actor.role === "SUPER_OWNER" || !setting.branchId) return;

  if (!actor.branchId || setting.branchId !== actor.branchId) {
    throw new AppError(
      "You can only access settings for your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const listSettings = async (filters = {}, actor = null) => {
  const includeInactive = filters.includeInactive === "true";

  if (
    actor &&
    actor.role !== "SUPER_OWNER" &&
    filters.branchId &&
    filters.branchId !== actor?.branchId
  ) {
    throw new AppError(
      "You can only access settings for your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  const cacheKey = buildSettingsListCacheKey(filters, actor);
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const where = {
    category: filters.category,
    key: filters.key,
    branchId: filters.branchId,
    isActive: includeInactive ? undefined : true,
  };

  if (actor && actor.role !== "SUPER_OWNER" && !filters.branchId) {
    delete where.branchId;
    where.OR = [
      { branchId: null },
      { branchId: actor.branchId },
    ];
  }

  let settings = await prisma.businessSetting.findMany({
    where,
    select: SETTING_SELECT,
    orderBy: [
      {
        category: "asc",
      },
      {
        scopeKey: "asc",
      },
    ],
  });

  if (settings.length === 0 && !filters.category && !filters.key && !filters.branchId) {
    await ensureDefaultSettings();
    settings = await prisma.businessSetting.findMany({
      where,
      select: SETTING_SELECT,
      orderBy: [
        {
          category: "asc",
        },
        {
          scopeKey: "asc",
        },
      ],
    });
  }

  cache.set(cacheKey, settings, SETTINGS_CACHE_TTL);
  return settings;
};

const findSettingByScopeKeyOrKey = async (rawScopeKey, select = null) => {
  if (!rawScopeKey) return null;
  let decoded = rawScopeKey;
  try {
    decoded = decodeURIComponent(rawScopeKey);
  } catch {
    decoded = rawScopeKey;
  }

  const candidates = Array.from(
    new Set([
      rawScopeKey,
      decoded,
      `GLOBAL:${rawScopeKey}`,
      `GLOBAL:${decoded}`,
      rawScopeKey.replace(/^GLOBAL:/i, ""),
      decoded.replace(/^GLOBAL:/i, ""),
    ])
  ).filter(Boolean);

  const query = {
    where: {
      OR: [
        { scopeKey: { in: candidates } },
        { key: { in: candidates } },
      ],
    },
  };

  if (select) {
    query.select = select;
  }

  let setting = await prisma.businessSetting.findFirst(query);

  if (!setting) {
    const defaultItem = DEFAULT_SETTINGS_LIST.find(
      (d) => candidates.includes(d.scopeKey) || candidates.includes(d.key)
    );

    if (defaultItem) {
      setting = await prisma.businessSetting.upsert({
        where: { scopeKey: defaultItem.scopeKey },
        update: {},
        create: {
          scopeKey: defaultItem.scopeKey,
          key: defaultItem.key,
          category: defaultItem.category,
          valueType: defaultItem.valueType,
          value: defaultItem.value,
          label: defaultItem.label,
          description: defaultItem.description,
          isEditable: true,
          isActive: true,
        },
      });

      if (select) {
        setting = await prisma.businessSetting.findUnique({
          where: { id: setting.id },
          select,
        });
      }
    }
  }

  return setting;
};

const getSettingByScopeKey = async (scopeKey, actor = null) => {
  const cacheKey = `settings:scope:${scopeKey}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const setting = await findSettingByScopeKeyOrKey(scopeKey, SETTING_SELECT);

  if (!setting) {
    throw new AppError("Setting not found", 404, "SETTING_NOT_FOUND");
  }

  assertSettingBranchAccess(setting, actor);

  cache.set(cacheKey, setting, SETTINGS_CACHE_TTL);
  return setting;
};

const assertValueMatchesType = (valueType, value) => {
  if (value === undefined) {
    return;
  }

  if (valueType === "STRING" && typeof value !== "string") {
    throw new AppError("Setting value must be a string", 400, "VALUE_TYPE_MISMATCH");
  }

  if (valueType === "NUMBER" && (typeof value !== "number" || Number.isNaN(value))) {
    throw new AppError("Setting value must be a number", 400, "VALUE_TYPE_MISMATCH");
  }

  if (valueType === "BOOLEAN" && typeof value !== "boolean") {
    throw new AppError("Setting value must be a boolean", 400, "VALUE_TYPE_MISMATCH");
  }

  if (valueType === "ARRAY" && !Array.isArray(value)) {
    throw new AppError("Setting value must be an array", 400, "VALUE_TYPE_MISMATCH");
  }

  if (
    valueType === "JSON" &&
    (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
  ) {
    throw new AppError("Setting value must be a JSON object", 400, "VALUE_TYPE_MISMATCH");
  }
};

const updateSettingByScopeKey = async (scopeKey, payload, actor = null) => {
  const existingSetting = await findSettingByScopeKeyOrKey(scopeKey);

  if (!existingSetting) {
    throw new AppError("Setting not found", 404, "SETTING_NOT_FOUND");
  }

  if (!actor || !["SUPER_OWNER", "ADMIN"].includes(actor.role)) {
    throw new AppError(
      "Only Main Admin or Admin can update business settings",
      403,
      "GLOBAL_SETTING_UPDATE_FORBIDDEN"
    );
  }

  assertSettingBranchAccess(existingSetting, actor);

  if (!existingSetting.isEditable) {
    throw new AppError("Setting is not editable", 400, "SETTING_NOT_EDITABLE");
  }

  assertValueMatchesType(existingSetting.valueType, payload.value);

  if (scopeKey === INCENTIVE_RULE_SCOPE_KEY && payload.value !== undefined) {
    const rules = payload.value;
    const requiredBooleanFields = [
      "enableItemIncentives",
      "enableServiceIncentives",
      "staffCanViewOwnIncentives",
      "ownerCanViewAllIncentives",
      "requireOwnerApprovalBeforePayout",
    ];
    const requiredPercentFields = [
      "defaultItemIncentivePercent",
      "defaultServiceIncentivePercent",
    ];

    for (const field of requiredBooleanFields) {
      if (typeof rules[field] !== "boolean") {
        throw new AppError(
          `Incentive rule ${field} must be a boolean`,
          400,
          "INVALID_INCENTIVE_RULES"
        );
      }
    }

    for (const field of requiredPercentFields) {
      if (
        typeof rules[field] !== "number" ||
        Number.isNaN(rules[field]) ||
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

    const allowedFields = new Set([
      ...requiredBooleanFields,
      ...requiredPercentFields,
    ]);

    if (Object.keys(rules).some((field) => !allowedFields.has(field))) {
      throw new AppError(
        "Incentive rules contain unsupported fields",
        400,
        "INVALID_INCENTIVE_RULES"
      );
    }
  }

  const updateData = {};

  if (payload.value !== undefined) {
    updateData.value = payload.value;
  }

  if (payload.label !== undefined) {
    updateData.label = payload.label;
  }

  if (payload.description !== undefined) {
    updateData.description = payload.description;
  }

  if (payload.isEditable !== undefined) {
    updateData.isEditable = payload.isEditable;
  }

  if (payload.isActive !== undefined) {
    updateData.isActive = payload.isActive;
  }

  if (actor?.id) {
    updateData.updatedById = actor.id;
  }

  return prisma.$transaction(async (tx) => {
    const setting = await tx.businessSetting.update({
      where: { id: existingSetting.id },
      data: updateData,
      select: SETTING_SELECT,
    });

    await createAuditLog({
      actor,
      branchId: setting.branchId,
      action: "SETTING_UPDATED",
      entityType: "BusinessSetting",
      entityId: setting.id,
      description: `Setting ${setting.scopeKey} updated`,
      metadata: {
        scopeKey: setting.scopeKey,
        previous: {
          value: existingSetting.value,
          label: existingSetting.label,
          description: existingSetting.description,
          isEditable: existingSetting.isEditable,
          isActive: existingSetting.isActive,
        },
        current: {
          value: setting.value,
          label: setting.label,
          description: setting.description,
          isEditable: setting.isEditable,
          isActive: setting.isActive,
        },
      },
    }, tx);

    cache.invalidatePrefix("settings:");
    return setting;
  });
};

const getRequiredActiveSettingsByScopeKeys = async (scopeKeys = []) => {
  const cleanScopeKeys = [...new Set(scopeKeys.filter(Boolean))];
  const cacheKey = buildSettingsRequiredCacheKey(cleanScopeKeys);
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const settings = await prisma.businessSetting.findMany({
    where: {
      scopeKey: {
        in: cleanScopeKeys,
      },
      isActive: true,
    },
    select: SETTING_SELECT,
  });

  const settingsMap = new Map(
    settings.map((setting) => [setting.scopeKey, setting])
  );

  for (const scopeKey of cleanScopeKeys) {
    if (!settingsMap.has(scopeKey)) {
      throw new AppError(
        `Required setting is missing or inactive: ${scopeKey}`,
        500,
        "REQUIRED_SETTING_MISSING"
      );
    }
  }

  cache.set(cacheKey, settingsMap, SETTINGS_CACHE_TTL);
  return settingsMap;
};

const assertNumberSetting = (setting) => {
  if (setting.valueType !== "NUMBER" || typeof setting.value !== "number") {
    throw new AppError(
      `Setting ${setting.scopeKey} must be a number`,
      500,
      "INVALID_SETTING_VALUE"
    );
  }
};

const assertJsonObjectSetting = (setting) => {
  if (
    setting.valueType !== "JSON" ||
    setting.value === null ||
    typeof setting.value !== "object" ||
    Array.isArray(setting.value)
  ) {
    throw new AppError(
      `Setting ${setting.scopeKey} must be a JSON object`,
      500,
      "INVALID_SETTING_VALUE"
    );
  }
};

const assertStringSetting = (setting) => {
  if (setting.valueType !== "STRING" || typeof setting.value !== "string") {
    throw new AppError(
      `Setting ${setting.scopeKey} must be a string`,
      500,
      "INVALID_SETTING_VALUE"
    );
  }
};

const assertBooleanSetting = (setting) => {
  if (setting.valueType !== "BOOLEAN" || typeof setting.value !== "boolean") {
    throw new AppError(
      `Setting ${setting.scopeKey} must be a boolean`,
      500,
      "INVALID_SETTING_VALUE"
    );
  }
};

const assertPositiveNumberSetting = (setting) => {
  assertNumberSetting(setting);

  if (setting.value <= 0) {
    throw new AppError(
      `Setting ${setting.scopeKey} must be greater than zero`,
      500,
      "INVALID_SETTING_VALUE"
    );
  }
};

const roundMoney = (value) => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

const formatDateOnly = (date) => {
  return date.toISOString().slice(0, 10);
};

const parseDateOnly = (dateString) => {
  const date = new Date(`${dateString}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("Invalid purchase date", 400, "INVALID_PURCHASE_DATE");
  }

  return date;
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const addMonths = (date, months) => {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
};

const getQuotationBasisSettings = async () => {
  const scopeKeys = Object.values(QUOTATION_SETTING_SCOPE_KEYS);

  const settingsMap = await getRequiredActiveSettingsByScopeKeys(scopeKeys);

  const cashDiscountedAmountFormula = settingsMap.get(
    QUOTATION_SETTING_SCOPE_KEYS.CASH_DISCOUNTED_AMOUNT_FORMULA
  );

  const totalCashDiscountedPriceFormula = settingsMap.get(
    QUOTATION_SETTING_SCOPE_KEYS.TOTAL_CASH_DISCOUNTED_PRICE_FORMULA
  );

  const suggestedRetailPriceBasis = settingsMap.get(
    QUOTATION_SETTING_SCOPE_KEYS.SUGGESTED_RETAIL_PRICE_BASIS
  );

  const regularPriceBasis = settingsMap.get(
    QUOTATION_SETTING_SCOPE_KEYS.REGULAR_PRICE_BASIS
  );

  assertStringSetting(cashDiscountedAmountFormula);
  assertStringSetting(totalCashDiscountedPriceFormula);
  assertPositiveNumberSetting(suggestedRetailPriceBasis);
  assertPositiveNumberSetting(regularPriceBasis);

  return {
    formulas: {
      cashDiscountedAmount: cashDiscountedAmountFormula.value,
      totalCashDiscountedPrice: totalCashDiscountedPriceFormula.value,
      suggestedRetailPrice:
        "totalCashDiscountedPrice / suggestedRetailPriceBasis",
      regularPrice:
        "totalCashDiscountedPrice / regularPriceBasis",
    },
    basis: {
      suggestedRetailPriceBasis: suggestedRetailPriceBasis.value,
      regularPriceBasis: regularPriceBasis.value,
    },
    settings: {
      cashDiscountedAmountFormula,
      totalCashDiscountedPriceFormula,
      suggestedRetailPriceBasis,
      regularPriceBasis,
    },
  };
};

const computeQuotationTest = async ({ items }) => {
  const quotationSettings = await getQuotationBasisSettings();

  const suggestedRetailPriceBasis =
    quotationSettings.basis.suggestedRetailPriceBasis;

  const regularPriceBasis =
    quotationSettings.basis.regularPriceBasis;

  const computedItems = items.map((item, index) => {
    const quantity = item.quantity;
    const cashDiscountedPrice = item.cashDiscountedPrice;
    const amount = roundMoney(quantity * cashDiscountedPrice);

    return {
      lineNo: index + 1,
      itemCode: item.itemCode || null,
      description: item.description || null,
      quantity,
      cashDiscountedPrice,
      amount,
    };
  });

  const totalCashDiscountedPrice = roundMoney(
    computedItems.reduce((sum, item) => sum + item.amount, 0)
  );

  const suggestedRetailPrice = roundMoney(
    totalCashDiscountedPrice / suggestedRetailPriceBasis
  );

  const regularPrice = roundMoney(
    totalCashDiscountedPrice / regularPriceBasis
  );

  return {
    formulasUsed: quotationSettings.formulas,
    basisUsed: quotationSettings.basis,
    items: computedItems,
    totals: {
      totalCashDiscountedPrice,
      suggestedRetailPrice,
      regularPrice,
    },
  };
};

const getInstallmentBasisSettings = async () => {
  const scopeKeys = Object.values(INSTALLMENT_SETTING_SCOPE_KEYS);

  const settingsMap = await getRequiredActiveSettingsByScopeKeys(scopeKeys);

  const termBasis = settingsMap.get(
    INSTALLMENT_SETTING_SCOPE_KEYS.TERM_BASIS
  );

  const balanceFormula = settingsMap.get(
    INSTALLMENT_SETTING_SCOPE_KEYS.BALANCE_FORMULA
  );

  assertJsonObjectSetting(termBasis);
  assertStringSetting(balanceFormula);

  for (const [term, basis] of Object.entries(termBasis.value)) {
    if (typeof basis !== "number" || Number.isNaN(basis) || basis <= 0) {
      throw new AppError(
        `Installment basis for ${term} must be a number greater than zero`,
        500,
        "INVALID_SETTING_VALUE"
      );
    }
  }

  return {
    formulas: {
      regularPriceTotalAmount: "cashPromoTotalAmount / termBasis",
      balance: balanceFormula.value,
    },
    termBasis: termBasis.value,
    settings: {
      termBasis,
      balanceFormula,
    },
  };
};

const computeInstallmentTest = async ({
  cashPromoTotalAmount,
  cashDownpayment = 0,
  term,
}) => {
  const installmentSettings = await getInstallmentBasisSettings();

  const termBasis = installmentSettings.termBasis[term];

  if (typeof termBasis !== "number" || Number.isNaN(termBasis) || termBasis <= 0) {
    throw new AppError(
      `Installment term is not configured: ${term}`,
      400,
      "INSTALLMENT_TERM_NOT_CONFIGURED"
    );
  }

  if (cashDownpayment > cashPromoTotalAmount) {
    throw new AppError(
      "Cash downpayment cannot be greater than cash promo total amount",
      400,
      "INVALID_CASH_DOWNPAYMENT"
    );
  }

  const regularPriceTotalAmount = roundMoney(
    cashPromoTotalAmount / termBasis
  );

  const balance = roundMoney(
    (cashPromoTotalAmount - cashDownpayment) / termBasis
  );

  return {
    formulasUsed: installmentSettings.formulas,
    input: {
      cashPromoTotalAmount,
      cashDownpayment,
      term,
    },
    basisUsed: {
      term,
      termBasis,
    },
    result: {
      regularPriceTotalAmount,
      balance,
    },
  };
};

const getWarrantyRuleSettings = async () => {
  const scopeKeys = Object.values(WARRANTY_SETTING_SCOPE_KEYS);

  const settingsMap = await getRequiredActiveSettingsByScopeKeys(scopeKeys);

  const majorPartsMonths = settingsMap.get(
    WARRANTY_SETTING_SCOPE_KEYS.MAJOR_PARTS_MONTHS
  );

  const accessoriesDays = settingsMap.get(
    WARRANTY_SETTING_SCOPE_KEYS.ACCESSORIES_DAYS
  );

  const outrightReplacementDays = settingsMap.get(
    WARRANTY_SETTING_SCOPE_KEYS.OUTRIGHT_REPLACEMENT_DAYS
  );

  assertPositiveNumberSetting(majorPartsMonths);
  assertPositiveNumberSetting(accessoriesDays);
  assertPositiveNumberSetting(outrightReplacementDays);

  return {
    rules: {
      majorPartsMonths: majorPartsMonths.value,
      accessoriesDays: accessoriesDays.value,
      outrightReplacementDays: outrightReplacementDays.value,
    },
    settings: {
      majorPartsMonths,
      accessoriesDays,
      outrightReplacementDays,
    },
  };
};

const computeWarrantyTest = async ({ productType, purchaseDate }) => {
  const warrantySettings = await getWarrantyRuleSettings();

  const parsedPurchaseDate = parseDateOnly(purchaseDate);

  let warrantyEndDate;

  if (productType === "MAJOR_PART") {
    warrantyEndDate = addMonths(
      parsedPurchaseDate,
      warrantySettings.rules.majorPartsMonths
    );
  }

  if (productType === "ACCESSORY") {
    warrantyEndDate = addDays(
      parsedPurchaseDate,
      warrantySettings.rules.accessoriesDays
    );
  }

  if (!warrantyEndDate) {
    throw new AppError("Invalid warranty product type", 400, "INVALID_WARRANTY_PRODUCT_TYPE");
  }

  const outrightReplacementUntil = addDays(
    parsedPurchaseDate,
    warrantySettings.rules.outrightReplacementDays
  );

  return {
    rulesUsed: warrantySettings.rules,
    input: {
      productType,
      purchaseDate,
    },
    result: {
      warrantyEndDate: formatDateOnly(warrantyEndDate),
      outrightReplacementUntil: formatDateOnly(outrightReplacementUntil),
    },
  };
};

const getCashBoxRuleSettings = async () => {
  const scopeKeys = Object.values(CASH_BOX_SETTING_SCOPE_KEYS);

  const settingsMap = await getRequiredActiveSettingsByScopeKeys(scopeKeys);

  const requireHandoverConfirmation = settingsMap.get(
    CASH_BOX_SETTING_SCOPE_KEYS.REQUIRE_HANDOVER_CONFIRMATION
  );

  const defaultPaymentStatus = settingsMap.get(
    CASH_BOX_SETTING_SCOPE_KEYS.DEFAULT_PAYMENT_STATUS
  );

  assertBooleanSetting(requireHandoverConfirmation);
  assertStringSetting(defaultPaymentStatus);

  return {
    rules: {
      requireHandoverConfirmation: requireHandoverConfirmation.value,
      defaultPaymentStatus: defaultPaymentStatus.value,
      confirmedPaymentStatus: CASH_BOX_STATUSES.CONFIRMED_RECEIVED,
    },
    allowedStatuses: Object.values(CASH_BOX_STATUSES),
    settings: {
      requireHandoverConfirmation,
      defaultPaymentStatus,
    },
  };
};

const computeCashBoxStatusTest = async ({
  paymentAmount,
  recordedByRole,
  isCustodianConfirmed = false,
}) => {
  const cashBoxSettings = await getCashBoxRuleSettings();

  const requireHandoverConfirmation =
    cashBoxSettings.rules.requireHandoverConfirmation;

  const defaultPaymentStatus =
    cashBoxSettings.rules.defaultPaymentStatus;

  let currentStatus;

  if (requireHandoverConfirmation) {
    currentStatus = isCustodianConfirmed
      ? CASH_BOX_STATUSES.CONFIRMED_RECEIVED
      : defaultPaymentStatus;
  } else {
    currentStatus = CASH_BOX_STATUSES.CONFIRMED_RECEIVED;
  }

  return {
    rulesUsed: cashBoxSettings.rules,
    input: {
      paymentAmount,
      recordedByRole,
      isCustodianConfirmed,
    },
    result: {
      currentStatus,
      needsCustodianConfirmation:
        requireHandoverConfirmation && !isCustodianConfirmed,
    },
  };
};

module.exports = {
  listSettings,
  getSettingByScopeKey,
  updateSettingByScopeKey,
  ensureDefaultSettings,
  getQuotationBasisSettings,
  computeQuotationTest,
  getInstallmentBasisSettings,
  computeInstallmentTest,
  getWarrantyRuleSettings,
  computeWarrantyTest,
  getCashBoxRuleSettings,
  computeCashBoxStatusTest,
};
