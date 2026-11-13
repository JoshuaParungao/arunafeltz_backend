const express = require("express");

const supplierReturnController = require("../controllers/supplierReturn.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const {
  createSupplierReturnSchema,
  updateSupplierReturnSchema,
  supplierReturnIdParamSchema,
  approveSupplierReturnSchema,
  dispatchSupplierReturnSchema,
  resolveSupplierReturnSchema,
  cancelSupplierReturnSchema,
  listSupplierReturnsSchema,
  getEligibleDefectsSchema,
} = require("../validations/supplierReturn.validation");

const router = express.Router();

router.use(protect);

router.get(
  "/",
  validate(listSupplierReturnsSchema),
  supplierReturnController.getSupplierReturns
);

router.get(
  "/eligible-defects",
  validate(getEligibleDefectsSchema),
  supplierReturnController.getEligibleDefects
);

router.get(
  "/:id",
  validate(supplierReturnIdParamSchema),
  supplierReturnController.getSupplierReturnById
);

router.post(
  "/",
  validate(createSupplierReturnSchema),
  supplierReturnController.createSupplierReturn
);

router.put(
  "/:id",
  validate(updateSupplierReturnSchema),
  supplierReturnController.updateSupplierReturn
);

router.post(
  "/:id/approve",
  validate(approveSupplierReturnSchema),
  supplierReturnController.approveSupplierReturn
);

router.post(
  "/:id/dispatch",
  validate(dispatchSupplierReturnSchema),
  supplierReturnController.dispatchSupplierReturn
);

router.post(
  "/:id/resolve",
  validate(resolveSupplierReturnSchema),
  supplierReturnController.resolveSupplierReturn
);

router.post(
  "/:id/cancel",
  validate(cancelSupplierReturnSchema),
  supplierReturnController.cancelSupplierReturn
);

module.exports = router;

