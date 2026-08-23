const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const reportController = require("../controllers/report.controller");
const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
} = require("../validations/report.validation");

const router = express.Router();

router.use(protect);
router.use(requirePermission(PERMISSIONS.VIEW_REPORTS));

router.get(
  "/inventory-summary",
  validate(inventorySummarySchema),
  reportController.getInventorySummary
);

router.get(
  "/sales-summary",
  validate(salesSummarySchema),
  reportController.getSalesSummary
);

router.get(
  "/service-summary",
  validate(serviceSummarySchema),
  reportController.getServiceSummary
);

router.get(
  "/warranty-summary",
  validate(warrantySummarySchema),
  reportController.getWarrantySummary
);

router.get(
  "/cash-summary",
  validate(cashSummarySchema),
  reportController.getCashSummary
);

module.exports = router;
