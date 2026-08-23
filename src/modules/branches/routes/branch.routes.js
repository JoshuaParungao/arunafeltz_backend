const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const branchController = require("../controllers/branch.controller");
const {
  createBranchSchema,
  listBranchesSchema,
  updateBranchSchema,
  branchIdParamSchema,
} = require("../validations/branch.validation");

const router = express.Router();

router.use(protect);

router.post(
  "/",
  requirePermission(PERMISSIONS.MANAGE_BRANCHES),
  validate(createBranchSchema),
  branchController.createBranch
);
router.get(
  "/",
  requirePermission(PERMISSIONS.VIEW_BRANCHES),
  validate(listBranchesSchema),
  branchController.getBranches
);
router.get(
  "/:id",
  requirePermission(PERMISSIONS.VIEW_BRANCHES),
  validate(branchIdParamSchema),
  branchController.getBranchById
);
router.patch(
  "/:id",
  requirePermission(PERMISSIONS.MANAGE_BRANCHES),
  validate(updateBranchSchema),
  branchController.updateBranch
);
router.patch(
  "/:id/deactivate",
  requirePermission(PERMISSIONS.MANAGE_BRANCHES),
  validate(branchIdParamSchema),
  branchController.deactivateBranch
);

module.exports = router;
