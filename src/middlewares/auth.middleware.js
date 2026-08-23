const prisma = require("../config/prisma");
const AppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { verifyToken } = require("../utils/jwt");

const SAFE_AUTH_USER_SELECT = {
  id: true,
  employeeCode: true,
  username: true,
  email: true,
  firstName: true,
  middleName: true,
  lastName: true,
  fullName: true,
  role: true,
  incentiveClassification: true,
  status: true,
  branchId: true,
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
  approvedById: true,
  approvedAt: true,
  rejectedAt: true,
  disabledAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};

const getBearerToken = (authorizationHeader) => {
  if (!authorizationHeader) {
    return null;
  }

  const parts = authorizationHeader.trim().split(/\s+/);

  if (parts.length !== 2) {
    return null;
  }

  const [scheme, token] = parts;

  if (scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
};

const protect = asyncHandler(async (req, res, next) => {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    throw new AppError("Authentication token is required", 401, "TOKEN_REQUIRED");
  }

  let decoded;

  try {
    decoded = verifyToken(token);
  } catch (error) {
    throw new AppError("Invalid or expired token", 401, "INVALID_TOKEN");
  }

  const userId = decoded.sub;

  if (!userId) {
    throw new AppError("Invalid token payload", 401, "INVALID_TOKEN_PAYLOAD");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: SAFE_AUTH_USER_SELECT,
  });

  if (!user) {
    throw new AppError("User no longer exists", 401, "USER_NOT_FOUND");
  }

  if (user.status !== "ACTIVE") {
    throw new AppError(
      `User account is ${user.status.toLowerCase()}`,
      403,
      "USER_NOT_ACTIVE"
    );
  }

  if (user.branch && user.branch.status !== "ACTIVE") {
    throw new AppError("Assigned branch is inactive", 403, "BRANCH_INACTIVE");
  }

  req.user = user;

  return next();
});

module.exports = {
  protect,
};
