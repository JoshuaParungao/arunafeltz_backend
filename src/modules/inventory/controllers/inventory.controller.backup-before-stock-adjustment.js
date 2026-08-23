const inventoryService = require("../services/inventory.service");
const {
  sanitizeBatchesCostForActor,
} = require("../utils/inventoryVisibilityPolicy");

const sendSuccess = (res, message, data) => {
  return res.status(200).json({
    success: true,
    message,
    data,
  });
};

const getOverview = async (req, res, next) => {
  try {
    const result = await inventoryService.getInventoryOverview(req.user, req.query);

    return sendSuccess(res, "Inventory overview fetched successfully", result);
  } catch (error) {
    if (error.message === "INVALID_BOOLEAN_FILTER") {
      return res.status(400).json({
        success: false,
        message: "Invalid boolean filter. Use true or false.",
        errorCode: "INVALID_BOOLEAN_FILTER",
      });
    }

    return next(error);
  }
};

const getBatches = async (req, res, next) => {
  try {
    const result = await inventoryService.getInventoryBatches(req.user, req.query);

    result.data = sanitizeBatchesCostForActor(result.data, req.user);

    return sendSuccess(res, "Inventory batches fetched successfully", result);
  } catch (error) {
    return next(error);
  }
};

const getSerials = async (req, res, next) => {
  try {
    const result = await inventoryService.getInventorySerials(req.user, req.query);

    return sendSuccess(res, "Inventory serials fetched successfully", result);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getOverview,
  getBatches,
  getSerials,
};
