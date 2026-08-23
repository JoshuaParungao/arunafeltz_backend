const fs = require("fs");
const path = require("path");

const root = process.cwd();

const targetFolders = [
  "src/routes",
  "src/modules",
  "src/middlewares",
  "src/constants",
];

const routeFiles = [];
const permissionFiles = [];

const walk = (dir) => {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".js")) continue;

    const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");

    if (
      relativePath.includes("/routes/") ||
      relativePath.endsWith("api.routes.js") ||
      relativePath.includes("permission") ||
      relativePath.includes("permissions")
    ) {
      routeFiles.push(relativePath);
    }

    if (
      relativePath.includes("permission") ||
      relativePath.includes("permissions") ||
      relativePath.includes("auth.middleware") ||
      relativePath.includes("role")
    ) {
      permissionFiles.push(relativePath);
    }
  }
};

for (const folder of targetFolders) {
  walk(path.join(root, folder));
}

const unique = (items) => [...new Set(items)].sort();

const printMatches = (title, files, keywords) => {
  console.log(`\n================ ${title} ================`);

  for (const file of unique(files)) {
    const fullPath = path.join(root, file);

    if (!fs.existsSync(fullPath)) {
      console.log(`\nMISSING FILE: ${file}`);
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split(/\r?\n/);

    const matches = [];

    lines.forEach((line, index) => {
      if (keywords.some((keyword) => line.includes(keyword))) {
        matches.push(`${index + 1}: ${line}`);
      }
    });

    if (matches.length === 0) continue;

    console.log(`\nFILE: ${file}`);
    console.log(matches.join("\n"));
  }
};

console.log("\nPHASE 14K-A FINAL PERMISSION AUDIT INSPECT");
console.log("------------------------------------------");

printMatches("ROUTES / PROTECTION / PERMISSIONS", routeFiles, [
  "router.",
  "protect",
  "requirePermission",
  "requireRole",
  "PERMISSIONS.",
  "MANAGE_",
  "VIEW_",
]);

printMatches("PERMISSION CONSTANTS / MIDDLEWARES", permissionFiles, [
  "const PERMISSIONS",
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "CASHIER",
  "TECHNICIAN",
  "CASH_CUSTODIAN",
  "Object.values",
  "PERMISSIONS.",
  "requirePermission",
  "requireRole",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "status",
  "role",
  "branchId",
]);

console.log("\n================ ROUTE FILE LIST ================");
for (const file of unique(routeFiles)) {
  console.log(file);
}

console.log("\n================ PERMISSION FILE LIST ================");
for (const file of unique(permissionFiles)) {
  console.log(file);
}

console.log("\nPHASE 14K-A FINAL PERMISSION AUDIT INSPECT DONE");
