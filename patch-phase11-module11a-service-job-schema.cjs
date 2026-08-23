const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model ServiceJob")) {
  console.log("SKIP: ServiceJob model already exists.");
  process.exit(0);
}

const addLineBeforeModelEnd = (content, modelName, line) => {
  const modelStart = content.indexOf(`model ${modelName} {`);

  if (modelStart === -1) {
    throw new Error(`Cannot find model ${modelName}`);
  }

  const nextModel = content.indexOf("\nmodel ", modelStart + 1);
  const nextEnum = content.indexOf("\nenum ", modelStart + 1);

  let blockEnd = content.length;

  if (nextModel !== -1 && nextEnum !== -1) {
    blockEnd = Math.min(nextModel, nextEnum);
  } else if (nextModel !== -1) {
    blockEnd = nextModel;
  } else if (nextEnum !== -1) {
    blockEnd = nextEnum;
  }

  const block = content.slice(modelStart, blockEnd);

  if (block.includes(line.trim())) {
    return content;
  }

  const braceIndex = block.lastIndexOf("}");

  if (braceIndex === -1) {
    throw new Error(`Cannot find closing brace for model ${modelName}`);
  }

  const absoluteBraceIndex = modelStart + braceIndex;

  return content.slice(0, absoluteBraceIndex) + `  ${line}\n` + content.slice(absoluteBraceIndex);
};

const serviceJobSchema = `enum ServiceJobStatus {
  PENDING
  IN_PROGRESS
  READY_FOR_RELEASE
  COMPLETED
  CANCELLED
}

model ServiceJob {
  id String @id @default(cuid())

  jobCode String
  status  ServiceJobStatus @default(PENDING)

  jobTitle           String
  deviceDescription String?
  problemDescription String?
  diagnosis          String?
  serviceNotes       String?

  estimatedServiceCharge Decimal @default(0) @db.Decimal(12, 2)
  finalServiceCharge     Decimal @default(0) @db.Decimal(12, 2)

  receivedAt  DateTime @default(now())
  startedAt   DateTime?
  readyAt     DateTime?
  completedAt DateTime?
  cancelledAt DateTime?

  cancellationReason String?

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  customerId String?
  customer   Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)

  assignedTechnicianId String?
  assignedTechnician   User? @relation("ServiceJobAssignedTechnician", fields: [assignedTechnicianId], references: [id], onDelete: SetNull)

  createdById String?
  createdBy   User? @relation("ServiceJobCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy   User? @relation("ServiceJobUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  cancelledById String?
  cancelledBy   User? @relation("ServiceJobCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, jobCode])
  @@index([branchId])
  @@index([customerId])
  @@index([assignedTechnicianId])
  @@index([status])
  @@index([receivedAt])
  @@index([createdById])
  @@index([updatedById])
  @@index([cancelledById])
}`;

if (!schema.includes("model Branch {")) {
  throw new Error("Cannot find model Branch");
}

schema = schema.replace(
  "model Branch {",
  `${serviceJobSchema}\n\nmodel Branch {`
);

schema = addLineBeforeModelEnd(schema, "Branch", "serviceJobs ServiceJob[]");
schema = addLineBeforeModelEnd(schema, "Customer", "serviceJobs ServiceJob[]");
schema = addLineBeforeModelEnd(schema, "User", 'assignedServiceJobs  ServiceJob[] @relation("ServiceJobAssignedTechnician")');
schema = addLineBeforeModelEnd(schema, "User", 'createdServiceJobs   ServiceJob[] @relation("ServiceJobCreatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'updatedServiceJobs   ServiceJob[] @relation("ServiceJobUpdatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'cancelledServiceJobs ServiceJob[] @relation("ServiceJobCancelledBy")');

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 11 Module 11A ServiceJob schema patched.");
