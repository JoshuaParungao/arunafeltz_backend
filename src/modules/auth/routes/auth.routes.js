const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { requireBranchAccess } = require("../../../middlewares/branchAccess.middleware");
const { loginRateLimit } = require("../../../middlewares/loginRateLimit.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const authController = require("../controllers/auth.controller");
const { loginSchema } = require("../validations/auth.validation");

const router = express.Router();

router.post("/login", loginRateLimit, validate(loginSchema), authController.login);

router.get("/me", protect, authController.getMe);

router.get(
  "/permission-test/settings",
  protect,
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  authController.permissionTest
);

router.get(
  "/branch-test/:branchId",
  protect,
  requireBranchAccess("params"),
  authController.branchAccessTest
);

module.exports = router;
