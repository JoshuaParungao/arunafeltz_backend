const fs = require("fs");

const filePath = "./src/modules/sales/services/sale.service.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  'termBasis: toMoneyString(termBasis),',
  'termBasis: Number(termBasis).toFixed(4),'
);

fs.writeFileSync(filePath, content);

console.log("DONE: termBasis now preserves 4 decimals.");
