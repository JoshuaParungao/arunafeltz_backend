const fs = require("fs");

const files = [
  "src/modules/suppliers/routes/supplier.routes.js",
  "src/modules/suppliers/controllers/supplier.controller.js",
  "src/modules/suppliers/services/supplier.service.js",
  "src/modules/auth/middlewares/auth.middleware.js",
  "src/middlewares/auth.middleware.js",
  "src/middlewares/error.middleware.js",
  "src/constants/permissions.js",
  "src/utils/AppError.js",
  "src/utils/catchAsync.js",
  "src/utils/sendResponse.js",
  "src/routes/api.routes.js",
];

console.log("\nPHASE 14B PATTERN INSPECT");
console.log("=========================");

for (const file of files) {
  console.log(`\n--- ${file} ---`);

  if (!fs.existsSync(file)) {
    console.log("[MISSING]");
    continue;
  }

  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  lines.slice(0, 160).forEach((line, index) => {
    console.log(`${index + 1}: ${line}`);
  });

  if (lines.length > 160) {
    console.log(`... truncated, total lines: ${lines.length}`);
  }
}
