const AppError = require("../utils/appError");
const { USER_ROLES } = require("../constants/roles");

const getBranchIdFromRequest = (req, source) => {
  if (source === "params") {
    return req.params.branchId || req.params.id;
  }

  if (source === "query") {
    return req.query.branchId;
  }

  if (source === "body") {
    return req.body.branchId;
  }

  return req.params.branchId || req.query.branchId || req.body.branchId;
};

const requireBranchAccess = (source = "auto") => {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        new AppError(
          "Authentication is required",
          401,
          "AUTHENTICATION_REQUIRED"
        )
      );
    }

    const requestedBranchId = getBranchIdFromRequest(req, source);

    if (!requestedBranchId) {
      return next(
        new AppError(
          "Branch ID is required",
          400,
          "BRANCH_ID_REQUIRED"
        )
      );
    }

    if (req.user.role === USER_ROLES.SUPER_OWNER) {
      return next();
    }

    if (!req.user.branchId) {
      return next(
        new AppError(
          "User is not assigned to a branch",
          403,
          "USER_BRANCH_NOT_ASSIGNED"
        )
      );
    }

    if (req.user.branchId !== requestedBranchId) {
      return next(
        new AppError(
          "You do not have access to this branch",
          403,
          "BRANCH_ACCESS_DENIED"
        )
      );
    }

    return next();
  };
};

module.exports = {
  requireBranchAccess,
};
