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
