const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const itemController = require("../controllers/item.controller");
const { createItemSchema } = require("../validations/item.validation");

const router = express.Router();

router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_CATALOG),
  validate(createItemSchema),
  itemController.createItem
);

module.exports = router;
