const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
let schema = fs.readFileSync(schemaPath, "utf8");

if (schema.includes("model PurchaseReceivingSerial")) {
  console.log("SKIP: PurchaseReceivingSerial model already exists.");
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

const serialModel = `
model PurchaseReceivingSerial {
  id String @id @default(cuid())

  serialNumber String

  purchaseReceivingItemId String
  purchaseReceivingItem PurchaseReceivingItem @relation(fields: [purchaseReceivingItemId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([purchaseReceivingItemId, serialNumber])
  @@index([purchaseReceivingItemId])
  @@index([serialNumber])
}
`;

schema = schema.replace(
  "model PurchaseOrder {",
  serialModel + "\nmodel PurchaseOrder {"
);

schema = addLineBeforeModelEnd(schema, "PurchaseReceivingItem", "serials PurchaseReceivingSerial[]");

fs.writeFileSync(schemaPath, schema);

console.log("DONE: Phase 13I serialized receiving schema patched.");
