const fs = require("fs");

const filePath = "./src/modules/sales/controllers/sale.controller.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.controller.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

const additions = [
  ['BATCH_REQUIRED: [400, "Batch is required for non-serialized inventory item."],', "BATCH_REQUIRED"],
  ['BATCH_NOT_FOUND: [404, "Batch not found for this item and branch."],', "BATCH_NOT_FOUND"],
  ['INSUFFICIENT_BATCH_QUANTITY: [400, "Insufficient batch quantity."],', "INSUFFICIENT_BATCH_QUANTITY"],
  ['SERIAL_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM: [400, "Serial is not allowed for non-serialized item."],', "SERIAL_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM"],
  ['SERIALIZED_SALE_NOT_READY: [400, "Serialized item sale requires serial outbound module."],', "SERIALIZED_SALE_NOT_READY"],
];

for (const [line, key] of additions) {
  if (content.includes(key)) {
    console.log(`SKIP: ${key} already exists.`);
    continue;
  }

  content = content.replace(
    'DISCOUNT_EXCEEDS_LINE_TOTAL: [400, "Discount cannot exceed line total."],',
    `DISCOUNT_EXCEEDS_LINE_TOTAL: [400, "Discount cannot exceed line total."],\n    ${line}`
  );

  console.log(`ADDED: ${key}`);
}

fs.writeFileSync(filePath, content);
console.log("DONE: sale.controller.js patched with stock deduction errors.");
