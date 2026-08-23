const { USER_ROLES, OWNER_ADMIN_ROLES, STAFF_ROLES, BRANCH_SCOPED_ROLES } = require("../constants/roles");
const { ROLE_PERMISSIONS } = require("../constants/permissions");

const isValidRole = (role) => {
  return Object.values(USER_ROLES).includes(role);
};

const isOwnerAdminRole = (role) => {
  return OWNER_ADMIN_ROLES.includes(role);
};

const isStaffRole = (role) => {
  return STAFF_ROLES.includes(role);
};

const isBranchScopedRole = (role) => {
  return BRANCH_SCOPED_ROLES.includes(role);
};

const getPermissionsForRole = (role) => {
  if (!isValidRole(role)) {
    return [];
  }

  return ROLE_PERMISSIONS[role] || [];
};

const roleHasPermission = (role, permission) => {
  const permissions = getPermissionsForRole(role);
  return permissions.includes(permission);
};

const roleHasAnyPermission = (role, permissionsToCheck = []) => {
  const permissions = getPermissionsForRole(role);
  return permissionsToCheck.some((permission) => permissions.includes(permission));
};

module.exports = {
  isValidRole,
  isOwnerAdminRole,
  isStaffRole,
  isBranchScopedRole,
  getPermissionsForRole,
  roleHasPermission,
  roleHasAnyPermission,
};
