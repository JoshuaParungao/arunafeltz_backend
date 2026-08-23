const express = require("express");

const saleController = require("../controllers/sale.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const { createSaleSchema } = require("../validations/sale.validation");

const router = express.Router();

router.use(protect);

router.post(
  "/",
  requirePermission(PERMISSIONS.MANAGE_SALES),
  validate(createSaleSchema),
  saleController.createSale
);

module.exports = router;
