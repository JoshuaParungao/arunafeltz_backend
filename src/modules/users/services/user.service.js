const bcrypt = require("bcryptjs");

const prisma = require("../../../config/prisma");
const AppError = require("../../../utils/appError");
const { createAuditLog } = require("../../../utils/auditLogger");
const {
  USER_ROLES,
  BRANCH_SCOPED_ROLES,
} = require("../../../constants/roles");

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

const USER_MANAGEMENT_ROLES = new Set([
  USER_ROLES.SUPER_OWNER,
  USER_ROLES.ADMIN,
]);

const MANAGEABLE_ROLES_BY_ACTOR = {
  [USER_ROLES.ADMIN]: new Set([
    USER_ROLES.CASHIER,
    USER_ROLES.TECHNICIAN,
  ]),
};

const buildFullName = ({ firstName, middleName, lastName }) =>
  [firstName, middleName, lastName]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeNullableString = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeUniqueInput = (value) => {
  const normalized = normalizeNullableString(value);
  return normalized ? normalized.toLowerCase() : null;
};

const assertManagementActor = (actor) => {
  if (!actor) {
    throw new AppError("Authentication is required", 401, "AUTHENTICATION_REQUIRED");
  }

  if (!USER_MANAGEMENT_ROLES.has(actor.role)) {
    throw new AppError(
      "You do not have permission to manage users",
      403,
      "USER_MANAGEMENT_FORBIDDEN"
    );
  }

  if (actor.role !== USER_ROLES.SUPER_OWNER && !actor.branchId) {
    throw new AppError(
      "Your account is not assigned to a branch",
      403,
      "USER_BRANCH_NOT_ASSIGNED"
    );
  }
};

