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
  console.log("\nPhase 6 Module 5: Serial Status API Test");
  console.log("----------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const serialSearch = await request("/inventory/serials?search=SN-MODULE4-RYZEN", {
    token: adminLogin.token,
  });

  assert(serialSearch.status === 200, "Admin can search serials for test");
  assert(serialSearch.body.data.data.length >= 1, "Test serial found");

  const testSerial = serialSearch.body.data.data[0];

  const noToken = await request(`/inventory/serials/${testSerial.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "DAMAGED",
      remarks: "Should be blocked.",
    }),
  });

  assert(noToken.status === 401, "Serial status update blocks missing token");

  const techUpdate = await request(`/inventory/serials/${testSerial.id}/status`, {
    method: "PATCH",
    token: techLogin.token,
    body: JSON.stringify({
      status: "DAMAGED",
      remarks: "Should be blocked.",
    }),
  });

  assert(techUpdate.status === 403, "Technician cannot update serial status");

  const invalidStatus = await request(`/inventory/serials/${testSerial.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "INVALID_STATUS",
      remarks: "Should fail validation.",
    }),
  });

  assert(invalidStatus.status === 400, "Invalid serial status is blocked");

  const damagedUpdate = await request(`/inventory/serials/${testSerial.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "DAMAGED",
      remarks: "Phase 6 Module 5 test: mark damaged.",
    }),
  });

  assert(damagedUpdate.status === 200, "Admin can update own branch serial to DAMAGED");
  assert(damagedUpdate.body.data.serial.status === "DAMAGED", "Serial status became DAMAGED");
  assert(damagedUpdate.body.data.previousStatus !== undefined, "Previous status returned");

  const availableUpdate = await request(`/inventory/serials/${testSerial.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "AVAILABLE",
      remarks: "Phase 6 Module 5 test: restore available.",
    }),
  });

  assert(availableUpdate.status === 200, "Admin can restore serial to AVAILABLE");
  assert(availableUpdate.body.data.serial.status === "AVAILABLE", "Serial status restored to AVAILABLE");

  const superUpdate = await request(`/inventory/serials/${testSerial.id}/status`, {
    method: "PATCH",
    token: superLogin.token,
    body: JSON.stringify({
      status: "RESERVED",
      remarks: "Phase 6 Module 5 test: super owner reserve.",
    }),
  });

  assert(superUpdate.status === 200, "Super Owner can update serial status");
  assert(superUpdate.body.data.serial.status === "RESERVED", "Serial status became RESERVED");

  const restoreFinal = await request(`/inventory/serials/${testSerial.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "AVAILABLE",
      remarks: "Phase 6 Module 5 test: final restore.",
    }),
  });

  assert(restoreFinal.status === 200, "Admin can restore final status to AVAILABLE");
  assert(restoreFinal.body.data.serial.status === "AVAILABLE", "Final serial status is AVAILABLE");

  const missingSerial = await request("/inventory/serials/not-existing-serial-id/status", {
    method: "PATCH",
    token: superLogin.token,
    body: JSON.stringify({
      status: "DAMAGED",
      remarks: "Missing serial test.",
    }),
  });

  assert(missingSerial.status === 404, "Missing serial returns 404");

  console.log("\nPHASE 6 MODULE 5 SERIAL STATUS API TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 6 MODULE 5 SERIAL STATUS API TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
