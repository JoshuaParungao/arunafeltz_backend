const fs = require("fs");
const { spawnSync } = require("child_process");

const scripts = [
  "phase10-module3-cash-in-out-test.js",
  "phase10-module4-cash-list-view-test.js",
  "phase10-module5-cancel-cash-transaction-test.js",
  "phase10-module6a-sales-credit-cash-link-test.js",
  "phase10-module6b-auto-reverse-cash-links-test.js",
  "phase10-module7a-cash-handover-db-check.js",
  "phase10-module7b-create-cash-handover-test.js",
  "phase10-module7c-receive-cash-handover-test.js",
  "phase10-module7d-cancel-cash-handover-test.js",
  "phase10-module7e-list-view-cash-handovers-test.js",
];

const syntaxFiles = [
  "src/modules/cash-boxes/validations/cashBox.validation.js",
  "src/modules/cash-boxes/services/cashBox.service.js",
  "src/modules/cash-boxes/services/cashLink.service.js",
  "src/modules/cash-boxes/controllers/cashBox.controller.js",
  "src/modules/cash-boxes/routes/cashBox.routes.js",
  "src/modules/sales/services/sale.service.js",
  "src/modules/credit-accounts/services/creditAccount.service.js",
];

const run = (label, command, args) => {
  console.log(`\n==================================================`);
  console.log(label);
  console.log(`==================================================`);

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed`);
  }
};

const main = () => {
  console.log("\nPHASE 10 MODULE 8: FINAL REGRESSION TEST");
  console.log("----------------------------------------");

  for (const file of syntaxFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing syntax file: ${file}`);
    }

    run(`Syntax check: ${file}`, "node", ["-c", file]);
  }

  for (const script of scripts) {
    if (!fs.existsSync(script)) {
      throw new Error(`Missing test script: ${script}`);
    }

    run(`Syntax check: ${script}`, "node", ["-c", script]);
  }

  for (const script of scripts) {
    run(`Run test: ${script}`, "node", [script]);
  }

  console.log("\nPHASE 10 MODULE 8 FINAL REGRESSION TEST PASSED");
};

try {
  main();
} catch (error) {
  console.error("\nPHASE 10 MODULE 8 FINAL REGRESSION TEST FAILED");
  console.error(error.message);
  process.exitCode = 1;
}
