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

module.exports = {
  createItem,
  listItems,
};
