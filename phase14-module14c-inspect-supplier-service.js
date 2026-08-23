const fs = require("fs");

const file = "src/modules/suppliers/services/supplier.service.js";

if (!fs.existsSync(file)) {
  console.error("Supplier service not found");
  process.exit(1);
}

const content = fs.readFileSync(file, "utf8");
const lines = content.split(/\r?\n/);

const keywords = [
  "const createSupplier",
  "const updateSupplierById",
  "const updateSupplierStatusById",
  "module.exports",
];

console.log("\nPHASE 14C SUPPLIER SERVICE FUNCTION INSPECT");
console.log("===========================================");

for (const keyword of keywords) {
  const index = lines.findIndex((line) => line.includes(keyword));

  console.log(`\n--- ${keyword} ---`);

  if (index === -1) {
    console.log("[MISSING]");
    continue;
  }

  const start = Math.max(0, index - 8);
  const end = Math.min(lines.length, index + 90);

  for (let i = start; i < end; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
