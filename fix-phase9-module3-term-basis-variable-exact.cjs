const fs = require("fs");

const filePath = "./src/modules/sales/services/sale.service.js";

let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  "const termBasis = toMoney(installmentComputation.basisUsed.termBasis);",
  "const termBasis = Number(installmentComputation.basisUsed.termBasis);"
);

fs.writeFileSync(filePath, content);

console.log("DONE: termBasis variable no longer uses toMoney rounding.");
