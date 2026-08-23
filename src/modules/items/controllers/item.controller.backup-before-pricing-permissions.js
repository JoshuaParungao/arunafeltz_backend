const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const itemService = require("../services/item.service");

const createItem = asyncHandler(async (req, res) => {
  const item = await itemService.createItem(req.body, req.user);

  return sendSuccess(res, {
    statusCode: 201,
    message: "Item created successfully",
    data: item,
  });
});

const listItems = asyncHandler(async (req, res) => {
  const result = await itemService.listItems(req.query, req.user);

  return sendSuccess(res, {
    message: "Items retrieved successfully",
    data: result,
  });
});

const getItemById = asyncHandler(async (req, res) => {
  const item = await itemService.getItemById(req.params.id, req.user);

  return sendSuccess(res, {
    message: "Item retrieved successfully",
    data: item,
  });
});

const updateItemById = asyncHandler(async (req, res) => {
  const item = await itemService.updateItemById(req.params.id, req.body, req.user);

  return sendSuccess(res, {
    message: "Item updated successfully",
    data: item,
  });
});

module.exports = {
  createItem,
  listItems,
  getItemById,
  updateItemById,
};
