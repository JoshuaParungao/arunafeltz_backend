const express = require("express");

const quotationController = require("../controllers/quotation.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const { createQuotationSchema } = require("../validations/quotation.validation");

const router = express.Router();

router.use(protect);

router.post(
  "/",
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  validate(createQuotationSchema),
  quotationController.createQuotation
);

module.exports = router;
