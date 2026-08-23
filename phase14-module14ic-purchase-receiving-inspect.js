const fs = require("fs");
const path = require("path");

const root = process.cwd();

const files = [
  "prisma/schema.prisma",
  "src/modules/purchase-receivings/routes/purchaseReceiving.routes.js",
  "src/modules/purchase-receivings/services/purchaseReceiving.service.js",
  "src/modules/purchase-receivings/controllers/purchaseReceiving.controller.js",
  "src/modules/purchase-receivings/validations/purchaseReceiving.validation.js",
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
    end = Math.min(content.length, start + 6000);
  }

  console.log(`\n================ ${title} ================`);
  console.log(content.slice(start, end).trim());
};

console.log("\nPHASE 14I-C PURCHASE RECEIVING INSPECT");
console.log("--------------------------------------");

const schema = readFile("prisma/schema.prisma");

printBlock("PurchaseReceiving Model", schema, "model PurchaseReceiving", "\nmodel ");
printBlock("PurchaseReceivingItem Model", schema, "model PurchaseReceivingItem", "\nmodel ");
printBlock("PurchaseReceivingSerial Model", schema, "model PurchaseReceivingSerial", "\nmodel ");
printBlock("PurchaseReceivingStatus Enum", schema, "enum PurchaseReceivingStatus", "\nenum ");
printBlock("PurchaseOrder Model", schema, "model PurchaseOrder", "\nmodel ");
printBlock("Supplier Model", schema, "model Supplier", "\nmodel ");

for (const file of files.slice(1)) {
  const content = readFile(file);

  if (!content) continue;

  console.log(`\n================ SCAN: ${file} ================`);

  const keywords = [
    "router.",
    "getPurchaseReceiving",
    "createPurchaseReceiving",
    "updatePurchaseReceiving",
    "status",
    "receivingCode",
    "receivingDate",
    "supplierDeliveryNo",
    "supplierInvoiceNo",
    "referenceNo",
    "subtotal",
    "totalDiscount",
    "grandTotal",
    "postedAt",
    "cancelledAt",
    "supplierId",
    "purchaseOrderId",
    "branchId",
    "createdById",
    "updatedById",
    "postedById",
    "cancelledById",
    "items",
    "serial",
    "VIEW_REPORTS",
  ];

  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (keywords.some((keyword) => line.includes(keyword))) {
      console.log(`${index + 1}: ${line}`);
    }
  });
}

console.log("\nPHASE 14I-C PURCHASE RECEIVING INSPECT DONE");
