const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
const backupPath = "./prisma/schema.backup-before-inventory-models.prisma";

console.log("Inventory Schema Patch");
console.log("----------------------");

if (!fs.existsSync(schemaPath)) {
  throw new Error(`schema.prisma not found at ${schemaPath}`);
}

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(schemaPath, backupPath);
  console.log(`Backup created: ${backupPath}`);
} else {
  console.log(`Backup already exists: ${backupPath}`);
}

let schema = fs.readFileSync(schemaPath, "utf8");

const inventoryEnums = `
enum InventoryBatchStatus {
  ACTIVE
  DEPLETED
  EXPIRED
  CANCELLED
}

enum InventoryMovementType {
  STOCK_IN
  STOCK_OUT
  ADJUSTMENT_IN
  ADJUSTMENT_OUT
  TRANSFER_IN
  TRANSFER_OUT
  SALE_OUT
  RETURN_IN
  WARRANTY_OUT
  WARRANTY_RETURN
}

enum InventoryMovementSource {
  MANUAL
  PURCHASE
  SALE
  TRANSFER
  RETURN
  WARRANTY
  SERVICE
  SYSTEM
}

enum ItemSerialStatus {
  AVAILABLE
  RESERVED
  SOLD
  RETURNED
  WARRANTY
  DAMAGED
  LOST
}
`.trim();

const branchFields = `
  inventoryBatches   InventoryBatch[]
  inventoryMovements InventoryMovement[]
  itemSerials        ItemSerial[]
`.trimEnd();

const itemFields = `
  inventoryBatches   InventoryBatch[]
  inventoryMovements InventoryMovement[]
  itemSerials        ItemSerial[]
`.trimEnd();

const userFields = `
  createdInventoryBatches   InventoryBatch[]    @relation("InventoryBatchCreatedBy")
  updatedInventoryBatches   InventoryBatch[]    @relation("InventoryBatchUpdatedBy")
  createdInventoryMovements InventoryMovement[] @relation("InventoryMovementCreatedBy")
  updatedInventoryMovements InventoryMovement[] @relation("InventoryMovementUpdatedBy")
  createdItemSerials        ItemSerial[]        @relation("ItemSerialCreatedBy")
  updatedItemSerials        ItemSerial[]        @relation("ItemSerialUpdatedBy")
`.trimEnd();

const inventoryModels = `
model InventoryBatch {
  id String @id @default(cuid())

  batchCode         String
  quantityIn        Decimal @db.Decimal(12, 2)
  quantityAvailable Decimal @default(0) @db.Decimal(12, 2)

  unitCost      Decimal @default(0) @db.Decimal(12, 2)
  sellingPrice1 Decimal @default(0) @db.Decimal(12, 2)
  sellingPrice2 Decimal @default(0) @db.Decimal(12, 2)
  sellingPrice3 Decimal @default(0) @db.Decimal(12, 2)
  sellingPrice4 Decimal @default(0) @db.Decimal(12, 2)
  sellingPrice5 Decimal @default(0) @db.Decimal(12, 2)

  supplierName String?
  referenceNo  String?
  remarks      String?

  receivedAt DateTime  @default(now())
  expiryDate DateTime?

  status InventoryBatchStatus @default(ACTIVE)

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  itemId String
  item   Item @relation(fields: [itemId], references: [id], onDelete: Restrict)

  createdById String?
  createdBy   User?   @relation("InventoryBatchCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy   User?   @relation("InventoryBatchUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  movements InventoryMovement[]
  serials    ItemSerial[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, batchCode])
  @@index([branchId])
  @@index([itemId])
  @@index([branchId, itemId])
  @@index([status])
  @@index([expiryDate])
}

model InventoryMovement {
  id String @id @default(cuid())

  movementCode String

  type   InventoryMovementType
  source InventoryMovementSource @default(MANUAL)

  quantity Decimal @db.Decimal(12, 2)

  previousQuantity Decimal? @db.Decimal(12, 2)
  newQuantity      Decimal? @db.Decimal(12, 2)

  unitCost    Decimal? @db.Decimal(12, 2)
  referenceNo String?
  remarks     String?

  movementDate DateTime @default(now())

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  itemId String
  item   Item @relation(fields: [itemId], references: [id], onDelete: Restrict)

  batchId String?
  batch   InventoryBatch? @relation(fields: [batchId], references: [id], onDelete: SetNull)

  serialId String?
  serial   ItemSerial? @relation(fields: [serialId], references: [id], onDelete: SetNull)

  createdById String?
  createdBy   User?   @relation("InventoryMovementCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy   User?   @relation("InventoryMovementUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, movementCode])
  @@index([branchId])
  @@index([itemId])
  @@index([batchId])
  @@index([serialId])
  @@index([type])
  @@index([source])
  @@index([movementDate])
}

model ItemSerial {
  id String @id @default(cuid())

  serialNumber String
  status       ItemSerialStatus @default(AVAILABLE)

  remarks String?

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  itemId String
  item   Item @relation(fields: [itemId], references: [id], onDelete: Restrict)

  batchId String?
  batch   InventoryBatch? @relation(fields: [batchId], references: [id], onDelete: SetNull)

  createdById String?
  createdBy   User?   @relation("ItemSerialCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy   User?   @relation("ItemSerialUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  movements InventoryMovement[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, serialNumber])
  @@index([branchId])
  @@index([itemId])
  @@index([batchId])
  @@index([status])
}
`.trim();

