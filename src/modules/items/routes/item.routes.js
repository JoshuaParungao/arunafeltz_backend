const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const itemController = require("../controllers/item.controller");
const {
  createItemSchema,
  listItemsSchema,
  itemIdParamSchema,
  updateItemSchema,
} = require("../validations/item.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_CATALOG),
  validate(listItemsSchema),
  itemController.listItems
);

router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_CATALOG),
  validate(createItemSchema),
  itemController.createItem
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_CATALOG),
  validate(itemIdParamSchema),
  itemController.getItemById
);

router.patch(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.MANAGE_CATALOG),
  validate(updateItemSchema),
  itemController.updateItemById
);

module.exports = router;
