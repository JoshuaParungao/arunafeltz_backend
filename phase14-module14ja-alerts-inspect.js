const fs = require("fs");
const path = require("path");

const root = process.cwd();

const files = [
  "prisma/schema.prisma",
  "src/routes/api.routes.js",
  "src/constants/permissions.js",

  "src/modules/inventory/routes/inventory.routes.js",
  "src/modules/inventory/services/inventory.service.js",
  "src/modules/items/services/item.service.js",

  "src/modules/stock-transfers/routes/stockTransfer.routes.js",
  "src/modules/stock-transfers/services/stockTransfer.service.js",

  "src/modules/warranty-claims/routes/warrantyClaim.routes.js",
  "src/modules/warranty-claims/services/warrantyClaim.service.js",

  "src/modules/purchase-orders/routes/purchaseOrder.routes.js",
  "src/modules/purchase-orders/services/purchaseOrder.service.js",

  "src/modules/purchase-receivings/routes/purchaseReceiving.routes.js",
  "src/modules/purchase-receivings/services/purchaseReceiving.service.js",

  "src/modules/cash-boxes/routes/cashBox.routes.js",
  "src/modules/cash-boxes/services/cashBox.service.js",

  "src/modules/reports/routes/report.routes.js",
  "src/modules/reports/services/report.service.js",
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

console.log("\nPHASE 14J-A ALERTS / NOTIFICATIONS INSPECT");
console.log("------------------------------------------");

const schema = readFile("prisma/schema.prisma");

const schemaBlocks = [
  ["Item Model", "model Item", "\nmodel "],
  ["InventoryBatch Model", "model InventoryBatch", "\nmodel "],
  ["ItemSerial Model", "model ItemSerial", "\nmodel "],
  ["StockTransfer Model", "model StockTransfer", "\nmodel "],
  ["WarrantyClaim Model", "model WarrantyClaim", "\nmodel "],
  ["PurchaseOrder Model", "model PurchaseOrder", "\nmodel "],
  ["PurchaseReceiving Model", "model PurchaseReceiving", "\nmodel "],
  ["CashBox Model", "model CashBox", "\nmodel "],
  ["CashTransaction Model", "model CashTransaction", "\nmodel "],
  ["CashHandover Model", "model CashHandover", "\nmodel "],

  ["CatalogStatus Enum", "enum CatalogStatus", "\nenum "],
  ["InventoryBatchStatus Enum", "enum InventoryBatchStatus", "\nenum "],
  ["ItemSerialStatus Enum", "enum ItemSerialStatus", "\nenum "],
  ["StockTransferStatus Enum", "enum StockTransferStatus", "\nenum "],
  ["WarrantyClaimStatus Enum", "enum WarrantyClaimStatus", "\nenum "],
  ["PurchaseOrderStatus Enum", "enum PurchaseOrderStatus", "\nenum "],
  ["PurchaseReceivingStatus Enum", "enum PurchaseReceivingStatus", "\nenum "],
  ["CashBoxStatus Enum", "enum CashBoxStatus", "\nenum "],
  ["CashTransactionStatus Enum", "enum CashTransactionStatus", "\nenum "],
  ["CashHandoverStatus Enum", "enum CashHandoverStatus", "\nenum "],
];

for (const [title, start, end] of schemaBlocks) {
  printBlock(title, schema, start, end);
}

for (const file of files.slice(1)) {
  const content = readFile(file);

  if (!content) continue;

  console.log(`\n================ ALERT SCAN: ${file} ================`);

  const keywords = [
    "router.",
    "low",
    "minimumStock",
    "reorderLevel",
    "quantityAvailable",
    "quantityIn",
    "status",
    "PENDING",
    "DRAFT",
    "REQUESTED",
    "APPROVED",
    "IN",
    "CHECKING",
    "SENT_TO_SUPPLIER",
    "READY",
    "HANDOVER",
    "VIEW_REPORTS",
    "VIEW_INVENTORY",
    "VIEW_STOCK_TRANSFERS",
    "VIEW_WARRANTY",
    "VIEW_PURCHASE_ORDERS",
    "VIEW_PURCHASE_RECEIVINGS",
    "VIEW_CASH",
    "permission",
    "requirePermission",
    "branchId",
    "fromBranchId",
    "toBranchId",
  ];

  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (keywords.some((keyword) => line.includes(keyword))) {
      console.log(`${index + 1}: ${line}`);
    }
  });
}

console.log("\nPHASE 14J-A ALERTS / NOTIFICATIONS INSPECT DONE");
