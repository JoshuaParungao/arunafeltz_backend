const asyncHandler = require("../../../utils/asyncHandler");
const { sendSuccess, sendCreated } = require("../../../utils/apiResponse");
const branchService = require("../services/branch.service");

const createBranch = asyncHandler(async (req, res) => {
  const branch = await branchService.createBranch(req.body, req.user);

  return sendCreated(res, {
    message: "Branch created successfully",
    data: branch,
  });
});

const getBranches = asyncHandler(async (req, res) => {
  const branches = await branchService.getBranches({
    status: req.query.status,
  });

  return sendSuccess(res, {
    message: "Branches retrieved successfully",
    data: branches,
  });
});

const getBranchById = asyncHandler(async (req, res) => {
  const branch = await branchService.getBranchById(req.params.id);

  return sendSuccess(res, {
    message: "Branch retrieved successfully",
    data: branch,
  });
});

const updateBranch = asyncHandler(async (req, res) => {
  const branch = await branchService.updateBranch(req.params.id, req.body, req.user);

  return sendSuccess(res, {
    message: "Branch updated successfully",
    data: branch,
  });
});

const deactivateBranch = asyncHandler(async (req, res) => {
  const branch = await branchService.deactivateBranch(req.params.id, req.user);

  return sendSuccess(res, {
    message: "Branch deactivated successfully",
    data: branch,
  });
});

module.exports = {
  createBranch,
  getBranches,
  getBranchById,
  updateBranch,
  deactivateBranch,
};
