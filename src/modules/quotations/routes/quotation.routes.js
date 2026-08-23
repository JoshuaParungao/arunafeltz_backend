const express = require("express");

const quotationController = require("../controllers/quotation.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const {
  createQuotationSchema,
  updateQuotationSchema,
  updateQuotationStatusSchema,
  listServiceStaffSchema,
  listQuotationsSchema,
  quotationIdParamSchema,
} = require("../validations/quotation.validation");

const router = express.Router();

router.use(protect);


router.get(
  "/",
  requirePermission(PERMISSIONS.VIEW_QUOTATIONS),
  validate(listQuotationsSchema),
  quotationController.getQuotations
);

router.get(
  "/service-staff",
  requirePermission(PERMISSIONS.VIEW_QUOTATIONS),
  validate(listServiceStaffSchema),
  quotationController.getEligibleServiceStaff
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS.VIEW_QUOTATIONS),
  validate(quotationIdParamSchema),
  quotationController.getQuotationById
);



router.patch(
  "/:id/status",
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  validate(updateQuotationStatusSchema),
  quotationController.updateQuotationStatus
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
