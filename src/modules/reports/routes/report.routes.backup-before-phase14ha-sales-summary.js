const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const reportController = require("../controllers/report.controller");
const { inventorySummarySchema } = require("../validations/report.validation");

const router = express.Router();

router.use(protect);
router.use(requirePermission(PERMISSIONS.VIEW_REPORTS));

router.get(
  "/inventory-summary",
  validate(inventorySummarySchema),
  reportController.getInventorySummary
);

module.exports = router;
