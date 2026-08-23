const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const purchaseOrderService = require("../services/purchaseOrder.service");

const createPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.createPurchaseOrder(
    req.body,
    req.user
  );

  return sendSuccess(res, {
    statusCode: 201,
    message: "Purchase order created successfully",
    data: purchaseOrder,
  });
});

const listPurchaseOrders = asyncHandler(async (req, res) => {
  const result = await purchaseOrderService.listPurchaseOrders(
    req.query,
    req.user
  );

  return sendSuccess(res, {
    message: "Purchase orders retrieved successfully",
    data: result,
  });
});

const getPurchaseOrderById = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.getPurchaseOrderById(
    req.params.id,
    req.user
  );

  return sendSuccess(res, {
    message: "Purchase order retrieved successfully",
    data: purchaseOrder,
  });
});

const updatePurchaseOrderById = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.updatePurchaseOrderById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Purchase order updated successfully",
    data: purchaseOrder,
  });
});

const updatePurchaseOrderStatusById = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.updatePurchaseOrderStatusById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Purchase order status updated successfully",
    data: purchaseOrder,
  });
});

module.exports = {
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrderById,
  updatePurchaseOrderStatusById,
};
