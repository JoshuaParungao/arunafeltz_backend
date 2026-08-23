require("../src/config/env");

const prisma = require("../src/config/prisma");

async function getRequiredBranchByCode(code) {
  const branch = await prisma.branch.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  if (!branch) {
    throw new Error(`Required branch not found: ${code}`);
  }

  if (branch.status !== "ACTIVE") {
    throw new Error(`Required branch is not active: ${code}`);
  }

  return branch;
}

async function getRequiredUserByUsername(username) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      status: true,
    },
  });

  if (!user) {
    throw new Error(`Required user not found: ${username}`);
  }

  if (user.status !== "ACTIVE") {
    throw new Error(`Required user is not active: ${username}`);
  }

  return user;
}

async function upsertUnit(unit, userId) {
  return prisma.unit.upsert({
    where: {
      unitCode: unit.unitCode,
    },
    update: {
      name: unit.name,
      description: unit.description,
      status: "ACTIVE",
      updatedById: userId,
    },
    create: {
      unitCode: unit.unitCode,
      name: unit.name,
      description: unit.description,
      status: "ACTIVE",
      createdById: userId,
      updatedById: userId,
    },
    select: {
      id: true,
      unitCode: true,
      name: true,
      status: true,
    },
  });
}

async function upsertCategory(category, branchId, userId) {
  return prisma.itemCategory.upsert({
    where: {
      branchId_categoryCode: {
        branchId,
        categoryCode: category.categoryCode,
      },
    },
    update: {
      name: category.name,
      description: category.description,
      status: "ACTIVE",
      updatedById: userId,
    },
    create: {
      categoryCode: category.categoryCode,
      name: category.name,
      description: category.description,
      status: "ACTIVE",
      branchId,
      createdById: userId,
      updatedById: userId,
    },
    select: {
      id: true,
      categoryCode: true,
      name: true,
      status: true,
      branch: {
        select: {
          code: true,
        },
      },
    },
  });
}

async function upsertItem(item, branchId, categoryId, unitId, userId) {
  return prisma.item.upsert({
    where: {
      branchId_itemCode: {
        branchId,
        itemCode: item.itemCode,
      },
    },
    update: {
      itemName: item.itemName,
      description: item.description,
      barcode: item.barcode,
      brand: item.brand,
      modelName: item.modelName,
      status: "ACTIVE",
      isSerialized: item.isSerialized,
      hasWarranty: item.hasWarranty,
      costPrice: item.costPrice,
      price1: item.price1,
      price2: item.price2,
      price3: item.price3,
      price4: item.price4,
      price5: item.price5,
      minimumStock: item.minimumStock,
      reorderLevel: item.reorderLevel,
      categoryId,
      unitId,
      updatedById: userId,
    },
    create: {
      itemCode: item.itemCode,
      itemName: item.itemName,
      description: item.description,
      barcode: item.barcode,
      brand: item.brand,
      modelName: item.modelName,
      status: "ACTIVE",
      isSerialized: item.isSerialized,
      hasWarranty: item.hasWarranty,
      costPrice: item.costPrice,
      price1: item.price1,
      price2: item.price2,
      price3: item.price3,
      price4: item.price4,
      price5: item.price5,
      minimumStock: item.minimumStock,
      reorderLevel: item.reorderLevel,
      branchId,
      categoryId,
      unitId,
      createdById: userId,
      updatedById: userId,
    },
    select: {
      id: true,
      itemCode: true,
      itemName: true,
      status: true,
      branch: {
        select: {
          code: true,
        },
      },
      category: {
        select: {
          categoryCode: true,
          name: true,
        },
      },
      unit: {
        select: {
          unitCode: true,
        },
      },
    },
  });
}

