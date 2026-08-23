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


const handleInventoryMutationError = (error, res, next) => {
  const knownErrors = {
    BRANCH_REQUIRED: [400, "Branch is required."],
    BRANCH_ACCESS_DENIED: [403, "You cannot manage inventory for this branch."],
    ITEM_NOT_FOUND: [404, "Item not found for this branch."],
    BATCH_NOT_FOUND: [404, "Batch not found for this branch."],
    DUPLICATE_SERIAL_IN_REQUEST: [400, "Duplicate serial number found in request."],
    SERIAL_COUNT_MISMATCH: [400, "Serialized item requires serial count to match quantity."],
    SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM: [400, "Serial numbers are not allowed for non-serialized item."],
    SERIAL_ALREADY_EXISTS: [409, "One or more serial numbers already exist."],
    INSUFFICIENT_BATCH_QUANTITY: [400, "Insufficient batch quantity."],
    SERIAL_NOT_FOUND: [404, "Serial not found."],
  };

  if (knownErrors[error.message]) {
    const [status, message] = knownErrors[error.message];

    return res.status(status).json({
      success: false,
      message,
      errorCode: error.message,
      details: error.details || null,
    });
  }

  return next(error);
};

const createStockIn = async (req, res, next) => {
  try {
    const result = await inventoryService.createStockIn(req.user, req.body);

    return res.status(201).json({
      success: true,
      message: "Stock-in recorded successfully",
      data: result,
    });
  } catch (error) {
    return handleInventoryMutationError(error, res, next);
  }
};

const createAdjustment = async (req, res, next) => {
  try {
    const result = await inventoryService.createStockAdjustment(req.user, req.body);

    return res.status(201).json({
      success: true,
      message: "Stock adjustment recorded successfully",
      data: result,
    });
  } catch (error) {
    return handleInventoryMutationError(error, res, next);
  }
};


const updateSerialStatus = async (req, res, next) => {
  try {
    const result = await inventoryService.updateSerialStatus(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Serial status updated successfully",
      data: result,
    });
  } catch (error) {
    return handleInventoryMutationError(error, res, next);
  }
};

module.exports = {
  getOverview,
  getBatches,
  getSerials,
  createStockIn,
  createAdjustment,
  updateSerialStatus,
};
