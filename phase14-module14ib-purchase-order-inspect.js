const fs = require("fs");
const path = require("path");

const root = process.cwd();

const files = [
  "prisma/schema.prisma",
  "src/modules/purchase-orders/routes/purchaseOrder.routes.js",
  "src/modules/purchase-orders/services/purchaseOrder.service.js",
  "src/modules/purchase-orders/controllers/purchaseOrder.controller.js",
  "src/modules/purchase-orders/validations/purchaseOrder.validation.js",
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

console.log("\nPHASE 14I-B PURCHASE ORDER INSPECT");
console.log("----------------------------------");

const schema = readFile("prisma/schema.prisma");

printBlock("PurchaseOrder Model", schema, "model PurchaseOrder", "\nmodel ");
printBlock("PurchaseOrderItem Model", schema, "model PurchaseOrderItem", "\nmodel ");
printBlock("PurchaseOrderStatus Enum", schema, "enum PurchaseOrderStatus", "\nenum ");
printBlock("Supplier Model", schema, "model Supplier", "\nmodel ");

for (const file of files.slice(1)) {
  const content = readFile(file);

  if (!content) continue;

  console.log(`\n================ SCAN: ${file} ================`);

  const keywords = [
    "router.",
    "getPurchaseOrder",
    "createPurchaseOrder",
    "updatePurchaseOrder",
    "status",
    "poCode",
    "orderDate",
    "expectedDate",
    "subtotal",
    "totalDiscount",
    "grandTotal",
    "supplierId",
    "branchId",
    "createdById",
    "updatedById",
    "orderedById",
    "cancelledById",
    "items",
    "VIEW_REPORTS",
  ];

  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (keywords.some((keyword) => line.includes(keyword))) {
      console.log(`${index + 1}: ${line}`);
    }
  });
}

console.log("\nPHASE 14I-B PURCHASE ORDER INSPECT DONE");
