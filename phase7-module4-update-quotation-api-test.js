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

const hasOwn = (object, key) => {
  return Object.prototype.hasOwnProperty.call(object, key);
};

const main = async () => {
  console.log("\nPhase 7 Module 4: Update Quotation API Test");
  console.log("-------------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const overview = await request("/inventory/overview?search=Ryzen", {
    token: adminLogin.token,
  });

  assert(overview.status === 200, "Admin can load item for update setup");

  const item = overview.body.data.data.find((row) =>
    row.itemName.includes("Ryzen")
  );

  assert(Boolean(item), "Quotation update test item found");

  const createQuotation = await request("/quotations", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Phase 7 Module 4 Original Title",
      notes: "Original notes.",
      internalNotes: "Original internal notes.",
      isPcBuild: false,
      items: [
        {
          itemId: item.id,
          priceTier: 1,
          quantity: 1,
          discountAmount: 0,
        },
      ],
    }),
  });

  assert(createQuotation.status === 201, "Setup quotation created");

  const quotationId = createQuotation.body.data.id;
  const originalPreparedById = createQuotation.body.data.preparedById;

  const noTokenUpdate = await request(`/quotations/${quotationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "Should fail",
    }),
  });

  assert(noTokenUpdate.status === 401, "Quotation update blocks missing token");

  const techCustomPriceBlocked = await request(`/quotations/${quotationId}`, {
    method: "PATCH",
    token: techLogin.token,
    body: JSON.stringify({
      items: [
        {
          itemId: item.id,
          priceTier: 1,
          quantity: 1,
          unitPrice: 1,
          discountAmount: 0,
        },
      ],
    }),
  });

  assert(techCustomPriceBlocked.status === 403, "Staff custom price update is blocked");

  const adminUpdate = await request(`/quotations/${quotationId}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Phase 7 Module 4 Updated Title",
      notes: "Updated notes.",
      internalNotes: "Updated internal notes.",
      isPcBuild: true,
      items: [
        {
          itemId: item.id,
          priceTier: 2,
          quantity: 2,
          discountAmount: 50,
          isPcBuildPart: true,
        },
        {
          description: "Updated custom labor line",
          priceTier: 1,
          quantity: 1,
          unitPrice: 600,
          discountAmount: 0,
        },
      ],
    }),
  });

  assert(adminUpdate.status === 200, "Admin can update own branch draft quotation");
  assert(adminUpdate.body.data.title === "Phase 7 Module 4 Updated Title", "Quotation title updated");
  assert(adminUpdate.body.data.notes === "Updated notes.", "Quotation notes updated");
  assert(adminUpdate.body.data.internalNotes === "Updated internal notes.", "Admin sees updated internalNotes");
  assert(adminUpdate.body.data.isPcBuild === true, "Quotation isPcBuild updated");
  assert(adminUpdate.body.data.items.length === 2, "Quotation items replaced with two rows");
  assert(adminUpdate.body.data.items[0].priceTier === 2, "Updated item price tier saved");
  assert(Number(adminUpdate.body.data.totalDiscount) === 50, "Updated total discount recalculated");
  assert(Number(adminUpdate.body.data.grandTotal) === Number(adminUpdate.body.data.subtotal) - 50, "Updated grand total recalculated");

  const techViewAfterUpdate = await request(`/quotations/${quotationId}`, {
    token: techLogin.token,
  });

  assert(techViewAfterUpdate.status === 200, "Technician can view updated quotation");
  assert(!hasOwn(techViewAfterUpdate.body.data, "internalNotes"), "Technician still cannot see internalNotes after update");

  const discountTooHigh = await request(`/quotations/${quotationId}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      items: [
        {
          itemId: item.id,
          priceTier: 1,
          quantity: 1,
          discountAmount: 999999,
        },
      ],
    }),
  });

  assert(discountTooHigh.status === 400, "Update blocks discount greater than line total");

  const missingQuotation = await request("/quotations/not-existing-quotation-id", {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Missing quotation",
    }),
  });

  assert(missingQuotation.status === 404, "Update missing quotation returns 404");

  const superUpdate = await request(`/quotations/${quotationId}`, {
    method: "PATCH",
    token: superLogin.token,
    body: JSON.stringify({
      title: "Phase 7 Module 4 Super Updated Title",
      preparedById: "",
    }),
  });

  assert(superUpdate.status === 200, "Super Owner can update quotation");
  assert(superUpdate.body.data.title === "Phase 7 Module 4 Super Updated Title", "Super Owner title update saved");
  assert(
    superUpdate.body.data.preparedById === originalPreparedById,
    "Prepared By remains the authenticated original encoder"
  );

  console.log("\nPHASE 7 MODULE 4 UPDATE QUOTATION API TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 7 MODULE 4 UPDATE QUOTATION API TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
