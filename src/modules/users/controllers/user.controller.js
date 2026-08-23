const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const userService = require("../services/user.service");

const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body, req.user);

  return sendSuccess(res, {
    statusCode: 201,
    message: "User created successfully",
    data: user,
  });
});

const listUsers = asyncHandler(async (req, res) => {
  const result = await userService.listUsers(req.query, req.user);

  return sendSuccess(res, {
    message: "Users retrieved successfully",
    data: result.users,
    meta: result.meta,
  });
});

const getUserById = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id, req.user);

  return sendSuccess(res, {
    message: "User retrieved successfully",
    data: user,
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body, req.user);

  return sendSuccess(res, {
    message: "User updated successfully",
    data: user,
  });
});

const approveUser = asyncHandler(async (req, res) => {
  const user = await userService.approveUser(req.params.id, req.user);

  return sendSuccess(res, {
    message: "User approved successfully",
    data: user,
  });
});

const rejectUser = asyncHandler(async (req, res) => {
  const user = await userService.rejectUser(req.params.id, req.user);

  return sendSuccess(res, {
    message: "User rejected successfully",
    data: user,
  });
});

const disableUser = asyncHandler(async (req, res) => {
  const user = await userService.disableUser(req.params.id, req.user);

  return sendSuccess(res, {
    message: "User disabled successfully",
    data: user,
  });
});

module.exports = {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  approveUser,
  rejectUser,
  disableUser,
};
