const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model ServicePayment")) {
  console.log("SKIP: ServicePayment model already exists.");
  process.exit(0);
}

const addLineBeforeModelEnd = (content, modelName, line) => {
  const modelStart = content.indexOf(`model ${modelName} {`);

  if (modelStart === -1) {
    throw new Error(`Cannot find model ${modelName}`);
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

      return content.slice(0, i) + `  ${line}\n` + content.slice(i);
    }
  }

  throw new Error(`Cannot find closing brace for model ${modelName}`);
};

const addEnumValue = (content, enumName, value) => {
  const enumStart = content.indexOf(`enum ${enumName} {`);

  if (enumStart === -1) {
    throw new Error(`Cannot find enum ${enumName}`);
  }

  const firstBrace = content.indexOf("{", enumStart);
  const closingBrace = content.indexOf("}", firstBrace);
  const block = content.slice(enumStart, closingBrace + 1);

  if (block.includes(value)) {
    return content;
  }

  return content.slice(0, closingBrace) + `  ${value}\n` + content.slice(closingBrace);
};

schema = addEnumValue(schema, "CashTransactionType", "SERVICE_PAYMENT");
schema = addEnumValue(schema, "CashTransactionSource", "SERVICE_JOB");

const servicePaymentSchema = `enum ServicePaymentMethod {
  CASH
  GCASH
  BANK_TRANSFER
  CARD
  OTHER
}

enum ServicePaymentStatus {
  POSTED
}

model ServicePayment {
  id String @id @default(cuid())

  paymentCode String
  paymentMethod ServicePaymentMethod
  status ServicePaymentStatus @default(POSTED)

  amount Decimal @db.Decimal(12, 2)
  referenceNo String?
  remarks String?
  paidAt DateTime @default(now())

  serviceJobId String @unique
  serviceJob ServiceJob @relation(fields: [serviceJobId], references: [id], onDelete: Restrict)

  branchId String
  branch Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  customerId String?
  customer Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)

  collectedById String?
  collectedBy User? @relation("ServicePaymentCollectedBy", fields: [collectedById], references: [id], onDelete: SetNull)

  createdById String?
  createdBy User? @relation("ServicePaymentCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, paymentCode])
  @@index([serviceJobId])
  @@index([branchId])
  @@index([customerId])
  @@index([paymentMethod])
  @@index([status])
  @@index([paidAt])
  @@index([collectedById])
  @@index([createdById])
}`;

schema = schema.replace(
  "model ServiceJob {",
  `${servicePaymentSchema}\n\nmodel ServiceJob {`
);

schema = addLineBeforeModelEnd(schema, "ServiceJob", "payment ServicePayment?");
schema = addLineBeforeModelEnd(schema, "Branch", "servicePayments ServicePayment[]");
schema = addLineBeforeModelEnd(schema, "Customer", "servicePayments ServicePayment[]");
schema = addLineBeforeModelEnd(schema, "User", 'collectedServicePayments ServicePayment[] @relation("ServicePaymentCollectedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'createdServicePayments ServicePayment[] @relation("ServicePaymentCreatedBy")');

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 11 Module 11E ServicePayment schema patched.");
