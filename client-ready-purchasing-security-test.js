require("dotenv").config();

const app = require("./src/app");
const prisma = require("./src/config/prisma");

const credentials = {
  admin: { identifier: "mainadmin", password: "Password123!" },
  technician: { identifier: "pendingtech", password: "Password123!" },
  superOwner: { identifier: "superowner", password: "Password123!" },
};

let passed = 0;

const assert = (condition, message, details) => {
  if (!condition) {
    if (details !== undefined) {
      console.dir(details, { depth: null });
    }
    throw new Error(message);
  }

  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
};

const sortedStatuses = (results) =>
  results.map((result) => result.status).sort((left, right) => left - right);

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
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
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

  const retained = {};

  try {
    const [admin, technician, superOwner] = await Promise.all([
      login(credentials.admin),
      login(credentials.technician),
      login(credentials.superOwner),
    ]);

    const branchId = admin.user.branch?.id || admin.user.branchId;
    const otherBranch = await prisma.branch.findFirst({
      where: {
        id: { not: branchId },
        status: "ACTIVE",
      },
      select: { id: true, code: true },
    });
    const category = await prisma.itemCategory.findFirst({
      where: { branchId, status: "ACTIVE" },
      select: { id: true },
    });
    const unit = await prisma.unit.findFirst({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    assert(Boolean(branchId), "Admin branch is available");
    assert(Boolean(otherBranch), "A second active branch is available");
    assert(Boolean(category && unit), "Active category and unit are available");

    const unauthenticated = await request("/purchase-receivings?limit=1");
    assert(
      unauthenticated.status === 401,
      "Purchase receiving list rejects unauthenticated access",
      unauthenticated.body
    );

    const technicianSupplier = await request("/suppliers?limit=1", {
      token: technician.token,
    });
    const technicianPurchaseOrder = await request("/purchase-orders?limit=1", {
      token: technician.token,
    });
    const technicianReceiving = await request("/purchase-receivings?limit=1", {
      token: technician.token,
    });
    assert(
      technicianSupplier.status === 403 &&
        technicianPurchaseOrder.status === 403 &&
        technicianReceiving.status === 403,
      "Technician is denied supplier, PO, and receiving management data",
      { technicianSupplier, technicianPurchaseOrder, technicianReceiving }
    );

    const crossBranchList = await request(
      `/purchase-receivings?branchId=${otherBranch.id}`,
      { token: admin.token }
    );
    assert(
      crossBranchList.status === 403,
      "Admin cannot query another branch's receivings",
      crossBranchList.body
    );

    const suffix = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`.toUpperCase();
    const supplierCode = `QA-SUP-${suffix}`;

    const crossBranchSupplier = await request("/suppliers", {
      method: "POST",
      token: admin.token,
      body: {
        branchId: otherBranch.id,
        supplierCode: `QA-XBR-${suffix}`,
        name: `QA Cross Branch ${suffix}`,
      },
    });
    assert(
      crossBranchSupplier.status === 403,
      "Admin cannot create a supplier in another branch",
      crossBranchSupplier.body
    );

    const duplicateSupplierPayload = {
      branchId,
      supplierCode,
      name: `QA Purchasing Supplier ${suffix}`,
      notes: "Retained client-ready purchasing concurrency verification record",
    };
    const duplicateSupplierCreates = await Promise.all([
      request("/suppliers", {
        method: "POST",
        token: admin.token,
        body: duplicateSupplierPayload,
      }),
      request("/suppliers", {
        method: "POST",
        token: admin.token,
        body: duplicateSupplierPayload,
      }),
    ]);
    assert(
      JSON.stringify(sortedStatuses(duplicateSupplierCreates)) ===
        JSON.stringify([201, 409]),
      "Concurrent duplicate supplier creation yields one record and one conflict",
      duplicateSupplierCreates
    );

    const supplier = duplicateSupplierCreates.find(
      (result) => result.status === 201
    ).body.data;
    retained.supplierId = supplier.id;
    retained.supplierCode = supplier.supplierCode;

    const supplierCount = await prisma.supplier.count({
      where: { branchId, supplierCode },
    });
    assert(supplierCount === 1, "Exactly one supplier exists for the duplicate code");

    const itemBase = {
      branchId,
      categoryId: category.id,
      unitId: unit.id,
      description: "Retained isolated purchasing acceptance item",
      costPrice: 100,
      price1: 125,
      price2: 130,
      price3: 135,
      price4: 140,
      price5: 145,
      minimumStock: 0,
      reorderLevel: 0,
    };
    const nonSerializedItemResult = await request("/items", {
      method: "POST",
      token: admin.token,
      body: {
        ...itemBase,
        itemCode: `QA-NON-${suffix}`,
        itemName: `QA Non-serialized ${suffix}`,
        isSerialized: false,
        hasWarranty: false,
      },
    });
    const serializedItemResult = await request("/items", {
      method: "POST",
      token: admin.token,
      body: {
        ...itemBase,
        itemCode: `QA-SER-${suffix}`,
        itemName: `QA Serialized ${suffix}`,
        isSerialized: true,
        hasWarranty: true,
      },
    });
    assert(
      nonSerializedItemResult.status === 201 &&
        serializedItemResult.status === 201,
      "Isolated serialized and non-serialized QA items are created",
      { nonSerializedItemResult, serializedItemResult }
    );

    const nonSerializedItem = nonSerializedItemResult.body.data;
    const serializedItem = serializedItemResult.body.data;
    retained.nonSerializedItemId = nonSerializedItem.id;
    retained.serializedItemId = serializedItem.id;

    const invalidPrecisionCode = `QA-PO-PREC-${suffix}`;
    const invalidPrecision = await request("/purchase-orders", {
      method: "POST",
      token: admin.token,
      body: {
        branchId,
        poCode: invalidPrecisionCode,
        supplierId: supplier.id,
        items: [
          {
            itemId: nonSerializedItem.id,
            description: "Invalid precision line",
            quantity: 0.001,
            unitCost: 100,
          },
        ],
      },
    });
    const invalidPrecisionCount = await prisma.purchaseOrder.count({
      where: { branchId, poCode: invalidPrecisionCode },
    });
    assert(
      invalidPrecision.status === 400 && invalidPrecisionCount === 0,
      "Sub-cent quantity precision is rejected without creating a PO",
      invalidPrecision.body
    );

    const generatedPoPayload = {
      branchId,
      supplierId: supplier.id,
      notes: `Generated-code concurrency ${suffix}`,
      items: [
        {
          description: `Generated code line ${suffix}`,
          quantity: 1,
          unitCost: 1,
        },
      ],
    };
    const generatedPurchaseOrders = await Promise.all([
      request("/purchase-orders", {
        method: "POST",
        token: admin.token,
        body: generatedPoPayload,
      }),
      request("/purchase-orders", {
        method: "POST",
        token: admin.token,
        body: generatedPoPayload,
      }),
    ]);
    const generatedCodes = generatedPurchaseOrders.map(
      (result) => result.body?.data?.poCode
    );
    assert(
      generatedPurchaseOrders.every((result) => result.status === 201) &&
        new Set(generatedCodes).size === 2,
      "Concurrent generated PO codes are both unique",
      generatedPurchaseOrders
    );
    for (const result of generatedPurchaseOrders) {
      const cancellation = await request(
        `/purchase-orders/${result.body.data.id}/status`,
        {
          method: "PATCH",
          token: admin.token,
          body: {
            status: "CANCELLED",
            cancellationReason: `Close generated-code QA draft ${suffix}`,
          },
        }
      );
      assert(
        cancellation.status === 200,
        `Generated-code QA PO ${result.body.data.poCode} is cancelled audibly`,
        cancellation.body
      );
    }

    const nonSerializedPoCode = `QA-PO-NON-${suffix}`;
    const nonSerializedPoResult = await request("/purchase-orders", {
      method: "POST",
      token: admin.token,
      body: {
        branchId,
        poCode: nonSerializedPoCode,
        supplierId: supplier.id,
        notes: `Concurrent receiving verification ${suffix}`,
        items: [
          {
            itemId: nonSerializedItem.id,
            description: nonSerializedItem.itemName,
            quantity: 2,
            unitCost: 100,
          },
        ],
      },
    });
    assert(
      nonSerializedPoResult.status === 201,
      "Non-serialized QA purchase order is created",
      nonSerializedPoResult.body
    );
    const nonSerializedPo = nonSerializedPoResult.body.data;
    retained.nonSerializedPoId = nonSerializedPo.id;

    const concurrentOrderResults = await Promise.all([
      request(`/purchase-orders/${nonSerializedPo.id}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status: "ORDERED" },
      }),
      request(`/purchase-orders/${nonSerializedPo.id}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status: "ORDERED" },
      }),
    ]);
    assert(
      JSON.stringify(sortedStatuses(concurrentOrderResults)) ===
        JSON.stringify([200, 400]),
      "Concurrent PO ordering performs exactly one state transition",
      concurrentOrderResults
    );

    const updateOrderedPo = await request(
      `/purchase-orders/${nonSerializedPo.id}`,
      {
        method: "PATCH",
        token: admin.token,
        body: { notes: "This update must not be applied after ordering" },
      }
    );
    assert(
      updateOrderedPo.status === 400,
      "Ordered purchase order cannot be edited",
      updateOrderedPo.body
    );

    const poItem = nonSerializedPo.items[0];
    const nonSerializedBatchCode = `QA-BATCH-NON-${suffix}`;
    const nonSerializedReference = `QA-REF-NON-${suffix}`;
    const firstReceivingCode = `QA-REC-NON-A-${suffix}`;
    const firstReceivingResult = await request("/purchase-receivings", {
      method: "POST",
      token: admin.token,
      body: {
        branchId,
        receivingCode: firstReceivingCode,
        supplierId: supplier.id,
        purchaseOrderId: nonSerializedPo.id,
        referenceNo: nonSerializedReference,
        items: [
          {
            itemId: nonSerializedItem.id,
            purchaseOrderItemId: poItem.id,
            description: nonSerializedItem.itemName,
            quantityReceived: 1.25,
            unitCost: 100,
            batchCode: nonSerializedBatchCode,
          },
        ],
      },
    });
    assert(
      firstReceivingResult.status === 201,
      "First linked receiving is created",
      firstReceivingResult.body
    );
    const firstReceiving = firstReceivingResult.body.data;
    retained.firstReceivingId = firstReceiving.id;

    const concurrentPosts = await Promise.all([
      request(`/purchase-receivings/${firstReceiving.id}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status: "POSTED" },
      }),
      request(`/purchase-receivings/${firstReceiving.id}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status: "POSTED" },
      }),
    ]);
    assert(
      JSON.stringify(sortedStatuses(concurrentPosts)) ===
        JSON.stringify([200, 400]),
      "Concurrent receiving POST performs exactly one stock-in",
      concurrentPosts
    );

    const firstBatch = await prisma.inventoryBatch.findUnique({
      where: {
        branchId_batchCode: { branchId, batchCode: nonSerializedBatchCode },
      },
    });
    const firstMovements = await prisma.inventoryMovement.findMany({
      where: {
        branchId,
        itemId: nonSerializedItem.id,
        referenceNo: nonSerializedReference,
        source: "PURCHASE",
      },
    });
    const partialPoItem = await prisma.purchaseOrderItem.findUnique({
      where: { id: poItem.id },
      include: { purchaseOrder: true },
    });
    const firstPostAuditCount = await prisma.auditLog.count({
      where: {
        entityType: "PurchaseReceiving",
        entityId: firstReceiving.id,
        action: "PURCHASE_RECEIVING_POSTED",
      },
    });
    assert(
      Number(firstBatch?.quantityIn) === 1.25 &&
        Number(firstBatch?.quantityAvailable) === 1.25,
      "Concurrent POST leaves the isolated batch at exactly 1.25",
      firstBatch
    );
    assert(
      firstMovements.length === 1 &&
        Number(firstMovements[0].previousQuantity) === 0 &&
        Number(firstMovements[0].newQuantity) === 1.25,
      "Exactly one attributable stock movement records 0 to 1.25",
      firstMovements
    );
    assert(
      Number(partialPoItem.receivedQuantity) === 1.25 &&
        partialPoItem.purchaseOrder.status === "PARTIALLY_RECEIVED",
      "PO received quantity and partial status update exactly once",
      partialPoItem
    );
    assert(
      firstPostAuditCount === 1,
      "Exactly one receiving-posted audit record exists"
    );

    const secondReceivingCode = `QA-REC-NON-B-${suffix}`;
    const secondReference = `QA-REF-NON-B-${suffix}`;
    const secondBatchCode = `QA-BATCH-NON-B-${suffix}`;
    const secondReceivingResult = await request("/purchase-receivings", {
      method: "POST",
      token: admin.token,
      body: {
        branchId,
        receivingCode: secondReceivingCode,
        supplierId: supplier.id,
        purchaseOrderId: nonSerializedPo.id,
        referenceNo: secondReference,
        items: [
          {
            itemId: nonSerializedItem.id,
            purchaseOrderItemId: poItem.id,
            description: nonSerializedItem.itemName,
            quantityReceived: 0.75,
            unitCost: 100,
            batchCode: secondBatchCode,
          },
        ],
      },
    });
    assert(
      secondReceivingResult.status === 201,
      "Second linked receiving is created for the remaining quantity",
      secondReceivingResult.body
    );
    const secondReceiving = secondReceivingResult.body.data;
    retained.secondReceivingId = secondReceiving.id;

    const secondPost = await request(
      `/purchase-receivings/${secondReceiving.id}/status`,
      {
        method: "PATCH",
        token: admin.token,
        body: { status: "POSTED" },
      }
    );
    assert(secondPost.status === 200, "Second receiving posts successfully", secondPost.body);

    const duplicateSecondPost = await request(
      `/purchase-receivings/${secondReceiving.id}/status`,
      {
        method: "PATCH",
        token: admin.token,
        body: { status: "POSTED" },
      }
    );
    assert(
      duplicateSecondPost.status === 400,
      "A later replay of a posted receiving is rejected",
      duplicateSecondPost.body
    );

    const completedBatch = await prisma.inventoryBatch.findUnique({
      where: {
        branchId_batchCode: { branchId, batchCode: nonSerializedBatchCode },
      },
    });
    const completedSecondBatch = await prisma.inventoryBatch.findUnique({
      where: {
        branchId_batchCode: { branchId, batchCode: secondBatchCode },
      },
    });
    const completedPo = await prisma.purchaseOrder.findUnique({
      where: { id: nonSerializedPo.id },
      include: { items: true },
    });
    assert(
      Number(completedBatch.quantityIn) === 1.25 &&
        Number(completedBatch.quantityAvailable) === 1.25 &&
        Number(completedSecondBatch.quantityIn) === 0.75 &&
        Number(completedSecondBatch.quantityAvailable) === 0.75 &&
        Number(completedPo.items[0].receivedQuantity) === 2 &&
        completedPo.status === "RECEIVED",
      "Incremental receiving preserves separate batch history and completes the PO",
      { completedBatch, completedSecondBatch, completedPo }
    );

    const serialPoCode = `QA-PO-SER-${suffix}`;
    const serialPoResult = await request("/purchase-orders", {
      method: "POST",
      token: admin.token,
      body: {
        branchId,
        poCode: serialPoCode,
        supplierId: supplier.id,
        items: [
          {
            itemId: serializedItem.id,
            description: serializedItem.itemName,
            quantity: 1,
            unitCost: 100,
          },
        ],
      },
    });
    assert(serialPoResult.status === 201, "Serialized-item PO is created", serialPoResult.body);
    const serialPo = serialPoResult.body.data;
    retained.serialPoId = serialPo.id;

    const serialPoOrder = await request(`/purchase-orders/${serialPo.id}/status`, {
      method: "PATCH",
      token: admin.token,
      body: { status: "ORDERED" },
    });
    assert(serialPoOrder.status === 200, "Serialized-item PO is ordered", serialPoOrder.body);

    const serialNumber = `QA-SERIAL-${suffix}`;
    const serialBatchCode = `QA-BATCH-SER-${suffix}`;
    const serialReference = `QA-REF-SER-${suffix}`;
    const serialReceivingResult = await request("/purchase-receivings", {
      method: "POST",
      token: admin.token,
      body: {
        branchId,
        receivingCode: `QA-REC-SER-${suffix}`,
        supplierId: supplier.id,
        purchaseOrderId: serialPo.id,
        referenceNo: serialReference,
        items: [
          {
            itemId: serializedItem.id,
            purchaseOrderItemId: serialPo.items[0].id,
            description: serializedItem.itemName,
            quantityReceived: 1,
            unitCost: 100,
            batchCode: serialBatchCode,
            serialNumbers: [serialNumber],
          },
        ],
      },
    });
    assert(
      serialReceivingResult.status === 201,
      "Serialized receiving with matching serial count is created",
      serialReceivingResult.body
    );
    const serialReceiving = serialReceivingResult.body.data;
    retained.serialReceivingId = serialReceiving.id;
    retained.serialNumber = serialNumber;

    const serialConcurrentPosts = await Promise.all([
      request(`/purchase-receivings/${serialReceiving.id}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status: "POSTED" },
      }),
      request(`/purchase-receivings/${serialReceiving.id}/status`, {
        method: "PATCH",
        token: admin.token,
        body: { status: "POSTED" },
      }),
    ]);
    assert(
      JSON.stringify(sortedStatuses(serialConcurrentPosts)) ===
        JSON.stringify([200, 400]),
      "Concurrent serialized receiving POST creates one serial and one stock-in",
      serialConcurrentPosts
    );

    const storedSerials = await prisma.itemSerial.findMany({
      where: { branchId, serialNumber },
      include: { batch: true },
    });
    const serialMovements = await prisma.inventoryMovement.findMany({
      where: {
        branchId,
        itemId: serializedItem.id,
        referenceNo: serialReference,
        source: "PURCHASE",
      },
    });
    assert(
      storedSerials.length === 1 &&
        storedSerials[0].status === "AVAILABLE" &&
        storedSerials[0].batch?.batchCode === serialBatchCode,
      "Serialized receipt creates exactly one available serial linked to its batch",
      storedSerials
    );
    assert(
      serialMovements.length === 1 &&
        Number(serialMovements[0].newQuantity) === 1,
      "Serialized receipt creates exactly one purchase stock movement",
      serialMovements
    );

    const duplicatePostedSerialCode = `QA-REC-DUP-SER-${suffix}`;
    const duplicatePostedSerial = await request("/purchase-receivings", {
      method: "POST",
      token: admin.token,
      body: {
        branchId,
        receivingCode: duplicatePostedSerialCode,
        supplierId: supplier.id,
        items: [
          {
            itemId: serializedItem.id,
            description: serializedItem.itemName,
            quantityReceived: 1,
            unitCost: 100,
            batchCode: `QA-BATCH-DUP-${suffix}`,
            serialNumbers: [serialNumber],
          },
        ],
      },
    });
    const duplicatePostedSerialCount = await prisma.purchaseReceiving.count({
      where: { branchId, receivingCode: duplicatePostedSerialCode },
    });
    assert(
      duplicatePostedSerial.status === 409 && duplicatePostedSerialCount === 0,
      "A posted serial cannot be reused and no draft is created",
      duplicatePostedSerial.body
    );

    const serialMismatchCode = `QA-REC-SER-MISMATCH-${suffix}`;
    const serialMismatch = await request("/purchase-receivings", {
      method: "POST",
      token: admin.token,
      body: {
        branchId,
        receivingCode: serialMismatchCode,
        supplierId: supplier.id,
        items: [
          {
            itemId: serializedItem.id,
            description: serializedItem.itemName,
            quantityReceived: 2,
            unitCost: 100,
            batchCode: `QA-BATCH-MISMATCH-${suffix}`,
            serialNumbers: [`QA-ONLY-ONE-${suffix}`],
          },
        ],
      },
    });
    const serialMismatchCount = await prisma.purchaseReceiving.count({
      where: { branchId, receivingCode: serialMismatchCode },
    });
    assert(
      serialMismatch.status === 400 && serialMismatchCount === 0,
      "Serialized quantity mismatch is rejected atomically",
      serialMismatch.body
    );

    const adminRead = await request(`/purchase-receivings/${serialReceiving.id}`, {
      token: admin.token,
    });
    const superOwnerRead = await request(
      `/purchase-receivings/${serialReceiving.id}`,
      { token: superOwner.token }
    );
    assert(
      adminRead.status === 200 && superOwnerRead.status === 200,
      "Branch admin and Super Owner can read the authorized retained receiving",
      { adminRead, superOwnerRead }
    );

    const deactivateSupplier = await request(`/suppliers/${supplier.id}/status`, {
      method: "PATCH",
      token: admin.token,
      body: { status: "INACTIVE" },
    });
    const deactivateNonSerializedItem = await request(
      `/items/${nonSerializedItem.id}`,
      {
        method: "PATCH",
        token: admin.token,
        body: { status: "INACTIVE" },
      }
    );
    const deactivateSerializedItem = await request(`/items/${serializedItem.id}`, {
      method: "PATCH",
      token: admin.token,
      body: { status: "INACTIVE" },
    });
    assert(
      deactivateSupplier.status === 200 &&
        deactivateNonSerializedItem.status === 200 &&
        deactivateSerializedItem.status === 200,
      "QA supplier and items are left inactive while transaction history remains",
      {
        deactivateSupplier,
        deactivateNonSerializedItem,
        deactivateSerializedItem,
      }
    );

    console.log(`\nRESULT: ${passed}/${passed} assertions passed`);
    console.log("RETAINED QA RECORDS:");
    console.log(JSON.stringify(retained, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
