const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";

if (!fs.existsSync(schemaPath)) {
  console.error("schema.prisma not found");
  process.exit(1);
}

let schema = fs.readFileSync(schemaPath, "utf8");

const has = (text) => schema.includes(text);

const addFieldToModel = (modelName, fieldLine, uniqueCheck) => {
  if (schema.includes(uniqueCheck || fieldLine.trim())) {
    console.log(`SKIP: ${modelName} already has ${uniqueCheck || fieldLine.trim()}`);
    return;
  }

  const modelStart = schema.indexOf(`model ${modelName} {`);

  if (modelStart === -1) {
    console.error(`Missing model: ${modelName}`);
    process.exit(1);
  }

  const nextModelStart = schema.indexOf("\nmodel ", modelStart + 1);
  const searchEnd = nextModelStart === -1 ? schema.length : nextModelStart;
  const modelBlock = schema.slice(modelStart, searchEnd);
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

if (!has("enum QuotationStatus")) {
  const enumBlock = `enum QuotationStatus {
  DRAFT
  SENT
  APPROVED
  CONVERTED
  CANCELLED
}

`;

  const firstModelIndex = schema.indexOf("model ");

  if (firstModelIndex === -1) {
    console.error("No Prisma models found.");
    process.exit(1);
  }

  schema = schema.slice(0, firstModelIndex) + enumBlock + schema.slice(firstModelIndex);

  console.log("ADDED: QuotationStatus enum");
} else {
  console.log("SKIP: QuotationStatus enum already exists");
}

if (!has("model Quotation {")) {
  schema += `

model Quotation {
  id String @id @default(cuid())

  quotationCode String
  title String?
  notes String?
  internalNotes String?

  status QuotationStatus @default(DRAFT)

  subtotal Decimal @default(0) @db.Decimal(12, 2)
  totalDiscount Decimal @default(0) @db.Decimal(12, 2)
  grandTotal Decimal @default(0) @db.Decimal(12, 2)

  isPcBuild Boolean @default(false)

  validUntil DateTime?
  sentAt DateTime?
  approvedAt DateTime?
  convertedAt DateTime?
  cancelledAt DateTime?

  branchId String
  branch Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  customerId String?
  customer Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)

  preparedById String?
  preparedBy User? @relation("QuotationPreparedBy", fields: [preparedById], references: [id], onDelete: SetNull)

  createdById String?
  createdBy User? @relation("QuotationCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy User? @relation("QuotationUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  items QuotationItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, quotationCode])
  @@index([branchId])
  @@index([customerId])
  @@index([preparedById])
  @@index([createdById])
  @@index([status])
  @@index([createdAt])
}
`;

  console.log("ADDED: Quotation model");
} else {
  console.log("SKIP: Quotation model already exists");
}

if (!has("model QuotationItem {")) {
  schema += `

model QuotationItem {
  id String @id @default(cuid())

  lineNo Int
  description String
  itemCodeSnapshot String?
  itemNameSnapshot String?
  brandSnapshot String?
  modelSnapshot String?

  priceTier Int
  quantity Decimal @db.Decimal(12, 2)
  unitPrice Decimal @db.Decimal(12, 2)
  discountAmount Decimal @default(0) @db.Decimal(12, 2)
  lineTotal Decimal @db.Decimal(12, 2)

  isPcBuildPart Boolean @default(false)
  remarks String?

  quotationId String
  quotation Quotation @relation(fields: [quotationId], references: [id], onDelete: Cascade)

  itemId String?
  item Item? @relation(fields: [itemId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([quotationId])
  @@index([itemId])
  @@index([priceTier])
}
`;

  console.log("ADDED: QuotationItem model");
} else {
  console.log("SKIP: QuotationItem model already exists");
}

addFieldToModel("Branch", "quotations Quotation[]", "quotations Quotation[]");
addFieldToModel("Customer", "quotations Quotation[]", "quotations Quotation[]");
addFieldToModel("Item", "quotationItems QuotationItem[]", "quotationItems QuotationItem[]");

addFieldToModel("User", 'preparedQuotations Quotation[] @relation("QuotationPreparedBy")', "preparedQuotations Quotation[]");
addFieldToModel("User", 'createdQuotations Quotation[] @relation("QuotationCreatedBy")', "createdQuotations Quotation[]");
addFieldToModel("User", 'updatedQuotations Quotation[] @relation("QuotationUpdatedBy")', "updatedQuotations Quotation[]");

fs.writeFileSync(schemaPath, schema);
console.log("DONE: schema.prisma patched for Phase 7 quotation models.");
