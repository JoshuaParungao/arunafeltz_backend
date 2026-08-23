const BASE_URL = "http://localhost:5000/api";

const unique = Date.now();

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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
};

const hasOwn = (object, key) => {
  return Object.prototype.hasOwnProperty.call(object, key);
};

const login = async (user) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  assert(result.status === 200, `${user.identifier} login status is 200`);
  assert(Boolean(result.body?.data?.token), `${user.identifier} login returns token`);

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const main = async () => {
  console.log("\nPHASE 6 FINAL INVENTORY TEST");
  console.log("----------------------------");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body?.success === true, "Health endpoint success true");
  assert(health.body?.data?.status === "healthy", "Backend status is healthy");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  assert(superLogin.user.role === "SUPER_OWNER", "Super Owner role verified");
  assert(adminLogin.user.role === "ADMIN", "Admin role verified");
  assert(techLogin.user.role === "TECHNICIAN", "Technician role verified");

  const overviewNoToken = await request("/inventory/overview");
  assert(overviewNoToken.status === 401, "Inventory overview blocks missing token");

  const superOverview = await request("/inventory/overview", {
    token: superLogin.token,
  });

  assert(superOverview.status === 200, "Super Owner can view inventory overview");
  assert(superOverview.body.data.data.length >= 1, "Super Owner overview has inventory items");

  const adminOverview = await request("/inventory/overview", {
    token: adminLogin.token,
  });

  assert(adminOverview.status === 200, "Admin can view inventory overview");
  assert(
    adminOverview.body.data.data.every((item) => item.branch.code === "MAIN"),
    "Admin overview is limited to own branch"
  );

  const techOverview = await request("/inventory/overview", {
    token: techLogin.token,
  });

  assert(techOverview.status === 200, "Technician can view inventory overview");
  assert(
    techOverview.body.data.data.every((item) => item.branch.code === "MAIN"),
    "Technician overview is limited to own branch"
  );

  const ryzenItem = adminOverview.body.data.data.find((item) =>
    item.itemName.includes("Ryzen")
  );

  assert(Boolean(ryzenItem), "Ryzen item found for final stock test");
  assert(ryzenItem.isSerialized === true, "Ryzen item is serialized");

  const adminBatches = await request("/inventory/batches", {
    token: adminLogin.token,
  });

  assert(adminBatches.status === 200, "Admin can view batches");
  assert(adminBatches.body.data.data.length >= 1, "Admin batch list has rows");
  assert(hasOwn(adminBatches.body.data.data[0], "unitCost"), "Admin can see batch unitCost");

  const techBatches = await request("/inventory/batches", {
    token: techLogin.token,
  });

  assert(techBatches.status === 200, "Technician can view batches");
  assert(techBatches.body.data.data.length >= 1, "Technician batch list has rows");
  assert(!hasOwn(techBatches.body.data.data[0], "unitCost"), "Technician cannot see batch unitCost");

  const adminSerials = await request("/inventory/serials", {
    token: adminLogin.token,
  });

  assert(adminSerials.status === 200, "Admin can view serials");
  assert(adminSerials.body.data.data.length >= 1, "Admin serial list has rows");
  assert(
    adminSerials.body.data.data.every((serial) => serial.branch.code === "MAIN"),
    "Admin serials are limited to own branch"
  );

  const techStockInBlocked = await request("/inventory/stock-in", {
    method: "POST",
    token: techLogin.token,
    body: JSON.stringify({
      itemId: ryzenItem.id,
      batchCode: `BATCH-PHASE6-FINAL-TECH-BLOCKED-${unique}`,
      quantity: 1,
      referenceNo: `PHASE6-FINAL-TECH-BLOCKED-${unique}`,
      remarks: "Should be blocked.",
      serialNumbers: [`SN-PHASE6-FINAL-TECH-BLOCKED-${unique}`],
    }),
  });

  assert(techStockInBlocked.status === 403, "Technician cannot stock-in");

  const finalBatchCode = `BATCH-PHASE6-FINAL-${unique}`;
  const finalSerialNumber = `SN-PHASE6-FINAL-${unique}`;
  const finalReference = `PHASE6-FINAL-${unique}`;

  const stockIn = await request("/inventory/stock-in", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      itemId: ryzenItem.id,
      batchCode: finalBatchCode,
      quantity: 1,
      referenceNo: finalReference,
      remarks: "Phase 6 final stock-in test.",
      serialNumbers: [finalSerialNumber],
    }),
  });

  assert(stockIn.status === 201, "Admin can stock-in serialized item");
  assert(stockIn.body.data.batch.batchCode === finalBatchCode, "Final stock-in batch code saved");
  assert(stockIn.body.data.serials.length === 1, "Final stock-in created one serial");
  assert(stockIn.body.data.serials[0].serialNumber === finalSerialNumber, "Final stock-in serial number saved");
  assert(stockIn.body.data.movement.type === "STOCK_IN", "Final stock-in movement created");

  const duplicateSerial = await request("/inventory/stock-in", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      itemId: ryzenItem.id,
      batchCode: `BATCH-PHASE6-FINAL-DUP-${unique}`,
      quantity: 1,
      referenceNo: `PHASE6-FINAL-DUP-${unique}`,
      remarks: "Duplicate serial should be blocked.",
      serialNumbers: [finalSerialNumber],
    }),
  });

  assert(duplicateSerial.status === 409, "Duplicate serial is blocked");

  const serialMismatch = await request("/inventory/stock-in", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      itemId: ryzenItem.id,
      batchCode: `BATCH-PHASE6-FINAL-MISMATCH-${unique}`,
      quantity: 2,
      referenceNo: `PHASE6-FINAL-MISMATCH-${unique}`,
      remarks: "Serial count mismatch should be blocked.",
      serialNumbers: [`SN-PHASE6-FINAL-MISMATCH-${unique}`],
    }),
  });

  assert(serialMismatch.status === 400, "Serialized item serial count mismatch is blocked");

  const adjustmentIn = await request("/inventory/adjustments", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      batchId: stockIn.body.data.batch.id,
      type: "INCREASE",
      quantity: 1,
      referenceNo: `PHASE6-FINAL-ADJUST-IN-${unique}`,
      remarks: "Phase 6 final adjustment increase.",
    }),
  });

  assert(adjustmentIn.status === 201, "Admin can increase batch quantity");
  assert(adjustmentIn.body.data.movement.type === "ADJUSTMENT_IN", "Adjustment-in movement created");

  const adjustmentOut = await request("/inventory/adjustments", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      batchId: stockIn.body.data.batch.id,
      type: "DECREASE",
      quantity: 1,
      referenceNo: `PHASE6-FINAL-ADJUST-OUT-${unique}`,
      remarks: "Phase 6 final adjustment decrease.",
    }),
  });

  assert(adjustmentOut.status === 201, "Admin can decrease batch quantity");
  assert(adjustmentOut.body.data.movement.type === "ADJUSTMENT_OUT", "Adjustment-out movement created");

  const adjustmentTooMuch = await request("/inventory/adjustments", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      batchId: stockIn.body.data.batch.id,
      type: "DECREASE",
      quantity: 999999,
      referenceNo: `PHASE6-FINAL-ADJUST-BLOCK-${unique}`,
      remarks: "Should be blocked.",
    }),
  });

  assert(adjustmentTooMuch.status === 400, "Adjustment cannot reduce quantity below zero");

  const finalSerialId = stockIn.body.data.serials[0].id;

  const techSerialUpdateBlocked = await request(`/inventory/serials/${finalSerialId}/status`, {
    method: "PATCH",
    token: techLogin.token,
    body: JSON.stringify({
      status: "DAMAGED",
      remarks: "Should be blocked.",
    }),
  });

  assert(techSerialUpdateBlocked.status === 403, "Technician cannot update serial status");

  const invalidSerialStatus = await request(`/inventory/serials/${finalSerialId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "INVALID_STATUS",
      remarks: "Should fail.",
    }),
  });

  assert(invalidSerialStatus.status === 400, "Invalid serial status is blocked");

  const serialDamaged = await request(`/inventory/serials/${finalSerialId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "DAMAGED",
      remarks: "Phase 6 final mark damaged.",
    }),
  });

  assert(serialDamaged.status === 200, "Admin can update serial to DAMAGED");
  assert(serialDamaged.body.data.serial.status === "DAMAGED", "Serial status is DAMAGED");

  const serialRestored = await request(`/inventory/serials/${finalSerialId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "AVAILABLE",
      remarks: "Phase 6 final restore available.",
    }),
  });

  assert(serialRestored.status === 200, "Admin can restore serial to AVAILABLE");
  assert(serialRestored.body.data.serial.status === "AVAILABLE", "Serial status restored to AVAILABLE");

  const movementsAdmin = await request(`/inventory/movements?search=${finalReference}`, {
    token: adminLogin.token,
  });

  assert(movementsAdmin.status === 200, "Admin can search movement history");
  assert(movementsAdmin.body.data.data.length >= 1, "Movement history contains final stock-in movement");
  assert(hasOwn(movementsAdmin.body.data.data[0], "unitCost"), "Admin can see movement unitCost");

  const movementsTech = await request(`/inventory/movements?search=${finalReference}`, {
    token: techLogin.token,
  });

  assert(movementsTech.status === 200, "Technician can search own branch movement history");
  assert(movementsTech.body.data.data.length >= 1, "Technician sees own branch movement history");
  assert(!hasOwn(movementsTech.body.data.data[0], "unitCost"), "Technician cannot see movement unitCost");

  const movementPagination = await request("/inventory/movements?page=1&limit=3", {
    token: superLogin.token,
  });

  assert(movementPagination.status === 200, "Movement pagination works");
  assert(movementPagination.body.data.data.length <= 3, "Movement pagination limit respected");

  const mabSerials = await request("/inventory/serials?search=SN-MAB", {
    token: superLogin.token,
  });

  assert(mabSerials.status === 200, "Super Owner can search MAB serials");

  if (mabSerials.body.data.data.length > 0) {
    const mabSerial = mabSerials.body.data.data[0];

    const adminMabUpdate = await request(`/inventory/serials/${mabSerial.id}/status`, {
      method: "PATCH",
      token: adminLogin.token,
      body: JSON.stringify({
        status: "DAMAGED",
        remarks: "Admin should not update other branch serial.",
      }),
    });

    assert(adminMabUpdate.status === 403, "Admin cannot update other branch serial");
  } else {
    console.log("SKIP: No MAB serial found for cross-branch serial update check");
  }

  const finalHealth = await request("/health");

  assert(finalHealth.status === 200, "Final health endpoint returns 200");
  assert(finalHealth.body?.data?.status === "healthy", "Final backend status is healthy");

  console.log("\nPHASE 6 FINAL INVENTORY TEST PASSED");
  console.log("-----------------------------------");
  console.log("Verified: models, seed data, overview, batches, serials, stock-in, adjustments, serial status, movements, permissions, branch restrictions, cost hiding, and health.");
};

main().catch((error) => {
  console.error("\nPHASE 6 FINAL INVENTORY TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
