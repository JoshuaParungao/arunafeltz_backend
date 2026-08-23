const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const purchaseReceivingService = require("../services/purchaseReceiving.service");

const createPurchaseReceiving = asyncHandler(async (req, res) => {
  const receiving = await purchaseReceivingService.createPurchaseReceiving(
    req.body,
    req.user
  );

  return sendSuccess(res, {
    statusCode: 201,
    message: "Purchase receiving created successfully",
    data: receiving,
  });
});

const listPurchaseReceivings = asyncHandler(async (req, res) => {
  const result = await purchaseReceivingService.listPurchaseReceivings(
    req.query,
    req.user
  );

  return sendSuccess(res, {
    message: "Purchase receivings retrieved successfully",
    data: result,
  });
});

const getPurchaseReceivingById = asyncHandler(async (req, res) => {
  const receiving = await purchaseReceivingService.getPurchaseReceivingById(
    req.params.id,
    req.user
  );

  return sendSuccess(res, {
    message: "Purchase receiving retrieved successfully",
    data: receiving,
  });
});

const updatePurchaseReceivingById = asyncHandler(async (req, res) => {
  const receiving = await purchaseReceivingService.updatePurchaseReceivingById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Purchase receiving updated successfully",
    data: receiving,
  });
});

const updatePurchaseReceivingStatusById = asyncHandler(async (req, res) => {
  const receiving =
    await purchaseReceivingService.updatePurchaseReceivingStatusById(
      req.params.id,
      req.body,
      req.user
    );

  return sendSuccess(res, {
    message: "Purchase receiving status updated successfully",
    data: receiving,
  });
});

module.exports = {
  createPurchaseReceiving,
  listPurchaseReceivings,
  getPurchaseReceivingById,
  updatePurchaseReceivingById,
  updatePurchaseReceivingStatusById,
};
