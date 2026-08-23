const BASE_URL = "http://localhost:5000";

let passed = 0;
let failed = 0;

function pass(message) {
  passed += 1;
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  failed += 1;
  console.log(`[FAIL] ${message}`);
}

function assertTrue(condition, message) {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    pass(`${message} => ${actual}`);
  } else {
    fail(`${message} => expected ${expected} but got ${actual}`);
  }
}

function assertIncludes(array, value, message) {
  if (Array.isArray(array) && array.includes(value)) {
    pass(`${message} => found ${value}`);
  } else {
    fail(`${message} => expected to include ${value}, got ${JSON.stringify(array)}`);
  }
}

function assertAllEqual(items, expected, selector, message) {
  const values = items.map(selector);
  const allMatch = values.every((value) => value === expected);

  if (allMatch) {
    pass(`${message} => all ${expected}`);
  } else {
    fail(`${message} => expected all ${expected}, got ${JSON.stringify(values)}`);
  }
}

async function api(method, path, token = null, body = null) {
  const headers = {
    Accept: "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      error: {
        code: "JSON_PARSE_ERROR",
        message: text,
      },
    };
  }
}

async function login(identifier) {
  return api("POST", "/api/auth/login", null, {
    identifier,
    password: "Password123!",
  });
}

async function main() {
  console.log("");
  console.log("========================================");
  console.log("ARUNAFELTZ PHASE 4 CUSTOMER FINAL TEST");
  console.log("========================================");
  console.log("");

  // 1. Health
  const health = await api("GET", "/api/health");
  assertTrue(health.success === true, "Health endpoint returns success");
  assertEqual(health.data?.status, "healthy", "Health status");

  // 2. Login users
  const superLogin = await login("superowner");
  assertTrue(superLogin.success === true, "Super Owner login success");
  const superToken = superLogin.data?.token;

  const adminLogin = await login("mainadmin");
  assertTrue(adminLogin.success === true, "Admin login success");
  const adminToken = adminLogin.data?.token;

  const techLogin = await login("pendingtech");
  assertTrue(techLogin.success === true, "Technician login success");
  const techToken = techLogin.data?.token;

  // 3. Branch IDs
  const branches = await api("GET", "/api/branches", superToken);
  assertTrue(branches.success === true, "Branches endpoint works");

  const mainBranch = branches.data?.find((branch) => branch.code === "MAIN");
  const mabBranch = branches.data?.find((branch) => branch.code === "MAB");

  assertTrue(Boolean(mainBranch?.id), "MAIN branch ID exists");
  assertTrue(Boolean(mabBranch?.id), "MAB branch ID exists");

  // 4. Super Owner list all customers
  const allCustomers = await api("GET", "/api/customers", superToken);
  assertTrue(allCustomers.success === true, "Super Owner can list all customers");
  assertEqual(allCustomers.data?.pagination?.totalItems, 7, "Super Owner total customer count");

  const allBranchCodes = allCustomers.data?.items?.map((customer) => customer.branch.code) || [];
  assertIncludes(allBranchCodes, "MAIN", "Super Owner can see MAIN customers");
  assertIncludes(allBranchCodes, "MAB", "Super Owner can see MAB customers");

  const mainCustomer = allCustomers.data?.items?.find(
    (customer) => customer.customerCode === "CUST-MAIN-004"
  );

  const mabCustomer = allCustomers.data?.items?.find(
    (customer) => customer.customerCode === "CUST-MAB-001"
  );

  const duplicateMainCustomer = allCustomers.data?.items?.find(
    (customer) => customer.customerCode === "CUST-MAIN-001"
  );

  assertTrue(Boolean(mainCustomer?.id), "CUST-MAIN-004 exists");
  assertTrue(Boolean(mabCustomer?.id), "CUST-MAB-001 exists");
  assertTrue(Boolean(duplicateMainCustomer?.id), "CUST-MAIN-001 exists");

  // 5. Super Owner branch filters
  const mainCustomers = await api(
    "GET",
    `/api/customers?branchId=${mainBranch.id}`,
    superToken
  );

  assertTrue(mainCustomers.success === true, "Super Owner can filter MAIN customers");
  assertEqual(mainCustomers.data?.pagination?.totalItems, 5, "MAIN customer count");
  assertAllEqual(
    mainCustomers.data?.items || [],
    "MAIN",
    (customer) => customer.branch.code,
    "MAIN filter branch check"
  );

  const mabCustomers = await api(
    "GET",
    `/api/customers?branchId=${mabBranch.id}`,
    superToken
  );

  assertTrue(mabCustomers.success === true, "Super Owner can filter MAB customers");
  assertEqual(mabCustomers.data?.pagination?.totalItems, 2, "MAB customer count");
  assertAllEqual(
    mabCustomers.data?.items || [],
    "MAB",
    (customer) => customer.branch.code,
    "MAB filter branch check"
  );

  // 6. Search
  const searchAna = await api("GET", "/api/customers?search=Ana", superToken);
  assertTrue(searchAna.success === true, "Customer search works");
  assertEqual(searchAna.data?.pagination?.totalItems, 1, "Search Ana result count");
  assertEqual(searchAna.data?.items?.[0]?.fullName, "Ana Garcia", "Search Ana result name");
  assertEqual(searchAna.data?.items?.[0]?.branch?.code, "MAB", "Search Ana branch");

  // 7. Pagination
  const pageOne = await api("GET", "/api/customers?page=1&limit=2", superToken);
  assertTrue(pageOne.success === true, "Customer pagination works");
  assertEqual(pageOne.data?.pagination?.page, 1, "Pagination page");
  assertEqual(pageOne.data?.pagination?.limit, 2, "Pagination limit");
  assertEqual(pageOne.data?.pagination?.totalItems, 7, "Pagination total items");
  assertEqual(pageOne.data?.pagination?.totalPages, 4, "Pagination total pages");
  assertEqual(pageOne.data?.pagination?.hasNextPage, true, "Pagination has next page");

  // 8. Admin list scoped to MAIN
  const adminCustomers = await api("GET", "/api/customers", adminToken);
  assertTrue(adminCustomers.success === true, "Admin can list customers");
  assertEqual(adminCustomers.data?.pagination?.totalItems, 5, "Admin customer count");
  assertAllEqual(
    adminCustomers.data?.items || [],
    "MAIN",
    (customer) => customer.branch.code,
    "Admin sees MAIN customers only"
  );

  // 9. Technician list scoped to MAIN
  const techCustomers = await api("GET", "/api/customers", techToken);
  assertTrue(techCustomers.success === true, "Technician can list customers");
  assertEqual(techCustomers.data?.pagination?.totalItems, 5, "Technician customer count");
  assertAllEqual(
    techCustomers.data?.items || [],
    "MAIN",
    (customer) => customer.branch.code,
    "Technician sees MAIN customers only"
  );

  // 10. Get customer by ID
  const superGetMab = await api("GET", `/api/customers/${mabCustomer.id}`, superToken);
  assertTrue(superGetMab.success === true, "Super Owner can get MAB customer");
  assertEqual(superGetMab.data?.customerCode, "CUST-MAB-001", "Super Owner get MAB customer code");
  assertEqual(superGetMab.data?.branch?.code, "MAB", "Super Owner get MAB customer branch");

  const adminGetMain = await api("GET", `/api/customers/${mainCustomer.id}`, adminToken);
  assertTrue(adminGetMain.success === true, "Admin can get MAIN customer");
  assertEqual(adminGetMain.data?.customerCode, "CUST-MAIN-004", "Admin get MAIN customer code");
  assertEqual(adminGetMain.data?.branch?.code, "MAIN", "Admin get MAIN customer branch");

  const techGetMain = await api("GET", `/api/customers/${mainCustomer.id}`, techToken);
  assertTrue(techGetMain.success === true, "Technician can get MAIN customer");
  assertEqual(techGetMain.data?.customerCode, "CUST-MAIN-004", "Technician get MAIN customer code");
  assertEqual(techGetMain.data?.branch?.code, "MAIN", "Technician get MAIN customer branch");

  // 11. Cross-branch restrictions
  const adminGetMab = await api("GET", `/api/customers/${mabCustomer.id}`, adminToken);
  assertEqual(adminGetMab.error?.code, "BRANCH_ACCESS_DENIED", "Admin cannot get MAB customer");

  const techGetMab = await api("GET", `/api/customers/${mabCustomer.id}`, techToken);
  assertEqual(techGetMab.error?.code, "BRANCH_ACCESS_DENIED", "Technician cannot get MAB customer");

  const adminFilterMab = await api(
    "GET",
    `/api/customers?branchId=${mabBranch.id}`,
    adminToken
  );
  assertEqual(adminFilterMab.error?.code, "BRANCH_ACCESS_DENIED", "Admin cannot filter MAB customers");

  // 12. Update customer
  const superUpdateMain = await api(
    "PATCH",
    `/api/customers/${mainCustomer.id}`,
    superToken,
    {
      fullName: "Test Customer Auto Code Updated",
      mobileNumber: "09309998888",
      notes: "Updated by superowner during Phase 4 final test.",
      status: "ACTIVE",
    }
  );

  assertTrue(superUpdateMain.success === true, "Super Owner can update MAIN customer");
  assertEqual(superUpdateMain.data?.fullName, "Test Customer Auto Code Updated", "Super Owner update fullName");
  assertEqual(superUpdateMain.data?.mobileNumber, "09309998888", "Super Owner update mobile number");
  assertEqual(superUpdateMain.data?.updatedBy?.username, "superowner", "Super Owner update updatedBy");

  const adminUpdateMain = await api(
    "PATCH",
    `/api/customers/${mainCustomer.id}`,
    adminToken,
    {
      notes: "Updated by mainadmin during Phase 4 final test.",
      status: "ACTIVE",
    }
  );

  assertTrue(adminUpdateMain.success === true, "Admin can update MAIN customer");
  assertEqual(adminUpdateMain.data?.notes, "Updated by mainadmin during Phase 4 final test.", "Admin update notes");
  assertEqual(adminUpdateMain.data?.updatedBy?.username, "mainadmin", "Admin update updatedBy");

  const adminUpdateMab = await api(
    "PATCH",
    `/api/customers/${mabCustomer.id}`,
    adminToken,
    {
      notes: "Admin should not update MAB customer.",
    }
  );
  assertEqual(adminUpdateMab.error?.code, "BRANCH_ACCESS_DENIED", "Admin cannot update MAB customer");

  // 13. Technician permission restrictions
  const techCreate = await api(
    "POST",
    "/api/customers",
    techToken,
    {
      fullName: "Technician Should Not Create Customer",
    }
  );
  assertEqual(techCreate.error?.code, "FORBIDDEN", "Technician cannot create customer");

  const techUpdate = await api(
    "PATCH",
    `/api/customers/${mainCustomer.id}`,
    techToken,
    {
      notes: "Technician should not update customer.",
    }
  );
  assertEqual(techUpdate.error?.code, "FORBIDDEN", "Technician cannot update customer");

  // 14. Validation and error tests
  const duplicateCreate = await api(
    "POST",
    "/api/customers",
    superToken,
    {
      branchId: mainBranch.id,
      customerCode: "CUST-MAIN-001",
      fullName: "Duplicate Customer Code Test",
    }
  );
  assertEqual(duplicateCreate.error?.code, "CUSTOMER_CODE_ALREADY_EXISTS", "Duplicate create customerCode blocked");

  const duplicateUpdate = await api(
    "PATCH",
    `/api/customers/${mainCustomer.id}`,
    superToken,
    {
      customerCode: duplicateMainCustomer.customerCode,
    }
  );
  assertEqual(duplicateUpdate.error?.code, "CUSTOMER_CODE_ALREADY_EXISTS", "Duplicate update customerCode blocked");

  const invalidCreate = await api(
    "POST",
    "/api/customers",
    superToken,
    {
      branchId: mainBranch.id,
      fullName: "",
    }
  );
  assertEqual(invalidCreate.error?.code, "VALIDATION_ERROR", "Create empty fullName validation");

  const invalidStatusList = await api(
    "GET",
    "/api/customers?status=DELETED",
    superToken
  );
  assertEqual(invalidStatusList.error?.code, "VALIDATION_ERROR", "List invalid status validation");

  const invalidStatusUpdate = await api(
    "PATCH",
    `/api/customers/${mainCustomer.id}`,
    superToken,
    {
      status: "DELETED",
    }
  );
  assertEqual(invalidStatusUpdate.error?.code, "VALIDATION_ERROR", "Update invalid status validation");

  const customerNotFound = await api(
    "GET",
    "/api/customers/customer-does-not-exist",
    superToken
  );
  assertEqual(customerNotFound.error?.code, "CUSTOMER_NOT_FOUND", "Customer not found error");

  const noTokenList = await api("GET", "/api/customers");
  assertEqual(noTokenList.error?.code, "TOKEN_REQUIRED", "No token list blocked");

  const noTokenGet = await api("GET", `/api/customers/${mainCustomer.id}`);
  assertEqual(noTokenGet.error?.code, "TOKEN_REQUIRED", "No token get blocked");

  // 15. Final customer count
  const finalCustomers = await api("GET", "/api/customers", superToken);
  assertTrue(finalCustomers.success === true, "Final customer list works");
  assertEqual(finalCustomers.data?.pagination?.totalItems, 7, "Final customer count remains 7");

  const finalMainCustomers = finalCustomers.data?.items?.filter(
    (customer) => customer.branch.code === "MAIN"
  );

  const finalMabCustomers = finalCustomers.data?.items?.filter(
    (customer) => customer.branch.code === "MAB"
  );

  assertEqual(finalMainCustomers?.length, 5, "Final MAIN customer count");
  assertEqual(finalMabCustomers?.length, 2, "Final MAB customer count");

  console.log("");
  console.log("========================================");
  console.log("PHASE 4 CUSTOMER FINAL TEST RESULT");
  console.log("========================================");
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);

  if (failed === 0) {
    console.log("STATUS: PHASE 4 CUSTOMERS PASSED");
    process.exit(0);
  }

  console.log("STATUS: PHASE 4 CUSTOMERS HAS FAILURES");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
