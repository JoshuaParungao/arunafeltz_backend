const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const userController = require("../controllers/user.controller");
const {
  createUserSchema,
  updateUserSchema,
  listUsersSchema,
  userIdParamSchema,
} = require("../validations/user.validation");

const router = express.Router();

router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_USERS),
  validate(createUserSchema),
  userController.createUser
);

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_USERS),
  validate(listUsersSchema),
  userController.listUsers
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_USERS),
  validate(userIdParamSchema),
  userController.getUserById
);

router.patch(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.MANAGE_USERS),
  validate(updateUserSchema),
  userController.updateUser
);

router.patch(
  "/:id/approve",
  protect,
  requirePermission(PERMISSIONS.APPROVE_USERS),
  validate(userIdParamSchema),
  userController.approveUser
);

router.patch(
  "/:id/reject",
  protect,
  requirePermission(PERMISSIONS.APPROVE_USERS),
  validate(userIdParamSchema),
  userController.rejectUser
);

router.patch(
  "/:id/disable",
  protect,
  requirePermission(PERMISSIONS.DISABLE_USERS),
  validate(userIdParamSchema),
  userController.disableUser
);

module.exports = router;
