const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const customerService = require("../services/customer.service");

const createCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.createCustomer(req.body, req.user);

  return sendSuccess(res, {
    statusCode: 201,
    message: "Customer created successfully",
    data: customer,
  });
});

const listCustomers = asyncHandler(async (req, res) => {
  const result = await customerService.listCustomers(req.query, req.user);

  return sendSuccess(res, {
    message: "Customers retrieved successfully",
    data: result,
  });
});

const getCustomerById = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.id, req.user);

  return sendSuccess(res, {
    message: "Customer retrieved successfully",
    data: customer,
  });
});

const getCustomerHistory = asyncHandler(async (req, res) => {
  const history = await customerService.getCustomerHistory(
    req.params.id,
    req.query,
    req.user
  );

  return sendSuccess(res, {
    message: "Customer history retrieved successfully",
    data: history,
  });
});

const updateCustomerById = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomerById(
    req.params.id,
    req.body,
    req.user
  );

  return sendSuccess(res, {
    message: "Customer updated successfully",
    data: customer,
  });
});

module.exports = {
  createCustomer,
  listCustomers,
  getCustomerById,
  getCustomerHistory,
  updateCustomerById,
};
