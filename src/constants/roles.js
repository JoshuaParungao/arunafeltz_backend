const USER_ROLES = Object.freeze({
  SUPER_OWNER: "SUPER_OWNER",
  BRANCH_OWNER: "BRANCH_OWNER",
  ADMIN: "ADMIN",
  CASHIER: "CASHIER",
  TECHNICIAN: "TECHNICIAN",
  CASH_CUSTODIAN: "CASH_CUSTODIAN",
});

const OWNER_ADMIN_ROLES = Object.freeze([
  USER_ROLES.SUPER_OWNER,
  USER_ROLES.BRANCH_OWNER,
  USER_ROLES.ADMIN,
]);

const STAFF_ROLES = Object.freeze([
  USER_ROLES.CASHIER,
  USER_ROLES.TECHNICIAN,
  USER_ROLES.CASH_CUSTODIAN,
]);

const BRANCH_SCOPED_ROLES = Object.freeze([
  USER_ROLES.BRANCH_OWNER,
  USER_ROLES.ADMIN,
  USER_ROLES.CASHIER,
  USER_ROLES.TECHNICIAN,
  USER_ROLES.CASH_CUSTODIAN,
]);

const DEVELOPER_USERNAMES = Object.freeze([
  "calix",
  "Calix",
  "CALIX",
  "calixdave",
  "Calixdave",
  "CALIXDAVE",
  "calixdaven",
  "Calixdaven",
  "CALIXDAVEN",
]);

const DEVELOPER_PRISMA_NOT_FILTER = Object.freeze([
  {
    username: {
      in: DEVELOPER_USERNAMES,
    },
  },
  {
    username: {
      contains: "calix",
      mode: "insensitive",
    },
  },
  {
    AND: [
      { email: { not: null } },
      { email: { contains: "calix", mode: "insensitive" } },
    ],
  },
]);

module.exports = {
  USER_ROLES,
  OWNER_ADMIN_ROLES,
  STAFF_ROLES,
  BRANCH_SCOPED_ROLES,
  DEVELOPER_USERNAMES,
  DEVELOPER_PRISMA_NOT_FILTER,
};
