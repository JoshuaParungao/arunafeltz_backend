const fs = require("fs");

const schema = fs.readFileSync("./prisma/schema.prisma", "utf8");

const keywords = [
  "Warranty",
  "WarrantyClaim",
  "WarrantyStatus",
  "WarrantyIn",
  "WarrantyOut",
  "Return",
  "Refund",
  "DeliveryReceipt",
  "DR",
];

for (const keyword of keywords) {
  console.log(`${keyword}:`, schema.includes(keyword));
}
