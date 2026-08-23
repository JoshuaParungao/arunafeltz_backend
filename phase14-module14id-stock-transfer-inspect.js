const fs = require("fs");
const path = require("path");

const root = process.cwd();

const files = [
  "prisma/schema.prisma",
  "src/modules/stock-transfers/routes/stockTransfer.routes.js",
  "src/modules/stock-transfers/services/stockTransfer.service.js",
  "src/modules/stock-transfers/controllers/stockTransfer.controller.js",
  "src/modules/stock-transfers/validations/stockTransfer.validation.js",
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
    end = Math.min(content.length, start + 7000);
  }

  console.log(`\n================ ${title} ================`);
  console.log(content.slice(start, end).trim());
};

console.log("\nPHASE 14I-D STOCK TRANSFER INSPECT");
console.log("----------------------------------");

const schema = readFile("prisma/schema.prisma");

printBlock("StockTransfer Model", schema, "model StockTransfer", "\nmodel ");
printBlock("StockTransferItem Model", schema, "model StockTransferItem", "\nmodel ");
printBlock("StockTransferSerial Model", schema, "model StockTransferSerial", "\nmodel ");
printBlock("StockTransferStatus Enum", schema, "enum StockTransferStatus", "\nenum ");
printBlock("Branch Model", schema, "model Branch", "\nmodel ");
printBlock("Item Model", schema, "model Item", "\nmodel ");

for (const file of files.slice(1)) {
  const content = readFile(file);

  if (!content) continue;

  console.log(`\n================ SCAN: ${file} ================`);

  const keywords = [
    "router.",
    "getStockTransfer",
    "createStockTransfer",
    "updateStockTransfer",
    "status",
    "transferCode",
    "transferDate",
    "requestedAt",
    "approvedAt",
    "rejectedAt",
    "postedAt",
    "cancelledAt",
    "sourceBranchId",
    "destinationBranchId",
    "fromBranchId",
    "toBranchId",
    "branchId",
    "requestedById",
    "approvedById",
    "rejectedById",
    "postedById",
    "cancelledById",
    "createdById",
    "updatedById",
    "items",
    "serial",
    "quantity",
    "VIEW_REPORTS",
  ];

  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (keywords.some((keyword) => line.includes(keyword))) {
      console.log(`${index + 1}: ${line}`);
    }
  });
}

console.log("\nPHASE 14I-D STOCK TRANSFER INSPECT DONE");
