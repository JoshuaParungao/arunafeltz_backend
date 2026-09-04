const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const supplierService = require("../services/supplier.service");

const createSupplier = asyncHandler(async (req, res) => {
  const supplier = await supplierService.createSupplier(req.body, req.user);

  return sendSuccess(res, {
    statusCode: 201,
    message: "Supplier created successfully",
    data: supplier,
  });
});

const listSuppliers = asyncHandler(async (req, res) => {
  const result = await supplierService.listSuppliers(req.query, req.user);

  return sendSuccess(res, {
    message: "Suppliers retrieved successfully",
    data: result,
  });
});

const getSupplierById = asyncHandler(async (req, res) => {
  const supplier = await supplierService.getSupplierById(req.params.id, req.user);

  return sendSuccess(res, {
    message: "Supplier retrieved successfully",
    data: supplier,
  });
});

const updateSupplierById = asyncHandler(async (req, res) => {
  const supplier = await supplierService.updateSupplierById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Supplier updated successfully",
    data: supplier,
  });
});

const updateSupplierStatusById = asyncHandler(async (req, res) => {
  const supplier = await supplierService.updateSupplierStatusById(
    req.params.id,
    req.body.status,
    req.user
  );

  return sendSuccess(res, {
    message: "Supplier status updated successfully",
    data: supplier,
  });
});

const getSupplierHistory = asyncHandler(async (req, res) => {
  const result = await supplierService.getSupplierHistory(
    req.params.id,
    req.query,
    req.user
  );

  return sendSuccess(res, {
    message: "Supplier history retrieved successfully",
    data: result,
  });
});

module.exports = {
  createSupplier,
  listSuppliers,
  getSupplierById,
  getSupplierHistory,
  updateSupplierById,
  updateSupplierStatusById,
};
