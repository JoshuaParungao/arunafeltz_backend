const fs = require("fs");

const filePath = "./src/constants/permissions.js";

if (!fs.existsSync(filePath)) {
  console.error("permissions.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes('VIEW_INVENTORY: "inventory:view"')) {
  console.log("SKIP: VIEW_INVENTORY already exists.");
} else {
  content = content.replace(
    'VIEW_CATALOG: "catalog:view",',
    'VIEW_CATALOG: "catalog:view",\n  VIEW_INVENTORY: "inventory:view",'
  );

  console.log("ADDED: VIEW_INVENTORY permission.");
}

if (content.includes('MANAGE_INVENTORY: "inventory:manage"')) {
  console.log("SKIP: MANAGE_INVENTORY already exists.");
} else {
  content = content.replace(
    'MANAGE_CATALOG: "catalog:manage",',
    'MANAGE_CATALOG: "catalog:manage",\n  MANAGE_INVENTORY: "inventory:manage",'
  );

  console.log("ADDED: MANAGE_INVENTORY permission.");
}

const replacements = [
  {
    label: "SUPER_OWNER",
    from: "Object.values(PERMISSIONS)",
    skip: true,
  },
  {
    label: "BRANCH_OWNER",
    marker: "PERMISSIONS.VIEW_CATALOG,",
    insert: "PERMISSIONS.VIEW_INVENTORY,\n    PERMISSIONS.MANAGE_INVENTORY,",
  },
  {
    label: "ADMIN",
    marker: "PERMISSIONS.VIEW_CATALOG,",
    insert: "PERMISSIONS.VIEW_INVENTORY,\n    PERMISSIONS.MANAGE_INVENTORY,",
  },
  {
    label: "CASHIER",
    marker: "PERMISSIONS.VIEW_CATALOG,",
    insert: "PERMISSIONS.VIEW_INVENTORY,",
  },
  {
    label: "TECHNICIAN",
    marker: "PERMISSIONS.VIEW_CATALOG,",
    insert: "PERMISSIONS.VIEW_INVENTORY,",
  },
];

function patchRoleBlock(text, roleName, marker, insertText) {
  const roleRegex = new RegExp(`(${roleName}:\\s*\\[[\\s\\S]*?\\])`, "m");
  const match = text.match(roleRegex);

  if (!match) {
    console.log(`WARNING: Could not find role block: ${roleName}`);
    return text;
  }

  let block = match[1];

  if (block.includes("PERMISSIONS.VIEW_INVENTORY")) {
    console.log(`SKIP: ${roleName} already has inventory permission.`);
    return text;
  }

  if (!block.includes(marker)) {
    console.log(`WARNING: Could not find marker in ${roleName}: ${marker}`);
    return text;
  }

  block = block.replace(marker, `${marker}\n    ${insertText}`);
  console.log(`ADDED: inventory permissions to ${roleName}`);

  return text.replace(match[1], block);
}

for (const replacement of replacements) {
  if (replacement.skip) {
    console.log("SKIP: SUPER_OWNER uses Object.values(PERMISSIONS).");
    continue;
  }

  content = patchRoleBlock(
    content,
    replacement.label,
    replacement.marker,
    replacement.insert
  );
}

fs.writeFileSync(filePath, content);
console.log("DONE: permissions.js patched for inventory.");
