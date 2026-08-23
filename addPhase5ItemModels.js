const fs = require("fs");
const path = require("path");

const schemaPath = path.join(__dirname, "prisma", "schema.prisma");
const backupPath = path.join(
  __dirname,
  "prisma",
  "schema.backup-before-phase5-items.prisma"
);

let schema = fs.readFileSync(schemaPath, "utf8");

fs.writeFileSync(backupPath, schema);

if (schema.includes("model Item ")) {
  console.log("Phase 5 item models already exist. No changes applied.");
  process.exit(0);
}

const catalogEnums = `
enum CatalogStatus {
  ACTIVE
  INACTIVE
}
`;

const itemModels = `
model ItemCategory {
  id           String        @id @default(cuid())
  categoryCode String
  name         String
  description  String?
  status       CatalogStatus @default(ACTIVE)

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  createdById String?
  createdBy   User? @relation("ItemCategoryCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy   User? @relation("ItemCategoryUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  items Item[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, categoryCode])
  @@unique([branchId, name])
  @@index([branchId])
  @@index([status])
  @@index([createdById])
  @@index([updatedById])
}

model Unit {
  id          String        @id @default(cuid())
  unitCode    String        @unique
  name        String        @unique
  description String?
  status      CatalogStatus @default(ACTIVE)

  createdById String?
  createdBy   User? @relation("UnitCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy   User? @relation("UnitUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  items Item[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([createdById])
  @@index([updatedById])
}

model Item {
  id          String        @id @default(cuid())
  itemCode    String
  itemName    String
  description String?
  barcode     String?
  brand       String?
  modelName   String?
  status      CatalogStatus @default(ACTIVE)

  isSerialized Boolean @default(false)
  hasWarranty  Boolean @default(false)

  costPrice Decimal @default(0) @db.Decimal(12, 2)
  price1    Decimal @default(0) @db.Decimal(12, 2)
  price2    Decimal @default(0) @db.Decimal(12, 2)
  price3    Decimal @default(0) @db.Decimal(12, 2)
  price4    Decimal @default(0) @db.Decimal(12, 2)
  price5    Decimal @default(0) @db.Decimal(12, 2)

  minimumStock Decimal @default(0) @db.Decimal(12, 2)
  reorderLevel Decimal @default(0) @db.Decimal(12, 2)

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  categoryId String
  category   ItemCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  unitId String
  unit   Unit @relation(fields: [unitId], references: [id], onDelete: Restrict)

  createdById String?
  createdBy   User? @relation("ItemCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy   User? @relation("ItemUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, itemCode])
  @@index([branchId])
  @@index([categoryId])
  @@index([unitId])
  @@index([status])
  @@index([barcode])
  @@index([brand])
  @@index([itemName])
  @@index([isSerialized])
  @@index([hasWarranty])
  @@index([createdById])
  @@index([updatedById])
  @@index([branchId, status])
}
`;

schema = schema.replace("model Branch {", `${catalogEnums}\nmodel Branch {`);

const branchRelationLine = "  businessSettings BusinessSetting[]";
if (schema.includes(branchRelationLine)) {
  schema = schema.replace(
    branchRelationLine,
    `${branchRelationLine}
  itemCategories  ItemCategory[]
  items           Item[]`
  );
} else {
  schema = schema.replace(
    "model Branch {",
    `model Branch {
  itemCategories ItemCategory[]
  items          Item[]`
  );
}

const userRelationLine = '  updatedSettings BusinessSetting[] @relation("SettingUpdatedBy")';
if (schema.includes(userRelationLine)) {
  schema = schema.replace(
    userRelationLine,
    `${userRelationLine}

  createdItemCategories ItemCategory[] @relation("ItemCategoryCreatedBy")
  updatedItemCategories ItemCategory[] @relation("ItemCategoryUpdatedBy")

  createdUnits Unit[] @relation("UnitCreatedBy")
  updatedUnits Unit[] @relation("UnitUpdatedBy")

  createdItems Item[] @relation("ItemCreatedBy")
  updatedItems Item[] @relation("ItemUpdatedBy")`
  );
} else {
  schema = schema.replace(
    "model User {",
    `model User {
  createdItemCategories ItemCategory[] @relation("ItemCategoryCreatedBy")
  updatedItemCategories ItemCategory[] @relation("ItemCategoryUpdatedBy")
  createdUnits          Unit[]         @relation("UnitCreatedBy")
  updatedUnits          Unit[]         @relation("UnitUpdatedBy")
  createdItems          Item[]         @relation("ItemCreatedBy")
  updatedItems          Item[]         @relation("ItemUpdatedBy")`
  );
}

schema = `${schema.trim()}\n\n${itemModels.trim()}\n`;

fs.writeFileSync(schemaPath, schema);

console.log("Phase 5 item models added.");
console.log(`Backup created: ${backupPath}`);
