const fs = require("fs");
const path = require("path");

const root = process.cwd();

const files = [
  "prisma/schema.prisma",
  "src/modules/cash-boxes/routes/cashBox.routes.js",
  "src/modules/cash-boxes/services/cashBox.service.js",
  "src/modules/cash-boxes/controllers/cashBox.controller.js",
  "src/modules/cash-boxes/validations/cashBox.validation.js",
  "src/modules/reports/validations/report.validation.js",
  "src/modules/reports/services/report.service.js",
  "src/modules/reports/controllers/report.controller.js",
  "src/modules/reports/routes/report.routes.js",
];

const readFile = (relativePath) => {
  const fullPath = path.join(root, relativePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`\nMISSING FILE: ${relativePath}`);
    return "";
  }

  console.log(`\nFOUND FILE: ${relativePath}`);
  return fs.readFileSync(fullPath, "utf8");
};

const printBlock = (title, content, startPattern, endPattern) => {
  const start = content.indexOf(startPattern);

  if (start === -1) {
    console.log(`\n${title}: NOT FOUND`);
    return;
  }

  let end = content.indexOf(endPattern, start + startPattern.length);

  if (end === -1) {
    end = Math.min(content.length, start + 5000);
  }

  console.log(`\n================ ${title} ================`);
  console.log(content.slice(start, end).trim());
};

console.log("\nPHASE 14H-D CASH INSPECT");
console.log("------------------------");

const schema = readFile("prisma/schema.prisma");

printBlock("CashBox Model", schema, "model CashBox", "\nmodel ");
printBlock("CashTransaction Model", schema, "model CashTransaction", "\nmodel ");
printBlock("CashHandover Model", schema, "model CashHandover", "\nmodel ");
printBlock("CashTransactionType Enum", schema, "enum CashTransactionType", "\nenum ");
printBlock("CashTransactionStatus Enum", schema, "enum CashTransactionStatus", "\nenum ");
printBlock("CashHandoverStatus Enum", schema, "enum CashHandoverStatus", "\nenum ");

for (const file of files.slice(1)) {
  const content = readFile(file);

  if (!content) continue;

  console.log(`\n================ SCAN: ${file} ================`);

  const keywords = [
    "router.",
    "getCash",
    "create",
    "post",
    "approve",
    "handover",
    "transaction",
    "cashIn",
    "cashOut",
    "status",
    "amount",
    "branchId",
    "createdById",
    "receivedById",
    "approvedById",
    "VIEW_REPORTS",
  ];

  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (keywords.some((keyword) => line.includes(keyword))) {
      console.log(`${index + 1}: ${line}`);
    }
  });
}

console.log("\nPHASE 14H-D CASH INSPECT DONE");
