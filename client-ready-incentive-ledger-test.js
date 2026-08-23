require("dotenv").config();

const app = require("./src/app");
const prisma = require("./src/config/prisma");
const incentiveService = require("./src/modules/incentives/services/incentive.service");

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
  const retained = {};
  let originalRules = null;
  let superOwner = null;

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
    const result = await request("/auth/login", {
      method: "POST",
      body: account,
    });

    assert(
      result.status === 200 && result.body?.data?.token,
      `Login succeeds for ${account.identifier}`,
      result.body
    );
    return result.body.data;
  };

  const updateRules = (token, rules) =>
    request("/incentives/rules", {
      method: "PATCH",
      token,
      body: rules,
    });

  try {
    const [admin, technician, loggedInSuperOwner] = await Promise.all([
      login(credentials.admin),
      login(credentials.technician),
      login(credentials.superOwner),
    ]);
    superOwner = loggedInSuperOwner;

    const branchId = admin.user.branch?.id || admin.user.branchId;
    const technicianBranchId = technician.user.branch?.id || technician.user.branchId;
    assert(Boolean(branchId), "Admin branch is available");
    assert(technicianBranchId === branchId, "Technician is assigned to the test branch");

    const secondBranch = await prisma.branch.findFirst({
      where: {
        id: { not: branchId },
      },
      select: {
        id: true,
      },
    });
    assert(Boolean(secondBranch), "A second branch exists for branch isolation checks");

    const unauthenticated = await request("/incentives");
    assert(unauthenticated.status === 401, "Incentive ledger rejects unauthenticated access");

    const before = await request("/incentives?limit=1", {
      token: superOwner.token,
    });
    assert(before.status === 200, "Super Owner can read the incentive ledger", before.body);
    originalRules = {
      enableItemIncentives: before.body.data.rules.enableItemIncentives,
      enableServiceIncentives: before.body.data.rules.enableServiceIncentives,
      defaultItemIncentivePercent:
        before.body.data.rules.defaultItemIncentivePercent,
      defaultServiceIncentivePercent:
        before.body.data.rules.defaultServiceIncentivePercent,
      staffCanViewOwnIncentives:
        before.body.data.rules.staffCanViewOwnIncentives,
      ownerCanViewAllIncentives:
        before.body.data.rules.ownerCanViewAllIncentives,
      requireOwnerApprovalBeforePayout:
        before.body.data.rules.requireOwnerApprovalBeforePayout,
    };

    const staffRuleMutation = await updateRules(technician.token, originalRules);
    assert(staffRuleMutation.status === 403, "Staff cannot change incentive rules");

    const adminRuleMutation = await updateRules(admin.token, originalRules);
    assert(adminRuleMutation.status === 403, "Branch Admin cannot change global incentive rules");

    const invalidRules = await updateRules(superOwner.token, {
      ...originalRules,
      defaultItemIncentivePercent: 101,
    });
    assert(invalidRules.status === 400, "Rule percentages above 100 are rejected");

    const activeRules = {
      enableItemIncentives: true,
      enableServiceIncentives: true,
      defaultItemIncentivePercent: 1.25,
      defaultServiceIncentivePercent: 7.5,
      staffCanViewOwnIncentives: true,
      ownerCanViewAllIncentives: true,
      requireOwnerApprovalBeforePayout: true,
    };
    const rulesEnabled = await updateRules(superOwner.token, activeRules);
    assert(rulesEnabled.status === 200, "Super Owner can configure global incentive rules", rulesEnabled.body);
    assert(
      rulesEnabled.body.data.rules.defaultServiceIncentivePercent === 7.5,
      "Rule response returns the saved configuration snapshot"
    );

    const suffix = Date.now().toString(36).toUpperCase();
    const inventory = await request("/inventory/overview?limit=100", {
      token: admin.token,
    });
    const item = inventory.body?.data?.data?.find(
      (row) => !row.isSerialized && Number(row.quantityAvailable) >= 1
    );
    assert(Boolean(item), "An in-stock non-serialized item exists for product incentive verification");

    const batches = await request(
      `/inventory/batches?itemId=${encodeURIComponent(item.id)}&status=ACTIVE&limit=100`,
      { token: admin.token }
    );
    const batch = batches.body?.data?.data?.find(
      (row) => Number(row.quantityAvailable) >= 1
    );
    assert(Boolean(batch), "An active batch exists for the product incentive sale");

    const itemSaleResult = await request("/sales", {
      method: "POST",
      token: admin.token,
      body: {
        remarks: `INCENTIVE PRODUCT ${suffix}`,
        items: [
          {
            itemId: item.id,
            batchId: batch.id,
            priceTier: 1,
            quantity: 1,
            discountAmount: 0,
          },
        ],
        payments: [{ paymentMethod: "OTHER", amount: 0 }],
      },
    });
    assert(itemSaleResult.status === 201, "Product sale completes with incentive posting", itemSaleResult.body);
    retained.itemSaleId = itemSaleResult.body.data.id;
    retained.itemSaleCode = itemSaleResult.body.data.receiptCode;

    const itemIncentive = await prisma.incentive.findUnique({
      where: { sourceKey: `SALE_ITEM:${retained.itemSaleId}` },
    });
    assert(Boolean(itemIncentive), "Product incentive is linked to the source sale");
    assert(itemIncentive.staffId === admin.user.id, "Product incentive credits the actual cashier");
    assert(Number(itemIncentive.ratePercent) === 1.25, "Product incentive snapshots the configured rate");
    assert(
      Number(itemIncentive.amount) ===
        Math.round(Number(itemIncentive.basisAmount) * 1.25) / 100,
      "Product incentive snapshots an exact two-decimal amount"
    );

    const quotationResult = await request("/quotations", {
      method: "POST",
      token: admin.token,
      body: {
        title: `INCENTIVE SERVICE ${suffix}`,
        serviceDoneById: technician.user.id,
        items: [
          {
            description: `Quotation service labor ${suffix}`,
            priceTier: 1,
            quantity: 1,
            unitPrice: 800,
            discountAmount: 50,
          },
        ],
      },
    });
    assert(quotationResult.status === 201, "Service quotation is created with Service Done By", quotationResult.body);
    retained.quotationId = quotationResult.body.data.id;
    retained.quotationCode = quotationResult.body.data.quotationCode;

    for (const status of ["SENT", "APPROVED"]) {
      const result = await request(`/quotations/${retained.quotationId}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status },
      });
      assert(result.status === 200, `Service quotation advances to ${status}`, result.body);
    }

    const serviceSaleResult = await request("/sales", {
      method: "POST",
      token: admin.token,
      body: {
        quotationId: retained.quotationId,
        remarks: `INCENTIVE SERVICE SALE ${suffix}`,
        items: [
          {
            description: `Quotation service labor ${suffix}`,
            quantity: 1,
            unitPrice: 800,
            discountAmount: 50,
          },
        ],
        payments: [{ paymentMethod: "OTHER", amount: 0 }],
      },
    });
    assert(serviceSaleResult.status === 201, "Approved service quotation converts to a sale", serviceSaleResult.body);
    retained.serviceSaleId = serviceSaleResult.body.data.id;
    retained.serviceSaleCode = serviceSaleResult.body.data.receiptCode;

    const quotationIncentive = await prisma.incentive.findUnique({
      where: { sourceKey: `QUOTATION_SERVICE:${retained.serviceSaleId}` },
    });
    assert(Boolean(quotationIncentive), "Quotation service incentive is linked to the converted sale");
    assert(
      quotationIncentive.staffId === technician.user.id,
      "Quotation service incentive credits Service Done By regardless of actor role"
    );
    assert(Number(quotationIncentive.basisAmount) === 750, "Quotation service basis uses final line revenue");
    assert(Number(quotationIncentive.amount) === 56.25, "Quotation service amount uses the saved service rate");

    const serviceJobResult = await request("/service-jobs", {
      method: "POST",
      token: admin.token,
      body: {
        assignedTechnicianId: technician.user.id,
        jobTitle: `Incentive lifecycle ${suffix}`,
        estimatedServiceCharge: 1200,
        serviceNotes: "Retained client-ready incentive verification",
      },
    });
    assert(serviceJobResult.status === 201, "Isolated service job is created", serviceJobResult.body);
    retained.serviceJobId = serviceJobResult.body.data.id;
    retained.serviceJobCode = serviceJobResult.body.data.jobCode;

    for (const status of ["IN_PROGRESS", "READY_FOR_RELEASE"]) {
      const result = await request(`/service-jobs/${retained.serviceJobId}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status },
      });
      assert(result.status === 200, `Service job advances to ${status}`, result.body);
    }

    const completionRequests = await Promise.all([
      request(`/service-jobs/${retained.serviceJobId}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status: "COMPLETED", finalServiceCharge: 1200 },
      }),
      request(`/service-jobs/${retained.serviceJobId}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status: "COMPLETED", finalServiceCharge: 1200 },
      }),
    ]);
    const completionStatuses = completionRequests.map((result) => result.status).sort();
    assert(
      JSON.stringify(completionStatuses) === JSON.stringify([200, 400]),
      "Concurrent service completion performs exactly one status transition",
      completionRequests
    );

    const serviceJobIncentives = await prisma.incentive.findMany({
      where: { serviceJobId: retained.serviceJobId },
    });
    assert(serviceJobIncentives.length === 1, "Concurrent completion posts exactly one service-job incentive");
    assert(
      serviceJobIncentives[0].sourceKey === `SERVICE_JOB:${retained.serviceJobId}` &&
        serviceJobIncentives[0].staffId === technician.user.id,
      "Service-job incentive links the source and assigned technician"
    );
    assert(
      Number(serviceJobIncentives[0].basisAmount) === 1200 &&
        Number(serviceJobIncentives[0].ratePercent) === 7.5 &&
        Number(serviceJobIncentives[0].amount) === 90,
      "Service-job incentive snapshots basis, rate, and amount"
    );

    const duplicatePostResults = await Promise.all([
      prisma.$transaction((tx) =>
        incentiveService.postServiceJobIncentive(tx, admin.user, retained.serviceJobId)
      ),
      prisma.$transaction((tx) =>
        incentiveService.postServiceJobIncentive(tx, admin.user, retained.serviceJobId)
      ),
    ]);
    const afterDuplicate = await prisma.incentive.count({
      where: { serviceJobId: retained.serviceJobId },
    });
    assert(duplicatePostResults.every((entry) => entry?.id), "Concurrent repost calls return the existing incentive");
    assert(afterDuplicate === 1, "Unique source key prevents duplicate incentive posting");

    const changedRulesResult = await updateRules(superOwner.token, {
      ...activeRules,
      defaultItemIncentivePercent: 25,
      defaultServiceIncentivePercent: 30,
    });
    assert(changedRulesResult.status === 200, "Rates can be changed for future source postings");

    const snapshotsAfterRuleChange = await prisma.incentive.findMany({
      where: {
        id: { in: [itemIncentive.id, quotationIncentive.id, serviceJobIncentives[0].id] },
      },
      orderBy: { id: "asc" },
    });
    assert(
      snapshotsAfterRuleChange.some((entry) => Number(entry.ratePercent) === 1.25) &&
        snapshotsAfterRuleChange.filter((entry) => Number(entry.ratePercent) === 7.5).length === 2,
      "Changing rules does not mutate historical rate snapshots"
    );

    const ownLedger = await request(
      `/incentives?staffId=${encodeURIComponent(technician.user.id)}&limit=100`,
      { token: technician.token }
    );
    assert(ownLedger.status === 200, "Staff can view own incentives when enabled", ownLedger.body);
    assert(
      ownLedger.body.data.entries.every(
        (entry) =>
          entry.staff.id === technician.user.id && entry.branch.id === branchId
      ),
      "Staff incentive results are limited to the authenticated staff and branch"
    );
    assert(
      ownLedger.body.data.entries.some(
        (entry) => entry.sourceType === "QUOTATION_SERVICE"
      ) &&
        ownLedger.body.data.entries.some(
          (entry) => entry.sourceType === "SERVICE_JOB"
        ),
      "Staff own view includes both quotation and service-job incentives"
    );

    const otherStaffAttempt = await request(
      `/incentives?staffId=${encodeURIComponent(admin.user.id)}`,
      { token: technician.token }
    );
    assert(otherStaffAttempt.status === 403, "Staff cannot request another user's incentive ledger");

    const crossBranchAttempt = await request(
      `/incentives?branchId=${encodeURIComponent(secondBranch.id)}`,
      { token: admin.token }
    );
    assert(crossBranchAttempt.status === 403, "Branch Admin cannot read another branch's incentives");

    const ownerAll = await request(
      `/incentives?branchId=${encodeURIComponent(branchId)}&limit=100`,
      { token: superOwner.token }
    );
    assert(ownerAll.status === 200, "Super Owner can monitor a selected branch", ownerAll.body);
    assert(
      ownerAll.body.data.entries.some((entry) => entry.id === itemIncentive.id) &&
        ownerAll.body.data.entries.some((entry) => entry.id === quotationIncentive.id) &&
        ownerAll.body.data.entries.some((entry) => entry.id === serviceJobIncentives[0].id),
      "Owner monitoring includes product and both service incentive sources"
    );

    const cancelResults = await Promise.all([
      request(`/sales/${retained.itemSaleId}/cancel`, {
        method: "PATCH",
        token: admin.token,
        body: { cancellationReason: `Incentive reversal A ${suffix}` },
      }),
      request(`/sales/${retained.itemSaleId}/cancel`, {
        method: "PATCH",
        token: admin.token,
        body: { cancellationReason: `Incentive reversal B ${suffix}` },
      }),
    ]);
    assert(
      JSON.stringify(cancelResults.map((result) => result.status).sort()) ===
        JSON.stringify([200, 400]),
      "Concurrent sale cancellation performs exactly one source reversal",
      cancelResults
    );

    const reversedItem = await prisma.incentive.findUnique({
      where: { id: itemIncentive.id },
    });
    assert(
      reversedItem.status === "REVERSED" &&
        Boolean(reversedItem.reversedAt) &&
        reversedItem.reversedById === admin.user.id &&
        Boolean(reversedItem.reversalReason),
      "Sale cancellation reverses the linked incentive with actor, time, and reason"
    );

    const postedOnly = await request(
      `/incentives?branchId=${encodeURIComponent(branchId)}&status=POSTED&limit=100`,
      { token: admin.token }
    );
    assert(
      postedOnly.status === 200 &&
        !postedOnly.body.data.entries.some((entry) => entry.id === itemIncentive.id),
      "Reversed incentives are excluded from posted/payable results"
    );

    const reversedOnly = await request(
      `/incentives?branchId=${encodeURIComponent(branchId)}&status=REVERSED&limit=100`,
      { token: admin.token }
    );
    assert(
      reversedOnly.status === 200 &&
        reversedOnly.body.data.entries.some((entry) => entry.id === itemIncentive.id),
      "Reversed incentive remains queryable as audit history"
    );

    const incentiveAudits = await prisma.auditLog.findMany({
      where: {
        entityType: "Incentive",
        entityId: {
          in: [itemIncentive.id, quotationIncentive.id, serviceJobIncentives[0].id],
        },
      },
      select: {
        action: true,
        entityId: true,
      },
    });
    assert(
      incentiveAudits.filter((entry) => entry.action === "INCENTIVE_POSTED").length === 3 &&
        incentiveAudits.filter((entry) => entry.action === "INCENTIVE_REVERSED").length === 1,
      "Incentive posting and reversal have durable audit events"
    );
  } finally {
    if (originalRules && superOwner?.token) {
      const restored = await updateRules(superOwner.token, originalRules).catch(
        () => null
      );
      if (restored?.status !== 200) {
        console.error("CRITICAL: incentive rule restoration failed", restored);
        process.exitCode = 1;
      } else {
        console.log("RESTORED: original incentive rules were restored through the audited API.");
      }
    }

    console.log("RETAINED AUDIT IDENTIFIERS:", JSON.stringify(retained));
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }

  console.log(`\nIncentive ledger regression passed: ${passed} assertions.`);
  console.log("All isolated source and ledger records were retained for audit; no record was deleted.");
};

main().catch((error) => {
  console.error("Incentive ledger regression failed:");
  console.error(error);
  process.exitCode = 1;
});
