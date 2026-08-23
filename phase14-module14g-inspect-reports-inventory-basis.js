const fs = require("fs");

const files = [
  "src/constants/permissions.js",
  "src/routes/api.routes.js",
  "src/modules/inventory/routes/inventory.routes.js",
  "src/modules/inventory/services/inventory.service.js",
  "prisma/schema.prisma",
];

console.log("\nPHASE 14G INSPECT: Reports Foundation / Inventory Report Basis");
console.log("==============================================================");

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
      "model InventoryBatch ",
      "model InventoryMovement ",
      "model Item ",
      "model Branch ",
      "enum InventoryBatchStatus",
      "enum InventoryMovementType",
      "enum InventoryMovementSource",
    ];

    for (const keyword of keywords) {
      const index = lines.findIndex((line) => line.includes(keyword));

      console.log(`\n--- ${keyword} ---`);

      if (index === -1) {
        console.log("[MISSING]");
        continue;
      }

      const start = Math.max(0, index);
      const end = Math.min(lines.length, index + 95);

      for (let i = start; i < end; i++) {
        console.log(`${i + 1}: ${lines[i]}`);
      }
    }

    continue;
  }

  const maxLines = Math.min(lines.length, 220);

  for (let i = 0; i < maxLines; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }

  if (lines.length > maxLines) {
    console.log(`... truncated, total lines: ${lines.length}`);
  }
}
