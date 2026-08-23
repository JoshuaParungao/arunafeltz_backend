const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model Supplier")) {
  console.log("SKIP: Supplier model already exists.");
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

const supplierSchema = `
enum SupplierStatus {
  ACTIVE
  INACTIVE
}

model Supplier {
  id String @id @default(cuid())

  supplierCode String
  name String
  contactPerson String?
  contactNo String?
  email String?
  address String?
  tin String?
  notes String?

  status SupplierStatus @default(ACTIVE)

  branchId String?
  branch Branch? @relation(fields: [branchId], references: [id], onDelete: SetNull)

  createdById String?
  createdBy User? @relation("SupplierCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy User? @relation("SupplierUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, supplierCode])
  @@index([branchId])
  @@index([name])
  @@index([status])
  @@index([createdById])
  @@index([updatedById])
}
`;

schema = schema.replace(
  "enum DeliveryReceiptStatus {",
  supplierSchema + "\nenum DeliveryReceiptStatus {"
);

schema = addLineBeforeModelEnd(schema, "Branch", "suppliers Supplier[]");
schema = addLineBeforeModelEnd(schema, "User", 'createdSuppliers Supplier[] @relation("SupplierCreatedBy")');
schema = addLineBeforeModelEnd(schema, "User", 'updatedSuppliers Supplier[] @relation("SupplierUpdatedBy")');

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 13B Supplier schema patched.");
