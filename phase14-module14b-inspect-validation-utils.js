const fs = require("fs");

const files = [
  "src/middlewares/validate.middleware.js",
  "src/utils/asyncHandler.js",
  "src/utils/apiResponse.js",
  "src/modules/suppliers/validations/supplier.validation.js",
];

console.log("\nPHASE 14B VALIDATION / UTIL PATTERN INSPECT");
console.log("===========================================");

for (const file of files) {
  console.log(`\n--- ${file} ---`);

  if (!fs.existsSync(file)) {
    console.log("[MISSING]");
    continue;
  }

  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  lines.slice(0, 220).forEach((line, index) => {
    console.log(`${index + 1}: ${line}`);
  });

  if (lines.length > 220) {
    console.log(`... truncated, total lines: ${lines.length}`);
  }
}