const assertRequestedBranchAccess = (actor, requestedBranchId) => {
  assertManagementActor(actor);

  if (actor.role === USER_ROLES.SUPER_OWNER || !requestedBranchId) {
    return;
  }

  if (requestedBranchId !== actor.branchId) {
    throw new AppError(
      "You can only manage users in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }
};

const assertCanAssignRole = (actor, role) => {
  assertManagementActor(actor);

  if (actor.role === USER_ROLES.SUPER_OWNER) {
    return;
  }

  const manageableRoles = MANAGEABLE_ROLES_BY_ACTOR[actor.role] || new Set();

  if (!manageableRoles.has(role)) {
    throw new AppError(
      "You cannot assign this role",
      403,
      "ROLE_HIERARCHY_DENIED"
    );
  }
};

const assertCanAccessTarget = (actor, targetUser, { manage = false } = {}) => {
  assertManagementActor(actor);

  if (actor.role === USER_ROLES.SUPER_OWNER) {
    return;
  }

  if (targetUser.branchId !== actor.branchId) {
    throw new AppError(
      "You can only access users in your assigned branch",
      403,
      "BRANCH_ACCESS_DENIED"
    );
  }

  if (manage) {
    const manageableRoles = MANAGEABLE_ROLES_BY_ACTOR[actor.role] || new Set();

    if (!manageableRoles.has(targetUser.role)) {
      throw new AppError(
        "You cannot manage a user with this role",
        403,
        "ROLE_HIERARCHY_DENIED"
      );
    }
  }
};

const assertUniqueUserFields = async (
  { username, email, employeeCode },
  excludeUserId = null,
  client = prisma
) => {
  const orConditions = [];

  if (username) orConditions.push({ username });
  if (email) orConditions.push({ email });
  if (employeeCode) orConditions.push({ employeeCode });

  if (orConditions.length === 0) {
    return;
  }

  const existingUser = await client.user.findFirst({
    where: {
      OR: orConditions,
      NOT: excludeUserId ? { id: excludeUserId } : undefined,
    },
    select: {
      username: true,
      email: true,
      employeeCode: true,
    },
  });

  if (!existingUser) return;

  if (existingUser.username === username) {
    throw new AppError("Username already exists", 409, "USERNAME_EXISTS");
  }

  if (email && existingUser.email === email) {
    throw new AppError("Email already exists", 409, "EMAIL_EXISTS");
  }

  if (employeeCode && existingUser.employeeCode === employeeCode) {
    throw new AppError("Employee code already exists", 409, "EMPLOYEE_CODE_EXISTS");
  }
};

const assertSuperOwnerRule = async (role, excludeUserId = null, client = prisma) => {
  if (role !== USER_ROLES.SUPER_OWNER) return;

  const existingSuperOwner = await client.user.findFirst({
    where: {
      role: USER_ROLES.SUPER_OWNER,
      NOT: excludeUserId ? { id: excludeUserId } : undefined,
    },
    select: { id: true },
  });

  if (existingSuperOwner) {
    throw new AppError("Only one Main Admin is allowed", 409, "SUPER_OWNER_EXISTS");
  }
};

const assertBranchRule = async ({ role, branchId }, client = prisma) => {
  if (role === USER_ROLES.SUPER_OWNER) return;

  if (BRANCH_SCOPED_ROLES.includes(role) && !branchId) {
    throw new AppError("Branch is required for this role", 400, "BRANCH_REQUIRED");
  }

  const branch = await client.branch.findUnique({
    where: { id: branchId },
    select: { id: true, status: true },
  });

  if (!branch) {
    throw new AppError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }

  if (branch.status !== "ACTIVE") {
    throw new AppError("Branch is inactive", 400, "BRANCH_INACTIVE");
  }
};

const resolveBranchId = ({ actor, role, requestedBranchId, existingBranchId = null }) => {
  if (role === USER_ROLES.SUPER_OWNER) {
    return null;
  }

  const normalizedBranchId = normalizeNullableString(requestedBranchId);

  if (actor.role !== USER_ROLES.SUPER_OWNER) {
    assertRequestedBranchAccess(actor, normalizedBranchId);
    return actor.branchId;
  }

  return requestedBranchId === undefined ? existingBranchId : normalizedBranchId;
};

const getUserByIdOrThrow = async (id, client = prisma) => {
  const user = await client.user.findUnique({
    where: { id },
    select: SAFE_USER_SELECT,
  });

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  return user;
};

const mapUniqueConstraintError = (error) => {
  if (error?.code !== "P2002") throw error;

  const target = JSON.stringify(error.meta?.target || "").toLowerCase();

  if (target.includes("username")) {
    throw new AppError("Username already exists", 409, "USERNAME_EXISTS");
  }

  if (target.includes("email")) {
    throw new AppError("Email already exists", 409, "EMAIL_EXISTS");
  }

  if (target.includes("employeecode")) {
    throw new AppError("Employee code already exists", 409, "EMPLOYEE_CODE_EXISTS");
  }

  throw new AppError("A user with these details already exists", 409, "USER_ALREADY_EXISTS");
};

const createUser = async (payload, actor) => {
  assertCanAssignRole(actor, payload.role);

  const username = normalizeUniqueInput(payload.username);
  const email = normalizeUniqueInput(payload.email);
  const employeeCode = normalizeNullableString(payload.employeeCode);
  const firstName = String(payload.firstName).trim();
  const middleName = normalizeNullableString(payload.middleName);
  const lastName = String(payload.lastName).trim();
  const branchId = resolveBranchId({
    actor,
    role: payload.role,
    requestedBranchId: payload.branchId,
  });
  const fullName = buildFullName({ firstName, middleName, lastName });
  const passwordHash = await bcrypt.hash(payload.password, 12);

  try {
    return await prisma.$transaction(async (tx) => {
      await assertUniqueUserFields({ username, email, employeeCode }, null, tx);
      await assertSuperOwnerRule(payload.role, null, tx);
      await assertBranchRule({ role: payload.role, branchId }, tx);

      const user = await tx.user.create({
        data: {
          employeeCode,
          username,
          email,
          passwordHash,
          firstName,
          middleName,
          lastName,
          fullName,
          role: payload.role,
          incentiveClassification: payload.incentiveClassification || "NONE",
          status: "PENDING",
          branchId,
        },
        select: SAFE_USER_SELECT,
      });

      await createAuditLog(
        {
          actor,
          branchId: user.branchId,
          action: "USER_CREATED",
          entityType: "User",
          entityId: user.id,
          description: `User ${user.username} created with pending status`,
          metadata: {
            username: user.username,
            employeeCode: user.employeeCode,
            role: user.role,
            incentiveClassification: user.incentiveClassification,
            status: user.status,
            branchId: user.branchId,
          },
        },
        tx
      );

      return user;
    });
  } catch (error) {
    return mapUniqueConstraintError(error);
  }
};

const listUsers = async (filters = {}, actor) => {
  assertManagementActor(actor);

  const page = Number.parseInt(filters.page || "1", 10);
  const limit = Math.min(Number.parseInt(filters.limit || "20", 10), 100);
  const skip = (page - 1) * limit;
  const where = {};

  if (actor.role === USER_ROLES.SUPER_OWNER) {
    if (filters.branchId) where.branchId = filters.branchId;
  } else {
    assertRequestedBranchAccess(actor, filters.branchId);
    where.branchId = actor.branchId;
  }

  if (filters.status) where.status = filters.status;
  if (filters.role) where.role = filters.role;
  if (filters.incentiveClassification) {
    where.incentiveClassification = filters.incentiveClassification;
  }

  const search = normalizeNullableString(filters.search);

  if (search) {
    where.OR = [
      { employeeCode: { contains: search, mode: "insensitive" } },
      { username: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { middleName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { fullName: { contains: search, mode: "insensitive" } },
      {
        branch: {
          is: {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { fullName: "asc" }],
      skip,
      take: limit,
      select: SAFE_USER_SELECT,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getUserById = async (id, actor) => {
  const user = await getUserByIdOrThrow(id);
  assertCanAccessTarget(actor, user);
  return user;
};

const updateUser = async (id, payload, actor) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const existingUser = await getUserByIdOrThrow(id, tx);
      assertCanAccessTarget(actor, existingUser, { manage: true });

      const nextRole = payload.role || existingUser.role;
      const nextIncentiveClassification =
        payload.incentiveClassification || existingUser.incentiveClassification;
      assertCanAssignRole(actor, nextRole);

      if (
        existingUser.role === USER_ROLES.SUPER_OWNER &&
        nextRole !== USER_ROLES.SUPER_OWNER
      ) {
        throw new AppError(
          "The Main Admin account type cannot be removed",
          400,
          "SUPER_OWNER_ROLE_IMMUTABLE"
        );
      }

      const nextUsername = payload.username !== undefined
        ? normalizeUniqueInput(payload.username)
        : existingUser.username;
      const nextEmail = payload.email !== undefined
        ? normalizeUniqueInput(payload.email)
        : existingUser.email;
      const nextEmployeeCode = payload.employeeCode !== undefined
        ? normalizeNullableString(payload.employeeCode)
        : existingUser.employeeCode;
      const nextFirstName = payload.firstName !== undefined
        ? String(payload.firstName).trim()
        : existingUser.firstName;
      const nextMiddleName = payload.middleName !== undefined
        ? normalizeNullableString(payload.middleName)
        : existingUser.middleName;
      const nextLastName = payload.lastName !== undefined
        ? String(payload.lastName).trim()
        : existingUser.lastName;
      const nextBranchId = resolveBranchId({
        actor,
        role: nextRole,
        requestedBranchId: payload.branchId,
        existingBranchId: existingUser.branchId,
      });

      await assertUniqueUserFields(
        {
          username: nextUsername,
          email: nextEmail,
          employeeCode: nextEmployeeCode,
        },
        id,
        tx
      );
      await assertSuperOwnerRule(nextRole, id, tx);
      await assertBranchRule({ role: nextRole, branchId: nextBranchId }, tx);

      const fullName = buildFullName({
        firstName: nextFirstName,
        middleName: nextMiddleName,
        lastName: nextLastName,
      });

      const user = await tx.user.update({
        where: { id },
        data: {
          employeeCode: nextEmployeeCode,
          username: nextUsername,
          email: nextEmail,
          firstName: nextFirstName,
          middleName: nextMiddleName,
          lastName: nextLastName,
          fullName,
          role: nextRole,
          incentiveClassification: nextIncentiveClassification,
          branchId: nextBranchId,
        },
        select: SAFE_USER_SELECT,
      });

      await createAuditLog(
        {
          actor,
          branchId: user.branchId,
          action: "USER_UPDATED",
          entityType: "User",
          entityId: user.id,
          description: `User ${user.username} updated`,
          metadata: {
            previous: {
              employeeCode: existingUser.employeeCode,
              username: existingUser.username,
              fullName: existingUser.fullName,
              role: existingUser.role,
              incentiveClassification: existingUser.incentiveClassification,
              branchId: existingUser.branchId,
            },
            current: {
              employeeCode: user.employeeCode,
              username: user.username,
              fullName: user.fullName,
              role: user.role,
              incentiveClassification: user.incentiveClassification,
              branchId: user.branchId,
            },
          },
        },
        tx
      );

      return user;
    });
  } catch (error) {
    return mapUniqueConstraintError(error);
  }
};

const transitionUser = async (id, actor, action) =>
  prisma.$transaction(async (tx) => {
    const existingUser = await getUserByIdOrThrow(id, tx);
    assertCanAccessTarget(actor, existingUser);

    if (existingUser.id === actor.id) {
      throw new AppError(
        `You cannot ${action.toLowerCase()} your own account`,
        400,
        "SELF_ACTION_NOT_ALLOWED"
      );
    }

    assertCanAccessTarget(actor, existingUser, { manage: true });

    const transitionData = {};
    let nextStatus;

    if (action === "APPROVE") {
      if (existingUser.status !== "PENDING") {
        throw new AppError("Only pending users can be approved", 400, "USER_NOT_PENDING");
      }

      nextStatus = "ACTIVE";
      Object.assign(transitionData, {
        status: nextStatus,
        approvedById: actor.id,
        approvedAt: new Date(),
        rejectedAt: null,
        disabledAt: null,
      });
    } else if (action === "REJECT") {
      if (existingUser.status !== "PENDING") {
        throw new AppError("Only pending users can be rejected", 400, "USER_NOT_PENDING");
      }

      nextStatus = "REJECTED";
      Object.assign(transitionData, {
        status: nextStatus,
        approvedById: null,
        approvedAt: null,
        rejectedAt: new Date(),
        disabledAt: null,
      });
    } else {
      if (existingUser.status === "DISABLED") {
        throw new AppError("User is already disabled", 400, "USER_ALREADY_DISABLED");
      }

      nextStatus = "DISABLED";
      Object.assign(transitionData, {
        status: nextStatus,
        disabledAt: new Date(),
      });
    }

    const user = await tx.user.update({
      where: { id },
      data: transitionData,
      select: SAFE_USER_SELECT,
    });

    const actionPastTense = {
      APPROVE: "APPROVED",
      REJECT: "REJECTED",
      DISABLE: "DISABLED",
    }[action];

    await createAuditLog(
      {
        actor,
        branchId: user.branchId,
        action: `USER_${actionPastTense}`,
        entityType: "User",
        entityId: user.id,
        description: `User ${user.username} ${actionPastTense.toLowerCase()}`,
        metadata: {
          username: user.username,
          role: user.role,
          incentiveClassification: user.incentiveClassification,
          branchId: user.branchId,
          previousStatus: existingUser.status,
          currentStatus: user.status,
        },
      },
      tx
    );

    return user;
  });

const approveUser = (id, actor) => transitionUser(id, actor, "APPROVE");
const rejectUser = (id, actor) => transitionUser(id, actor, "REJECT");
const disableUser = (id, actor) => transitionUser(id, actor, "DISABLE");

module.exports = {
  SAFE_USER_SELECT,
  createUser,
  listUsers,
  getUserById,
  updateUser,
  approveUser,
  rejectUser,
  disableUser,
};
