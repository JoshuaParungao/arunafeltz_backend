const express = require("express");

const serviceJobController = require("../controllers/serviceJob.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const {
  createServiceJobSchema,
  updateServiceJobStatusSchema,
} = require("../validations/serviceJob.validation");

const router = express.Router();

router.use(protect);

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
