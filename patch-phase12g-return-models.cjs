const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model ReturnRequest")) {
  console.log("SKIP: ReturnRequest model already exists.");
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

const returnSchema = `
enum ReturnRequestStatus {
  DRAFT
  REQUESTED
  APPROVED
  REJECTED
  COMPLETED
  CANCELLED
}

enum ReturnRefundMethod {
  CASH
  GCASH
  BANK_TRANSFER
  CARD
  STORE_CREDIT
  NONE
}

model ReturnRequest {
  id String @id @default(cuid())

  returnCode String
  status ReturnRequestStatus @default(DRAFT)

  reason String
  notes String?
  internalNotes String?

  refundMethod ReturnRefundMethod @default(NONE)
  totalRefundAmount Decimal @default(0) @db.Decimal(12, 2)

  requestedAt DateTime @default(now())
  approvedAt DateTime?
  rejectedAt DateTime?
  completedAt DateTime?
  cancelledAt DateTime?

  rejectionReason String?
  cancellationReason String?

  branchId String
  branch Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  customerId String?
  customer Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)

  saleId String
  sale Sale @relation(fields: [saleId], references: [id], onDelete: Restrict)

  createdById String?
  createdBy User? @relation("ReturnRequestCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy User? @relation("ReturnRequestUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  approvedById String?
  approvedBy User? @relation("ReturnRequestApprovedBy", fields: [approvedById], references: [id], onDelete: SetNull)

  rejectedById String?
  rejectedBy User? @relation("ReturnRequestRejectedBy", fields: [rejectedById], references: [id], onDelete: SetNull)

  completedById String?
  completedBy User? @relation("ReturnRequestCompletedBy", fields: [completedById], references: [id], onDelete: SetNull)

  cancelledById String?
  cancelledBy User? @relation("ReturnRequestCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  items ReturnItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, returnCode])
  @@index([branchId])
  @@index([customerId])
  @@index([saleId])
  @@index([status])
  @@index([refundMethod])
  @@index([requestedAt])
  @@index([createdById])
  @@index([updatedById])
  @@index([approvedById])
  @@index([rejectedById])
  @@index([completedById])
  @@index([cancelledById])
}

model ReturnItem {
  id String @id @default(cuid())

  lineNo Int
  description String
  reason String?

  quantity Decimal @db.Decimal(12, 2)
  unitRefundAmount Decimal @default(0) @db.Decimal(12, 2)
  lineRefundAmount Decimal @default(0) @db.Decimal(12, 2)

  returnRequestId String
  returnRequest ReturnRequest @relation(fields: [returnRequestId], references: [id], onDelete: Cascade)

  saleItemId String?
  saleItem SaleItem? @relation(fields: [saleItemId], references: [id], onDelete: SetNull)

  itemId String?
  item Item? @relation(fields: [itemId], references: [id], onDelete: SetNull)

  serialId String?
  serial ItemSerial? @relation(fields: [serialId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([returnRequestId])
  @@index([saleItemId])
  @@index([itemId])
  @@index([serialId])
}
`;

schema = schema.replace(
  "enum WarrantyClaimStatus {",
  returnSchema + "\nenum WarrantyClaimStatus {"
);

schema = addLineBeforeModelEnd(schema, "Branch", "returnRequests ReturnRequest[]");
schema = addLineBeforeModelEnd(schema, "Customer", "returnRequests ReturnRequest[]");
schema = addLineBeforeModelEnd(schema, "Sale", "returnRequests ReturnRequest[]");
schema = addLineBeforeModelEnd(schema, "SaleItem", "returnItems ReturnItem[]");
schema = addLineBeforeModelEnd(schema, "Item", "returnItems ReturnItem[]");
schema = addLineBeforeModelEnd(schema, "ItemSerial", "returnItems ReturnItem[]");

schema = addLineBeforeModelEnd(schema, "User", 'createdReturnRequests ReturnRequest[] @relation("ReturnRequestCreatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'updatedReturnRequests ReturnRequest[] @relation("ReturnRequestUpdatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'approvedReturnRequests ReturnRequest[] @relation("ReturnRequestApprovedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'rejectedReturnRequests ReturnRequest[] @relation("ReturnRequestRejectedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'completedReturnRequests ReturnRequest[] @relation("ReturnRequestCompletedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'cancelledReturnRequests ReturnRequest[] @relation("ReturnRequestCancelledBy")');

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 12G ReturnRequest / ReturnItem schema patched.");
