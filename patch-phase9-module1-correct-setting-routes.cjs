const fs = require("fs");

const filePath = "./phase9-module1-installment-settings-verification-test.js";

if (!fs.existsSync(filePath)) {
  console.error("Test file not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

content = content.replaceAll(
  "/settings/installment-basis",
  "/settings/business-rules/installment"
);

content = content.replaceAll(
  "/settings/installment-test-compute",
  "/settings/business-rules/installment/test-compute"
);

fs.writeFileSync(filePath, content);

console.log("DONE: Phase 9 Module 1 test endpoint paths corrected.");
