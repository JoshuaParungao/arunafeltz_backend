const BASE_URL = "http://localhost:5000/api";

const users = {
  superOwner: {
    identifier: "superowner",
    password: "Password123!",
  },
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

const login = async (user) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  if (!result.body?.success || !result.body?.data?.token) {
    throw new Error(`Login failed for ${user.identifier}: ${JSON.stringify(result.body)}`);
  }

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
};

const main = async () => {
  console.log("\nPhase 6 Module 4: Stock Mutation API Test");
  console.log("-----------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const adminOverview = await request("/inventory/overview?search=Ryzen", {
    token: adminLogin.token,
  });

  assert(adminOverview.status === 200, "Admin can load overview for test item");

  const ryzenItem = adminOverview.body.data.data.find((item) =>
    item.itemName.includes("Ryzen")
  );

  assert(Boolean(ryzenItem), "Ryzen test item found");

  const noTokenStockIn = await request("/inventory/stock-in", {
    method: "POST",
    body: JSON.stringify({}),
  });

  assert(noTokenStockIn.status === 401, "Stock-in blocks missing token");

  const techStockIn = await request("/inventory/stock-in", {
    method: "POST",
    token: techLogin.token,
    body: JSON.stringify({
      itemId: ryzenItem.id,
      batchCode: "BATCH-MAIN-MODULE4-TECH-BLOCKED",
      quantity: 1,
      serialNumbers: ["SN-MODULE4-TECH-BLOCKED-001"],
    }),
  });

  assert(techStockIn.status === 403, "Technician cannot stock-in");

  const stockIn = await request("/inventory/stock-in", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      itemId: ryzenItem.id,
      batchCode: "BATCH-MAIN-MODULE4-STOCKIN-001",
      quantity: 1,
      referenceNo: "MODULE4-STOCKIN-001",
      remarks: "Phase 6 Module 4 API test stock-in.",
      serialNumbers: ["SN-MODULE4-RYZEN-001"],
    }),
  });

  assert(stockIn.status === 201, "Admin can stock-in own branch serialized item");
  assert(stockIn.body.data.batch.batchCode === "BATCH-MAIN-MODULE4-STOCKIN-001", "Stock-in batch code saved");
  assert(stockIn.body.data.serials.length === 1, "Stock-in serial created");
  assert(stockIn.body.data.movement.type === "STOCK_IN", "Stock-in movement created");

  const duplicateSerial = await request("/inventory/stock-in", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      itemId: ryzenItem.id,
      batchCode: "BATCH-MAIN-MODULE4-STOCKIN-002",
      quantity: 1,
      referenceNo: "MODULE4-STOCKIN-002",
      remarks: "Duplicate serial test.",
      serialNumbers: ["SN-MODULE4-RYZEN-001"],
    }),
  });

  assert(duplicateSerial.status === 409, "Duplicate serial is blocked");

  const serialMismatch = await request("/inventory/stock-in", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      itemId: ryzenItem.id,
      batchCode: "BATCH-MAIN-MODULE4-STOCKIN-003",
      quantity: 2,
      referenceNo: "MODULE4-STOCKIN-003",
      remarks: "Serial mismatch test.",
      serialNumbers: ["SN-MODULE4-RYZEN-002"],
    }),
  });

  assert(serialMismatch.status === 400, "Serialized item requires matching serial count");

  const batches = await request("/inventory/batches?search=BATCH-MAIN-MODULE4-STOCKIN-001", {
    token: adminLogin.token,
  });

  assert(batches.status === 200, "Admin can search new stock-in batch");
  assert(batches.body.data.data.length === 1, "New stock-in batch found");

  const testBatch = batches.body.data.data[0];

  const adjustmentIn = await request("/inventory/adjustments", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      batchId: testBatch.id,
      type: "INCREASE",
      quantity: 1,
      referenceNo: "MODULE4-ADJUST-IN-001",
      remarks: "Phase 6 Module 4 adjustment increase.",
    }),
  });

  assert(adjustmentIn.status === 201, "Admin can increase batch quantity");
  assert(adjustmentIn.body.data.movement.type === "ADJUSTMENT_IN", "Adjustment-in movement created");

  const adjustmentOut = await request("/inventory/adjustments", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      batchId: testBatch.id,
      type: "DECREASE",
      quantity: 1,
      referenceNo: "MODULE4-ADJUST-OUT-001",
      remarks: "Phase 6 Module 4 adjustment decrease.",
    }),
  });

  assert(adjustmentOut.status === 201, "Admin can decrease batch quantity");
  assert(adjustmentOut.body.data.movement.type === "ADJUSTMENT_OUT", "Adjustment-out movement created");

  const tooMuchDecrease = await request("/inventory/adjustments", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      batchId: testBatch.id,
      type: "DECREASE",
      quantity: 999999,
      referenceNo: "MODULE4-ADJUST-OUT-BLOCKED",
      remarks: "Should be blocked.",
    }),
  });

  assert(tooMuchDecrease.status === 400, "Adjustment cannot make quantity negative");

  const techAdjustment = await request("/inventory/adjustments", {
    method: "POST",
    token: techLogin.token,
    body: JSON.stringify({
      batchId: testBatch.id,
      type: "INCREASE",
      quantity: 1,
      referenceNo: "MODULE4-TECH-ADJUST-BLOCKED",
      remarks: "Should be blocked.",
    }),
  });

  assert(techAdjustment.status === 403, "Technician cannot adjust stock");

  const superBatches = await request("/inventory/batches?search=BATCH-MAIN-MODULE4-STOCKIN-001", {
    token: superLogin.token,
  });

  assert(superBatches.status === 200, "Super Owner can view tested batch");
  assert(superBatches.body.data.data.length === 1, "Super Owner sees tested batch");

  console.log("\nPHASE 6 MODULE 4 STOCK MUTATION API TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 6 MODULE 4 STOCK MUTATION API TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
