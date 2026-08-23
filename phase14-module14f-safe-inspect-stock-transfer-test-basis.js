const fs = require("fs");

const files = [
  "src/modules/stock-transfers/routes/stockTransfer.routes.js",
  "src/modules/stock-transfers/validations/stockTransfer.validation.js",
  "prisma/schema.prisma",
];

console.log("\nPHASE 14F SAFE INSPECT: Routes, Validation, Schema");
console.log("===================================================");

for (const file of files) {
  console.log(`\n\n===== ${file} =====`);

  if (!fs.existsSync(file)) {
    console.log("[MISSING]");
    continue;
  }

  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  if (file.endsWith("schema.prisma")) {
    const keywords = [
      "model StockTransfer ",
      "model StockTransferItem ",
      "model InventoryBatch ",
      "model InventoryMovement ",
      "model Item ",
      "model Branch ",
    ];

    for (const keyword of keywords) {
      const index = lines.findIndex((line) => line.includes(keyword));

      console.log(`\n--- ${keyword} ---`);

      if (index === -1) {
        console.log("[MISSING]");
        continue;
      }

      const start = Math.max(0, index);
      const end = Math.min(lines.length, index + 90);

      for (let i = start; i < end; i++) {
        console.log(`${i + 1}: ${lines[i]}`);
      }
    }

    continue;
  }

  for (let i = 0; i < lines.length; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
