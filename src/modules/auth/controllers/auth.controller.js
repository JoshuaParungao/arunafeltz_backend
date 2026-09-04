const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess } = require("../../../utils/apiResponse");
const authService = require("../services/auth.service");

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);

  return sendSuccess(res, {
    message: "Login successful",
    data: result,
  });
});

const getMe = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    message: "Authenticated user retrieved successfully",
    data: {
      user: req.user,
    },
  });
});

const permissionTest = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    message: "Permission test passed",
    data: {
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
    },
  });
});

const branchAccessTest = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    message: "Branch access test passed",
    data: {
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      userBranchId: req.user.branchId,
      requestedBranchId: req.params.branchId,
    },
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const updatedUser = await authService.updateProfile(req.user, req.body);

  return sendSuccess(res, {
    message: "Profile and password updated successfully",
    data: {
      user: updatedUser,
    },
  });
});

module.exports = {
  login,
  getMe,
  updateProfile,
  permissionTest,
  branchAccessTest,
};
