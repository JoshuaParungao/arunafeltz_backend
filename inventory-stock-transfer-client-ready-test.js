require("dotenv").config();

const app = require("./src/app");
const prisma = require("./src/config/prisma");

let passed = 0;

const assert = (condition, message, details) => {
  if (!condition) {
    if (details !== undefined) console.dir(details, { depth: null });
    throw new Error(message);
  }
  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
};

const sumAvailable = async (branchId, itemId) => {
  const result = await prisma.inventoryBatch.aggregate({
    where: { branchId, itemId },
    _sum: { quantityAvailable: true },
  });
  return Number(result._sum.quantityAvailable || 0);
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
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  const login = async (identifier) => {
    const result = await request("/auth/login", {
      method: "POST",
      body: { identifier, password: "Password123!" },
    });
    assert(result.status === 200 && result.body?.data?.token, `${identifier} login succeeds`, result.body);
    return result.body.data;
  };

  try {
    const [admin, technician, superOwner] = await Promise.all([
      login("mainadmin"),
      login("pendingtech"),
      login("superowner"),
    ]);
    const mainBranchId = admin.user.branch?.id || admin.user.branchId;
    const mabBranch = await prisma.branch.findFirst({ where: { code: "MAB", status: "ACTIVE" } });
    assert(Boolean(mainBranchId && mabBranch), "Both active test branches are available");

    const ownInventory = await request(`/inventory/overview?branchId=${mainBranchId}&limit=5`, { token: technician.token });
    assert(ownInventory.status === 200, "Branch-scoped inventory overview allows own branch", ownInventory.body);

    const crossInventory = await request(`/inventory/overview?branchId=${mabBranch.id}&limit=5`, { token: technician.token });
    assert(crossInventory.status === 403, "Branch-scoped inventory overview blocks another branch", crossInventory.body);

    const invalidInventoryQuery = await request("/inventory/overview?page=0", { token: admin.token });
    assert(invalidInventoryQuery.status === 400, "Inventory list rejects invalid pagination", invalidInventoryQuery.body);

    const lowStockPageOne = await request(`/inventory/overview?branchId=${mainBranchId}&lowStockOnly=true&page=1&limit=1`, { token: admin.token });
    assert(lowStockPageOne.status === 200 && lowStockPageOne.body?.data?.pagination?.limit === 1, "Low-stock results use requested pagination", lowStockPageOne.body);
    const lowPagination = lowStockPageOne.body.data.pagination;
    assert(lowPagination.totalPages === Math.ceil(lowPagination.totalItems / lowPagination.limit), "Low-stock pagination reports the filtered total");
    if (lowPagination.totalPages > 1) {
      const lowStockPageTwo = await request(`/inventory/overview?branchId=${mainBranchId}&lowStockOnly=true&page=2&limit=1`, { token: admin.token });
      assert(lowStockPageTwo.status === 200 && lowStockPageTwo.body?.data?.data?.[0]?.id !== lowStockPageOne.body?.data?.data?.[0]?.id, "Low-stock pages are distinct and stable", lowStockPageTwo.body);
    }

    const techBatches = await request(`/inventory/batches?branchId=${mainBranchId}&limit=5`, { token: technician.token });
    const techBatchRows = techBatches.body?.data?.data || [];
    assert(techBatches.status === 200, "Technician can view scoped batch details", techBatches.body);
    assert(techBatchRows.every((batch) => !("unitCost" in batch)), "Inventory cost is removed from staff batch responses", techBatchRows);
    assert(techBatchRows.every((batch) => !("operationalUnitCost" in batch)), "Operational inventory cost is removed from staff batch responses", techBatchRows);

    const adjustmentBatch = await prisma.inventoryBatch.findFirst({
      where: {
        branchId: mainBranchId,
        status: "ACTIVE",
        quantityAvailable: { gte: 1 },
        item: { isSerialized: false, status: "ACTIVE" },
      },
      include: { item: { select: { id: true, itemCode: true } } },
    });

    if (adjustmentBatch) {
      const adjustmentQuantity = Number(adjustmentBatch.quantityAvailable);
      const adjustmentReference = `CRT-ADJ-${Date.now().toString(36).toUpperCase()}`;
      const concurrentAdjustments = await Promise.all([
        request("/inventory/adjustments", { method: "POST", token: admin.token, body: { branchId: mainBranchId, batchId: adjustmentBatch.id, type: "DECREASE", quantity: adjustmentQuantity, referenceNo: adjustmentReference, remarks: "Atomic non-negative verification A" } }),
        request("/inventory/adjustments", { method: "POST", token: admin.token, body: { branchId: mainBranchId, batchId: adjustmentBatch.id, type: "DECREASE", quantity: adjustmentQuantity, referenceNo: adjustmentReference, remarks: "Atomic non-negative verification B" } }),
      ]);
      const adjustmentStatuses = concurrentAdjustments.map((result) => result.status).sort();
      assert(JSON.stringify(adjustmentStatuses) === JSON.stringify([201, 400]), "Concurrent deductions allow exactly one and prevent negative stock", concurrentAdjustments);
      const depletedBatch = await prisma.inventoryBatch.findUnique({ where: { id: adjustmentBatch.id } });
      assert(Number(depletedBatch.quantityAvailable) === 0 && depletedBatch.status === "DEPLETED", "Successful full deduction marks the batch depleted without going negative", depletedBatch);
      const compensatingAdjustment = await request("/inventory/adjustments", { method: "POST", token: admin.token, body: { branchId: mainBranchId, batchId: adjustmentBatch.id, type: "INCREASE", quantity: adjustmentQuantity, referenceNo: `${adjustmentReference}-RESTORE`, remarks: "Compensating adjustment restores verified stock" } });
      assert(compensatingAdjustment.status === 201, "Compensating adjustment succeeds and remains auditable", compensatingAdjustment.body);
      const restoredBatch = await prisma.inventoryBatch.findUnique({ where: { id: adjustmentBatch.id } });
      assert(Number(restoredBatch.quantityAvailable) === adjustmentQuantity && restoredBatch.status === "ACTIVE", "Compensating adjustment restores original batch quantity and status", restoredBatch);

      const sameItemCollisionAttempt = await request("/inventory/stock-in", { method: "POST", token: admin.token, body: { branchId: mainBranchId, itemId: adjustmentBatch.itemId, batchCode: adjustmentBatch.batchCode, quantity: 1, unitCost: 999999, remarks: "Historical same-item collision rejection verification" } });
      assert(sameItemCollisionAttempt.status === 409, "Manual stock-in cannot reuse an existing batch code for the same item", sameItemCollisionAttempt.body);
      const collisionPreservedBatch = await prisma.inventoryBatch.findUnique({ where: { id: adjustmentBatch.id } });
      assert(Number(collisionPreservedBatch.quantityAvailable) === adjustmentQuantity && collisionPreservedBatch.unitCost.toString() === restoredBatch.unitCost.toString(), "Rejected manual collision preserves batch quantity and cost", collisionPreservedBatch);

      const collisionItem = await prisma.item.findFirst({
        where: { branchId: mainBranchId, id: { not: adjustmentBatch.itemId }, status: "ACTIVE", isSerialized: false },
        select: { id: true },
      });
      if (collisionItem) {
        const collisionAttempt = await request("/inventory/stock-in", { method: "POST", token: admin.token, body: { branchId: mainBranchId, itemId: collisionItem.id, batchCode: adjustmentBatch.batchCode, quantity: 1, remarks: "Collision rejection verification" } });
        assert(collisionAttempt.status === 409, "A branch batch code cannot be reassigned to another item", collisionAttempt.body);
      }
    } else {
      console.log("SKIP: No stocked non-serialized MAIN batch exists for adjustment concurrency verification.");
    }

    const requestable = await request(`/stock-transfers/requestable-items?fromBranchId=${mabBranch.id}&limit=20`, { token: technician.token });
    const requestableItems = requestable.body?.data?.data || [];
    assert(requestable.status === 200, "Branch staff can view requestable stock from another branch", requestable.body);
    assert(requestableItems.every((item) => !("inventoryBatches" in item) && !("costPrice" in item)), "Requestable stock returns only safe item and availability fields", requestableItems);

    if (requestableItems.length > 0) {
      const duplicateLineOverflow = await request("/stock-transfers/requests", {
        method: "POST",
        token: admin.token,
        body: {
          fromBranchId: mabBranch.id,
          toBranchId: mainBranchId,
          notes: "Duplicate request-line aggregate validation",
          items: [
            { itemId: requestableItems[0].id, quantity: requestableItems[0].quantityAvailable },
            { itemId: requestableItems[0].id, quantity: requestableItems[0].quantityAvailable },
          ],
        },
      });
      assert(duplicateLineOverflow.status === 400, "Duplicate request lines cannot cumulatively exceed available stock", duplicateLineOverflow.body);
    }

    const sameBranchRequestable = await request(`/stock-transfers/requestable-items?fromBranchId=${mainBranchId}`, { token: technician.token });
    assert(sameBranchRequestable.status === 400, "Requestable-stock lookup rejects the actor's own branch", sameBranchRequestable.body);

    if (requestableItems.length > 0) {
      const requestCodeSuffix = Date.now().toString(36).toUpperCase();
      const createRequest = await request("/stock-transfers/requests", {
        method: "POST",
        token: admin.token,
        body: {
          fromBranchId: mabBranch.id,
          toBranchId: mainBranchId,
          notes: `Retained client-ready emergency request ${requestCodeSuffix}`,
          items: [{ itemId: requestableItems[0].id, quantity: 1 }],
        },
      });
      assert(createRequest.status === 201 && createRequest.body?.data?.status === "REQUESTED", "Emergency request creates retained REQUESTED history", createRequest.body);
      const requestId = createRequest.body.data.id;

      const destinationApproval = await request(`/stock-transfers/${requestId}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status: "APPROVED" },
      });
      assert(destinationApproval.status === 403, "Destination branch cannot approve source stock", destinationApproval.body);

      const cancelRequest = await request(`/stock-transfers/${requestId}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status: "CANCELLED", cancellationReason: "Client-ready request lifecycle verification" },
      });
      assert(cancelRequest.status === 200 && cancelRequest.body?.data?.status === "CANCELLED", "Requesting branch can cancel its unfulfilled request", cancelRequest.body);

      const repeatCancel = await request(`/stock-transfers/${requestId}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status: "CANCELLED", cancellationReason: "Repeated idempotency verification" },
      });
      assert(repeatCancel.status === 200 && repeatCancel.body?.data?.status === "CANCELLED", "Repeated terminal status request is idempotent", repeatCancel.body);
    } else {
      console.log("SKIP: No MAB requestable stock exists for retained request lifecycle assertion.");
    }

    const sourceCandidates = await prisma.item.findMany({
      where: {
        branchId: mainBranchId,
        status: "ACTIVE",
        isSerialized: false,
        inventoryBatches: { some: { status: "ACTIVE", quantityAvailable: { gte: 1 } } },
      },
      select: { id: true, itemCode: true, itemName: true },
    });

    let pair = null;
    for (const sourceItem of sourceCandidates) {
      const destinationItem = await prisma.item.findFirst({
        where: { branchId: mabBranch.id, itemCode: sourceItem.itemCode, status: "ACTIVE", isSerialized: false },
        select: { id: true, itemCode: true, itemName: true },
      });
      if (destinationItem) {
        pair = { sourceItem, destinationItem };
        break;
      }
    }

    if (pair) {
      const suffix = Date.now().toString(36).toUpperCase();
      const forwardCode = `CRT-FWD-${suffix}`;
      const reverseCode = `CRT-REV-${suffix}`;
      const sourceBefore = await sumAvailable(mainBranchId, pair.sourceItem.id);
      const destinationBefore = await sumAvailable(mabBranch.id, pair.destinationItem.id);

      const createForward = await request("/stock-transfers", {
        method: "POST",
        token: admin.token,
        body: {
          toBranchId: mabBranch.id,
          transferCode: forwardCode,
          notes: "Retained client-ready concurrency verification",
          items: [{ itemId: pair.sourceItem.id, description: pair.sourceItem.itemName, quantity: 1 }],
        },
      });
      assert(createForward.status === 201, "Forward verification transfer is created", createForward.body);
      const forwardId = createForward.body.data.id;

      const setForwardPricing = await request(`/stock-transfers/${forwardId}/pricing`, { method: "PATCH", token: admin.token, body: { items: [{ stockTransferItemId: createForward.body.data.items[0].id, agreedTransferUnitPrice: 2500 }] } });
      assert(setForwardPricing.status === 200, "Source manager sets forward agreed transfer pricing", setForwardPricing.body);

      const approveForward = await request(`/stock-transfers/${forwardId}/status`, { method: "PATCH", token: admin.token, body: { status: "APPROVED" } });
      assert(approveForward.status === 200, "Forward verification transfer is approved", approveForward.body);

      const concurrentPosts = await Promise.all([
        request(`/stock-transfers/${forwardId}/status`, { method: "PATCH", token: admin.token, body: { status: "POSTED" } }),
        request(`/stock-transfers/${forwardId}/status`, { method: "PATCH", token: admin.token, body: { status: "POSTED" } }),
      ]);
      assert(concurrentPosts.every((result) => result.status === 200 && result.body?.data?.status === "POSTED"), "Concurrent fulfill retries resolve idempotently", concurrentPosts);

      const forwardMovements = await prisma.inventoryMovement.count({ where: { referenceNo: forwardCode } });
      assert(forwardMovements === 2, "Concurrent fulfill creates exactly one transfer-out and one transfer-in movement", { forwardMovements });
      assert((await sumAvailable(mainBranchId, pair.sourceItem.id)) === sourceBefore - 1, "Forward transfer deducts source aggregate once");
      assert((await sumAvailable(mabBranch.id, pair.destinationItem.id)) === destinationBefore + 1, "Forward transfer increases destination aggregate once");

      const createReverse = await request("/stock-transfers", {
        method: "POST",
        token: superOwner.token,
        body: {
          fromBranchId: mabBranch.id,
          toBranchId: mainBranchId,
          transferCode: reverseCode,
          notes: `Compensating transfer for ${forwardCode}`,
          items: [{ itemId: pair.destinationItem.id, description: pair.destinationItem.itemName, quantity: 1 }],
        },
      });
      assert(createReverse.status === 201, "Compensating transfer is created as retained audit history", createReverse.body);
      const reverseId = createReverse.body.data.id;
      const setReversePricing = await request(`/stock-transfers/${reverseId}/pricing`, { method: "PATCH", token: superOwner.token, body: { items: [{ stockTransferItemId: createReverse.body.data.items[0].id, agreedTransferUnitPrice: 2500 }] } });
      assert(setReversePricing.status === 200, "Super Owner sets compensating agreed transfer pricing", setReversePricing.body);
      const approveReverse = await request(`/stock-transfers/${reverseId}/status`, { method: "PATCH", token: superOwner.token, body: { status: "APPROVED" } });
      assert(approveReverse.status === 200, "Compensating transfer is approved", approveReverse.body);
      const postReverse = await request(`/stock-transfers/${reverseId}/status`, { method: "PATCH", token: superOwner.token, body: { status: "POSTED" } });
      assert(postReverse.status === 200, "Compensating transfer is posted", postReverse.body);
      assert((await sumAvailable(mainBranchId, pair.sourceItem.id)) === sourceBefore, "Compensating transfer restores source aggregate exactly");
      assert((await sumAvailable(mabBranch.id, pair.destinationItem.id)) === destinationBefore, "Compensating transfer restores destination aggregate exactly");
    } else {
      console.log("SKIP: No matching non-serialized stocked item pair exists for posting concurrency verification.");
    }

    const invalidTransferQuery = await request("/stock-transfers?page=0", { token: admin.token });
    assert(invalidTransferQuery.status === 400, "Stock-transfer list rejects invalid pagination", invalidTransferQuery.body);
    const crossFilter = await request(`/stock-transfers?fromBranchId=${mabBranch.id}`, { token: admin.token });
    assert(crossFilter.status === 403, "Branch manager cannot use filters to enumerate another source branch", crossFilter.body);

    console.log(`\nInventory/stock-transfer client-ready test passed: ${passed} assertions.`);
    console.log("Created transfer records and movements were retained; compensating transfer restored aggregate inventory.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error("Inventory/stock-transfer client-ready test failed:");
  console.error(error);
  process.exitCode = 1;
});
