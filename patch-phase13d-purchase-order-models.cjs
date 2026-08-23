const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model PurchaseOrder")) {
  console.log("SKIP: PurchaseOrder model already exists.");
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

const purchaseOrderSchema = `
enum PurchaseOrderStatus {
  DRAFT
  ORDERED
  PARTIALLY_RECEIVED
  RECEIVED
  CANCELLED
}

model PurchaseOrder {
  id String @id @default(cuid())

  poCode String
  status PurchaseOrderStatus @default(DRAFT)

  orderDate DateTime @default(now())
  expectedDate DateTime?

  supplierNameSnapshot String?
  supplierContactSnapshot String?

  notes String?
  internalNotes String?
  cancellationReason String?

  subtotal Decimal @default(0) @db.Decimal(12, 2)
  totalDiscount Decimal @default(0) @db.Decimal(12, 2)
  grandTotal Decimal @default(0) @db.Decimal(12, 2)

  orderedAt DateTime?
  receivedAt DateTime?
  cancelledAt DateTime?

  branchId String
  branch Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  supplierId String
  supplier Supplier @relation(fields: [supplierId], references: [id], onDelete: Restrict)

  createdById String?
  createdBy User? @relation("PurchaseOrderCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy User? @relation("PurchaseOrderUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  orderedById String?
  orderedBy User? @relation("PurchaseOrderOrderedBy", fields: [orderedById], references: [id], onDelete: SetNull)

  cancelledById String?
  cancelledBy User? @relation("PurchaseOrderCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  items PurchaseOrderItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, poCode])
  @@index([branchId])
  @@index([supplierId])
  @@index([status])
  @@index([orderDate])
  @@index([expectedDate])
  @@index([createdById])
  @@index([updatedById])
  @@index([orderedById])
  @@index([cancelledById])
}

model PurchaseOrderItem {
  id String @id @default(cuid())

  lineNo Int
  description String

  quantity Decimal @db.Decimal(12, 2)
  receivedQuantity Decimal @default(0) @db.Decimal(12, 2)

  unitCost Decimal @default(0) @db.Decimal(12, 2)
  discountAmount Decimal @default(0) @db.Decimal(12, 2)
  lineTotal Decimal @default(0) @db.Decimal(12, 2)

  purchaseOrderId String
  purchaseOrder PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)

  itemId String?
  item Item? @relation(fields: [itemId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([purchaseOrderId])
  @@index([itemId])
}
`;

schema = schema.replace(
  "enum SupplierStatus {",
  purchaseOrderSchema + "\nenum SupplierStatus {"
);

schema = addLineBeforeModelEnd(schema, "Branch", "purchaseOrders PurchaseOrder[]");
schema = addLineBeforeModelEnd(schema, "Supplier", "purchaseOrders PurchaseOrder[]");
schema = addLineBeforeModelEnd(schema, "Item", "purchaseOrderItems PurchaseOrderItem[]");

schema = addLineBeforeModelEnd(schema, "User", 'createdPurchaseOrders PurchaseOrder[] @relation("PurchaseOrderCreatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'updatedPurchaseOrders PurchaseOrder[] @relation("PurchaseOrderUpdatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'orderedPurchaseOrders PurchaseOrder[] @relation("PurchaseOrderOrderedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'cancelledPurchaseOrders PurchaseOrder[] @relation("PurchaseOrderCancelledBy")');

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 13D PurchaseOrder schema patched.");
