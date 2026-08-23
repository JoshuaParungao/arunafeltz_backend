const fs = require("fs");
const path = require("path");

const root = process.cwd();

const files = [
  "prisma/schema.prisma",
  "src/modules/suppliers/routes/supplier.routes.js",
  "src/modules/suppliers/services/supplier.service.js",
  "src/modules/suppliers/controllers/supplier.controller.js",
  "src/modules/suppliers/validations/supplier.validation.js",
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

console.log("\nPHASE 14I-A SUPPLIER INSPECT");
console.log("----------------------------");

const schema = readFile("prisma/schema.prisma");

printBlock("Supplier Model", schema, "model Supplier", "\nmodel ");
printBlock("Supplier Status Enum", schema, "enum SupplierStatus", "\nenum ");
printBlock("PurchaseOrder Model", schema, "model PurchaseOrder", "\nmodel ");
printBlock("PurchaseReceiving Model", schema, "model PurchaseReceiving", "\nmodel ");

for (const file of files.slice(1)) {
  const content = readFile(file);

  if (!content) continue;

  console.log(`\n================ SCAN: ${file} ================`);

  const keywords = [
    "router.",
    "getSupplier",
    "createSupplier",
    "updateSupplier",
    "status",
    "supplierCode",
    "companyName",
    "contactPerson",
    "branchId",
    "createdById",
    "updatedById",
    "purchaseOrders",
    "purchaseReceivings",
    "VIEW_REPORTS",
  ];

  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (keywords.some((keyword) => line.includes(keyword))) {
      console.log(`${index + 1}: ${line}`);
    }
  });
}

console.log("\nPHASE 14I-A SUPPLIER INSPECT DONE");
