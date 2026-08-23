require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";

const users = {
  admin: {
    identifier: "mainadmin",
    password: "Password123!",
  },
  superOwner: {
    identifier: "superowner",
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

const createQuotation = async (token, title) => {
  const result = await request("/quotations", {
    method: "POST",
    token,
    body: JSON.stringify({
      title,
      notes: "Phase 8 Module 7 quotation conversion test.",
      items: [
        {
          description: "Phase 8 Module 7 custom quotation line",
          priceTier: 1,
          quantity: 1,
          unitPrice: 1500,
          discountAmount: 0,
        },
      ],
    }),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
    throw new Error("Failed to create quotation for conversion test");
  }

  return result.body.data;
};

const approveQuotation = async (token, quotationId) => {
  const sent = await request(`/quotations/${quotationId}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(sent.status === 200, "Quotation moved DRAFT to SENT");

  const approved = await request(`/quotations/${quotationId}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(approved.status === 200, "Quotation moved SENT to APPROVED");

  return approved.body.data;
};

const createSaleFromQuotation = async (token, quotationId) => {
  return request("/sales", {
    method: "POST",
    token,
    body: JSON.stringify({
      quotationId,
      remarks: "Phase 8 Module 7 sale linked to approved quotation.",
      items: [
        {
          description: "Phase 8 Module 7 custom sale line",
          quantity: 1,
          unitPrice: 1500,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 1500,
        },
      ],
    }),
  });
};

const main = async () => {
  console.log("\nPhase 8 Module 7: Quotation to Sale Conversion Test");
  console.log("---------------------------------------------------");

  const adminLogin = await login(users.admin);
  const superLogin = await login(users.superOwner);

  const draftQuotation = await createQuotation(
    adminLogin.token,
    "Phase 8 Module 7 Draft Conversion Block Test"
  );

  const draftSale = await createSaleFromQuotation(adminLogin.token, draftQuotation.id);

  assert(draftSale.status === 400, "DRAFT quotation cannot be converted to sale");

  const approvedQuotation = await createQuotation(
    adminLogin.token,
    "Phase 8 Module 7 Approved Conversion Test"
  );

  await approveQuotation(adminLogin.token, approvedQuotation.id);

  const sale = await createSaleFromQuotation(adminLogin.token, approvedQuotation.id);

  if (sale.status !== 201) {
    console.dir(sale.body, { depth: null });
  }

  assert(sale.status === 201, "Approved quotation can be linked to sale");
  assert(sale.body.data.quotationId === approvedQuotation.id, "Sale stores quotationId");
  assert(sale.body.data.quotation.status === "CONVERTED", "Sale response quotation status is CONVERTED");

  const dbQuotation = await prisma.quotation.findUnique({
    where: {
      id: approvedQuotation.id,
    },
  });

  assert(dbQuotation.status === "CONVERTED", "Quotation status updated to CONVERTED in database");
  assert(Boolean(dbQuotation.convertedAt), "Quotation convertedAt is saved");

  const secondSale = await createSaleFromQuotation(adminLogin.token, approvedQuotation.id);

  assert(secondSale.status === 400, "Already converted quotation cannot be converted again");

  const superQuotation = await request("/quotations", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      branchId: sale.body.data.branch.id,
      title: "Phase 8 Module 7 Super Owner Conversion Test",
      items: [
        {
          description: "Super Owner conversion custom line",
          priceTier: 1,
          quantity: 1,
          unitPrice: 1000,
          discountAmount: 0,
        },
      ],
    }),
  });

  assert(superQuotation.status === 201, "Super Owner quotation created with branchId");

  const superSent = await request(`/quotations/${superQuotation.body.data.id}/status`, {
    method: "PATCH",
    token: superLogin.token,
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(superSent.status === 200, "Super Owner quotation moved to SENT");

  const superApproved = await request(`/quotations/${superQuotation.body.data.id}/status`, {
    method: "PATCH",
    token: superLogin.token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(superApproved.status === 200, "Super Owner quotation moved to APPROVED");

  const superSale = await request("/sales", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      branchId: sale.body.data.branch.id,
      quotationId: superQuotation.body.data.id,
      remarks: "Super Owner conversion sale.",
      items: [
        {
          description: "Super Owner conversion custom sale line",
          quantity: 1,
          unitPrice: 1000,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 1000,
        },
      ],
    }),
  });

  if (superSale.status !== 201) {
    console.dir(superSale.body, { depth: null });
  }

  assert(superSale.status === 201, "Super Owner can convert approved quotation with branchId");
  assert(superSale.body.data.quotation.status === "CONVERTED", "Super Owner sale response quotation status is CONVERTED");

  const missingQuotationSale = await request("/sales", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      quotationId: "not-existing-quotation-id",
      items: [
        {
          description: "Missing quotation sale line",
          quantity: 1,
          unitPrice: 100,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 100,
        },
      ],
    }),
  });

  assert(missingQuotationSale.status === 404, "Missing quotation conversion returns 404");

  console.log("\nPHASE 8 MODULE 7 QUOTATION TO SALE CONVERSION TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 8 MODULE 7 QUOTATION TO SALE CONVERSION TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
