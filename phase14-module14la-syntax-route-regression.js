const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();

const foldersToCheck = [
  "src/config",
  "src/constants",
  "src/middlewares",
  "src/modules",
  "src/routes",
  "src/utils",
];

const ignorePatterns = [
  ".backup-",
  ".bak",
  "backup-before",
];

const jsFiles = [];

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

    if (ignorePatterns.some((pattern) => relativePath.includes(pattern))) {
      continue;
    }

    jsFiles.push(relativePath);
  }
};

for (const folder of foldersToCheck) {
  walk(path.join(root, folder));
}

console.log("\nPHASE 14L-A: Full Backend Syntax + Route Health Regression");
console.log("----------------------------------------------------------");

console.log(`\nFound ${jsFiles.length} active JS files to syntax check.`);

let failed = 0;

for (const file of jsFiles.sort()) {
  const result = spawnSync("node", ["-c", file], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failed += 1;
    console.log(`\nFAIL: ${file}`);
    console.log(result.stderr || result.stdout);
  } else {
    console.log(`PASS: ${file}`);
  }
}

if (failed > 0) {
  throw new Error(`Syntax check failed. Failed files: ${failed}`);
}

console.log("\nSyntax check passed for all active backend JS files.");

const apiRoutesPath = path.join(root, "src/routes/api.routes.js");
const apiRoutes = fs.readFileSync(apiRoutesPath, "utf8");

const expectedMounts = [
  "/health",
  "/auth",
  "/branches",
  "/users",
  "/settings",
  "/customers",
  "/suppliers",
  "/purchase-orders",
  "/purchase-receivings",
  "/stock-transfers",
  "/item-categories",
  "/units",
  "/items",
  "/inventory",
  "/quotations",
  "/sales",
  "/credit-accounts",
  "/cash-boxes",
  "/service-jobs",
  "/warranty-claims",
  "/audit-logs",
  "/reports",
];

for (const mount of expectedMounts) {
  if (!apiRoutes.includes(`"${mount}"`)) {
    throw new Error(`Missing route mount in api.routes.js: ${mount}`);
  }

  console.log(`PASS: route mount found ${mount}`);
}

console.log("\nPHASE 14L-A LOCAL SYNTAX + ROUTE MOUNT CHECK PASSED");
