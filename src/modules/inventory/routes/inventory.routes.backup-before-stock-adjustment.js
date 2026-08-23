const express = require("express");

const inventoryController = require("../controllers/inventory.controller");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");

const router = express.Router();

router.use(protect);
router.use(requirePermission(PERMISSIONS.VIEW_INVENTORY));

router.get("/overview", inventoryController.getOverview);
router.get("/batches", inventoryController.getBatches);
router.get("/serials", inventoryController.getSerials);

module.exports = router;
