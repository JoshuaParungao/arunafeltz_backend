const fs = require("fs");
const { spawnSync } = require("child_process");

const syntaxFiles = [
  "src/modules/service-jobs/validations/serviceJob.validation.js",
  "src/modules/service-jobs/services/serviceJob.service.js",
  "src/modules/service-jobs/controllers/serviceJob.controller.js",
  "src/modules/service-jobs/routes/serviceJob.routes.js",
  "src/routes/api.routes.js",
];

const testScripts = [
  "phase11-module11a-service-job-db-check.js",
  "phase11-module11b-create-service-job-test.js",
  "phase11-module11c-update-service-job-status-test.js",
  "phase11-module11d-list-view-service-jobs-test.js",
  "phase11-module11e-service-payment-test.js",
];

const run = (label, command, args) => {
  console.log("\n==================================================");
  console.log(label);
  console.log("==================================================");

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed`);
  }
};

const main = () => {
  console.log("\nPHASE 11 MODULE 11F: FINAL REGRESSION TEST");
  console.log("------------------------------------------");

  for (const file of syntaxFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing syntax file: ${file}`);
    }

    run(`Syntax check: ${file}`, "node", ["-c", file]);
  }

  for (const script of testScripts) {
    if (!fs.existsSync(script)) {
      throw new Error(`Missing test script: ${script}`);
    }

    run(`Syntax check: ${script}`, "node", ["-c", script]);
  }

  for (const script of testScripts) {
    run(`Run test: ${script}`, "node", [script]);
  }

  console.log("\nPHASE 11 MODULE 11F FINAL REGRESSION TEST PASSED");
};

try {
  main();
} catch (error) {
  console.error("\nPHASE 11 MODULE 11F FINAL REGRESSION TEST FAILED");
  console.error(error.message);
  process.exitCode = 1;
}
