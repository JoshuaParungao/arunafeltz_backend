const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const settingService = require("../services/setting.service");

const listSettings = asyncHandler(async (req, res) => {
  const settings = await settingService.listSettings(req.query, req.user);

  return sendSuccess(res, {
    message: "Settings retrieved successfully",
    data: settings,
  });
});

const getSettingByScopeKey = asyncHandler(async (req, res) => {
  const setting = await settingService.getSettingByScopeKey(
    req.params.scopeKey,
    req.user
  );

  return sendSuccess(res, {
    message: "Setting retrieved successfully",
    data: setting,
  });
});

const updateSettingByScopeKey = asyncHandler(async (req, res) => {
  const setting = await settingService.updateSettingByScopeKey(
    req.params.scopeKey,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Setting updated successfully",
    data: setting,
  });
});

const updateSettingFromBody = asyncHandler(async (req, res) => {
  const scopeKeyOrKey = req.body.scopeKey || req.body.key || req.body.id;
  const setting = await settingService.updateSettingByScopeKey(
    scopeKeyOrKey,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Setting updated successfully",
    data: setting,
  });
});

const getQuotationBasisSettings = asyncHandler(async (req, res) => {
  const quotationSettings = await settingService.getQuotationBasisSettings();

  return sendSuccess(res, {
    message: "Quotation basis settings retrieved successfully",
    data: quotationSettings,
  });
});

const computeQuotationTest = asyncHandler(async (req, res) => {
  const result = await settingService.computeQuotationTest(req.body);

  return sendSuccess(res, {
    message: "Quotation test computation successful",
    data: result,
  });
});

const getInstallmentBasisSettings = asyncHandler(async (req, res) => {
  const installmentSettings = await settingService.getInstallmentBasisSettings();

  return sendSuccess(res, {
    message: "Installment basis settings retrieved successfully",
    data: installmentSettings,
  });
});

const computeInstallmentTest = asyncHandler(async (req, res) => {
  const result = await settingService.computeInstallmentTest(req.body);

  return sendSuccess(res, {
    message: "Installment test computation successful",
    data: result,
  });
});

const getWarrantyRuleSettings = asyncHandler(async (req, res) => {
  const warrantySettings = await settingService.getWarrantyRuleSettings();

  return sendSuccess(res, {
    message: "Warranty rule settings retrieved successfully",
    data: warrantySettings,
  });
});

const computeWarrantyTest = asyncHandler(async (req, res) => {
  const result = await settingService.computeWarrantyTest(req.body);

  return sendSuccess(res, {
    message: "Warranty test computation successful",
    data: result,
  });
});

const getCashBoxRuleSettings = asyncHandler(async (req, res) => {
  const cashBoxSettings = await settingService.getCashBoxRuleSettings();

  return sendSuccess(res, {
    message: "Cash box rule settings retrieved successfully",
    data: cashBoxSettings,
  });
});

const computeCashBoxStatusTest = asyncHandler(async (req, res) => {
  const result = await settingService.computeCashBoxStatusTest(req.body);

  return sendSuccess(res, {
    message: "Cash box status test successful",
    data: result,
  });
});

module.exports = {
  listSettings,
  getSettingByScopeKey,
  updateSettingByScopeKey,
  updateSettingFromBody,
  getQuotationBasisSettings,
  computeQuotationTest,
  getInstallmentBasisSettings,
  computeInstallmentTest,
  getWarrantyRuleSettings,
  computeWarrantyTest,
  getCashBoxRuleSettings,
  computeCashBoxStatusTest,
};
