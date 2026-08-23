const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const itemCategoryService = require("../services/itemCategory.service");

const createItemCategory = asyncHandler(async (req, res) => {
  const category = await itemCategoryService.createItemCategory(req.body, req.user);

  return sendSuccess(res, {
    statusCode: 201,
    message: "Item category created successfully",
    data: category,
  });
});

const listItemCategories = asyncHandler(async (req, res) => {
  const result = await itemCategoryService.listItemCategories(req.query, req.user);

  return sendSuccess(res, {
    message: "Item categories retrieved successfully",
    data: result,
  });
});

const getItemCategoryById = asyncHandler(async (req, res) => {
  const category = await itemCategoryService.getItemCategoryById(
    req.params.id,
    req.user
  );

  return sendSuccess(res, {
    message: "Item category retrieved successfully",
    data: category,
  });
});

const updateItemCategoryById = asyncHandler(async (req, res) => {
  const category = await itemCategoryService.updateItemCategoryById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Item category updated successfully",
    data: category,
  });
});

module.exports = {
  createItemCategory,
  listItemCategories,
  getItemCategoryById,
  updateItemCategoryById,
};
