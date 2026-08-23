const fs = require("fs");

const testPath = "./phase13-module13h-receiving-stock-in-test.js";
let test = fs.readFileSync(testPath, "utf8");

const oldBlock = `  let item = await prisma.item.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
      isSerialized: false,
    },
  });

  if (!item) {
    throw new Error("No active non-serialized item found for safe 13H stock-in test");
  }

  assert(Boolean(item.id), "Active non-serialized branch item found");`;

const newBlock = `  const category = await prisma.itemCategory.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(category), "Active item category found for test item");

  const unit = await prisma.unit.findFirst({
    where: {
      status: "ACTIVE",
    },
  });

  assert(Boolean(unit), "Active unit found for test item");

  const item = await prisma.item.upsert({
    where: {
      branchId_itemCode: {
        branchId,
        itemCode: "RECSTOCK-13H-ITEM",
      },
    },
    update: {
      itemName: "13H Non-Serialized Stock Test Item",
      status: "ACTIVE",
      isSerialized: false,
      hasWarranty: false,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      categoryId: category.id,
      unitId: unit.id,
      updatedById: adminLogin.user.id,
    },
    create: {
      branchId,
      itemCode: "RECSTOCK-13H-ITEM",
      itemName: "13H Non-Serialized Stock Test Item",
      description: "Temporary test item for Phase 13H receiving stock-in",
      status: "ACTIVE",
      isSerialized: false,
      hasWarranty: false,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      minimumStock: "0",
      reorderLevel: "0",
      categoryId: category.id,
      unitId: unit.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(item.id), "Active non-serialized test item ready");`;

if (!test.includes(oldBlock)) {
  throw new Error("Target item setup block not found. Stop and send current test file.");
}

test = test.replace(oldBlock, newBlock);

fs.writeFileSync(testPath, test);

console.log("DONE: 13H test now creates/uses non-serialized test item.");
