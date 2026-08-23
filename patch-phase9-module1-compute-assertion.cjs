const fs = require("fs");

const filePath = "./phase9-module1-installment-settings-verification-test.js";

if (!fs.existsSync(filePath)) {
  console.error("Test file not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  'assert(compute.body.data.termBasisUsed === 0.875 || compute.body.data.termBasis === 0.875 || compute.body.data.computation?.termBasis === 0.875, "MONTH_12 basis used somewhere in compute response");',
  'assert(compute.body.data.basisUsed.termBasis === 0.875, "MONTH_12 basis used in compute response");'
);

fs.writeFileSync(filePath, content);

console.log("DONE: Phase 9 Module 1 compute assertion corrected.");
