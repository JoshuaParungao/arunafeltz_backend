const express = require("express");

const warrantyClaimController = require("../controllers/warrantyClaim.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const {
  createWarrantyClaimSchema,
} = require("../validations/warrantyClaim.validation");

const router = express.Router();

router.use(protect);

router.post(
  "/",
  validate(createWarrantyClaimSchema),
  warrantyClaimController.createWarrantyClaim
);

module.exports = router;
