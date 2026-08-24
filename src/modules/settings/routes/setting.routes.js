const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const settingController = require("../controllers/setting.controller");
const {
  listSettingsSchema,
  scopeKeyParamSchema,
  updateSettingSchema,
  quotationTestComputeSchema,
  installmentTestComputeSchema,
  warrantyTestComputeSchema,
  cashBoxTestStatusSchema,
} = require("../validations/setting.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  validate(listSettingsSchema),
  settingController.listSettings
);

router.patch(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  settingController.updateSettingFromBody
);

router.get(
  "/business-rules/quotation",
  protect,
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  settingController.getQuotationBasisSettings
);

router.post(
  "/business-rules/quotation/test-compute",
  protect,
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  validate(quotationTestComputeSchema),
  settingController.computeQuotationTest
);

router.get(
  "/business-rules/installment",
  protect,
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  settingController.getInstallmentBasisSettings
);

router.post(
  "/business-rules/installment/test-compute",
  protect,
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  validate(installmentTestComputeSchema),
  settingController.computeInstallmentTest
);

router.get(
  "/business-rules/warranty",
  protect,
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  settingController.getWarrantyRuleSettings
);

router.post(
  "/business-rules/warranty/test-compute",
  protect,
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  validate(warrantyTestComputeSchema),
  settingController.computeWarrantyTest
);

router.get(
  "/business-rules/cash-box",
  protect,
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  settingController.getCashBoxRuleSettings
);

router.post(
  "/business-rules/cash-box/test-status",
  protect,
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  validate(cashBoxTestStatusSchema),
  settingController.computeCashBoxStatusTest
);

router.get(
  "/scope/:scopeKey",
  protect,
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  validate(scopeKeyParamSchema),
  settingController.getSettingByScopeKey
);

router.patch(
  "/scope/:scopeKey",
  protect,
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  validate(updateSettingSchema),
  settingController.updateSettingByScopeKey
);

router.get(
  "/:scopeKey",
  protect,
  requirePermission(PERMISSIONS.VIEW_SETTINGS),
  validate(scopeKeyParamSchema),
  settingController.getSettingByScopeKey
);

router.patch(
  "/:scopeKey",
  protect,
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  validate(updateSettingSchema),
  settingController.updateSettingByScopeKey
);

module.exports = router;
