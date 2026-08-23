const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const unitController = require("../controllers/unit.controller");
const {
  createUnitSchema,
  listUnitsSchema,
  unitIdParamSchema,
  updateUnitSchema,
} = require("../validations/unit.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_CATALOG),
  validate(listUnitsSchema),
  unitController.listUnits
);

router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_CATALOG),
  validate(createUnitSchema),
  unitController.createUnit
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_CATALOG),
  validate(unitIdParamSchema),
  unitController.getUnitById
);

router.patch(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.MANAGE_CATALOG),
  validate(updateUnitSchema),
  unitController.updateUnitById
);

module.exports = router;