function insertAfterEnum(text, enumName, insertText) {
  if (text.includes("enum InventoryBatchStatus")) {
    console.log("SKIP: Inventory enums already exist.");
    return text;
  }

  const regex = new RegExp(`(enum\\s+${enumName}\\s*\\{[\\s\\S]*?\\n\\})`);

  if (!regex.test(text)) {
    throw new Error(`Could not find enum ${enumName}`);
  }

  console.log(`ADDED: Inventory enums after enum ${enumName}`);
  return text.replace(regex, `$1\n\n${insertText}`);
}

function insertFieldsInModel(text, modelName, fieldCheck, fieldsToAdd) {
  if (text.includes(fieldCheck)) {
    console.log(`SKIP: ${modelName} inventory relations already exist.`);
    return text;
  }

  const regex = new RegExp(`(model\\s+${modelName}\\s*\\{)([\\s\\S]*?)(\\n\\})`);

  if (!regex.test(text)) {
    throw new Error(`Could not find model ${modelName}`);
  }

  console.log(`ADDED: inventory relations to model ${modelName}`);
  return text.replace(regex, `$1$2\n${fieldsToAdd}$3`);
}

try {
  schema = insertAfterEnum(schema, "CatalogStatus", inventoryEnums);

  schema = insertFieldsInModel(
    schema,
    "Branch",
    "inventoryBatches   InventoryBatch[]",
    branchFields
  );

  schema = insertFieldsInModel(
    schema,
    "Item",
    "inventoryMovements InventoryMovement[]",
    itemFields
  );

  schema = insertFieldsInModel(
    schema,
    "User",
    "createdInventoryBatches",
    userFields
  );

  if (schema.includes("model InventoryBatch")) {
    console.log("SKIP: Inventory models already exist.");
  } else {
    schema = `${schema.trimEnd()}\n\n${inventoryModels}\n`;
    console.log("ADDED: InventoryBatch, InventoryMovement, ItemSerial models.");
  }

  fs.writeFileSync(schemaPath, schema);

  console.log("");
  console.log("DONE: Inventory schema patch applied.");
  console.log("NEXT: run npx prisma format");
} catch (error) {
  console.log("");
  console.log("FAILED: Inventory schema patch failed.");
  console.log(error.message);
  console.log("");
  console.log("Restoring schema backup...");
  fs.copyFileSync(backupPath, schemaPath);
  process.exitCode = 1;
}
