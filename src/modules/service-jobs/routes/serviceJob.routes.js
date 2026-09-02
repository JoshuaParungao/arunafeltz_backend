const express = require("express");

const serviceJobController = require("../controllers/serviceJob.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const {
  cancelServicePaymentSchema,
  createServiceCatalogItemSchema,
  createServiceJobSchema,
  createServicePaymentSchema,
  listServiceJobsSchema,
  listServiceTechniciansSchema,
  releaseServiceJobSchema,
  serviceCatalogIdParamSchema,
  serviceJobIdParamSchema,
  updateServiceCatalogItemSchema,
  updateServiceJobAssignmentSchema,
  updateServiceJobStatusSchema,
} = require("../validations/serviceJob.validation");

const router = express.Router();

router.use(protect);

router.get("/catalog", serviceJobController.getServiceCatalog);
router.post(
  "/catalog",
  validate(createServiceCatalogItemSchema),
  serviceJobController.createServiceCatalogItem
);
router.put(
  "/catalog/:id",
  validate(updateServiceCatalogItemSchema),
  serviceJobController.updateServiceCatalogItem
);
router.delete(
  "/catalog/:id",
  validate(serviceCatalogIdParamSchema),
  serviceJobController.deleteServiceCatalogItem
);

router.get(
  "/",
  validate(listServiceJobsSchema),
  serviceJobController.getServiceJobs
);

router.get(
  "/technicians",
  validate(listServiceTechniciansSchema),
  serviceJobController.getServiceTechnicians
);

router.patch(
  "/:id/assignment",
  validate(updateServiceJobAssignmentSchema),
  serviceJobController.updateServiceJobAssignment
);

router.post(
  "/:id/release",
  validate(releaseServiceJobSchema),
  serviceJobController.releaseServiceJob
);

router.post(
  "/payments/:paymentId/cancel",
  validate(cancelServicePaymentSchema),
  serviceJobController.cancelServicePayment
);

router.get(
  "/:id",
  validate(serviceJobIdParamSchema),
  serviceJobController.getServiceJobById
);

router.post(
  "/:id/payment",
  validate(createServicePaymentSchema),
  serviceJobController.createServicePayment
);

router.patch(
  "/:id/status",
  validate(updateServiceJobStatusSchema),
  serviceJobController.updateServiceJobStatus
);

router.post(
  "/",
  validate(createServiceJobSchema),
  serviceJobController.createServiceJob
);

module.exports = router;
