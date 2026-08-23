const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const stockTransferController = require("../controllers/stockTransfer.controller");
const {
  createStockTransferSchema,
  listStockTransfersSchema,
  stockTransferIdParamSchema,
  updateStockTransferSchema,
  updateStockTransferStatusSchema,
} = require("../validations/stockTransfer.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_STOCK_TRANSFERS),
  validate(listStockTransfersSchema),
  stockTransferController.listStockTransfers
);

router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_STOCK_TRANSFERS),
  validate(createStockTransferSchema),
  stockTransferController.createStockTransfer
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_STOCK_TRANSFERS),
  validate(stockTransferIdParamSchema),
  stockTransferController.getStockTransferById
);

router.patch(
  "/:id/status",
  protect,
  requirePermission(PERMISSIONS.MANAGE_STOCK_TRANSFERS),
  validate(updateStockTransferStatusSchema),
  stockTransferController.updateStockTransferStatusById
);

router.patch(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.MANAGE_STOCK_TRANSFERS),
  validate(updateStockTransferSchema),
  stockTransferController.updateStockTransferById
);

module.exports = router;
