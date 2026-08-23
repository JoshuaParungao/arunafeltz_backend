const fs = require("fs");

const filePath = "./src/constants/permissions.js";

if (!fs.existsSync(filePath)) {
  console.error("permissions.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

const addPermissionConstant = (key, value) => {
  if (content.includes(`${key}: "${value}"`)) {
    console.log(`SKIP: ${key} already exists.`);
    return;
  }

  const permissionsEnd = content.indexOf("};");

  if (permissionsEnd === -1) {
    console.error("Cannot find end of PERMISSIONS object.");
    process.exit(1);
  }

  content =
    content.slice(0, permissionsEnd) +
    `  ${key}: "${value}",\n` +
    content.slice(permissionsEnd);

  console.log(`ADDED: ${key}`);
};

const addPermissionToRole = (roleName, permissions) => {
  const roleStart = content.indexOf(`${roleName}: [`);

  if (roleStart === -1) {
    console.error(`Missing role permissions: ${roleName}`);
    process.exit(1);
  }

  const roleEnd = content.indexOf("]", roleStart);

  if (roleEnd === -1) {
    console.error(`Cannot find end of role permissions: ${roleName}`);
    process.exit(1);
  }

  let roleBlock = content.slice(roleStart, roleEnd + 1);
  let changed = false;

  for (const permission of permissions) {
    if (roleBlock.includes(permission)) {
      console.log(`SKIP: ${permission} already in ${roleName}`);
      continue;
    }

    roleBlock = roleBlock.replace(
      "]",
      `  ${permission},\n  ]`
    );

    changed = true;
    console.log(`ADDED: ${permission} to ${roleName}`);
  }

  if (changed) {
    content = content.slice(0, roleStart) + roleBlock + content.slice(roleEnd + 1);
  }
};

addPermissionConstant("VIEW_SALES", "sales:view");
addPermissionConstant("MANAGE_SALES", "sales:manage");

if (content.includes("SUPER_OWNER: Object.values(PERMISSIONS)")) {
  console.log("SKIP: SUPER_OWNER uses Object.values(PERMISSIONS).");
} else {
  addPermissionToRole("SUPER_OWNER", [
    "PERMISSIONS.VIEW_SALES",
    "PERMISSIONS.MANAGE_SALES",
  ]);
}

addPermissionToRole("BRANCH_OWNER", [
  "PERMISSIONS.VIEW_SALES",
  "PERMISSIONS.MANAGE_SALES",
]);

addPermissionToRole("ADMIN", [
  "PERMISSIONS.VIEW_SALES",
  "PERMISSIONS.MANAGE_SALES",
]);

addPermissionToRole("CASHIER", [
  "PERMISSIONS.VIEW_SALES",
  "PERMISSIONS.MANAGE_SALES",
]);

addPermissionToRole("TECHNICIAN", [
  "PERMISSIONS.VIEW_SALES",
]);

fs.writeFileSync(filePath, content);
console.log("DONE: permissions.js patched for sales.");
