const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";

let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("HANDOVER_OUT")) {
  console.log("SKIP: HANDOVER_OUT already exists.");
  process.exit(0);
}

const oldEnum = `enum CashTransactionType {
  CASH_IN
  CASH_OUT
  SALE_PAYMENT
  CREDIT_COLLECTION
  ADJUSTMENT_IN
  ADJUSTMENT_OUT
}`;

const newEnum = `enum CashTransactionType {
  CASH_IN
  CASH_OUT
  SALE_PAYMENT
  CREDIT_COLLECTION
  HANDOVER_OUT
  ADJUSTMENT_IN
  ADJUSTMENT_OUT
}`;

if (!schema.includes(oldEnum)) {
  throw new Error("CashTransactionType enum exact block not found. Stop muna.");
}

schema = schema.replace(oldEnum, newEnum);

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Added HANDOVER_OUT to CashTransactionType enum.");
