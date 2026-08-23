const express = require("express");

const validate = require("../../../middlewares/validate.middleware");
const { protect } = require("../../../middlewares/auth.middleware");
const { requirePermission } = require("../../../middlewares/permission.middleware");
const { PERMISSIONS } = require("../../../constants/permissions");
const itemCategoryController = require("../controllers/itemCategory.controller");
const {
  createItemCategorySchema,
  listItemCategoriesSchema,
  itemCategoryIdParamSchema,
  updateItemCategorySchema,
} = require("../validations/itemCategory.validation");

const router = express.Router();

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.VIEW_CATALOG),
  validate(listItemCategoriesSchema),
  itemCategoryController.listItemCategories
);

router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.MANAGE_CATALOG),
  validate(createItemCategorySchema),
  itemCategoryController.createItemCategory
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.VIEW_CATALOG),
  validate(itemCategoryIdParamSchema),
  itemCategoryController.getItemCategoryById
);

router.patch(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.MANAGE_CATALOG),
  validate(updateItemCategorySchema),
  itemCategoryController.updateItemCategoryById
);

module.exports = router;
