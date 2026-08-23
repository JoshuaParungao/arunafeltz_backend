const fs = require("fs");

const filePath = "./src/modules/sales/controllers/sale.controller.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.controller.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("QUOTATION_ALREADY_CONVERTED")) {
  console.log("SKIP: QUOTATION_ALREADY_CONVERTED already exists.");
  process.exit(0);
}

content = content.replace(
  'QUOTATION_NOT_APPROVED: [400, "Quotation must be approved before linking to sale."],',
  'QUOTATION_NOT_APPROVED: [400, "Quotation must be approved before linking to sale."],\n    QUOTATION_ALREADY_CONVERTED: [400, "Quotation is already converted to sale."],'
);

fs.writeFileSync(filePath, content);
console.log("DONE: sale.controller.js patched with QUOTATION_ALREADY_CONVERTED error.");
