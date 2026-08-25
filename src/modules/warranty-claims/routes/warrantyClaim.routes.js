const express = require("express");

const warrantyClaimController = require("../controllers/warrantyClaim.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const {
  createWarrantyClaimSchema,
  listWarrantyClaimsSchema,
  releaseWarrantyClaimSchema,
  warrantyClaimIdParamSchema,
  updateWarrantyClaimStatusSchema,
  immediateReplacementSchema,
  dispatchSupplierSchema,
  resolveSupplierRmaSchema,
  rejectCustomerClaimSchema,
} = require("../validations/warrantyClaim.validation");

const router = express.Router();

router.use(protect);

router.get(
  "/",
  validate(listWarrantyClaimsSchema),
  warrantyClaimController.getWarrantyClaims
);

router.get(
  "/:id",
  validate(warrantyClaimIdParamSchema),
  warrantyClaimController.getWarrantyClaimById
);

router.post(
  "/:id/release",
  validate(releaseWarrantyClaimSchema),
  warrantyClaimController.releaseWarrantyClaim
);

router.post(
  "/:id/replace",
  validate(immediateReplacementSchema),
  warrantyClaimController.processImmediateReplacement
);

router.post(
  "/:id/dispatch-supplier",
  validate(dispatchSupplierSchema),
  warrantyClaimController.dispatchToSupplier
);

router.post(
  "/:id/resolve-supplier",
  validate(resolveSupplierRmaSchema),
  warrantyClaimController.resolveSupplierRma
);

router.post(
  "/:id/reject",
  validate(rejectCustomerClaimSchema),
  warrantyClaimController.rejectCustomerClaim
);

router.patch(
  "/:id/status",
  validate(updateWarrantyClaimStatusSchema),
  warrantyClaimController.updateWarrantyClaimStatus
);

router.post(
  "/",
  validate(createWarrantyClaimSchema),
  warrantyClaimController.createWarrantyClaim
);

module.exports = router;
