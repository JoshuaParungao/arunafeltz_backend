const BASE_URL = "http://localhost:5000/api";

const results = [];

const addResult = (name, passed, details = "") => {
  results.push({ name, passed, details });
  const icon = passed ? "PASS" : "FAIL";
  console.log(`${icon} - ${name}${details ? ` | ${details}` : ""}`);
};

const request = async ({ method = "GET", path, token, body }) => {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
};

const login = async (identifier) => {
  const response = await request({
    method: "POST",
    path: "/auth/login",
    body: {
      identifier,
      password: "Password123!",
    },
  });

  if (!response.ok || !response.data?.data?.token) {
    throw new Error(`Login failed for ${identifier}`);
  }

  return response.data.data.token;
};

const hasProperty = (object, propertyName) => {
  return Object.prototype.hasOwnProperty.call(object || {}, propertyName);
};

const getErrorCode = (response) => {
  return response.data?.error?.code;
};

const expectErrorCode = (name, response, expectedCode) => {
  const actualCode = getErrorCode(response);

  addResult(
    name,
    actualCode === expectedCode,
    `expected=${expectedCode}, actual=${actualCode || "NONE"}`
  );
};

const main = async () => {
  console.log("\nPHASE 5 FINAL TEST");
  console.log("------------------\n");

  const health = await request({
    path: "/health",
  });

  addResult(
    "Health check",
    health.ok && health.data?.success === true && health.data?.data?.status === "healthy",
    `status=${health.data?.data?.status}`
  );

  const superToken = await login("superowner");
  const adminToken = await login("mainadmin");
  const techToken = await login("pendingtech");

  addResult("Login superowner", Boolean(superToken));
  addResult("Login mainadmin", Boolean(adminToken));
  addResult("Login pendingtech", Boolean(techToken));

  const branchesResponse = await request({
    path: "/branches",
    token: superToken,
  });

  const branches = branchesResponse.data?.data || [];
  const mainBranch = branches.find((branch) => branch.code === "MAIN");
  const mabBranch = branches.find((branch) => branch.code === "MAB");

  addResult("MAIN branch found", Boolean(mainBranch?.id), mainBranch?.id || "");
  addResult("MAB branch found", Boolean(mabBranch?.id), mabBranch?.id || "");

  const unitList = await request({
    path: "/units",
    token: superToken,
  });

  const units = unitList.data?.data?.items || [];
  const pcsUnit = units.find((unit) => unit.unitCode === "PCS");
  const packUnit = units.find((unit) => unit.unitCode === "PACK");

  addResult(
    "Units count = 5",
    unitList.data?.data?.pagination?.totalItems === 5,
    `actual=${unitList.data?.data?.pagination?.totalItems}`
  );

  addResult("PCS unit found", Boolean(pcsUnit?.id), pcsUnit?.id || "");
  addResult("PACK unit found", Boolean(packUnit?.id), packUnit?.id || "");

  const categoryList = await request({
    path: "/item-categories",
    token: superToken,
  });

  const categories = categoryList.data?.data?.items || [];
  const mainCpuCategory = categories.find(
    (category) => category.branch?.code === "MAIN" && category.categoryCode === "CAT-CPU"
  );
  const mainMoboCategory = categories.find(
    (category) => category.branch?.code === "MAIN" && category.categoryCode === "CAT-MOBO"
  );
  const mabCpuCategory = categories.find(
    (category) => category.branch?.code === "MAB" && category.categoryCode === "CAT-CPU"
  );

  addResult(
    "Item categories count = 15",
    categoryList.data?.data?.pagination?.totalItems === 15,
    `actual=${categoryList.data?.data?.pagination?.totalItems}`
  );

  addResult("MAIN CAT-CPU found", Boolean(mainCpuCategory?.id), mainCpuCategory?.id || "");
  addResult("MAIN CAT-MOBO found", Boolean(mainMoboCategory?.id), mainMoboCategory?.id || "");
  addResult("MAB CAT-CPU found", Boolean(mabCpuCategory?.id), mabCpuCategory?.id || "");

  const superItemList = await request({
    path: "/items",
    token: superToken,
  });

  const superItems = superItemList.data?.data?.items || [];
  const mainApiItem = superItems.find((item) => item.itemCode === "ITEM-MAIN-API");
  const mainAutoItem = superItems.find((item) => item.itemCode === "ITEM-MAIN-API-001");
  const mabItem = superItems.find((item) => item.itemCode === "ITEM-MAB-001");

  addResult(
    "Super Owner item count = 7",
    superItemList.data?.data?.pagination?.totalItems === 7,
    `actual=${superItemList.data?.data?.pagination?.totalItems}`
  );

  addResult("ITEM-MAIN-API found", Boolean(mainApiItem?.id), mainApiItem?.id || "");
  addResult("ITEM-MAIN-API-001 found", Boolean(mainAutoItem?.id), mainAutoItem?.id || "");
  addResult("ITEM-MAB-001 found", Boolean(mabItem?.id), mabItem?.id || "");

  const adminItemList = await request({
    path: "/items",
    token: adminToken,
  });

  const adminItems = adminItemList.data?.data?.items || [];
  const adminOnlyMain = adminItems.every((item) => item.branch?.code === "MAIN");

  addResult(
    "Admin item count = 5",
    adminItemList.data?.data?.pagination?.totalItems === 5,
    `actual=${adminItemList.data?.data?.pagination?.totalItems}`
  );

  addResult("Admin only sees MAIN items", adminOnlyMain);

  const techItemList = await request({
    path: "/items",
    token: techToken,
  });

  const techItems = techItemList.data?.data?.items || [];
  const techOnlyMain = techItems.every((item) => item.branch?.code === "MAIN");

  addResult(
    "Technician item count = 5",
    techItemList.data?.data?.pagination?.totalItems === 5,
    `actual=${techItemList.data?.data?.pagination?.totalItems}`
  );

  addResult("Technician only sees MAIN items", techOnlyMain);

  addResult(
    "Super Owner sees costPrice in list",
    hasProperty(superItems[0], "costPrice")
  );

  addResult(
    "Admin sees costPrice in list",
    hasProperty(adminItems[0], "costPrice")
  );

  addResult(
    "Technician does not see costPrice in list",
    !hasProperty(techItems[0], "costPrice")
  );

  const superGetItem = await request({
    path: `/items/${mainApiItem.id}`,
    token: superToken,
  });

  const techGetItem = await request({
    path: `/items/${mainApiItem.id}`,
    token: techToken,
  });

  addResult(
    "Super Owner sees costPrice in get item",
    hasProperty(superGetItem.data?.data, "costPrice")
  );

  addResult(
    "Technician does not see costPrice in get item",
    !hasProperty(techGetItem.data?.data, "costPrice")
  );

  addResult(
    "Technician still sees selling prices",
    hasProperty(techGetItem.data?.data, "price1") &&
      hasProperty(techGetItem.data?.data, "price5")
  );

  const mabFilter = await request({
    path: `/items?branchId=${mabBranch.id}`,
    token: superToken,
  });

  addResult(
    "Super Owner can filter MAB items = 2",
    mabFilter.data?.data?.pagination?.totalItems === 2,
    `actual=${mabFilter.data?.data?.pagination?.totalItems}`
  );

  const adminMabFilter = await request({
    path: `/items?branchId=${mabBranch.id}`,
    token: adminToken,
  });

  expectErrorCode(
    "Admin cannot filter MAB items",
    adminMabFilter,
    "BRANCH_ACCESS_DENIED"
  );

  const adminGetMabItem = await request({
    path: `/items/${mabItem.id}`,
    token: adminToken,
  });

  expectErrorCode(
    "Admin cannot get MAB item",
    adminGetMabItem,
    "BRANCH_ACCESS_DENIED"
  );

  const searchApi = await request({
    path: "/items?search=API",
    token: superToken,
  });

  const searchApiCodes = (searchApi.data?.data?.items || []).map((item) => item.itemCode);

  addResult(
    "Search API returns test API items",
    searchApiCodes.includes("ITEM-MAIN-API") &&
      searchApiCodes.includes("ITEM-MAIN-API-001"),
    searchApiCodes.join(", ")
  );

  const cpuFilter = await request({
    path: `/items?categoryId=${mainCpuCategory.id}`,
    token: superToken,
  });

  addResult(
    "MAIN CPU category filter works",
    cpuFilter.ok && (cpuFilter.data?.data?.items || []).every(
      (item) => item.category?.categoryCode === "CAT-CPU" && item.branch?.code === "MAIN"
    ),
    `actual=${cpuFilter.data?.data?.pagination?.totalItems}`
  );

  const pcsFilter = await request({
    path: `/items?unitId=${pcsUnit.id}`,
    token: superToken,
  });

  addResult(
    "PCS unit filter returns 6 after PACK update",
    pcsFilter.data?.data?.pagination?.totalItems === 6,
    `actual=${pcsFilter.data?.data?.pagination?.totalItems}`
  );

  const serializedFilter = await request({
    path: "/items?isSerialized=true",
    token: superToken,
  });

  addResult(
    "Serialized filter returns 7",
    serializedFilter.data?.data?.pagination?.totalItems === 7,
    `actual=${serializedFilter.data?.data?.pagination?.totalItems}`
  );

  const pageOne = await request({
    path: "/items?page=1&limit=3",
    token: superToken,
  });

  addResult(
    "Pagination page 1 works",
    pageOne.data?.data?.pagination?.page === 1 &&
      pageOne.data?.data?.pagination?.limit === 3 &&
      pageOne.data?.data?.pagination?.totalItems === 7 &&
      pageOne.data?.data?.pagination?.totalPages === 3,
    JSON.stringify(pageOne.data?.data?.pagination)
  );

  const invalidStatus = await request({
    path: "/items?status=DELETED",
    token: superToken,
  });

  expectErrorCode("Invalid item status validation", invalidStatus, "VALIDATION_ERROR");

  const invalidBoolean = await request({
    path: "/items?isSerialized=yes",
    token: superToken,
  });

  expectErrorCode("Invalid boolean validation", invalidBoolean, "VALIDATION_ERROR");

  const noTokenItems = await request({
    path: "/items",
  });

  expectErrorCode("No token items list", noTokenItems, "TOKEN_REQUIRED");

  const duplicateItemCode = await request({
    method: "POST",
    path: "/items",
    token: superToken,
    body: {
      branchId: mainBranch.id,
      itemCode: "ITEM-MAIN-API",
      itemName: "Duplicate Final Test",
      categoryId: mainMoboCategory.id,
      unitId: pcsUnit.id,
    },
  });

  expectErrorCode("Duplicate itemCode create", duplicateItemCode, "ITEM_CODE_ALREADY_EXISTS");

  const categoryMismatch = await request({
    method: "POST",
    path: "/items",
    token: superToken,
    body: {
      branchId: mainBranch.id,
      itemCode: "ITEM-MAIN-FINAL-MISMATCH",
      itemName: "Category Mismatch Final Test",
      categoryId: mabCpuCategory.id,
      unitId: pcsUnit.id,
    },
  });

  expectErrorCode("Category branch mismatch create", categoryMismatch, "CATEGORY_BRANCH_MISMATCH");

  const techCreateItem = await request({
    method: "POST",
    path: "/items",
    token: techToken,
    body: {
      itemName: "Technician Final Create Block",
      categoryId: mainMoboCategory.id,
      unitId: pcsUnit.id,
    },
  });

  expectErrorCode("Technician cannot create item", techCreateItem, "FORBIDDEN");

  const techUpdateItem = await request({
    method: "PATCH",
    path: `/items/${mainAutoItem.id}`,
    token: techToken,
    body: {
      price1: "9999.00",
    },
  });

  expectErrorCode("Technician cannot update item", techUpdateItem, "FORBIDDEN");

  const negativeCost = await request({
    method: "PATCH",
    path: `/items/${mainAutoItem.id}`,
    token: superToken,
    body: {
      costPrice: "-1.00",
    },
  });

  expectErrorCode("Negative costPrice validation", negativeCost, "VALIDATION_ERROR");

  const negativeSellingPrice = await request({
    method: "PATCH",
    path: `/items/${mainAutoItem.id}`,
    token: superToken,
    body: {
      price5: "-1.00",
    },
  });

  expectErrorCode("Negative selling price validation", negativeSellingPrice, "VALIDATION_ERROR");

  const duplicateCategoryCode = await request({
    method: "POST",
    path: "/item-categories",
    token: superToken,
    body: {
      branchId: mainBranch.id,
      categoryCode: "CAT-MAIN-API",
      name: "Duplicate Category Final Test",
    },
  });

  expectErrorCode(
    "Duplicate categoryCode create",
    duplicateCategoryCode,
    "CATEGORY_CODE_ALREADY_EXISTS"
  );

  const duplicateUnitCode = await request({
    method: "POST",
    path: "/units",
    token: superToken,
    body: {
      unitCode: "PACK",
      name: "Duplicate Unit Final Test",
    },
  });

  expectErrorCode("Duplicate unitCode create", duplicateUnitCode, "UNIT_CODE_ALREADY_EXISTS");

  const techCreateCategory = await request({
    method: "POST",
    path: "/item-categories",
    token: techToken,
    body: {
      name: "Tech Category Final Block",
    },
  });

  expectErrorCode("Technician cannot create category", techCreateCategory, "FORBIDDEN");

  const techCreateUnit = await request({
    method: "POST",
    path: "/units",
    token: techToken,
    body: {
      unitCode: "TECHFINAL",
      name: "Tech Final Unit",
    },
  });

  expectErrorCode("Technician cannot create unit", techCreateUnit, "FORBIDDEN");

  const finalItemList = await request({
    path: "/items",
    token: superToken,
  });

  const finalItems = finalItemList.data?.data?.items || [];
  const finalMabCount = finalItems.filter((item) => item.branch?.code === "MAB").length;
  const finalMainCount = finalItems.filter((item) => item.branch?.code === "MAIN").length;

  addResult(
    "Final items count remains 7",
    finalItemList.data?.data?.pagination?.totalItems === 7,
    `actual=${finalItemList.data?.data?.pagination?.totalItems}`
  );

  addResult("Final MAB item count = 2", finalMabCount === 2, `actual=${finalMabCount}`);
  addResult("Final MAIN item count = 5", finalMainCount === 5, `actual=${finalMainCount}`);

  console.log("\nSUMMARY");
  console.log("-------");

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFAILED TESTS");
    console.log("------------");

    for (const result of results.filter((item) => !item.passed)) {
      console.log(`- ${result.name}${result.details ? ` | ${result.details}` : ""}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log("\nPHASE 5 FINAL TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 5 FINAL TEST CRASHED");
  console.error(error);
  process.exitCode = 1;
});
