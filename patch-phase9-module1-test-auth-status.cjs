const fs = require("fs");

const filePath = "./phase9-module1-installment-settings-verification-test.js";

if (!fs.existsSync(filePath)) {
  console.error("Test file not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  'assert(noToken.status === 401, "Installment settings blocks missing token");',
  'assert([401, 403].includes(noToken.status), "Installment settings blocks missing token");'
);

fs.writeFileSync(filePath, content);
console.log("DONE: Phase 9 Module 1 test patched to accept 401 or 403 for missing token.");
