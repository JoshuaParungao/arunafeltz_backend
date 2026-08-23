const fs = require("fs");

const files = [
  "src/modules/inventory/controllers/inventory.controller.js",
  "src/modules/audit-logs/controllers/auditLog.controller.js",
  "src/utils/apiResponse.js",
  "src/middlewares/validate.middleware.js",
  "src/middlewares/auth.middleware.js",
  "src/middlewares/permission.middleware.js",
];

console.log("\nPHASE 14G RESPONSE STYLE INSPECT");
console.log("================================");

for (const file of files) {
  console.log(`\n\n===== ${file} =====`);

  if (!fs.existsSync(file)) {
    console.log("[MISSING]");
    continue;
  }

  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
