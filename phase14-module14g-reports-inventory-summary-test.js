require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";

const users = {
  admin: {
    identifier: "mainadmin",
    password: "Password123!",
  },
  technician: {
    identifier: "pendingtech",
    password: "Password123!",
  },
};

const request = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...options,
  });

  const body = await response.json().catch(() => null);

  return {
    status: response.status,
    body,
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const login = async (user) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  if (!result.body?.data?.token) {
    console.dir(result.body, { depth: null });
    throw new Error("Login failed for " + user.identifier);
  }

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const main = async () => {
  console.log("\nPHASE 14 MODULE 14G: Reports Inventory Summary Test");
  console.log("---------------------------------------------------");

  const adminLogin = await login(users.admin);
  const technicianLogin = await login(users.technician);

  const mainBranchId = adminLogin.user.branch?.id || adminLogin.user.branchId;

  assert(Boolean(mainBranchId), "MAIN branch detected");

  const otherBranch = await prisma.branch.findFirst({
    where: {
      id: {
        not: mainBranchId,
      },
      status: "ACTIVE",
    },
    orderBy: {
      code: "asc",
    },
  });

  assert(Boolean(otherBranch), "Second active branch detected");

  await prisma.inventoryBatch.deleteMany({
    where: {
      batchCode: {
        startsWith: "PHASE14G-",
      },
    },
  });

  await prisma.item.deleteMany({
    where: {
      itemCode: {
        startsWith: "PHASE14G-",
      },
    },
  });

  assert(true, "Previous 14G inventory report test data cleared");

  const category = await prisma.itemCategory.findFirst({
    where: {
      branchId: mainBranchId,
      status: "ACTIVE",
    },
  });

  const unit = await prisma.unit.findFirst({
    where: {
      status: "ACTIVE",
    },
  });

  assert(Boolean(category), "MAIN active category found");
  assert(Boolean(unit), "Active unit found");

  const lowStockItem = await prisma.item.create({
    data: {
      branchId: mainBranchId,
      itemCode: "PHASE14G-LOW",
      itemName: "Phase 14G Low Stock Item",
      description: "Temporary low stock item for reports test",
      status: "ACTIVE",
      isSerialized: false,
      hasWarranty: false,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      minimumStock: "3",
      reorderLevel: "10",
      categoryId: category.id,
      unitId: unit.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  const normalStockItem = await prisma.item.create({
    data: {
      branchId: mainBranchId,
      itemCode: "PHASE14G-NORMAL",
      itemName: "Phase 14G Normal Stock Item",
      description: "Temporary normal stock item for reports test",
      status: "ACTIVE",
      isSerialized: false,
      hasWarranty: false,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      minimumStock: "3",
      reorderLevel: "10",
      categoryId: category.id,
      unitId: unit.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  await prisma.inventoryBatch.create({
    data: {
      branchId: mainBranchId,
      itemId: lowStockItem.id,
      batchCode: "PHASE14G-BATCH-LOW",
      quantityIn: "5",
      quantityAvailable: "5",
      unitCost: "1000",
      sellingPrice1: "1200",
      sellingPrice2: "1250",
      sellingPrice3: "1300",
      sellingPrice4: "1350",
      sellingPrice5: "1400",
      supplierName: "Phase 14G Test Supplier",
      referenceNo: "PHASE14G-SEED-LOW",
      remarks: "Temporary low batch for reports test",
      status: "ACTIVE",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  await prisma.inventoryBatch.create({
    data: {
      branchId: mainBranchId,
      itemId: normalStockItem.id,
      batchCode: "PHASE14G-BATCH-NORMAL",
      quantityIn: "50",
      quantityAvailable: "50",
      unitCost: "1000",
      sellingPrice1: "1200",
      sellingPrice2: "1250",
      sellingPrice3: "1300",
      sellingPrice4: "1350",
      sellingPrice5: "1400",
      supplierName: "Phase 14G Test Supplier",
      referenceNo: "PHASE14G-SEED-NORMAL",
      remarks: "Temporary normal batch for reports test",
      status: "ACTIVE",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(true, "Report test items and batches seeded");

  const summary = await request("/reports/inventory-summary?search=PHASE14G&page=1&limit=20", {
    token: adminLogin.token,
  });

  if (summary.status !== 200) {
    console.dir(summary.body, { depth: null });
  }

  assert(summary.status === 200, "Admin can access inventory summary report");
  assert(summary.body.success === true, "Inventory summary success response returned");
  assert(summary.body.message === "Inventory summary report retrieved successfully", "Inventory summary message returned");
  assert(Boolean(summary.body.data.report), "Report object returned");
  assert(Array.isArray(summary.body.data.records), "Report records returned");
  assert(Boolean(summary.body.meta), "Report meta returned");

  const records = summary.body.data.records;
  const report = summary.body.data.report;

  assert(records.length === 2, "Search returns exactly 2 PHASE14G records");
  assert(report.name === "Inventory Summary", "Report name is Inventory Summary");
  assert(report.totals.totalItems === 2, "Report totals item count correct");
  assert(report.totals.totalQuantityIn === 55, "Report totalQuantityIn correct");
  assert(report.totals.totalQuantityAvailable === 55, "Report totalQuantityAvailable correct");
  assert(report.totals.lowStockItems === 1, "Report lowStockItems count correct");
  assert(report.totals.zeroStockItems === 0, "Report zeroStockItems count correct");

  const lowRecord = records.find((item) => item.itemCode === "PHASE14G-LOW");
  const normalRecord = records.find((item) => item.itemCode === "PHASE14G-NORMAL");

  assert(Boolean(lowRecord), "Low stock item included in report");
  assert(Boolean(normalRecord), "Normal stock item included in report");
  assert(lowRecord.quantityAvailable === 5, "Low stock quantityAvailable correct");
  assert(lowRecord.isLowStock === true, "Low stock item marked low stock");
  assert(normalRecord.quantityAvailable === 50, "Normal stock quantityAvailable correct");
  assert(normalRecord.isLowStock === false, "Normal stock item not marked low stock");

  const lowStockOnly = await request("/reports/inventory-summary?search=PHASE14G&lowStockOnly=true&page=1&limit=20", {
    token: adminLogin.token,
  });

  if (lowStockOnly.status !== 200) {
    console.dir(lowStockOnly.body, { depth: null });
  }

  assert(lowStockOnly.status === 200, "lowStockOnly filter works");
  assert(lowStockOnly.body.data.records.length === 1, "lowStockOnly returns exactly 1 record");
  assert(lowStockOnly.body.data.records[0].itemCode === "PHASE14G-LOW", "lowStockOnly returns low stock item");

  const ownBranchFilter = await request(`/reports/inventory-summary?branchId=${mainBranchId}&search=PHASE14G`, {
    token: adminLogin.token,
  });

  assert(ownBranchFilter.status === 200, "Admin can filter own branch report");

  const otherBranchFilter = await request(`/reports/inventory-summary?branchId=${otherBranch.id}&search=PHASE14G`, {
    token: adminLogin.token,
  });

  assert(otherBranchFilter.status === 403, "Admin blocked from other branch report");

  const technicianSummary = await request("/reports/inventory-summary?search=PHASE14G", {
    token: technicianLogin.token,
  });

  assert(technicianSummary.status === 403, "Technician blocked from reports endpoint");

  const invalidLowStockFilter = await request("/reports/inventory-summary?lowStockOnly=maybe", {
    token: adminLogin.token,
  });

  assert(invalidLowStockFilter.status === 400, "Invalid lowStockOnly filter rejected");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14 MODULE 14G REPORTS INVENTORY SUMMARY TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14 MODULE 14G REPORTS INVENTORY SUMMARY TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
