require("dotenv").config();

const BASE_URL = "http://localhost:5000/api";

const accounts = {
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
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const body = await response.json().catch(() => null);

  return {
    status: response.status,
    body,
  };
};

const assert = (condition, message, details = null) => {
  if (!condition) {
    if (details) {
      console.dir(details, { depth: null });
    }

    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const login = async (label, credentials) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: credentials,
  });

  assert(result.status === 200, `${label} login status 200`, result.body);
  assert(result.body?.success === true, `${label} login success true`, result.body);
  assert(Boolean(result.body?.data?.token), `${label} login token returned`, result.body);
  assert(Boolean(result.body?.data?.user), `${label} login user returned`, result.body);

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const main = async () => {
  console.log("\nPHASE 14L-B: Auth / Users / Settings Regression");
  console.log("-----------------------------------------------");

  console.log("\n--- Auth Login Tests ---");

  const superOwner = await login("SUPER_OWNER", accounts.superOwner);
  const admin = await login("ADMIN", accounts.admin);
  const technician = await login("TECHNICIAN", accounts.technician);

  assert(superOwner.user.role === "SUPER_OWNER", "SUPER_OWNER role confirmed");
  assert(["ADMIN", "BRANCH_OWNER"].includes(admin.user.role), "ADMIN/BRANCH_OWNER role confirmed");
  assert(technician.user.role === "TECHNICIAN", "TECHNICIAN role confirmed");

  console.log("\n--- Invalid Login Test ---");

  const invalidLogin = await request("/auth/login", {
    method: "POST",
    body: {
      identifier: "superowner",
      password: "WrongPassword123!",
    },
  });

  assert([400, 401].includes(invalidLogin.status), "Invalid login rejected");

  console.log("\n--- Auth Me Tests ---");

  const superOwnerMe = await request("/auth/me", {
    token: superOwner.token,
  });

  assert(superOwnerMe.status === 200, "SUPER_OWNER /auth/me works", superOwnerMe.body);
  assert(superOwnerMe.body?.data?.user?.role === "SUPER_OWNER", "SUPER_OWNER /auth/me role correct", superOwnerMe.body);

  const adminMe = await request("/auth/me", {
    token: admin.token,
  });

  assert(adminMe.status === 200, "ADMIN /auth/me works", adminMe.body);
  assert(["ADMIN", "BRANCH_OWNER"].includes(adminMe.body?.data?.user?.role), "ADMIN /auth/me role correct", adminMe.body);

  const technicianMe = await request("/auth/me", {
    token: technician.token,
  });

  assert(technicianMe.status === 200, "TECHNICIAN /auth/me works", technicianMe.body);
  assert(technicianMe.body?.data?.user?.role === "TECHNICIAN", "TECHNICIAN /auth/me role correct", technicianMe.body);

  const noTokenMe = await request("/auth/me");

  assert(noTokenMe.status === 401, "No token blocked from /auth/me");

  console.log("\n--- Users Access Tests ---");

  const superOwnerUsers = await request("/users?limit=5", {
    token: superOwner.token,
  });

  assert(superOwnerUsers.status === 200, "SUPER_OWNER can access users", superOwnerUsers.body);

  const adminUsers = await request("/users?limit=5", {
    token: admin.token,
  });

  assert(adminUsers.status === 200, "ADMIN can access users", adminUsers.body);

  const technicianUsers = await request("/users?limit=5", {
    token: technician.token,
  });

  assert(technicianUsers.status === 403, "TECHNICIAN blocked from users", technicianUsers.body);

  console.log("\n--- Settings Access Tests ---");

  const superOwnerSettings = await request("/settings", {
    token: superOwner.token,
  });

  assert(superOwnerSettings.status === 200, "SUPER_OWNER can access settings", superOwnerSettings.body);

  const adminSettings = await request("/settings", {
    token: admin.token,
  });

  assert(adminSettings.status === 200, "ADMIN can access settings", adminSettings.body);

  const technicianSettings = await request("/settings", {
    token: technician.token,
  });

  assert(technicianSettings.status === 403, "TECHNICIAN blocked from settings", technicianSettings.body);

  const noTokenSettings = await request("/settings");

  assert(noTokenSettings.status === 401, "No token blocked from settings");

  console.log("\n--- Health Test ---");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200", health.body);
  assert(health.body?.data?.status === "healthy", "Backend status is healthy", health.body);

  console.log("\nPHASE 14L-B AUTH / USERS / SETTINGS REGRESSION TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 14L-B AUTH / USERS / SETTINGS REGRESSION TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
