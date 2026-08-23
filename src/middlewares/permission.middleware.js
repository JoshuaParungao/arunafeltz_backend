const AppError = require("../utils/appError");
const { roleHasPermission } = require("../utils/roleAccess");

const requirePermission = (permission) => {
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

    const allowed = roleHasPermission(req.user.role, permission);

    if (!allowed) {
      return next(
        new AppError(
          "You do not have permission to perform this action",
          403,
          "FORBIDDEN"
        )
      );
    }

    return next();
  };
};

const requireAnyPermission = (permissions = []) => {
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

    const allowed = permissions.some((permission) =>
      roleHasPermission(req.user.role, permission)
    );

    if (!allowed) {
      return next(
        new AppError(
          "You do not have permission to perform this action",
          403,
          "FORBIDDEN"
        )
      );
    }

    return next();
  };
};

module.exports = {
  requirePermission,
  requireAnyPermission,
};
