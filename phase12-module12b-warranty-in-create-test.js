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
  superOwner: {
    identifier: "superowner",
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
  console.log("\nPHASE 12 MODULE 12B: Warranty IN Creation Test");
  console.log("----------------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);
  const superOwnerLogin = await login(users.superOwner);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.warrantyClaim.deleteMany({
    where: {
      branchId,
    },
  });

  assert(true, "Previous warranty claim test data cleared");

  const customer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(customer), "Active customer found");

  const item = await prisma.item.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(item), "Active item found");

  const serial = await prisma.itemSerial.findFirst({
    where: {
      branchId,
      itemId: item.id,
    },
  });

  if (!serial) {
    console.log("SKIP NOTE: No serial found for selected item. Serial-linked claim checks will be skipped.");
  } else {
    assert(serial.itemId === item.id, "Serial belongs to selected item");
  }

  const sale = await prisma.sale.findFirst({
    where: {
      branchId,
      status: {
        not: "CANCELLED",
      },
    },
    include: {
      items: true,
    },
  });

  if (!sale || sale.items.length === 0) {
    console.log("SKIP NOTE: No sale with sale items found. Sale-linked claim checks will be skipped.");
  } else {
    assert(Boolean(sale.id), "Sale with sale item found");
  }

  const saleItem = sale?.items?.[0] || null;

  const missingToken = await request("/warranty-claims", {
    method: "POST",
    body: JSON.stringify({
      issueDescription: "Missing token test",
    }),
  });

  assert(missingToken.status === 401, "Create warranty claim blocks missing token");

  const missingIssue = await request("/warranty-claims", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      customerId: customer.id,
    }),
  });

  assert(missingIssue.status === 400, "Missing issue description is blocked");

  const invalidCustomer = await request("/warranty-claims", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      customerId: "not-existing-customer-id",
      issueDescription: "Invalid customer test",
    }),
  });

  assert(invalidCustomer.status === 404, "Invalid customer is blocked");

  const invalidItem = await request("/warranty-claims", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      itemId: "not-existing-item-id",
      issueDescription: "Invalid item test",
    }),
  });

  assert(invalidItem.status === 404, "Invalid item is blocked");

  const adminCreate = await request("/warranty-claims", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      customerId: customer.id,
      itemId: item.id,
      serialId: serial ? serial.id : undefined,
      saleId: sale ? sale.id : undefined,
      saleItemId: saleItem ? saleItem.id : undefined,
      issueDescription: "No display after purchase",
      customerComplaint: "Customer reports no display",
      diagnosis: "Pending check",
      remarks: "Phase 12B admin create test",
    }),
  });

  if (adminCreate.status !== 201) {
    console.dir(adminCreate.body, { depth: null });
  }

  assert(adminCreate.status === 201, "Admin can create warranty IN claim");
  assert(adminCreate.body.data.claimCode.startsWith("WTY-MAIN-"), "Warranty claim code generated");
  assert(adminCreate.body.data.status === "IN", "Warranty starts as IN");
  assert(adminCreate.body.data.issueDescription === "No display after purchase", "Issue description saved");
  assert(adminCreate.body.data.branch.id === branchId, "Warranty linked to own branch");
  assert(adminCreate.body.data.customer.id === customer.id, "Warranty linked to customer");
  assert(adminCreate.body.data.item.id === item.id, "Warranty linked to item");
  assert(adminCreate.body.data.createdBy.id === adminLogin.user.id, "createdBy is actor");
  assert(adminCreate.body.data.updatedBy.id === adminLogin.user.id, "updatedBy is actor");
  assert(adminCreate.body.data.statusUpdatedBy.id === adminLogin.user.id, "statusUpdatedBy is actor");

  if (serial) {
    assert(adminCreate.body.data.serial.id === serial.id, "Warranty linked to serial");
  }

  if (sale) {
    assert(adminCreate.body.data.sale.id === sale.id, "Warranty linked to sale");
  }

  if (saleItem) {
    assert(adminCreate.body.data.saleItem.id === saleItem.id, "Warranty linked to sale item");
  }

  const saved = await prisma.warrantyClaim.findUnique({
    where: {
      id: adminCreate.body.data.id,
    },
  });

  assert(Boolean(saved), "Warranty claim saved in database");
  assert(saved.status === "IN", "Database status is IN");

  const techCreate = await request("/warranty-claims", {
    method: "POST",
    token: techLogin.token,
    body: JSON.stringify({
      customerId: customer.id,
      itemId: item.id,
      issueDescription: "Technician received warranty item",
    }),
  });

  if (techCreate.status !== 201) {
    console.dir(techCreate.body, { depth: null });
  }

  assert(techCreate.status === 201, "Technician can create warranty IN claim");
  assert(techCreate.body.data.branch.id === branchId, "Technician-created claim is own branch");

  const superMissingBranch = await request("/warranty-claims", {
    method: "POST",
    token: superOwnerLogin.token,
    body: JSON.stringify({
      issueDescription: "Super Owner missing branch test",
    }),
  });

  assert(superMissingBranch.status === 400, "Super Owner must provide branchId");

  const superCreate = await request("/warranty-claims", {
    method: "POST",
    token: superOwnerLogin.token,
    body: JSON.stringify({
      branchId,
      customerId: customer.id,
      itemId: item.id,
      issueDescription: "Super Owner branch warranty claim",
    }),
  });

  if (superCreate.status !== 201) {
    console.dir(superCreate.body, { depth: null });
  }

  assert(superCreate.status === 201, "Super Owner can create warranty claim with branchId");
  assert(superCreate.body.data.branch.id === branchId, "Super Owner claim linked to requested branch");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 12 MODULE 12B WARRANTY IN CREATION TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 12 MODULE 12B WARRANTY IN CREATION TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
