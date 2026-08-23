const fs = require("fs");

const filePath = "./phase9-module1-installment-settings-verification-test.js";

if (!fs.existsSync(filePath)) {
  console.error("Test file not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  'assert(techView.status === 200, "Technician can view installment basis settings");',
  'assert(techView.status === 403, "Technician cannot view installment basis settings");'
);

fs.writeFileSync(filePath, content);

console.log("DONE: Phase 9 Module 1 technician settings assertion corrected.");