async function main() {
  const mainBranch = await getRequiredBranchByCode("MAIN");
  const mabBranch = await getRequiredBranchByCode("MAB");

  const superOwner = await getRequiredUserByUsername("superowner");
  const mainAdmin = await getRequiredUserByUsername("mainadmin");

  const units = [
    {
      unitCode: "PCS",
      name: "Pieces",
      description: "Default unit for individual products.",
    },
    {
      unitCode: "SET",
      name: "Set",
      description: "Unit for bundled items or complete sets.",
    },
    {
      unitCode: "BOX",
      name: "Box",
      description: "Unit for boxed items.",
    },
    {
      unitCode: "METER",
      name: "Meter",
      description: "Unit for cables and items measured by length.",
    },
  ];

  const categories = [
    {
      categoryCode: "CAT-CPU",
      name: "CPU / Processor",
      description: "Processors for desktop computer builds.",
    },
    {
      categoryCode: "CAT-MOBO",
      name: "Motherboard",
      description: "Desktop motherboards.",
    },
    {
      categoryCode: "CAT-RAM",
      name: "RAM / Memory",
      description: "Memory modules.",
    },
    {
      categoryCode: "CAT-STORAGE",
      name: "Storage",
      description: "SSD, NVMe, and hard drives.",
    },
    {
      categoryCode: "CAT-GPU",
      name: "GPU / Graphics Card",
      description: "Graphics cards.",
    },
    {
      categoryCode: "CAT-ACCESSORIES",
      name: "Accessories",
      description: "Computer accessories.",
    },
    {
      categoryCode: "CAT-PERIPHERALS",
      name: "Peripherals",
      description: "Keyboard, mouse, monitor, and other peripherals.",
    },
  ];

  console.log("");
  console.log("Seeding item catalog...");
  console.log("-----------------------");

  const createdUnits = {};

  for (const unit of units) {
    const savedUnit = await upsertUnit(unit, superOwner.id);
    createdUnits[savedUnit.unitCode] = savedUnit;
    console.log(`UNIT | ${savedUnit.unitCode} | ${savedUnit.name} | ${savedUnit.status}`);
  }

  const branchConfigs = [
    {
      branch: mainBranch,
      user: mainAdmin,
    },
    {
      branch: mabBranch,
      user: superOwner,
    },
  ];

  const savedCategories = {};

  for (const config of branchConfigs) {
    savedCategories[config.branch.code] = {};

    for (const category of categories) {
      const savedCategory = await upsertCategory(
        category,
        config.branch.id,
        config.user.id
      );

      savedCategories[config.branch.code][savedCategory.categoryCode] = savedCategory;

      console.log(
        `${config.branch.code} | ${savedCategory.categoryCode} | ${savedCategory.name} | ${savedCategory.status}`
      );
    }
  }

  const sampleItems = [
    {
      branch: mainBranch,
      user: mainAdmin,
      categoryCode: "CAT-CPU",
      unitCode: "PCS",
      itemCode: "ITEM-MAIN-001",
      itemName: "AMD Ryzen 5 5600G Processor",
      description: "6-core desktop processor with integrated graphics.",
      barcode: null,
      brand: "AMD",
      modelName: "Ryzen 5 5600G",
      isSerialized: true,
      hasWarranty: true,
      costPrice: "6500.00",
      price1: "7500.00",
      price2: "7350.00",
      price3: "7200.00",
      price4: "7000.00",
      price5: "6800.00",
      minimumStock: "1.00",
      reorderLevel: "2.00",
    },
    {
      branch: mainBranch,
      user: mainAdmin,
      categoryCode: "CAT-MOBO",
      unitCode: "PCS",
      itemCode: "ITEM-MAIN-002",
      itemName: "MSI A320M-A PRO Motherboard",
      description: "AM4 micro-ATX motherboard.",
      barcode: null,
      brand: "MSI",
      modelName: "A320M-A PRO",
      isSerialized: true,
      hasWarranty: true,
      costPrice: "2200.00",
      price1: "2900.00",
      price2: "2800.00",
      price3: "2700.00",
      price4: "2600.00",
      price5: "2500.00",
      minimumStock: "1.00",
      reorderLevel: "2.00",
    },
    {
      branch: mainBranch,
      user: mainAdmin,
      categoryCode: "CAT-STORAGE",
      unitCode: "PCS",
      itemCode: "ITEM-MAIN-003",
      itemName: "Kingston NV2 500GB NVMe SSD",
      description: "500GB NVMe solid-state drive.",
      barcode: null,
      brand: "Kingston",
      modelName: "NV2 500GB",
      isSerialized: true,
      hasWarranty: true,
      costPrice: "1450.00",
      price1: "1900.00",
      price2: "1850.00",
      price3: "1800.00",
      price4: "1750.00",
      price5: "1700.00",
      minimumStock: "2.00",
      reorderLevel: "3.00",
    },
    {
      branch: mabBranch,
      user: superOwner,
      categoryCode: "CAT-MOBO",
      unitCode: "PCS",
      itemCode: "ITEM-MAB-001",
      itemName: "Gigabyte B550M DS3H Motherboard",
      description: "AM4 B550 micro-ATX motherboard.",
      barcode: null,
      brand: "Gigabyte",
      modelName: "B550M DS3H",
      isSerialized: true,
      hasWarranty: true,
      costPrice: "4300.00",
      price1: "5200.00",
      price2: "5050.00",
      price3: "4900.00",
      price4: "4700.00",
      price5: "4550.00",
      minimumStock: "1.00",
      reorderLevel: "2.00",
    },
    {
      branch: mabBranch,
      user: superOwner,
      categoryCode: "CAT-RAM",
      unitCode: "PCS",
      itemCode: "ITEM-MAB-002",
      itemName: "TeamGroup T-Force 16GB DDR4 RAM",
      description: "16GB DDR4 desktop memory module.",
      barcode: null,
      brand: "TeamGroup",
      modelName: "T-Force 16GB DDR4",
      isSerialized: true,
      hasWarranty: true,
      costPrice: "1550.00",
      price1: "2100.00",
      price2: "2000.00",
      price3: "1950.00",
      price4: "1900.00",
      price5: "1850.00",
      minimumStock: "2.00",
      reorderLevel: "3.00",
    },
  ];

  for (const item of sampleItems) {
    const category = savedCategories[item.branch.code][item.categoryCode];
    const unit = createdUnits[item.unitCode];

    if (!category) {
      throw new Error(`Missing category ${item.categoryCode} for branch ${item.branch.code}`);
    }

    if (!unit) {
      throw new Error(`Missing unit ${item.unitCode}`);
    }

    const savedItem = await upsertItem(
      item,
      item.branch.id,
      category.id,
      unit.id,
      item.user.id
    );

    console.log(
      `${savedItem.branch.code} | ${savedItem.itemCode} | ${savedItem.itemName} | ${savedItem.category.categoryCode} | ${savedItem.unit.unitCode} | ${savedItem.status}`
    );
  }

  const unitCount = await prisma.unit.count();
  const categoryCount = await prisma.itemCategory.count();
  const itemCount = await prisma.item.count();

  const branchCounts = await prisma.branch.findMany({
    orderBy: {
      code: "asc",
    },
    select: {
      code: true,
      name: true,
      _count: {
        select: {
          itemCategories: true,
          items: true,
        },
      },
    },
  });

  console.log("");
  console.log("Item catalog seed completed.");
  console.log(`Units: ${unitCount}`);
  console.log(`Item categories: ${categoryCount}`);
  console.log(`Items: ${itemCount}`);
  console.log("");

  console.table(
    branchCounts.map((branch) => ({
      branchCode: branch.code,
      branchName: branch.name,
      categoryCount: branch._count.itemCategories,
      itemCount: branch._count.items,
    }))
  );
}

main()
  .catch((error) => {
    console.error("Item catalog seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
