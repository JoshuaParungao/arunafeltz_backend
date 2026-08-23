const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";

let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model CashBox") || schema.includes("model CashTransaction")) {
  console.log("SKIP: CashBox/CashTransaction models already exist.");
  process.exit(0);
}

const insertBeforeModel = (content, modelName, insertion) => {
  const marker = `model ${modelName} {`;

  if (!content.includes(marker)) {
    throw new Error(`Cannot find ${marker}`);
  }

  return content.replace(marker, `${insertion}\n\n${marker}`);
};

const addLineBeforeModelEnd = (content, modelName, line) => {
  const modelStart = content.indexOf(`model ${modelName} {`);

  if (modelStart === -1) {
    throw new Error(`Cannot find model ${modelName}`);
  }

  const nextModel = content.indexOf("\nmodel ", modelStart + 1);
  const modelEndSearchEnd = nextModel === -1 ? content.length : nextModel;
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

const cashEnums = `enum CashBoxStatus {
  ACTIVE
  INACTIVE
}

enum CashTransactionType {
  CASH_IN
  CASH_OUT
  SALE_PAYMENT
  CREDIT_COLLECTION
  ADJUSTMENT_IN
  ADJUSTMENT_OUT
}

enum CashTransactionStatus {
  POSTED
  CANCELLED
}

enum CashTransactionSource {
  MANUAL
  SALE
  CREDIT_COLLECTION
  SYSTEM_ADJUSTMENT
}`;

const cashModels = `${cashEnums}

model CashBox {
  id String @id @default(cuid())

  boxCode String
  name    String
  status  CashBoxStatus @default(ACTIVE)

  currentBalance Decimal @default(0) @db.Decimal(12, 2)
  remarks        String?

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  createdById String?
  createdBy   User? @relation("CashBoxCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy   User? @relation("CashBoxUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  transactions CashTransaction[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, boxCode])
  @@index([branchId])
  @@index([status])
  @@index([createdById])
  @@index([updatedById])
}

model CashTransaction {
  id String @id @default(cuid())

  transactionCode String
  type            CashTransactionType
  status          CashTransactionStatus @default(POSTED)
  source          CashTransactionSource @default(MANUAL)

  amount        Decimal @db.Decimal(12, 2)
  balanceBefore Decimal @db.Decimal(12, 2)
  balanceAfter  Decimal @db.Decimal(12, 2)

  description String
  referenceNo String?
  sourceId    String?
  sourceCode  String?

  transactionDate DateTime @default(now())

  cancelledAt        DateTime?
  cancellationReason String?

  cashBoxId String
  cashBox   CashBox @relation(fields: [cashBoxId], references: [id], onDelete: Restrict)

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  createdById String?
  createdBy   User? @relation("CashTransactionCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  cancelledById String?
  cancelledBy   User? @relation("CashTransactionCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, transactionCode])
  @@index([cashBoxId])
  @@index([branchId])
  @@index([type])
  @@index([status])
  @@index([source])
  @@index([transactionDate])
  @@index([createdById])
  @@index([cancelledById])
}`;

schema = insertBeforeModel(schema, "CreditAccount", cashModels);

schema = addLineBeforeModelEnd(schema, "Branch", "cashBoxes        CashBox[]");
schema = addLineBeforeModelEnd(schema, "Branch", "cashTransactions CashTransaction[]");

schema = addLineBeforeModelEnd(schema, "User", 'createdCashBoxes              CashBox[]          @relation("CashBoxCreatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'updatedCashBoxes              CashBox[]          @relation("CashBoxUpdatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'createdCashTransactions        CashTransaction[] @relation("CashTransactionCreatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'cancelledCashTransactions      CashTransaction[] @relation("CashTransactionCancelledBy")');

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 10 Module 1 Prisma schema patched.");
