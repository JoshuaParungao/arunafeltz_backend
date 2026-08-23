const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const purchaseOrderController = require("../controllers/purchaseOrder.controller");
const {
  createPurchaseOrderSchema,
  listPurchaseOrdersSchema,
  purchaseOrderIdParamSchema,
  updatePurchaseOrderSchema,
  updatePurchaseOrderStatusSchema,
} = require("../validations/purchaseOrder.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_ORDERS),
  validate(listPurchaseOrdersSchema),
  purchaseOrderController.listPurchaseOrders
);

router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS),
  validate(createPurchaseOrderSchema),
  purchaseOrderController.createPurchaseOrder
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_ORDERS),
  validate(purchaseOrderIdParamSchema),
  purchaseOrderController.getPurchaseOrderById
);

router.patch(
  "/:id/status",
  protect,
  requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS),
  validate(updatePurchaseOrderStatusSchema),
  purchaseOrderController.updatePurchaseOrderStatusById
);

router.patch(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS),
  validate(updatePurchaseOrderSchema),
  purchaseOrderController.updatePurchaseOrderById
);

module.exports = router;
