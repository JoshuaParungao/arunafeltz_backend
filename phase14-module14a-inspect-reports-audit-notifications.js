const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const exists = (targetPath) => {
  return fs.existsSync(path.join(ROOT, targetPath));
};

const readIfExists = (targetPath) => {
  const fullPath = path.join(ROOT, targetPath);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  return fs.readFileSync(fullPath, "utf8");
};

const listDir = (targetPath) => {
  const fullPath = path.join(ROOT, targetPath);

  if (!fs.existsSync(fullPath)) {
    return [];
  }

  return fs.readdirSync(fullPath, { withFileTypes: true }).map((entry) => {
    return {
      name: entry.name,
      type: entry.isDirectory() ? "dir" : "file",
    };
  });
};

const findInFile = (targetPath, keywords) => {
  const content = readIfExists(targetPath);

  if (!content) {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const matches = [];

  lines.forEach((line, index) => {
    const lowerLine = line.toLowerCase();

    for (const keyword of keywords) {
      if (lowerLine.includes(keyword.toLowerCase())) {
        matches.push({
          line: index + 1,
          text: line.trim(),
        });
        break;
      }
    }
  });

  return matches;
};

const printSection = (title) => {
  console.log("\n" + title);
  console.log("-".repeat(title.length));
};

const printStatus = (label, status) => {
  console.log(`${status ? "[FOUND]" : "[MISSING]"} ${label}`);
};

const modulesToCheck = [
  "reports",
  "audit-logs",
  "audit",
  "notifications",
  "dashboard",
];

const routeFilesToCheck = [
  "src/routes/api.routes.js",
  "src/constants/permissions.js",
  "src/config/prisma.js",
  "prisma/schema.prisma",
];

console.log("\nPHASE 14 MODULE 14A: INSPECT REPORTS / AUDIT / NOTIFICATIONS");
console.log("============================================================");

printSection("1. Module folder check");

for (const moduleName of modulesToCheck) {
  printStatus(`src/modules/${moduleName}`, exists(`src/modules/${moduleName}`));

  const entries = listDir(`src/modules/${moduleName}`);

  if (entries.length > 0) {
    for (const entry of entries) {
      console.log(`  - ${entry.type}: ${entry.name}`);
    }
  }
}

printSection("2. Key file check");

for (const filePath of routeFilesToCheck) {
  printStatus(filePath, exists(filePath));
}

printSection("3. api.routes.js mount check");

const apiRouteMatches = findInFile("src/routes/api.routes.js", [
  "report",
  "audit",
  "notification",
  "dashboard",
]);

if (apiRouteMatches.length === 0) {
  console.log("[INFO] No report/audit/notification/dashboard route mount found in api.routes.js");
} else {
  for (const match of apiRouteMatches) {
    console.log(`Line ${match.line}: ${match.text}`);
  }
}

printSection("4. permissions.js check");

const permissionMatches = findInFile("src/constants/permissions.js", [
  "report",
  "audit",
  "notification",
  "dashboard",
]);

if (permissionMatches.length === 0) {
  console.log("[INFO] No report/audit/notification/dashboard permission keyword found");
} else {
  for (const match of permissionMatches) {
    console.log(`Line ${match.line}: ${match.text}`);
  }
}

printSection("5. Prisma schema model check");

const schemaMatches = findInFile("prisma/schema.prisma", [
  "model AuditLog",
  "model Notification",
  "model Report",
  "model Dashboard",
  "AuditLog",
  "Notification",
  "Report",
  "Dashboard",
]);

if (schemaMatches.length === 0) {
  console.log("[INFO] No audit/report/notification/dashboard model keywords found in Prisma schema");
} else {
  for (const match of schemaMatches) {
    console.log(`Line ${match.line}: ${match.text}`);
  }
}

printSection("6. Existing route files search");

const modulesRoot = path.join(ROOT, "src", "modules");

if (!fs.existsSync(modulesRoot)) {
  console.log("[ERROR] src/modules not found");
  process.exitCode = 1;
} else {
  const foundFiles = [];

  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const relativePath = path.relative(ROOT, fullPath).replaceAll("\\", "/");
      const lowerPath = relativePath.toLowerCase();

      if (
        lowerPath.includes("report") ||
        lowerPath.includes("audit") ||
        lowerPath.includes("notification") ||
        lowerPath.includes("dashboard")
      ) {
        foundFiles.push(relativePath);
      }
    }
  };

  walk(modulesRoot);

  if (foundFiles.length === 0) {
    console.log("[INFO] No report/audit/notification/dashboard files found under src/modules");
  } else {
    for (const filePath of foundFiles) {
      console.log(filePath);
    }
  }
}

printSection("7. Summary");

console.log("Inspect only completed.");
console.log("No file was modified except this inspect script itself.");
console.log("\nPHASE 14 MODULE 14A INSPECT SCRIPT FINISHED");
