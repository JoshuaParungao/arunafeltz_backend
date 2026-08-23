const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const stockTransferService = require("../services/stockTransfer.service");

const createStockTransferRequest = asyncHandler(async (req, res) => {
  const stockTransfer = await stockTransferService.createStockTransferRequest(req.body, req.user);

  return sendSuccess(res, {
    statusCode: 201,
    message: "Stock request sent successfully",
    data: stockTransfer,
  });
});

const listRequestableStock = asyncHandler(async (req, res) => {
  const result = await stockTransferService.listRequestableStock(req.query, req.user);

  return sendSuccess(res, {
    message: "Requestable stock retrieved successfully",
    data: result,
  });
});

const createStockTransfer = asyncHandler(async (req, res) => {
  const stockTransfer = await stockTransferService.createStockTransfer(req.body, req.user);

  return sendSuccess(res, {
    statusCode: 201,
    message: "Stock transfer created successfully",
    data: stockTransfer,
  });
});

const listStockTransfers = asyncHandler(async (req, res) => {
  const result = await stockTransferService.listStockTransfers(req.query, req.user);

  return sendSuccess(res, {
    message: "Stock transfers retrieved successfully",
    data: result,
  });
});

const getStockTransferById = asyncHandler(async (req, res) => {
  const stockTransfer = await stockTransferService.getStockTransferById(
    req.params.id,
    req.user
  );

  return sendSuccess(res, {
    message: "Stock transfer retrieved successfully",
    data: stockTransfer,
  });
});

const updateStockTransferById = asyncHandler(async (req, res) => {
  const stockTransfer = await stockTransferService.updateStockTransferById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Stock transfer updated successfully",
    data: stockTransfer,
  });
});

const updateStockTransferStatusById = asyncHandler(async (req, res) => {
  const stockTransfer = await stockTransferService.updateStockTransferStatusById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Stock transfer status updated successfully",
    data: stockTransfer,
  });
});

const updateStockTransferPricingById = asyncHandler(async (req, res) => {
  const stockTransfer = await stockTransferService.updateStockTransferPricingById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Stock transfer pricing updated successfully",
    data: stockTransfer,
  });
});

module.exports = {
  createStockTransferRequest,
  listRequestableStock,
  createStockTransfer,
  listStockTransfers,
  getStockTransferById,
  updateStockTransferById,
  updateStockTransferPricingById,
  updateStockTransferStatusById,
};


