const fs = require("fs");
const { spawnSync } = require("child_process");

const tests = [
  {
    name: "12A Warranty DB Check",
    file: "phase12-module12a-warranty-db-check.js",
  },
  {
    name: "12B Warranty IN Creation",
    file: "phase12-module12b-warranty-in-create-test.js",
  },
  {
    name: "12C Warranty Status Flow",
    file: "phase12-module12c-warranty-status-flow-test.js",
  },
  {
    name: "12D Warranty Release",
    file: "phase12-module12d-warranty-release-test.js",
  },
  {
    name: "12E Warranty Link Validation",
    file: "phase12-module12e-warranty-link-validation-test.js",
  },
  {
    name: "12F Warranty List / View",
    file: "phase12-module12f-warranty-list-view-test.js",
  },
  {
    name: "12G Return DB Check",
    file: "phase12-module12g-return-db-check.js",
  },
  {
    name: "12H DR DB Check",
    file: "phase12-module12h-dr-db-check.js",
  },
];

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
  });

  return result.status === 0;
};

console.log("\nPHASE 12 MODULE 12I: FINAL REGRESSION TEST");
console.log("==========================================");

for (const test of tests) {
  console.log(`\nChecking file: ${test.file}`);

  if (!fs.existsSync(test.file)) {
    console.error(`FAILED: Missing test file: ${test.file}`);
    process.exit(1);
  }

  console.log(`\nSyntax check: ${test.name}`);
  const syntaxOk = run("node", ["-c", test.file]);

  if (!syntaxOk) {
    console.error(`FAILED: Syntax check failed for ${test.name}`);
    process.exit(1);
  }

  console.log(`\nRunning: ${test.name}`);
  const testOk = run("node", [test.file]);

  if (!testOk) {
    console.error(`FAILED: ${test.name}`);
    process.exit(1);
  }

  console.log(`PASSED: ${test.name}`);
}

console.log("\n==========================================");
console.log("PHASE 12 MODULE 12I FINAL REGRESSION TEST PASSED");
console.log("==========================================");
