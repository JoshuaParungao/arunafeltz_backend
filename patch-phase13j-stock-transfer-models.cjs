const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model StockTransfer")) {
  console.log("SKIP: StockTransfer model already exists.");
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

const stockTransferSchema = `
enum StockTransferStatus {
  DRAFT
  REQUESTED
  APPROVED
  REJECTED
  POSTED
  CANCELLED
}

model StockTransfer {
  id String @id @default(cuid())

  transferCode String
  status StockTransferStatus @default(DRAFT)

  transferDate DateTime @default(now())
  requestedAt DateTime?
  approvedAt DateTime?
  rejectedAt DateTime?
  postedAt DateTime?
  cancelledAt DateTime?

  notes String?
  internalNotes String?
  rejectionReason String?
  cancellationReason String?

  fromBranchId String
  fromBranch Branch @relation("StockTransferFromBranch", fields: [fromBranchId], references: [id], onDelete: Restrict)

  toBranchId String
  toBranch Branch @relation("StockTransferToBranch", fields: [toBranchId], references: [id], onDelete: Restrict)

  requestedById String?
  requestedBy User? @relation("StockTransferRequestedBy", fields: [requestedById], references: [id], onDelete: SetNull)

  approvedById String?
  approvedBy User? @relation("StockTransferApprovedBy", fields: [approvedById], references: [id], onDelete: SetNull)

  rejectedById String?
  rejectedBy User? @relation("StockTransferRejectedBy", fields: [rejectedById], references: [id], onDelete: SetNull)

  postedById String?
  postedBy User? @relation("StockTransferPostedBy", fields: [postedById], references: [id], onDelete: SetNull)

  cancelledById String?
  cancelledBy User? @relation("StockTransferCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  createdById String?
  createdBy User? @relation("StockTransferCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy User? @relation("StockTransferUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  items StockTransferItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([fromBranchId, transferCode])
  @@index([fromBranchId])
  @@index([toBranchId])
  @@index([status])
  @@index([transferDate])
  @@index([requestedById])
  @@index([approvedById])
  @@index([rejectedById])
  @@index([postedById])
  @@index([cancelledById])
  @@index([createdById])
  @@index([updatedById])
}

model StockTransferItem {
  id String @id @default(cuid())

  lineNo Int
  description String

  quantity Decimal @db.Decimal(12, 2)

  stockTransferId String
  stockTransfer StockTransfer @relation(fields: [stockTransferId], references: [id], onDelete: Cascade)

  itemId String
  item Item @relation(fields: [itemId], references: [id], onDelete: Restrict)

  fromBatchId String?
  fromBatch InventoryBatch? @relation("StockTransferItemFromBatch", fields: [fromBatchId], references: [id], onDelete: SetNull)

  serials StockTransferSerial[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([stockTransferId])
  @@index([itemId])
  @@index([fromBatchId])
}

model StockTransferSerial {
  id String @id @default(cuid())

  serialNumberSnapshot String

  stockTransferItemId String
  stockTransferItem StockTransferItem @relation(fields: [stockTransferItemId], references: [id], onDelete: Cascade)

  itemSerialId String
  itemSerial ItemSerial @relation(fields: [itemSerialId], references: [id], onDelete: Restrict)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([stockTransferItemId, itemSerialId])
  @@index([stockTransferItemId])
  @@index([itemSerialId])
  @@index([serialNumberSnapshot])
}
`;

schema = schema.replace(
  "enum PurchaseReceivingStatus {",
  stockTransferSchema + "\nenum PurchaseReceivingStatus {"
);

schema = addLineBeforeModelEnd(schema, "Branch", 'stockTransfersFrom StockTransfer[] @relation("StockTransferFromBranch")');
schema = addLineBeforeModelEnd(schema, "Branch", 'stockTransfersTo StockTransfer[] @relation("StockTransferToBranch")');

schema = addLineBeforeModelEnd(schema, "User", 'requestedStockTransfers StockTransfer[] @relation("StockTransferRequestedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'approvedStockTransfers StockTransfer[] @relation("StockTransferApprovedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'rejectedStockTransfers StockTransfer[] @relation("StockTransferRejectedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'postedStockTransfers StockTransfer[] @relation("StockTransferPostedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'cancelledStockTransfers StockTransfer[] @relation("StockTransferCancelledBy")');
schema = addLineBeforeModelEnd(schema, "User", 'createdStockTransfers StockTransfer[] @relation("StockTransferCreatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'updatedStockTransfers StockTransfer[] @relation("StockTransferUpdatedBy")');

schema = addLineBeforeModelEnd(schema, "Item", "stockTransferItems StockTransferItem[]");
schema = addLineBeforeModelEnd(schema, "InventoryBatch", 'stockTransferItemsFrom StockTransferItem[] @relation("StockTransferItemFromBatch")');
schema = addLineBeforeModelEnd(schema, "ItemSerial", "stockTransferSerials StockTransferSerial[]");

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 13J StockTransfer schema patched.");
