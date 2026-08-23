const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model WarrantyClaim")) {
  console.log("SKIP: WarrantyClaim model already exists.");
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

const warrantySchema = `
enum WarrantyClaimStatus {
  IN
  CHECKING
  SENT_TO_SUPPLIER
  APPROVED
  REJECTED
  REPAIRED
  REPLACED
  OUT
}

model WarrantyClaim {
  id String @id @default(cuid())

  claimCode String
  status WarrantyClaimStatus @default(IN)

  issueDescription String
  customerComplaint String?
  diagnosis String?
  actionTaken String?
  supplierName String?
  supplierReferenceNo String?
  remarks String?

  receivedAt DateTime @default(now())
  checkingAt DateTime?
  sentToSupplierAt DateTime?
  approvedAt DateTime?
  rejectedAt DateTime?
  repairedAt DateTime?
  replacedAt DateTime?
  releasedAt DateTime?

  branchId String
  branch Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  customerId String?
  customer Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)

  itemId String?
  item Item? @relation(fields: [itemId], references: [id], onDelete: SetNull)

  serialId String?
  serial ItemSerial? @relation(fields: [serialId], references: [id], onDelete: SetNull)

  saleId String?
  sale Sale? @relation(fields: [saleId], references: [id], onDelete: SetNull)

  saleItemId String?
  saleItem SaleItem? @relation(fields: [saleItemId], references: [id], onDelete: SetNull)

  createdById String?
  createdBy User? @relation("WarrantyClaimCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy User? @relation("WarrantyClaimUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  statusUpdatedById String?
  statusUpdatedBy User? @relation("WarrantyClaimStatusUpdatedBy", fields: [statusUpdatedById], references: [id], onDelete: SetNull)

  releasedById String?
  releasedBy User? @relation("WarrantyClaimReleasedBy", fields: [releasedById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, claimCode])
  @@index([branchId])
  @@index([customerId])
  @@index([itemId])
  @@index([serialId])
  @@index([saleId])
  @@index([saleItemId])
  @@index([status])
  @@index([receivedAt])
  @@index([createdById])
  @@index([updatedById])
  @@index([statusUpdatedById])
  @@index([releasedById])
}
`;

schema = schema.replace(
  "model ServicePayment {",
  warrantySchema + "\nmodel ServicePayment {"
);

schema = addLineBeforeModelEnd(schema, "Branch", "warrantyClaims WarrantyClaim[]");
schema = addLineBeforeModelEnd(schema, "Customer", "warrantyClaims WarrantyClaim[]");
schema = addLineBeforeModelEnd(schema, "Item", "warrantyClaims WarrantyClaim[]");
schema = addLineBeforeModelEnd(schema, "ItemSerial", "warrantyClaims WarrantyClaim[]");
schema = addLineBeforeModelEnd(schema, "Sale", "warrantyClaims WarrantyClaim[]");
schema = addLineBeforeModelEnd(schema, "SaleItem", "warrantyClaims WarrantyClaim[]");

schema = addLineBeforeModelEnd(schema, "User", 'createdWarrantyClaims WarrantyClaim[] @relation("WarrantyClaimCreatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'updatedWarrantyClaims WarrantyClaim[] @relation("WarrantyClaimUpdatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'statusUpdatedWarrantyClaims WarrantyClaim[] @relation("WarrantyClaimStatusUpdatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'releasedWarrantyClaims WarrantyClaim[] @relation("WarrantyClaimReleasedBy")');

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 12A WarrantyClaim schema patched.");
