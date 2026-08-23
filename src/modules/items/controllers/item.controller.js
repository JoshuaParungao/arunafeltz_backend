const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const itemService = require("../services/item.service");
const {
  sanitizeItemPricingForActor,
  sanitizeItemsPricingForActor,
} = require("../utils/itemPricingPolicy");

const createItem = asyncHandler(async (req, res) => {
  const item = await itemService.createItem(req.body, req.user);
  const safeItem = sanitizeItemPricingForActor(item, req.user);

  return sendSuccess(res, {
    statusCode: 201,
    message: "Item created successfully",
    data: safeItem,
  });
});

const listItems = asyncHandler(async (req, res) => {
  const result = await itemService.listItems(req.query, req.user);

  const safeResult = {
    ...result,
    items: sanitizeItemsPricingForActor(result.items, req.user),
  };

  return sendSuccess(res, {
    message: "Items retrieved successfully",
    data: safeResult,
  });
});

const getItemById = asyncHandler(async (req, res) => {
  const item = await itemService.getItemById(req.params.id, req.user);
  const safeItem = sanitizeItemPricingForActor(item, req.user);

  return sendSuccess(res, {
    message: "Item retrieved successfully",
    data: safeItem,
  });
});

const updateItemById = asyncHandler(async (req, res) => {
  const item = await itemService.updateItemById(req.params.id, req.body, req.user);
  const safeItem = sanitizeItemPricingForActor(item, req.user);

  return sendSuccess(res, {
    message: "Item updated successfully",
    data: safeItem,
  });
});

module.exports = {
  createItem,
  listItems,
  getItemById,
  updateItemById,
};
