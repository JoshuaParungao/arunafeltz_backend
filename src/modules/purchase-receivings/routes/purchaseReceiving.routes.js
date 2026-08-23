const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const purchaseReceivingController = require("../controllers/purchaseReceiving.controller");
const {
  createPurchaseReceivingSchema,
  listPurchaseReceivingsSchema,
  purchaseReceivingIdParamSchema,
  updatePurchaseReceivingSchema,
  updatePurchaseReceivingStatusSchema,
} = require("../validations/purchaseReceiving.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_RECEIVINGS),
  validate(listPurchaseReceivingsSchema),
  purchaseReceivingController.listPurchaseReceivings
);

router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_PURCHASE_RECEIVINGS),
  validate(createPurchaseReceivingSchema),
  purchaseReceivingController.createPurchaseReceiving
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_RECEIVINGS),
  validate(purchaseReceivingIdParamSchema),
  purchaseReceivingController.getPurchaseReceivingById
);

router.patch(
  "/:id/status",
  protect,
  requirePermission(PERMISSIONS.MANAGE_PURCHASE_RECEIVINGS),
  validate(updatePurchaseReceivingStatusSchema),
  purchaseReceivingController.updatePurchaseReceivingStatusById
);

router.patch(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.MANAGE_PURCHASE_RECEIVINGS),
  validate(updatePurchaseReceivingSchema),
  purchaseReceivingController.updatePurchaseReceivingById
);

module.exports = router;
