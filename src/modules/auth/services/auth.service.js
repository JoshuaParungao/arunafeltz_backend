const bcrypt = require("bcryptjs");

const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { signToken } = require("../../../utils/jwt");

// A fixed non-user hash keeps unknown-account failures close to the cost of a
// wrong password for a real account and reduces username timing enumeration.
const DUMMY_PASSWORD_HASH =
  "$2b$12$CMBsXuoiLRCeFW5ZqPxpo.Be7ZCGzAOke5KofPUNj1IHTObzGWPl6";

const SAFE_USER_SELECT = {
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

const normalizeIdentifier = (identifier) => {
  return identifier.trim().toLowerCase();
};

const login = async ({ identifier, password }) => {
  const normalizedIdentifier = normalizeIdentifier(identifier);

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: normalizedIdentifier },
        { email: normalizedIdentifier },
      ],
    },
    select: {
      id: true,
      passwordHash: true,
      role: true,
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
    },
  });

  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw new AppError("Invalid username/email or password", 401, "INVALID_CREDENTIALS");
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError("Invalid username/email or password", 401, "INVALID_CREDENTIALS");
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

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
    },
    select: SAFE_USER_SELECT,
  });

  const token = signToken({
    sub: updatedUser.id,
    role: updatedUser.role,
    branchId: updatedUser.branchId,
  });

  return {
    token,
    user: updatedUser,
  };
};

module.exports = {
  login,
};
