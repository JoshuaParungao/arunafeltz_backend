const express = require("express");

const quotationController = require("../controllers/quotation.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const { createQuotationSchema, updateQuotationSchema } = require("../validations/quotation.validation");

const router = express.Router();

router.use(protect);


router.get(
  "/",
  requirePermission(PERMISSIONS.VIEW_QUOTATIONS),
  quotationController.getQuotations
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS.VIEW_QUOTATIONS),
  quotationController.getQuotationById
);


router.patch(
  "/:id",
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  validate(updateQuotationSchema),
  quotationController.updateQuotation
);

router.post(
  "/",
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  validate(createQuotationSchema),
  quotationController.createQuotation
);

module.exports = router;
