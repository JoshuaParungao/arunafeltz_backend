const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";

if (!fs.existsSync(schemaPath)) {
  console.error("schema.prisma not found");
  process.exit(1);
}

let schema = fs.readFileSync(schemaPath, "utf8");

const addEnumBeforeFirstModel = (enumName, enumBlock) => {
  if (schema.includes(`enum ${enumName}`)) {
    console.log(`SKIP: ${enumName} already exists.`);
    return;
  }

  const firstModelIndex = schema.indexOf("model ");

  if (firstModelIndex === -1) {
    console.error("No Prisma models found.");
    process.exit(1);
  }

  schema = schema.slice(0, firstModelIndex) + enumBlock + "\n\n" + schema.slice(firstModelIndex);
  console.log(`ADDED: ${enumName}`);
};

const addModel = (modelName, modelBlock) => {
  if (schema.includes(`model ${modelName} {`)) {
    console.log(`SKIP: ${modelName} already exists.`);
    return;
  }

  schema += "\n\n" + modelBlock + "\n";
  console.log(`ADDED: ${modelName} model`);
};

const addFieldToSpecificModel = (modelName, fieldLine) => {
  const modelStart = schema.indexOf(`model ${modelName} {`);

  if (modelStart === -1) {
    console.error(`Missing model: ${modelName}`);
    process.exit(1);
  }

  const nextModelStart = schema.indexOf("\nmodel ", modelStart + 1);
  const searchEnd = nextModelStart === -1 ? schema.length : nextModelStart;
  const modelBlock = schema.slice(modelStart, searchEnd);

  if (modelBlock.includes(fieldLine.trim())) {
    console.log(`SKIP: ${modelName} already has ${fieldLine.trim()}`);
    return;
  }

  const lastBraceIndexInBlock = modelBlock.lastIndexOf("}");

  if (lastBraceIndexInBlock === -1) {
    console.error(`Invalid model block: ${modelName}`);
    process.exit(1);
  }

  const absoluteInsertIndex = modelStart + lastBraceIndexInBlock;

  schema =
    schema.slice(0, absoluteInsertIndex) +
    `  ${fieldLine}\n` +
    schema.slice(absoluteInsertIndex);

  console.log(`ADDED: ${fieldLine} to ${modelName}`);
};

addEnumBeforeFirstModel(
  "SaleStatus",
  `enum SaleStatus {
  COMPLETED
  CANCELLED
  REFUNDED
  PARTIALLY_REFUNDED
}`
);

addEnumBeforeFirstModel(
  "SalePaymentMethod",
  `enum SalePaymentMethod {
  CASH
  GCASH
  BANK_TRANSFER
  CARD
  CREDIT
  OTHER
}`
);

addEnumBeforeFirstModel(
  "SalePaymentStatus",
  `enum SalePaymentStatus {
  PAID
  PARTIALLY_PAID
  UNPAID
  REFUNDED
}`
);

addModel(
  "Sale",
  `model Sale {
  id String @id @default(cuid())

  receiptCode String
  status SaleStatus @default(COMPLETED)
  paymentStatus SalePaymentStatus @default(PAID)

  saleDate DateTime @default(now())

  subtotal Decimal @default(0) @db.Decimal(12, 2)
  totalDiscount Decimal @default(0) @db.Decimal(12, 2)
  serviceCharge Decimal @default(0) @db.Decimal(12, 2)
  grandTotal Decimal @default(0) @db.Decimal(12, 2)
  amountPaid Decimal @default(0) @db.Decimal(12, 2)
  changeAmount Decimal @default(0) @db.Decimal(12, 2)

  remarks String?
  cancellationReason String?
  cancelledAt DateTime?

  branchId String
  branch Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  customerId String?
  customer Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)

  quotationId String?
  quotation Quotation? @relation(fields: [quotationId], references: [id], onDelete: SetNull)

  cashierId String?
  cashier User? @relation("SaleCashier", fields: [cashierId], references: [id], onDelete: SetNull)

  createdById String?
  createdBy User? @relation("SaleCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy User? @relation("SaleUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  cancelledById String?
  cancelledBy User? @relation("SaleCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  items SaleItem[]
  payments SalePayment[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, receiptCode])
  @@index([branchId])
  @@index([customerId])
  @@index([quotationId])
  @@index([cashierId])
  @@index([status])
  @@index([paymentStatus])
  @@index([saleDate])
}`
);

addModel(
  "SaleItem",
  `model SaleItem {
  id String @id @default(cuid())

  lineNo Int
  description String

  itemCodeSnapshot String?
  itemNameSnapshot String?
  brandSnapshot String?
  modelSnapshot String?

  priceTier Int?
  quantity Decimal @db.Decimal(12, 2)
  unitPrice Decimal @db.Decimal(12, 2)
  discountAmount Decimal @default(0) @db.Decimal(12, 2)
  lineTotal Decimal @db.Decimal(12, 2)

  saleId String
  sale Sale @relation(fields: [saleId], references: [id], onDelete: Cascade)

  itemId String?
  item Item? @relation(fields: [itemId], references: [id], onDelete: SetNull)

  batchId String?
  batch InventoryBatch? @relation(fields: [batchId], references: [id], onDelete: SetNull)

  serialId String?
  serial ItemSerial? @relation(fields: [serialId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([saleId])
  @@index([itemId])
  @@index([batchId])
  @@index([serialId])
}`
);

addModel(
  "SalePayment",
  `model SalePayment {
  id String @id @default(cuid())

  paymentMethod SalePaymentMethod
  amount Decimal @db.Decimal(12, 2)
  referenceNo String?
  remarks String?
  paidAt DateTime @default(now())

  saleId String
  sale Sale @relation(fields: [saleId], references: [id], onDelete: Cascade)

  createdById String?
  createdBy User? @relation("SalePaymentCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([saleId])
  @@index([paymentMethod])
  @@index([paidAt])
}`
);

addFieldToSpecificModel("Branch", "sales Sale[]");
addFieldToSpecificModel("Customer", "sales Sale[]");
addFieldToSpecificModel("Quotation", "sales Sale[]");
addFieldToSpecificModel("Item", "saleItems SaleItem[]");
addFieldToSpecificModel("InventoryBatch", "saleItems SaleItem[]");
addFieldToSpecificModel("ItemSerial", "saleItems SaleItem[]");

addFieldToSpecificModel("User", 'cashierSales Sale[] @relation("SaleCashier")');
addFieldToSpecificModel("User", 'createdSales Sale[] @relation("SaleCreatedBy")');
addFieldToSpecificModel("User", 'updatedSales Sale[] @relation("SaleUpdatedBy")');
addFieldToSpecificModel("User", 'cancelledSales Sale[] @relation("SaleCancelledBy")');
addFieldToSpecificModel("User", 'createdSalePayments SalePayment[] @relation("SalePaymentCreatedBy")');

fs.writeFileSync(schemaPath, schema);
console.log("DONE: schema.prisma patched for Phase 8 sales models.");
