const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const supplierController = require("../controllers/supplier.controller");
const {
  createSupplierSchema,
  listSuppliersSchema,
  supplierIdParamSchema,
  updateSupplierSchema,
  updateSupplierStatusSchema,
} = require("../validations/supplier.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_SUPPLIERS),
  validate(listSuppliersSchema),
  supplierController.listSuppliers
);

router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_SUPPLIERS),
  validate(createSupplierSchema),
  supplierController.createSupplier
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_SUPPLIERS),
  validate(supplierIdParamSchema),
  supplierController.getSupplierById
);

router.patch(
  "/:id/status",
  protect,
  requirePermission(PERMISSIONS.MANAGE_SUPPLIERS),
  validate(updateSupplierStatusSchema),
  supplierController.updateSupplierStatusById
);

router.patch(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.MANAGE_SUPPLIERS),
  validate(updateSupplierSchema),
  supplierController.updateSupplierById
);

module.exports = router;
