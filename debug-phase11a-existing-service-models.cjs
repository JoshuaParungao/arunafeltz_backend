const fs = require("fs");

const schema = fs.readFileSync("./prisma/schema.prisma", "utf8");

const keywords = [
  "ServiceJob",
  "ServicePayment",
  "ServiceStatus",
  "JobOrder",
  "Repair",
  "Technician",
];

for (const keyword of keywords) {
  console.log(`${keyword}:`, schema.includes(keyword));
}
