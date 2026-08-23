const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");

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

const listSettings = async (filters = {}) => {
  const includeInactive = filters.includeInactive === "true";

  const where = {
    category: filters.category,
    key: filters.key,
    branchId: filters.branchId,
    isActive: includeInactive ? undefined : true,
  };

  return prisma.businessSetting.findMany({
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
};

const getSettingByScopeKey = async (scopeKey) => {
  const setting = await prisma.businessSetting.findUnique({
    where: {
      scopeKey,
    },
    select: SETTING_SELECT,
  });

  if (!setting) {
    throw new AppError("Setting not found", 404, "SETTING_NOT_FOUND");
  }

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

const updateSettingByScopeKey = async (scopeKey, payload, actorUserId = null) => {
  const existingSetting = await prisma.businessSetting.findUnique({
    where: {
      scopeKey,
    },
  });

  if (!existingSetting) {
    throw new AppError("Setting not found", 404, "SETTING_NOT_FOUND");
  }

  if (!existingSetting.isEditable) {
    throw new AppError("Setting is not editable", 400, "SETTING_NOT_EDITABLE");
  }

  assertValueMatchesType(existingSetting.valueType, payload.value);

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

  if (actorUserId) {
    updateData.updatedById = actorUserId;
  }

  return prisma.businessSetting.update({
    where: {
      scopeKey,
    },
    data: updateData,
    select: SETTING_SELECT,
  });
};

const getRequiredActiveSettingsByScopeKeys = async (scopeKeys = []) => {
  const settings = await prisma.businessSetting.findMany({
    where: {
      scopeKey: {
        in: scopeKeys,
      },
      isActive: true,
    },
    select: SETTING_SELECT,
  });

  const settingsMap = new Map(
    settings.map((setting) => [setting.scopeKey, setting])
  );

  for (const scopeKey of scopeKeys) {
    if (!settingsMap.has(scopeKey)) {
      throw new AppError(
        `Required setting is missing or inactive: ${scopeKey}`,
        500,
        "REQUIRED_SETTING_MISSING"
      );
    }
  }

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
  getQuotationBasisSettings,
  computeQuotationTest,
  getInstallmentBasisSettings,
  computeInstallmentTest,
  getWarrantyRuleSettings,
  computeWarrantyTest,
  getCashBoxRuleSettings,
  computeCashBoxStatusTest,
};
