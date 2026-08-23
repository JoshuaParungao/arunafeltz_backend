const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model DeliveryReceipt")) {
  console.log("SKIP: DeliveryReceipt model already exists.");
  process.exit(0);
}

const addLineBeforeModelEnd = (content, modelName, line) => {
  const target = `model ${modelName} {`;
  const modelStart = content.indexOf(target);

  if (modelStart === -1) {
    throw new Error("Cannot find " + target);
  }

  const firstBrace = content.indexOf("{", modelStart);
  let depth = 0;

  for (let i = firstBrace; i < content.length; i += 1) {
    if (content[i] === "{") depth += 1;
    if (content[i] === "}") depth -= 1;

    if (depth === 0) {
      const block = content.slice(modelStart, i + 1);

      if (block.includes(line.trim())) {
        return content;
      }

      return content.slice(0, i) + "  " + line + "\n" + content.slice(i);
    }
  }

  throw new Error("Cannot find closing brace for model " + modelName);
};

const deliveryReceiptSchema = `
enum DeliveryReceiptStatus {
  DRAFT
  ISSUED
  CANCELLED
}

model DeliveryReceipt {
  id String @id @default(cuid())

  drCode String
  status DeliveryReceiptStatus @default(DRAFT)

  drDate DateTime @default(now())

  customerName String?
  customerAddress String?
  customerContactNo String?

  preparedByName String?
  receivedByName String?

  notes String?
  internalNotes String?

  subtotal Decimal @default(0) @db.Decimal(12, 2)
  totalDiscount Decimal @default(0) @db.Decimal(12, 2)
  grandTotal Decimal @default(0) @db.Decimal(12, 2)

  issuedAt DateTime?
  cancelledAt DateTime?
  cancellationReason String?

  branchId String
  branch Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  saleId String @unique
  sale Sale @relation(fields: [saleId], references: [id], onDelete: Restrict)

  createdById String?
  createdBy User? @relation("DeliveryReceiptCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy User? @relation("DeliveryReceiptUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  issuedById String?
  issuedBy User? @relation("DeliveryReceiptIssuedBy", fields: [issuedById], references: [id], onDelete: SetNull)

  cancelledById String?
  cancelledBy User? @relation("DeliveryReceiptCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  items DeliveryReceiptItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, drCode])
  @@index([branchId])
  @@index([saleId])
  @@index([status])
  @@index([drDate])
  @@index([createdById])
  @@index([updatedById])
  @@index([issuedById])
  @@index([cancelledById])
}

model DeliveryReceiptItem {
  id String @id @default(cuid())

  lineNo Int

  itemCodeSnapshot String?
  itemDescription String
  quantity Decimal @db.Decimal(12, 2)
  cashDiscountedPrice Decimal @default(0) @db.Decimal(12, 2)
  amount Decimal @default(0) @db.Decimal(12, 2)

  deliveryReceiptId String
  deliveryReceipt DeliveryReceipt @relation(fields: [deliveryReceiptId], references: [id], onDelete: Cascade)

  saleItemId String?
  saleItem SaleItem? @relation(fields: [saleItemId], references: [id], onDelete: SetNull)

  itemId String?
  item Item? @relation(fields: [itemId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([deliveryReceiptId])
  @@index([saleItemId])
  @@index([itemId])
}
`;

schema = schema.replace(
  "enum ReturnRequestStatus {",
  deliveryReceiptSchema + "\nenum ReturnRequestStatus {"
);

schema = addLineBeforeModelEnd(schema, "Branch", "deliveryReceipts DeliveryReceipt[]");
schema = addLineBeforeModelEnd(schema, "Sale", "deliveryReceipt DeliveryReceipt?");
schema = addLineBeforeModelEnd(schema, "SaleItem", "deliveryReceiptItems DeliveryReceiptItem[]");
schema = addLineBeforeModelEnd(schema, "Item", "deliveryReceiptItems DeliveryReceiptItem[]");

schema = addLineBeforeModelEnd(schema, "User", 'createdDeliveryReceipts DeliveryReceipt[] @relation("DeliveryReceiptCreatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'updatedDeliveryReceipts DeliveryReceipt[] @relation("DeliveryReceiptUpdatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'issuedDeliveryReceipts DeliveryReceipt[] @relation("DeliveryReceiptIssuedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'cancelledDeliveryReceipts DeliveryReceipt[] @relation("DeliveryReceiptCancelledBy")');

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 12H DeliveryReceipt / DeliveryReceiptItem schema patched.");
