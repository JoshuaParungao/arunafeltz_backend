const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const supplierReturnService = require("../services/supplierReturn.service");

const getEligibleDefects = asyncHandler(async (req, res) => {
  const result = await supplierReturnService.getEligibleDefects(req.user, req.query);
  return sendSuccess(res, {
    message: "Eligible defective items retrieved successfully",
    data: result,
  });
});

const getSupplierReturns = asyncHandler(async (req, res) => {
  const result = await supplierReturnService.getSupplierReturns(req.user, req.query);
  return sendSuccess(res, {
    message: "Supplier returns retrieved successfully",
    data: result.data,
    meta: {
      pagination: result.pagination,
      summary: result.summary,
    },
  });
});

const getSupplierReturnById = asyncHandler(async (req, res) => {
  const supplierReturn = await supplierReturnService.getSupplierReturnById(
    req.user,
    req.params.id
  );
  return sendSuccess(res, {
    message: "Supplier return retrieved successfully",
    data: supplierReturn,
  });
});

const createSupplierReturn = asyncHandler(async (req, res) => {
  const supplierReturn = await supplierReturnService.createSupplierReturn(
    req.user,
    req.body
  );
  return sendSuccess(res, {
    statusCode: 201,
    message: "Supplier return created successfully",
    data: supplierReturn,
  });
});

const updateSupplierReturn = asyncHandler(async (req, res) => {
  const supplierReturn = await supplierReturnService.updateSupplierReturn(
    req.user,
    req.params.id,
    req.body
  );
  return sendSuccess(res, {
    message: "Supplier return updated successfully",
    data: supplierReturn,
  });
});

const approveSupplierReturn = asyncHandler(async (req, res) => {
  const supplierReturn = await supplierReturnService.approveSupplierReturn(
    req.user,
    req.params.id,
    req.body
  );
  return sendSuccess(res, {
    message: "Supplier return approved successfully",
    data: supplierReturn,
  });
});

const dispatchSupplierReturn = asyncHandler(async (req, res) => {
  const supplierReturn = await supplierReturnService.dispatchSupplierReturn(
    req.user,
    req.params.id,
    req.body
  );
  return sendSuccess(res, {
    message: "Supplier return dispatched to supplier successfully",
    data: supplierReturn,
  });
});

const resolveSupplierReturn = asyncHandler(async (req, res) => {
  const supplierReturn = await supplierReturnService.resolveSupplierReturn(
    req.user,
    req.params.id,
    req.body
  );
  return sendSuccess(res, {
    message: "Supplier return resolved successfully",
    data: supplierReturn,
  });
});

const cancelSupplierReturn = asyncHandler(async (req, res) => {
  const supplierReturn = await supplierReturnService.cancelSupplierReturn(
    req.user,
    req.params.id,
    req.body
  );
  return sendSuccess(res, {
    message: "Supplier return cancelled successfully",
    data: supplierReturn,
  });
});

module.exports = {
  getEligibleDefects,
  getSupplierReturns,
  getSupplierReturnById,
  createSupplierReturn,
  updateSupplierReturn,
  approveSupplierReturn,
  dispatchSupplierReturn,
  resolveSupplierReturn,
  cancelSupplierReturn,
};
