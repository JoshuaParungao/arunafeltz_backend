const fs = require("fs");
const prisma = require("./src/config/prisma");

const schema = fs.readFileSync("./prisma/schema.prisma", "utf8");

console.log("Schema has enum CashHandoverStatus:", schema.includes("enum CashHandoverStatus"));
console.log("Schema has model CashHandover:", schema.includes("model CashHandover"));
console.log("Prisma client cashHandover:", typeof prisma.cashHandover);
console.log("Prisma client keys containing handover:");
console.log(Object.keys(prisma).filter((key) => key.toLowerCase().includes("handover")));
