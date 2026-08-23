require("dotenv").config();

const app = require("./src/app");
const prisma = require("./src/config/prisma");
const cashBoxService = require("./src/modules/cash-boxes/services/cashBox.service");
const { ROLE_PERMISSIONS, PERMISSIONS } = require("./src/constants/permissions");

const credentials = {
  admin: { identifier: "mainadmin", password: "Password123!" },
  technician: { identifier: "pendingtech", password: "Password123!" },
  superOwner: { identifier: "superowner", password: "Password123!" },
};

let passed = 0;

const assert = (condition, message, details) => {
  if (!condition) {
    if (details !== undefined) console.dir(details, { depth: null });
    throw new Error(message);
  }
  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
};

const main = async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  };

  const login = async (account) => {
    const result = await request("/auth/login", { method: "POST", body: account });
    assert(result.status === 200 && result.body?.data?.token, `Login succeeds for ${account.identifier}`, result.body);
    return result.body.data;
  };

  try {
    const [admin, technician, superOwner] = await Promise.all([
      login(credentials.admin),
      login(credentials.technician),
      login(credentials.superOwner),
    ]);
    const branchId = admin.user.branch?.id || admin.user.branchId;
    assert(Boolean(branchId), "Admin branch is available");

    const unauthenticatedBranches = await request("/branches");
    assert(unauthenticatedBranches.status === 401, "Branch list rejects unauthenticated access", unauthenticatedBranches.body);

    const adminBranches = await request("/branches", { token: admin.token });
    assert(adminBranches.status === 200, "Admin can read protected branch lookup", adminBranches.body);

    const adminBranchCreate = await request("/branches", { method: "POST", token: admin.token, body: {} });
    assert(adminBranchCreate.status === 403, "Admin cannot create branches", adminBranchCreate.body);

    const superOwnerInvalidBranchCreate = await request("/branches", { method: "POST", token: superOwner.token, body: {} });
    assert(superOwnerInvalidBranchCreate.status === 400, "Super Owner reaches branch validation without creating a record", superOwnerInvalidBranchCreate.body);

    const cashWithoutAuth = await request("/cash-boxes");
    assert(cashWithoutAuth.status === 401, "Cash boxes reject unauthenticated access", cashWithoutAuth.body);

    const technicianCash = await request("/cash-boxes", { token: technician.token });
    assert(technicianCash.status === 403, "Technician cannot view cash boxes", technicianCash.body);

    const adminCash = await request(`/cash-boxes?branchId=${branchId}&limit=20`, { token: admin.token });
    assert(adminCash.status === 200, "Admin can view own-branch cash boxes", adminCash.body);
    const cashBoxes = adminCash.body?.data?.data || [];
    assert(cashBoxes.length > 0, "Active branch has a cash box for finance verification", adminCash.body);
    const cashBox = cashBoxes[0];

    assert(ROLE_PERMISSIONS.CASH_CUSTODIAN.includes(PERMISSIONS.VIEW_CASH_BOX), "Cash Custodian role has cash-box view permission");
    assert(ROLE_PERMISSIONS.CASH_CUSTODIAN.includes(PERMISSIONS.CONFIRM_CASH_HANDOVER), "Cash Custodian role has handover confirmation permission");
    assert(!ROLE_PERMISSIONS.CASH_CUSTODIAN.includes(PERMISSIONS.MANAGE_CASH_BOX), "Cash Custodian role cannot post arbitrary cash movements");

    const custodianView = await cashBoxService.getCashBoxes({
      id: "role-contract-check",
      role: "CASH_CUSTODIAN",
      branchId,
    }, { limit: 5 });
    assert(Array.isArray(custodianView.data), "Cash service accepts authorized branch custodian read access");

    const baseline = Number(cashBox.currentBalance);
    const suffix = Date.now().toString(36);
    const cashPayloads = [
      { type: "CASH_IN", amount: 1.11, description: `Client-ready concurrency A ${suffix}`, referenceNo: `CRF-A-${suffix}` },
      { type: "CASH_IN", amount: 2.22, description: `Client-ready concurrency B ${suffix}`, referenceNo: `CRF-B-${suffix}` },
    ];
    const cashPosts = await Promise.all(cashPayloads.map((body) => request(`/cash-boxes/${cashBox.id}/transactions`, {
      method: "POST",
      token: admin.token,
      body,
    })));
    assert(cashPosts.every((result) => result.status === 201), "Concurrent cash postings both succeed without lost update", cashPosts);

    const cashAfterPosts = await request(`/cash-boxes/${cashBox.id}`, { token: admin.token });
    assert(Math.abs(Number(cashAfterPosts.body?.data?.currentBalance) - (baseline + 3.33)) < 0.001, "Concurrent cash postings preserve the exact combined balance", cashAfterPosts.body);

    const postedTransactions = cashPosts.map((result) => result.body.data.transaction);
    const cashReversals = await Promise.all(postedTransactions.map((transaction) => request(`/cash-boxes/transactions/${transaction.id}/cancel`, {
      method: "POST",
      token: admin.token,
      body: { cancellationReason: `Client-ready reversible concurrency test ${suffix}` },
    })));
    assert(cashReversals.every((result) => result.status === 200), "Concurrent manual cash reversals serialize safely", cashReversals);

    const cashAfterReversal = await request(`/cash-boxes/${cashBox.id}`, { token: admin.token });
    assert(Math.abs(Number(cashAfterReversal.body?.data?.currentBalance) - baseline) < 0.001, "Cash reversals restore the pre-test balance exactly", cashAfterReversal.body);

    const activeCustomer = await prisma.customer.findFirst({
      where: { branchId, status: "ACTIVE" },
      select: { id: true },
    });
    assert(Boolean(activeCustomer), "Active customer exists for installment verification");

    const creditSaleResult = await request("/sales", {
      method: "POST",
      token: admin.token,
      body: {
        branchId,
        customerId: activeCustomer.id,
        remarks: `Client-ready credit concurrency ${suffix}`,
        items: [{ description: `Finance verification ${suffix}`, quantity: 1, unitPrice: 1000, discountAmount: 0 }],
        payments: [{ paymentMethod: "CREDIT", amount: 0 }],
      },
    });
    assert(creditSaleResult.status === 201, "Isolated customer credit sale is created", creditSaleResult.body);
    const creditSale = creditSaleResult.body.data;

    const creditCreates = await Promise.all([
      request(`/sales/${creditSale.id}/credit-account`, { method: "POST", token: admin.token, body: { term: "MONTH_3", dueDay: 15, remarks: `Concurrent A ${suffix}` } }),
      request(`/sales/${creditSale.id}/credit-account`, { method: "POST", token: admin.token, body: { term: "MONTH_3", dueDay: 15, remarks: `Concurrent B ${suffix}` } }),
    ]);
    const creditStatuses = creditCreates.map((result) => result.status).sort();
    assert(JSON.stringify(creditStatuses) === JSON.stringify([201, 400]), "Concurrent duplicate credit creation yields exactly one account", creditCreates);
    const creditAccount = creditCreates.find((result) => result.status === 201).body.data;

    const attemptedCollectionAmount = Math.round(Number(creditAccount.remainingBalance) * 0.75 * 100) / 100;
    const collectionCreates = await Promise.all([
      request(`/credit-accounts/${creditAccount.id}/collections`, { method: "POST", token: admin.token, body: { amount: attemptedCollectionAmount, paymentMethod: "OTHER", referenceNo: `COL-A-${suffix}` } }),
      request(`/credit-accounts/${creditAccount.id}/collections`, { method: "POST", token: admin.token, body: { amount: attemptedCollectionAmount, paymentMethod: "OTHER", referenceNo: `COL-B-${suffix}` } }),
    ]);
    const collectionStatuses = collectionCreates.map((result) => result.status).sort();
    assert(JSON.stringify(collectionStatuses) === JSON.stringify([201, 400]), "Concurrent over-collection yields one posting and one safe rejection", collectionCreates);
    const postedCollection = collectionCreates.find((result) => result.status === 201).body.data.collection;

    const collectionReversal = await request(`/credit-accounts/collections/${postedCollection.id}/cancel`, {
      method: "POST",
      token: admin.token,
      body: { cancellationReason: `Restore isolated concurrency test ${suffix}` },
    });
    assert(collectionReversal.status === 200, "Posted test collection reverses with audit history", collectionReversal.body);

    const saleCancellation = await request(`/sales/${creditSale.id}/cancel`, {
      method: "PATCH",
      token: admin.token,
      body: { cancellationReason: `Complete isolated finance verification ${suffix}` },
    });
    assert(saleCancellation.status === 200, "Credit-linked sale cancels through reversible workflow", saleCancellation.body);
    const cancelledAccount = await prisma.creditAccount.findUnique({ where: { id: creditAccount.id }, select: { status: true, cancellationReason: true } });
    assert(cancelledAccount?.status === "CANCELLED" && Boolean(cancelledAccount.cancellationReason), "Sale cancellation also cancels its credit account audibly", cancelledAccount);

    const plainSaleResult = await request("/sales", {
      method: "POST",
      token: admin.token,
      body: {
        branchId,
        remarks: `Concurrent sale cancel ${suffix}`,
        items: [{ description: `Cancellation verification ${suffix}`, quantity: 1, unitPrice: 10, discountAmount: 0 }],
        payments: [{ paymentMethod: "OTHER", amount: 0 }],
      },
    });
    assert(plainSaleResult.status === 201, "Isolated sale exists for duplicate cancellation test", plainSaleResult.body);
    const saleId = plainSaleResult.body.data.id;
    const cancellations = await Promise.all([
      request(`/sales/${saleId}/cancel`, { method: "PATCH", token: admin.token, body: { cancellationReason: `Concurrent cancel A ${suffix}` } }),
      request(`/sales/${saleId}/cancel`, { method: "PATCH", token: admin.token, body: { cancellationReason: `Concurrent cancel B ${suffix}` } }),
    ]);
    const cancellationStatuses = cancellations.map((result) => result.status).sort();
    assert(JSON.stringify(cancellationStatuses) === JSON.stringify([200, 400]), "Concurrent sale cancellation performs exactly one reversal", cancellations);

    console.log(`\nFinance/security regression passed: ${passed} assertions.`);
    console.log("Isolated records were retained as cancelled audit history; no record was deleted.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error("Finance/security regression failed:");
  console.error(error);
  process.exitCode = 1;
});
