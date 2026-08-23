const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model PurchaseReceiving")) {
  console.log("SKIP: PurchaseReceiving model already exists.");
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

const receivingSchema = `
enum PurchaseReceivingStatus {
  DRAFT
  POSTED
  CANCELLED
}

model PurchaseReceiving {
  id String @id @default(cuid())

  receivingCode String
  status PurchaseReceivingStatus @default(DRAFT)

  receivingDate DateTime @default(now())
  supplierDeliveryNo String?
  supplierInvoiceNo String?
  referenceNo String?

  supplierNameSnapshot String?
  supplierContactSnapshot String?

  notes String?
  internalNotes String?
  cancellationReason String?

  subtotal Decimal @default(0) @db.Decimal(12, 2)
  totalDiscount Decimal @default(0) @db.Decimal(12, 2)
  grandTotal Decimal @default(0) @db.Decimal(12, 2)

  postedAt DateTime?
  cancelledAt DateTime?

  branchId String
  branch Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  supplierId String
  supplier Supplier @relation(fields: [supplierId], references: [id], onDelete: Restrict)

  purchaseOrderId String?
  purchaseOrder PurchaseOrder? @relation(fields: [purchaseOrderId], references: [id], onDelete: SetNull)

  createdById String?
  createdBy User? @relation("PurchaseReceivingCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy User? @relation("PurchaseReceivingUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  postedById String?
  postedBy User? @relation("PurchaseReceivingPostedBy", fields: [postedById], references: [id], onDelete: SetNull)

  cancelledById String?
  cancelledBy User? @relation("PurchaseReceivingCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  items PurchaseReceivingItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, receivingCode])
  @@index([branchId])
  @@index([supplierId])
  @@index([purchaseOrderId])
  @@index([status])
  @@index([receivingDate])
  @@index([createdById])
  @@index([updatedById])
  @@index([postedById])
  @@index([cancelledById])
}

model PurchaseReceivingItem {
  id String @id @default(cuid())

  lineNo Int
  description String

  quantityReceived Decimal @db.Decimal(12, 2)
  unitCost Decimal @default(0) @db.Decimal(12, 2)
  discountAmount Decimal @default(0) @db.Decimal(12, 2)
  lineTotal Decimal @default(0) @db.Decimal(12, 2)

  batchCode String?
  expiryDate DateTime?

  purchaseReceivingId String
  purchaseReceiving PurchaseReceiving @relation(fields: [purchaseReceivingId], references: [id], onDelete: Cascade)

  purchaseOrderItemId String?
  purchaseOrderItem PurchaseOrderItem? @relation(fields: [purchaseOrderItemId], references: [id], onDelete: SetNull)

  itemId String
  item Item @relation(fields: [itemId], references: [id], onDelete: Restrict)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([purchaseReceivingId])
  @@index([purchaseOrderItemId])
  @@index([itemId])
  @@index([batchCode])
  @@index([expiryDate])
}
`;

schema = schema.replace(
  "enum PurchaseOrderStatus {",
  receivingSchema + "\nenum PurchaseOrderStatus {"
);

schema = addLineBeforeModelEnd(schema, "Branch", "purchaseReceivings PurchaseReceiving[]");
schema = addLineBeforeModelEnd(schema, "Supplier", "purchaseReceivings PurchaseReceiving[]");
schema = addLineBeforeModelEnd(schema, "PurchaseOrder", "purchaseReceivings PurchaseReceiving[]");
schema = addLineBeforeModelEnd(schema, "PurchaseOrderItem", "purchaseReceivingItems PurchaseReceivingItem[]");
schema = addLineBeforeModelEnd(schema, "Item", "purchaseReceivingItems PurchaseReceivingItem[]");

schema = addLineBeforeModelEnd(schema, "User", 'createdPurchaseReceivings PurchaseReceiving[] @relation("PurchaseReceivingCreatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'updatedPurchaseReceivings PurchaseReceiving[] @relation("PurchaseReceivingUpdatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'postedPurchaseReceivings PurchaseReceiving[] @relation("PurchaseReceivingPostedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'cancelledPurchaseReceivings PurchaseReceiving[] @relation("PurchaseReceivingCancelledBy")');

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 13F PurchaseReceiving schema patched.");
