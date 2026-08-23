const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";

let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model CashHandover")) {
  console.log("SKIP: CashHandover model already exists.");
  process.exit(0);
}

const addLineBeforeModelEnd = (content, modelName, line) => {
  const modelStart = content.indexOf(`model ${modelName} {`);

  if (modelStart === -1) {
    throw new Error(`Cannot find model ${modelName}`);
  }

  const nextModel = content.indexOf("\nmodel ", modelStart + 1);
  const nextEnum = content.indexOf("\nenum ", modelStart + 1);

  let modelEndSearchEnd = content.length;

  if (nextModel !== -1 && nextEnum !== -1) {
    modelEndSearchEnd = Math.min(nextModel, nextEnum);
  } else if (nextModel !== -1) {
    modelEndSearchEnd = nextModel;
  } else if (nextEnum !== -1) {
    modelEndSearchEnd = nextEnum;
  }

  const modelBlock = content.slice(modelStart, modelEndSearchEnd);

  if (modelBlock.includes(line.trim())) {
    return content;
  }

  const lastBraceIndexInBlock = modelBlock.lastIndexOf("}");

  if (lastBraceIndexInBlock === -1) {
    throw new Error(`Cannot find closing brace for model ${modelName}`);
  }

  const absoluteBraceIndex = modelStart + lastBraceIndexInBlock;

  return (
    content.slice(0, absoluteBraceIndex) +
    `  ${line}\n` +
    content.slice(absoluteBraceIndex)
  );
};

const handoverSchema = `enum CashHandoverStatus {
  PENDING
  RECEIVED
  CANCELLED
}

model CashHandover {
  id String @id @default(cuid())

  handoverCode String
  status       CashHandoverStatus @default(PENDING)

  amount Decimal @db.Decimal(12, 2)

  remarks            String?
  cancellationReason String?

  receivedAt  DateTime?
  cancelledAt DateTime?

  cashBoxId String
  cashBox   CashBox @relation(fields: [cashBoxId], references: [id], onDelete: Restrict)

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  fromUserId String?
  fromUser   User? @relation("CashHandoverFromUser", fields: [fromUserId], references: [id], onDelete: SetNull)

  toUserId String?
  toUser   User? @relation("CashHandoverToUser", fields: [toUserId], references: [id], onDelete: SetNull)

  createdById String?
  createdBy   User? @relation("CashHandoverCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  receivedById String?
  receivedBy   User? @relation("CashHandoverReceivedBy", fields: [receivedById], references: [id], onDelete: SetNull)

  cancelledById String?
  cancelledBy   User? @relation("CashHandoverCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, handoverCode])
  @@index([cashBoxId])
  @@index([branchId])
  @@index([status])
  @@index([fromUserId])
  @@index([toUserId])
  @@index([createdById])
  @@index([receivedById])
  @@index([cancelledById])
}`;

if (!schema.includes("model CashBox {")) {
  throw new Error("Cannot find model CashBox");
}

schema = schema.replace(
  `model CashBox {`,
  `${handoverSchema}\n\nmodel CashBox {`
);

schema = addLineBeforeModelEnd(schema, "Branch", "cashHandovers    CashHandover[]");
schema = addLineBeforeModelEnd(schema, "CashBox", "cashHandovers CashHandover[]");

schema = addLineBeforeModelEnd(schema, "User", 'cashHandoversFrom       CashHandover[] @relation("CashHandoverFromUser")');
schema = addLineBeforeModelEnd(schema, "User", 'cashHandoversTo         CashHandover[] @relation("CashHandoverToUser")');
schema = addLineBeforeModelEnd(schema, "User", 'createdCashHandovers    CashHandover[] @relation("CashHandoverCreatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'receivedCashHandovers   CashHandover[] @relation("CashHandoverReceivedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'cancelledCashHandovers  CashHandover[] @relation("CashHandoverCancelledBy")');

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 10 Module 7A CashHandover schema patched.");
