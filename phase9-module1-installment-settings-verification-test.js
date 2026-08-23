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
  console.log("\nPhase 9 Module 1: Installment Settings Verification");
  console.log("---------------------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const noToken = await request("/settings/business-rules/installment");

  assert([401, 403].includes(noToken.status), "Installment settings blocks missing token");

  const adminView = await request("/settings/business-rules/installment", {
    token: adminLogin.token,
  });

  if (adminView.status !== 200) {
    console.dir(adminView.body, { depth: null });
  }

  assert(adminView.status === 200, "Admin can view installment basis settings");
  assert(adminView.body.data.termBasis.STRAIGHT === 0.96, "STRAIGHT basis is 0.96");
  assert(adminView.body.data.termBasis.MONTH_3 === 0.96, "MONTH_3 basis is 0.96");
  assert(adminView.body.data.termBasis.MONTH_6 === 0.935, "MONTH_6 basis is 0.935");
  assert(adminView.body.data.termBasis.MONTH_9 === 0.905, "MONTH_9 basis is 0.905");
  assert(adminView.body.data.termBasis.MONTH_12 === 0.875, "MONTH_12 basis is 0.875");
  assert(adminView.body.data.termBasis.MONTH_18 === 0.815, "MONTH_18 basis is 0.815");
  assert(adminView.body.data.termBasis.MONTH_24 === 0.755, "MONTH_24 basis is 0.755");

  const techView = await request("/settings/business-rules/installment", {
    token: techLogin.token,
  });

  assert(techView.status === 403, "Technician cannot view installment basis settings");

  const compute = await request("/settings/business-rules/installment/test-compute", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      cashPromoTotalAmount: 10000,
      cashDownpayment: 2000,
      term: "MONTH_12",
    }),
  });

  if (compute.status !== 200) {
    console.dir(compute.body, { depth: null });
  }

  assert(compute.status === 200, "Admin can compute installment test");
  assert(compute.body.data.input.cashPromoTotalAmount === 10000, "Compute input cashPromoTotalAmount returned");
  assert(compute.body.data.input.cashDownpayment === 2000, "Compute input cashDownpayment returned");
  assert(compute.body.data.input.term === "MONTH_12", "Compute input term returned");
  assert(compute.body.data.basisUsed.termBasis === 0.875, "MONTH_12 basis used in compute response");

  const settingDetail = await request("/settings/scope/GLOBAL%3Ainstallment.term_basis", {
    token: adminLogin.token,
  });

  assert(settingDetail.status === 200, "Admin can view installment.term_basis by scopeKey");
  assert(settingDetail.body.data.scopeKey === "GLOBAL:installment.term_basis", "Scope key is correct");
  assert(settingDetail.body.data.valueType === "JSON", "Installment term basis valueType is JSON");
  assert(settingDetail.body.data.isEditable === true, "Installment term basis is editable");

  const currentValue = settingDetail.body.data.value;

  const techUpdate = await request("/settings/scope/GLOBAL%3Ainstallment.term_basis", {
    method: "PATCH",
    token: techLogin.token,
    body: JSON.stringify({
      value: currentValue,
    }),
  });

  assert(techUpdate.status === 403, "Technician cannot update installment setting");

  const superUpdateSameValue = await request("/settings/scope/GLOBAL%3Ainstallment.term_basis", {
    method: "PATCH",
    token: superLogin.token,
    body: JSON.stringify({
      value: currentValue,
    }),
  });

  assert(superUpdateSameValue.status === 200, "Super Owner can update installment setting");
  assert(superUpdateSameValue.body.data.value.MONTH_12 === 0.875, "Super Owner update kept MONTH_12 basis");

  const invalidTypeUpdate = await request("/settings/scope/GLOBAL%3Ainstallment.term_basis", {
    method: "PATCH",
    token: superLogin.token,
    body: JSON.stringify({
      value: "invalid-json-value",
    }),
  });

  assert(invalidTypeUpdate.status === 400, "Invalid setting value type is blocked");

  const finalHealth = await request("/health");

  assert(finalHealth.status === 200, "Final health endpoint returns 200");
  assert(finalHealth.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 9 MODULE 1 INSTALLMENT SETTINGS VERIFICATION PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 9 MODULE 1 INSTALLMENT SETTINGS VERIFICATION FAILED");
  console.error(error);
  process.exitCode = 1;
});
