const express = require("express");

const serviceJobController = require("../controllers/serviceJob.controller");
const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const {
  createServiceJobSchema,
} = require("../validations/serviceJob.validation");

const router = express.Router();

router.use(protect);

router.post(
  "/",
  validate(createServiceJobSchema),
  serviceJobController.createServiceJob
);

module.exports = router;
