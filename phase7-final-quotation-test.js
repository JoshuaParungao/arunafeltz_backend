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
  console.log("\nPHASE 7 FINAL QUOTATION TEST");
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

  const overview = await request("/inventory/overview?search=Ryzen", {
    token: adminLogin.token,
  });

  assert(overview.status === 200, "Admin can load inventory item for quotation");
  assert(overview.body.data.data.length >= 1, "Inventory item search has rows");

  const item = overview.body.data.data.find((row) =>
    row.itemName.includes("Ryzen")
  );

  assert(Boolean(item), "Ryzen quotation item found");

  const createNoToken = await request("/quotations", {
    method: "POST",
    body: JSON.stringify({
      title: "Should fail",
      items: [],
    }),
  });

  assert(createNoToken.status === 401, "Create quotation blocks missing token");

  const createEmptyItems = await request("/quotations", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Should fail empty items",
      items: [],
    }),
  });

  assert(createEmptyItems.status === 400, "Create quotation blocks empty items");

  const staffCustomPrice = await request("/quotations", {
    method: "POST",
    token: techLogin.token,
    body: JSON.stringify({
      title: "Staff custom price should fail",
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

  assert(staffCustomPrice.status === 403, "Staff cannot set custom price for inventory item");

  const createQuotation = await request("/quotations", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Phase 7 Final Quotation",
      notes: "Final quotation test note.",
      internalNotes: "Final internal note for admin only.",
      isPcBuild: true,
      items: [
        {
          itemId: item.id,
          priceTier: 1,
          quantity: 2,
          discountAmount: 100,
          isPcBuildPart: true,
          remarks: "Processor line.",
        },
        {
          description: "Final custom labor line",
          priceTier: 1,
          quantity: 1,
          unitPrice: 500,
          discountAmount: 0,
          remarks: "Custom line.",
        },
      ],
    }),
  });

  assert(createQuotation.status === 201, "Admin can create quotation");
  assert(createQuotation.body.data.quotationCode.startsWith("QT-MAIN-"), "Quotation code generated for MAIN");
  assert(createQuotation.body.data.status === "DRAFT", "New quotation status is DRAFT");
  assert(createQuotation.body.data.items.length === 2, "Quotation has two items");
  assert(Number(createQuotation.body.data.subtotal) > 0, "Quotation subtotal computed");
  assert(Number(createQuotation.body.data.totalDiscount) === 100, "Quotation total discount computed");
  assert(Number(createQuotation.body.data.grandTotal) === Number(createQuotation.body.data.subtotal) - 100, "Quotation grand total computed");
  assert(createQuotation.body.data.items[0].itemCodeSnapshot === item.itemCode, "Item snapshot saved");

  const quotationId = createQuotation.body.data.id;
  const quotationCode = createQuotation.body.data.quotationCode;

  const listNoToken = await request("/quotations");

  assert(listNoToken.status === 401, "Quotation list blocks missing token");

  const adminList = await request(`/quotations?search=${encodeURIComponent(quotationCode)}`, {
    token: adminLogin.token,
  });

  assert(adminList.status === 200, "Admin can search quotation list");
  assert(adminList.body.data.data.some((quotation) => quotation.id === quotationId), "Admin search returns created quotation");
  assert(hasOwn(adminList.body.data.data[0], "internalNotes"), "Admin can see internalNotes in list");

  const techList = await request(`/quotations?search=${encodeURIComponent(quotationCode)}`, {
    token: techLogin.token,
  });

  assert(techList.status === 200, "Technician can search own branch quotation list");
  assert(techList.body.data.data.some((quotation) => quotation.id === quotationId), "Technician search returns created quotation");
  assert(!hasOwn(techList.body.data.data[0], "internalNotes"), "Technician cannot see internalNotes in list");

  const adminView = await request(`/quotations/${quotationId}`, {
    token: adminLogin.token,
  });

  assert(adminView.status === 200, "Admin can view quotation detail");
  assert(adminView.body.data.id === quotationId, "Admin viewed correct quotation");
  assert(adminView.body.data.items.length === 2, "Quotation detail includes items");
  assert(hasOwn(adminView.body.data, "internalNotes"), "Admin can see internalNotes in detail");

  const techView = await request(`/quotations/${quotationId}`, {
    token: techLogin.token,
  });

  assert(techView.status === 200, "Technician can view own branch quotation detail");
  assert(techView.body.data.id === quotationId, "Technician viewed correct quotation");
  assert(!hasOwn(techView.body.data, "internalNotes"), "Technician cannot see internalNotes in detail");

  const updateNoToken = await request(`/quotations/${quotationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "Should fail",
    }),
  });

  assert(updateNoToken.status === 401, "Update quotation blocks missing token");

  const updateQuotation = await request(`/quotations/${quotationId}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Phase 7 Final Updated Quotation",
      notes: "Updated final note.",
      internalNotes: "Updated final internal note.",
      isPcBuild: true,
      items: [
        {
          itemId: item.id,
          priceTier: 2,
          quantity: 1,
          discountAmount: 50,
          isPcBuildPart: true,
        },
        {
          description: "Updated final custom labor",
          priceTier: 1,
          quantity: 1,
          unitPrice: 600,
          discountAmount: 0,
        },
      ],
    }),
  });

  assert(updateQuotation.status === 200, "Admin can update draft quotation");
  assert(updateQuotation.body.data.title === "Phase 7 Final Updated Quotation", "Quotation title updated");
  assert(updateQuotation.body.data.items.length === 2, "Quotation items replaced");
  assert(updateQuotation.body.data.items[0].priceTier === 2, "Updated price tier saved");
  assert(Number(updateQuotation.body.data.totalDiscount) === 50, "Updated discount recalculated");
  assert(Number(updateQuotation.body.data.grandTotal) === Number(updateQuotation.body.data.subtotal) - 50, "Updated grand total recalculated");

  const badDiscount = await request(`/quotations/${quotationId}`, {
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

  assert(badDiscount.status === 400, "Update blocks discount greater than line total");

  const invalidStatus = await request(`/quotations/${quotationId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CONVERTED",
    }),
  });

  assert(invalidStatus.status === 400, "Invalid quotation status value blocked");

  const draftToApproved = await request(`/quotations/${quotationId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(draftToApproved.status === 400, "DRAFT to APPROVED is blocked");

  const draftToSent = await request(`/quotations/${quotationId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(draftToSent.status === 200, "DRAFT to SENT allowed");
  assert(draftToSent.body.data.status === "SENT", "Quotation status is SENT");
  assert(Boolean(draftToSent.body.data.sentAt), "sentAt is set");

  const updateSentBlocked = await request(`/quotations/${quotationId}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Should not update SENT quotation",
    }),
  });

  assert(updateSentBlocked.status === 400, "Non-DRAFT quotation update is blocked");

  const sentToApproved = await request(`/quotations/${quotationId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(sentToApproved.status === 200, "SENT to APPROVED allowed");
  assert(sentToApproved.body.data.status === "APPROVED", "Quotation status is APPROVED");
  assert(Boolean(sentToApproved.body.data.approvedAt), "approvedAt is set");

  const approvedToCancelled = await request(`/quotations/${quotationId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
    }),
  });

  assert(approvedToCancelled.status === 400, "APPROVED to CANCELLED is blocked");

  const cancelQuotation = await request("/quotations", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Phase 7 Final Cancel Quotation",
      internalNotes: "Will be cancelled.",
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

  assert(cancelQuotation.status === 201, "Cancel test quotation created");

  const draftToCancelled = await request(`/quotations/${cancelQuotation.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
      remarks: "Final test cancellation.",
    }),
  });

  assert(draftToCancelled.status === 200, "DRAFT to CANCELLED allowed");
  assert(draftToCancelled.body.data.status === "CANCELLED", "Quotation status is CANCELLED");
  assert(Boolean(draftToCancelled.body.data.cancelledAt), "cancelledAt is set");

  const cancelledToSent = await request(`/quotations/${cancelQuotation.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(cancelledToSent.status === 400, "CANCELLED to SENT is blocked");

  const superCreate = await request("/quotations", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      branchId: item.branch.id,
      title: "Phase 7 Final Super Quotation",
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

  assert(superCreate.status === 201, "Super Owner can create quotation with branchId");

  const superUpdate = await request(`/quotations/${superCreate.body.data.id}`, {
    method: "PATCH",
    token: superLogin.token,
    body: JSON.stringify({
      title: "Phase 7 Final Super Updated",
      preparedById: "",
    }),
  });

  assert(superUpdate.status === 200, "Super Owner can update quotation");
  assert(
    superUpdate.body.data.preparedById === superCreate.body.data.preparedById,
    "Prepared By remains the authenticated encoder and cannot be cleared"
  );

  const missingView = await request("/quotations/not-existing-quotation-id", {
    token: adminLogin.token,
  });

  assert(missingView.status === 404, "Missing quotation view returns 404");

  const missingUpdate = await request("/quotations/not-existing-quotation-id", {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Missing",
    }),
  });

  assert(missingUpdate.status === 404, "Missing quotation update returns 404");

  const missingStatus = await request("/quotations/not-existing-quotation-id/status", {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(missingStatus.status === 404, "Missing quotation status update returns 404");

  const finalHealth = await request("/health");

  assert(finalHealth.status === 200, "Final health endpoint returns 200");
  assert(finalHealth.body?.data?.status === "healthy", "Final backend status is healthy");

  console.log("\nPHASE 7 FINAL QUOTATION TEST PASSED");
  console.log("-----------------------------------");
  console.log("Verified: models, create, list, view, update, status transitions, permissions, branch scope, internalNotes hiding, and health.");
};

main().catch((error) => {
  console.error("\nPHASE 7 FINAL QUOTATION TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
