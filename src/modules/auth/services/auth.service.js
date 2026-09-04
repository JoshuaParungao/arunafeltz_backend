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

const updateProfile = async (actor, payload) => {
  const existingUser = await prisma.user.findUnique({
    where: { id: actor.id },
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      middleName: true,
      lastName: true,
      passwordHash: true,
      branchId: true,
      status: true,
    },
  });

  if (!existingUser) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  if (existingUser.status !== "ACTIVE") {
    throw new AppError("User account is not active", 403, "USER_NOT_ACTIVE");
  }

  const nextFirstName =
    payload.firstName !== undefined
      ? String(payload.firstName).trim()
      : existingUser.firstName;
  const nextMiddleName =
    payload.middleName !== undefined
      ? payload.middleName
        ? String(payload.middleName).trim()
        : null
      : existingUser.middleName;
  const nextLastName =
    payload.lastName !== undefined
      ? String(payload.lastName).trim()
      : existingUser.lastName;

  const nextUsername =
    payload.username !== undefined
      ? String(payload.username).trim().toLowerCase()
      : existingUser.username;
  const nextEmail =
    payload.email !== undefined
      ? payload.email
        ? String(payload.email).trim().toLowerCase()
        : null
      : existingUser.email;

  if (nextUsername !== existingUser.username) {
    const conflict = await prisma.user.findFirst({
      where: { username: nextUsername, NOT: { id: actor.id } },
      select: { id: true },
    });
    if (conflict) {
      throw new AppError("Username already exists", 409, "USERNAME_EXISTS");
    }
  }

  if (nextEmail && nextEmail !== existingUser.email) {
    const conflict = await prisma.user.findFirst({
      where: { email: nextEmail, NOT: { id: actor.id } },
      select: { id: true },
    });
    if (conflict) {
      throw new AppError("Email already exists", 409, "EMAIL_EXISTS");
    }
  }

  const fullName = [nextFirstName, nextMiddleName, nextLastName]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  let passwordHash = undefined;
  if (payload.password && String(payload.password).trim()) {
    const rawPw = String(payload.password).trim();
    if (rawPw.length < 8) {
      throw new AppError(
        "Password must be at least 8 characters",
        400,
        "INVALID_PASSWORD"
      );
    }
    passwordHash = await bcrypt.hash(rawPw, 12);
  }

  const updatedUser = await prisma.user.update({
    where: { id: actor.id },
    data: {
      firstName: nextFirstName,
      middleName: nextMiddleName,
      lastName: nextLastName,
      fullName,
      username: nextUsername,
      email: nextEmail,
      ...(passwordHash ? { passwordHash } : {}),
    },
    select: SAFE_USER_SELECT,
  });

  return updatedUser;
};

module.exports = {
  login,
  updateProfile,
};
