const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const stockTransferController = require("../controllers/stockTransfer.controller");
const {
  createStockTransferRequestSchema,
  listRequestableStockSchema,
  createStockTransferSchema,
  listStockTransfersSchema,
  stockTransferIdParamSchema,
  updateStockTransferSchema,
  updateStockTransferPricingSchema,
  updateStockTransferStatusSchema,
  dispatchStockTransferSchema,
  receiveStockTransferSchema,
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

router.post(
  "/requests",
  protect,
  requirePermission(PERMISSIONS.ACCESS_SYSTEM),
  validate(createStockTransferRequestSchema),
  stockTransferController.createStockTransferRequest
);

router.get(
  "/requestable-items",
  protect,
  requirePermission(PERMISSIONS.ACCESS_SYSTEM),
  validate(listRequestableStockSchema),
  stockTransferController.listRequestableStock
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_STOCK_TRANSFERS),
  validate(stockTransferIdParamSchema),
  stockTransferController.getStockTransferById
);

router.post(
  "/:id/dispatch",
  protect,
  requirePermission(PERMISSIONS.MANAGE_STOCK_TRANSFERS),
  validate(dispatchStockTransferSchema),
  stockTransferController.dispatchStockTransfer
);

router.post(
  "/:id/receive",
  protect,
  requirePermission(PERMISSIONS.MANAGE_STOCK_TRANSFERS),
  validate(receiveStockTransferSchema),
  stockTransferController.receiveStockTransfer
);

router.patch(
  "/:id/pricing",
  protect,
  requirePermission(PERMISSIONS.MANAGE_STOCK_TRANSFERS),
  validate(updateStockTransferPricingSchema),
  stockTransferController.updateStockTransferPricingById
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

