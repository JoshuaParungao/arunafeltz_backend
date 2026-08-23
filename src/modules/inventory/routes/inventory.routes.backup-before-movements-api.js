const express = require("express");

const validate = require("../../../middlewares/validate.middleware");

const inventoryController = require("../controllers/inventory.controller");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const { stockInSchema, adjustmentSchema, serialStatusUpdateSchema } = require("../validations/inventory.validation");

const router = express.Router();

router.use(protect);
router.use(requirePermission(PERMISSIONS.VIEW_INVENTORY));

router.get("/overview", inventoryController.getOverview);
router.get("/batches", inventoryController.getBatches);
router.get("/serials", inventoryController.getSerials);

router.patch(
  "/serials/:id/status",
  requirePermission(PERMISSIONS.MANAGE_INVENTORY),
  validate(serialStatusUpdateSchema),
  inventoryController.updateSerialStatus
);

router.post(
  "/stock-in",
  requirePermission(PERMISSIONS.MANAGE_INVENTORY),
  validate(stockInSchema),
  inventoryController.createStockIn
);

router.post(
  "/adjustments",
  requirePermission(PERMISSIONS.MANAGE_INVENTORY),
  validate(adjustmentSchema),
  inventoryController.createAdjustment
);

module.exports = router;
