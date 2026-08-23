const express = require("express");

const serviceJobController = require("../controllers/serviceJob.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const {
  createServiceJobSchema,
  listServiceJobsSchema,
  serviceJobIdParamSchema,
  updateServiceJobStatusSchema,
} = require("../validations/serviceJob.validation");

const router = express.Router();

router.use(protect);

router.get(
  "/",
  validate(listServiceJobsSchema),
  serviceJobController.getServiceJobs
);

router.get(
  "/:id",
  validate(serviceJobIdParamSchema),
  serviceJobController.getServiceJobById
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
