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

  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
};

const login = async (credentials) => {
  const response = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });

  assert(response.status === 200, `Login succeeds for ${credentials.identifier}`);

  return response.body.data;
};

const createQuotation = async (token, payload) => {
  const response = await request("/quotations", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });

  if (response.status !== 201) {
    console.dir(response.body, { depth: null });
  }

  assert(response.status === 201, `Quotation created: ${payload.title}`);
  return response.body.data;
};

const approveQuotation = async (token, quotationId) => {
  const sent = await request(`/quotations/${quotationId}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ status: "SENT" }),
  });
  assert(sent.status === 200, "Quotation transitions DRAFT to SENT");

  const approved = await request(`/quotations/${quotationId}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ status: "APPROVED" }),
  });
  assert(approved.status === 200, "Quotation transitions SENT to APPROVED");

  return approved.body.data;
};

const main = async () => {
  console.log("\nPhase A: Quotation / Sale Hardening Test");
  console.log("-----------------------------------------");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminLogin = await login(users.admin);
  const superLogin = await login(users.superOwner);
  const adminToken = adminLogin.token;
  const admin = adminLogin.user;

  const serviceStaffResponse = await request("/quotations/service-staff", {
    token: adminToken,
  });
  assert(serviceStaffResponse.status === 200, "Quotation-safe service staff lookup succeeds");

  const serviceStaff = serviceStaffResponse.body.data;
  assert(serviceStaff.length > 0, "Service staff lookup returns active same-branch users");
  assert(
    serviceStaff.every((staff) => {
      return (
        Object.keys(staff).sort().join(",") === "fullName,id,role" &&
        staff.role !== "SUPER_OWNER"
      );
    }),
    "Service staff lookup exposes only id/fullName/role and excludes SUPER_OWNER"
  );

  const serviceDoneBy = serviceStaff[0];
  const customer = await prisma.customer.findFirst({
    where: {
      branchId: admin.branchId,
      status: "ACTIVE",
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  const stockedItem = await prisma.item.findFirst({
    where: {
      branchId: admin.branchId,
      status: "ACTIVE",
      isSerialized: false,
      inventoryBatches: {
        some: {
          status: "ACTIVE",
          quantityAvailable: {
            gte: 1,
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      inventoryBatches: {
        where: {
          status: "ACTIVE",
          quantityAvailable: {
            gte: 1,
          },
        },
        orderBy: {
          quantityAvailable: "desc",
        },
        take: 1,
        select: {
          id: true,
          quantityAvailable: true,
        },
      },
    },
  });

  assert(Boolean(stockedItem), "A stocked non-serialized item exists for conversion coverage");

  const editable = await createQuotation(adminToken, {
    title: `Phase A editable ${suffix}`,
    customerId: customer?.id,
    serviceDoneById: serviceDoneBy.id,
    preparedById: superLogin.user.id,
    internalNotes: "Internal-only Phase A note.",
    items: [
      {
        itemId: stockedItem.id,
        priceTier: 1,
        quantity: 1,
        discountAmount: 0,
      },
      {
        description: "Phase A service line before edit",
        priceTier: 1,
        quantity: 1,
        unitPrice: 325.5,
        discountAmount: 25.5,
      },
    ],
  });

  assert(editable.preparedById === admin.id, "Prepared By is the authenticated encoder");
  assert(editable.serviceDoneById === serviceDoneBy.id, "Quotation-level Service Done By is saved");

  const detail = await request(`/quotations/${editable.id}`, {
    token: adminToken,
  });
  const productDetail = detail.body.data.items.find((item) => item.itemId);
  assert(detail.status === 200, "Quotation detail loads for print/edit data");
  assert(
    typeof productDetail.item.isSerialized === "boolean",
    "Quotation detail exposes the safe item.isSerialized flag"
  );
  assert(
    ["description", "quantity", "unitPrice", "discountAmount", "lineTotal"].every(
      (field) => Object.prototype.hasOwnProperty.call(productDetail, field)
    ),
    "Quotation detail provides final customer-facing line amounts"
  );

  const productOnlyUpdate = await request(`/quotations/${editable.id}`, {
    method: "PATCH",
    token: adminToken,
    body: JSON.stringify({
      title: `Phase A product-only edit ${suffix}`,
      customerId: "",
      serviceDoneById: serviceDoneBy.id,
      preparedById: superLogin.user.id,
      items: [
        {
          itemId: stockedItem.id,
          priceTier: 2,
          quantity: 1,
          discountAmount: 10,
        },
      ],
    }),
  });

  assert(productOnlyUpdate.status === 200, "Full DRAFT item/customer edit succeeds");
  assert(productOnlyUpdate.body.data.customerId === null, "DRAFT customer can be cleared for walk-in");
  assert(productOnlyUpdate.body.data.serviceDoneById === null, "Product-only edit clears meaningless Service Done By");
  assert(productOnlyUpdate.body.data.preparedById === admin.id, "DRAFT edit cannot spoof Prepared By");

  const serviceUpdate = await request(`/quotations/${editable.id}`, {
    method: "PATCH",
    token: adminToken,
    body: JSON.stringify({
      serviceDoneById: serviceDoneBy.id,
      items: [
        {
          description: "Phase A replacement service line",
          priceTier: 1,
          quantity: 2,
          unitPrice: 210.25,
          discountAmount: 20.5,
        },
      ],
    }),
  });
  assert(serviceUpdate.status === 200, "DRAFT can be fully replaced with service lines");
  assert(serviceUpdate.body.data.serviceDoneById === serviceDoneBy.id, "Eligible Service Done By can be reassigned");

  const superOwnerAssignment = await request(`/quotations/${editable.id}`, {
    method: "PATCH",
    token: adminToken,
    body: JSON.stringify({ serviceDoneById: superLogin.user.id }),
  });
  assert(superOwnerAssignment.status === 400, "SUPER_OWNER cannot be assigned as Service Done By");

  const concurrentStatusQuotation = await createQuotation(adminToken, {
    title: `Phase A concurrent status ${suffix}`,
    items: [
      {
        description: "Concurrent status service line",
        priceTier: 1,
        quantity: 1,
        unitPrice: 100,
        discountAmount: 0,
      },
    ],
  });

  const concurrentStatuses = await Promise.all([
    request(`/quotations/${concurrentStatusQuotation.id}/status`, {
      method: "PATCH",
      token: adminToken,
      body: JSON.stringify({ status: "SENT" }),
    }),
    request(`/quotations/${concurrentStatusQuotation.id}/status`, {
      method: "PATCH",
      token: adminToken,
      body: JSON.stringify({ status: "SENT" }),
    }),
  ]);

  assert(
    concurrentStatuses.map((response) => response.status).sort().join(",") === "200,400",
    "Concurrent duplicate status transitions serialize to one success"
  );

  const editAfterSent = await request(`/quotations/${concurrentStatusQuotation.id}`, {
    method: "PATCH",
    token: adminToken,
    body: JSON.stringify({ title: "Must not edit after SENT" }),
  });
  assert(editAfterSent.status === 400, "SENT quotation cannot be edited");

  const conversionQuotation = await createQuotation(adminToken, {
    title: `Phase A concurrent conversion ${suffix}`,
    customerId: customer?.id,
    serviceDoneById: serviceDoneBy.id,
    items: [
      {
        description: "Authoritative quoted service",
        priceTier: 1,
        quantity: 2,
        unitPrice: 345.67,
        discountAmount: 12.34,
      },
    ],
  });
  await approveQuotation(adminToken, conversionQuotation.id);

  const customerMismatch = await request("/sales", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({
      quotationId: conversionQuotation.id,
      customerId: "not-the-quotation-customer",
      items: [{ description: "ignored", quantity: 1, unitPrice: 1 }],
      payments: [{ paymentMethod: "OTHER", amount: 0 }],
    }),
  });
  assert(customerMismatch.body?.errorCode === "QUOTATION_CUSTOMER_MISMATCH", "Conversion rejects customer replacement");

  const extraCharge = await request("/sales", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({
      quotationId: conversionQuotation.id,
      serviceCharge: 1,
      items: [{ description: "ignored", quantity: 1, unitPrice: 1 }],
      payments: [{ paymentMethod: "OTHER", amount: 0 }],
    }),
  });
  assert(extraCharge.body?.errorCode === "QUOTATION_SERVICE_CHARGE_NOT_ALLOWED", "Conversion rejects unquoted charges");

  const extraLine = await request("/sales", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({
      quotationId: conversionQuotation.id,
      items: [
        { description: "ignored one", quantity: 1, unitPrice: 1 },
        { description: "ignored two", quantity: 1, unitPrice: 1 },
      ],
      payments: [{ paymentMethod: "OTHER", amount: 0 }],
    }),
  });
  assert(extraLine.body?.errorCode === "QUOTATION_ITEMS_MISMATCH", "Conversion rejects extra sale lines");

  const conversionPayload = {
    quotationId: conversionQuotation.id,
    remarks: "Phase A authoritative conversion.",
    items: [
      {
        description: "Client tampering must be ignored",
        quantity: 99,
        unitPrice: 0,
        discountAmount: 0,
      },
    ],
    payments: [
      {
        paymentMethod: "OTHER",
        amount: Number(conversionQuotation.grandTotal),
      },
    ],
  };

  const concurrentConversions = await Promise.all([
    request("/sales", {
      method: "POST",
      token: adminToken,
      body: JSON.stringify(conversionPayload),
    }),
    request("/sales", {
      method: "POST",
      token: adminToken,
      body: JSON.stringify(conversionPayload),
    }),
  ]);

  assert(
    concurrentConversions.map((response) => response.status).sort().join(",") === "201,400",
    "Concurrent quotation conversion creates exactly one sale"
  );

  const convertedSale = concurrentConversions.find((response) => response.status === 201).body.data;
  const rejectedConversion = concurrentConversions.find((response) => response.status === 400);
  assert(rejectedConversion.body.errorCode === "QUOTATION_ALREADY_CONVERTED", "Concurrent duplicate gets converted conflict");
  assert(convertedSale.customerId === (customer?.id || null), "Converted sale inherits quotation customer");
  assert(convertedSale.items[0].description === "Authoritative quoted service", "Converted service description comes from quotation");
  assert(Number(convertedSale.items[0].quantity) === 2, "Converted service quantity comes from quotation");
  assert(Number(convertedSale.items[0].unitPrice) === 345.67, "Converted service price comes from quotation");
  assert(Number(convertedSale.grandTotal) === Number(conversionQuotation.grandTotal), "Converted totals equal approved quotation");
  assert(convertedSale.quotation.preparedBy.id === admin.id, "Prepared By attribution remains linked through sale");
  assert(convertedSale.quotation.serviceDoneBy.id === serviceDoneBy.id, "Service Done By attribution remains linked through sale");

  const conversionSaleCount = await prisma.sale.count({
    where: {
      quotationId: conversionQuotation.id,
    },
  });
  const preservedQuotation = await prisma.quotation.findUnique({
    where: {
      id: conversionQuotation.id,
    },
    select: {
      status: true,
      convertedAt: true,
      items: {
        select: {
          id: true,
        },
      },
    },
  });
  assert(conversionSaleCount === 1, "Database contains one sale for the quotation");
  assert(preservedQuotation.status === "CONVERTED" && Boolean(preservedQuotation.convertedAt), "Original quotation is preserved and marked converted");
  assert(preservedQuotation.items.length === 1, "Original quotation items remain auditable");

  const productQuotation = await createQuotation(adminToken, {
    title: `Phase A product conversion ${suffix}`,
    items: [
      {
        itemId: stockedItem.id,
        priceTier: 1,
        quantity: 1,
        discountAmount: 1,
      },
    ],
  });
  await approveQuotation(adminToken, productQuotation.id);

  const batchBefore = Number(stockedItem.inventoryBatches[0].quantityAvailable);
  const productSaleResponse = await request("/sales", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({
      quotationId: productQuotation.id,
      items: [
        {
          itemId: stockedItem.id,
          batchId: stockedItem.inventoryBatches[0].id,
          priceTier: 5,
          quantity: 99,
          unitPrice: 0,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "OTHER",
          amount: Number(productQuotation.grandTotal),
        },
      ],
    }),
  });

  if (productSaleResponse.status !== 201) {
    console.dir(productSaleResponse.body, { depth: null });
  }
  assert(productSaleResponse.status === 201, "Approved product quotation converts with selected batch");
  assert(Number(productSaleResponse.body.data.items[0].quantity) === 1, "Product quantity is authoritative from quotation");
  assert(Number(productSaleResponse.body.data.items[0].unitPrice) === Number(productQuotation.items[0].unitPrice), "Product price snapshot is authoritative from quotation");

  const batchAfter = await prisma.inventoryBatch.findUnique({
    where: {
      id: stockedItem.inventoryBatches[0].id,
    },
    select: {
      quantityAvailable: true,
    },
  });
  assert(Number(batchAfter.quantityAvailable) === batchBefore - 1, "Product conversion deducts exactly the quoted stock quantity");

  console.log("\nPHASE A QUOTATION / SALE HARDENING TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE A QUOTATION / SALE HARDENING TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
