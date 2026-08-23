const express = require("express");

const saleController = require("../controllers/sale.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const { createSaleSchema, cancelSaleSchema } = require("../validations/sale.validation");

const router = express.Router();

router.use(protect);


router.get(
  "/",
  requirePermission(PERMISSIONS.VIEW_SALES),
  saleController.getSales
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS.VIEW_SALES),
  saleController.getSaleById
);


router.patch(
  "/:id/cancel",
  requirePermission(PERMISSIONS.MANAGE_SALES),
  validate(cancelSaleSchema),
  saleController.cancelSale
);

router.post(
  "/",
  requirePermission(PERMISSIONS.MANAGE_SALES),
  validate(createSaleSchema),
  saleController.createSale
);

module.exports = router;
