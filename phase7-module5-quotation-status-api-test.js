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

const createDraftQuotation = async (token, item, title) => {
  const result = await request("/quotations", {
    method: "POST",
    token,
    body: JSON.stringify({
      title,
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

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
    throw new Error("Failed to create draft quotation for test");
  }

  return result.body.data;
};

const main = async () => {
  console.log("\nPhase 7 Module 5: Quotation Status API Test");
  console.log("-------------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const overview = await request("/inventory/overview?search=Ryzen", {
    token: adminLogin.token,
  });

  assert(overview.status === 200, "Admin can load item for status setup");

  const item = overview.body.data.data.find((row) =>
    row.itemName.includes("Ryzen")
  );

  assert(Boolean(item), "Quotation status test item found");

  const draftQuotation = await createDraftQuotation(
    adminLogin.token,
    item,
    "Phase 7 Module 5 Draft to Sent"
  );

  const noTokenStatus = await request(`/quotations/${draftQuotation.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(noTokenStatus.status === 401, "Quotation status update blocks missing token");

  const invalidStatusValue = await request(`/quotations/${draftQuotation.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CONVERTED",
    }),
  });

  assert(invalidStatusValue.status === 400, "Invalid status value is blocked by validation");

  const draftToApproved = await request(`/quotations/${draftQuotation.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(draftToApproved.status === 400, "DRAFT to APPROVED is blocked");

  const draftToSent = await request(`/quotations/${draftQuotation.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(draftToSent.status === 200, "Admin can update DRAFT to SENT");
  assert(draftToSent.body.data.status === "SENT", "Quotation status is SENT");
  assert(Boolean(draftToSent.body.data.sentAt), "sentAt is set");

  const sentToApproved = await request(`/quotations/${draftQuotation.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(sentToApproved.status === 200, "Admin can update SENT to APPROVED");
  assert(sentToApproved.body.data.status === "APPROVED", "Quotation status is APPROVED");
  assert(Boolean(sentToApproved.body.data.approvedAt), "approvedAt is set");

  const approvedToCancel = await request(`/quotations/${draftQuotation.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
      remarks: "Should not cancel approved quotation.",
    }),
  });

  assert(approvedToCancel.status === 400, "APPROVED to CANCELLED is blocked");

  const cancelDraft = await createDraftQuotation(
    adminLogin.token,
    item,
    "Phase 7 Module 5 Draft to Cancelled"
  );

  const draftToCancelled = await request(`/quotations/${cancelDraft.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
      remarks: "Customer cancelled before sending.",
    }),
  });

  assert(draftToCancelled.status === 200, "Admin can cancel DRAFT quotation");
  assert(draftToCancelled.body.data.status === "CANCELLED", "DRAFT quotation became CANCELLED");
  assert(Boolean(draftToCancelled.body.data.cancelledAt), "cancelledAt is set");

  const cancelledToSent = await request(`/quotations/${cancelDraft.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(cancelledToSent.status === 400, "CANCELLED to SENT is blocked");

  const superDraft = await request("/quotations", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      branchId: item.branch.id,
      title: "Phase 7 Module 5 Super Owner Status",
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

  assert(superDraft.status === 201, "Super Owner setup quotation created");

  const superSent = await request(`/quotations/${superDraft.body.data.id}/status`, {
    method: "PATCH",
    token: superLogin.token,
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(superSent.status === 200, "Super Owner can update quotation status");
  assert(superSent.body.data.status === "SENT", "Super Owner quotation became SENT");

  const techDraft = await createDraftQuotation(
    techLogin.token,
    item,
    "Phase 7 Module 5 Technician Status"
  );

  const techSent = await request(`/quotations/${techDraft.id}/status`, {
    method: "PATCH",
    token: techLogin.token,
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(techSent.status === 200, "Technician can update own branch quotation status");
  assert(techSent.body.data.status === "SENT", "Technician quotation became SENT");

  const missingQuotation = await request("/quotations/not-existing-quotation-id/status", {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(missingQuotation.status === 404, "Missing quotation status update returns 404");

  console.log("\nPHASE 7 MODULE 5 QUOTATION STATUS API TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 7 MODULE 5 QUOTATION STATUS API TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
