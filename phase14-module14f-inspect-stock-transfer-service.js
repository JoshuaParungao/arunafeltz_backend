const fs = require("fs");

const file = "src/modules/stock-transfers/services/stockTransfer.service.js";

if (!fs.existsSync(file)) {
  console.error("Stock transfer service not found");
  process.exit(1);
}

const content = fs.readFileSync(file, "utf8");
const lines = content.split(/\r?\n/);

const keywords = [
  "const createStockTransfer",
  "const updateStockTransferById",
  "const updateStockTransferStatusById",
  "const postStockTransferInventoryMovement",
  "module.exports",
];

console.log("\nPHASE 14F STOCK TRANSFER SERVICE FUNCTION INSPECT");
console.log("=================================================");

for (const keyword of keywords) {
  const index = lines.findIndex((line) => line.includes(keyword));

  console.log(`\n--- ${keyword} ---`);

  if (index === -1) {
    console.log("[MISSING]");
    continue;
  }

  const start = Math.max(0, index - 12);
  const end = Math.min(lines.length, index + 220);

  for (let i = start; i < end; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
