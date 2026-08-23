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

const decimalEquals = (value, expected) => Number(value) === Number(expected);

const readOrdinarySaleFootprint = async () => {
  const [count, total] = await Promise.all([
    prisma.sale.count(),
    prisma.sale.aggregate({ _sum: { grandTotal: true } }),
  ]);

  return {
    count,
    grandTotal: Number(total._sum.grandTotal || 0),
  };
};

const main = async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  let cleanupCatalogItems = [];
  let cleanupToken = null;
  let cleanupComplete = false;

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

  const login = async (identifier) => {
    const result = await request("/auth/login", {
      method: "POST",
      body: { identifier, password: "Password123!" },
    });

    assert(
      result.status === 200 && result.body?.data?.token,
      `${identifier} login succeeds`,
      result.body
    );

    return result.body.data;
  };

  try {
    const [admin, technician, superOwner] = await Promise.all([
      login("mainadmin"),
      login("pendingtech"),
      login("superowner"),
    ]);
    const mainBranchId = admin.user.branch?.id || admin.user.branchId;
    const technicianBranchId =
      technician.user.branch?.id || technician.user.branchId;
    assert(
      technician.user.role === "TECHNICIAN" && technicianBranchId === mainBranchId,
      "Requester fixture is an explicit TECHNICIAN assigned to the destination branch",
      technician.user
    );
    const mabBranch = await prisma.branch.findFirst({
      where: { code: "MAB", status: "ACTIVE" },
    });
    const [category, unit] = await Promise.all([
      prisma.itemCategory.findFirst({ where: { status: "ACTIVE" } }),
      prisma.unit.findFirst({ where: { status: "ACTIVE" } }),
    ]);

    assert(
      Boolean(mainBranchId && mabBranch && category && unit),
      "Enterprise transfer fixtures have two branches, a category, and a unit"
    );

    const suffix = Date.now().toString(36).toUpperCase();
    const nonSerializedItemCode = `ETC-N-${suffix}`;
    const serializedItemCode = `ETC-S-${suffix}`;

    const [sourceItem, destinationItem, serializedSourceItem, serializedDestinationItem] =
      await prisma.$transaction([
        prisma.item.create({
          data: {
            branchId: mabBranch.id,
            categoryId: category.id,
            unitId: unit.id,
            itemCode: nonSerializedItemCode,
            itemName: `Enterprise FIFO source ${suffix}`,
            isSerialized: false,
            costPrice: "2400.00",
            price1: "2900.00",
            price2: "3000.00",
            price3: "3100.00",
            price4: "3200.00",
            price5: "3300.00",
            createdById: superOwner.user.id,
            updatedById: superOwner.user.id,
          },
        }),
        prisma.item.create({
          data: {
            branchId: mainBranchId,
            categoryId: category.id,
            unitId: unit.id,
            itemCode: nonSerializedItemCode,
            itemName: `Enterprise FIFO destination ${suffix}`,
            isSerialized: false,
            costPrice: "2100.00",
            price1: "3200.00",
            price2: "3300.00",
            price3: "3400.00",
            price4: "3500.00",
            price5: "3600.00",
            createdById: admin.user.id,
            updatedById: admin.user.id,
          },
        }),
        prisma.item.create({
          data: {
            branchId: mabBranch.id,
            categoryId: category.id,
            unitId: unit.id,
            itemCode: serializedItemCode,
            itemName: `Enterprise serial source ${suffix}`,
            isSerialized: true,
            costPrice: "1800.00",
            price1: "2300.00",
            price2: "2400.00",
            price3: "2500.00",
            price4: "2600.00",
            price5: "2700.00",
            createdById: superOwner.user.id,
            updatedById: superOwner.user.id,
          },
        }),
        prisma.item.create({
          data: {
            branchId: mainBranchId,
            categoryId: category.id,
            unitId: unit.id,
            itemCode: serializedItemCode,
            itemName: `Enterprise serial destination ${suffix}`,
            isSerialized: true,
            costPrice: "1700.00",
            price1: "2800.00",
            price2: "2900.00",
            price3: "3000.00",
            price4: "3100.00",
            price5: "3200.00",
            createdById: admin.user.id,
            updatedById: admin.user.id,
          },
        }),
      ]);
    cleanupCatalogItems = [
      sourceItem,
      destinationItem,
      serializedSourceItem,
      serializedDestinationItem,
    ];
    cleanupToken = superOwner.token;

    const destinationPricesBefore = [
      destinationItem.price1,
      destinationItem.price2,
      destinationItem.price3,
      destinationItem.price4,
      destinationItem.price5,
    ].map(String);

    const now = Date.now();
    const [sourceBatchA, sourceBatchB, serializedSourceBatch] =
      await prisma.$transaction([
        prisma.inventoryBatch.create({
          data: {
            branchId: mabBranch.id,
            itemId: sourceItem.id,
            batchCode: `ETC-A-${suffix}`,
            quantityIn: "2.00",
            quantityAvailable: "2.00",
            unitCost: "2400.00",
            operationalUnitCost: "2450.00",
            sellingPrice1: sourceItem.price1,
            sellingPrice2: sourceItem.price2,
            sellingPrice3: sourceItem.price3,
            sellingPrice4: sourceItem.price4,
            sellingPrice5: sourceItem.price5,
            receivedAt: new Date(now - 172800000),
            referenceNo: `ETC-FIXTURE-${suffix}`,
            remarks: "Retained enterprise multi-batch costing fixture A",
            createdById: superOwner.user.id,
            updatedById: superOwner.user.id,
          },
        }),
        prisma.inventoryBatch.create({
          data: {
            branchId: mabBranch.id,
            itemId: sourceItem.id,
            batchCode: `ETC-B-${suffix}`,
            quantityIn: "2.00",
            quantityAvailable: "2.00",
            unitCost: "2500.00",
            operationalUnitCost: "2525.00",
            sellingPrice1: sourceItem.price1,
            sellingPrice2: sourceItem.price2,
            sellingPrice3: sourceItem.price3,
            sellingPrice4: sourceItem.price4,
            sellingPrice5: sourceItem.price5,
            receivedAt: new Date(now - 86400000),
            referenceNo: `ETC-FIXTURE-${suffix}`,
            remarks: "Retained enterprise multi-batch costing fixture B",
            createdById: superOwner.user.id,
            updatedById: superOwner.user.id,
          },
        }),
        prisma.inventoryBatch.create({
          data: {
            branchId: mabBranch.id,
            itemId: serializedSourceItem.id,
            batchCode: `ETC-SERIAL-${suffix}`,
            quantityIn: "2.00",
            quantityAvailable: "2.00",
            unitCost: "1800.00",
            operationalUnitCost: "1900.00",
            sellingPrice1: serializedSourceItem.price1,
            sellingPrice2: serializedSourceItem.price2,
            sellingPrice3: serializedSourceItem.price3,
            sellingPrice4: serializedSourceItem.price4,
            sellingPrice5: serializedSourceItem.price5,
            referenceNo: `ETC-SERIAL-FIXTURE-${suffix}`,
            remarks: "Retained enterprise serialized costing fixture",
            createdById: superOwner.user.id,
            updatedById: superOwner.user.id,
          },
        }),
      ]);

    const sourceSerials = await prisma.$transaction(
      [1, 2].map((number) =>
        prisma.itemSerial.create({
          data: {
            branchId: mabBranch.id,
            itemId: serializedSourceItem.id,
            batchId: serializedSourceBatch.id,
            serialNumber: `ETC-SN-${suffix}-${number}`,
            status: "AVAILABLE",
            createdById: superOwner.user.id,
            updatedById: superOwner.user.id,
          },
        })
      )
    );

    assert(
      sourceSerials.length === 2,
      "Isolated multi-batch and serialized source inventory is created"
    );

    const directAgreedCountBefore = await prisma.stockTransfer.count();
    const directAgreedAttempt = await request("/stock-transfers/requests", {
      method: "POST",
      token: technician.token,
      body: {
        fromBranchId: mabBranch.id,
        toBranchId: mainBranchId,
        items: [
          {
            itemId: sourceItem.id,
            quantity: 1,
            proposedTransferUnitPrice: 2540,
            agreedTransferUnitPrice: 2550,
          },
        ],
      },
    });
    assert(
      directAgreedAttempt.status === 400 &&
        (await prisma.stockTransfer.count()) === directAgreedCountBefore,
      "Requester cannot inject an agreed transfer price into request creation",
      directAgreedAttempt.body
    );

    const ordinarySalesBefore = await readOrdinarySaleFootprint();
    const createTransfer = await request("/stock-transfers/requests", {
      method: "POST",
      token: technician.token,
      body: {
        fromBranchId: mabBranch.id,
        toBranchId: mainBranchId,
        notes: `Enterprise multi-batch transfer ${suffix}`,
        items: [
          {
            itemId: sourceItem.id,
            quantity: 3,
            proposedTransferUnitPrice: 2540,
          },
        ],
      },
    });
    assert(
      createTransfer.status === 201 &&
        decimalEquals(createTransfer.body?.data?.items?.[0]?.proposedTransferUnitPrice, 2540),
      "Destination requester may record a nonnegative proposed line price",
      createTransfer.body
    );
    const transfer = createTransfer.body.data;
    const transferItem = transfer.items[0];
    const persistedRequesterProposal = await prisma.stockTransferItem.findUnique({
      where: { id: transferItem.id },
      select: {
        proposedTransferUnitPrice: true,
        priceProposedAt: true,
        priceProposedById: true,
        agreedTransferUnitPrice: true,
        transferAmount: true,
      },
    });
    assert(
      decimalEquals(persistedRequesterProposal.proposedTransferUnitPrice, 2540) &&
        persistedRequesterProposal.priceProposedById === technician.user.id &&
        Boolean(persistedRequesterProposal.priceProposedAt) &&
        persistedRequesterProposal.agreedTransferUnitPrice === null &&
        persistedRequesterProposal.transferAmount === null,
      "TECHNICIAN proposal persists with actor/time but never becomes agreed pricing",
      persistedRequesterProposal
    );
    assert(
      transferItem.priceProposedById === technician.user.id &&
        Boolean(transferItem.priceProposedAt) &&
        !Object.hasOwn(transferItem, "agreedTransferUnitPrice") &&
        !Object.hasOwn(transferItem, "transferAmount") &&
        !Object.hasOwn(transferItem, "priceSetById") &&
        !Object.hasOwn(transferItem, "allocations") &&
        (!transferItem.fromBatch ||
          (!Object.hasOwn(transferItem.fromBatch, "unitCost") &&
            !Object.hasOwn(transferItem.fromBatch, "operationalUnitCost"))),
      "Requester sees their own proposal while agreed values, allocations, and costs stay redacted",
      transferItem
    );

    const technicianPricing = await request(`/stock-transfers/${transfer.id}/pricing`, {
      method: "PATCH",
      token: technician.token,
      body: {
        items: [
          { stockTransferItemId: transferItem.id, agreedTransferUnitPrice: 2550 },
        ],
      },
    });
    assert(
      technicianPricing.status === 403,
      "Non-management requester cannot set agreed transfer pricing",
      technicianPricing.body
    );

    const destinationManagerPricing = await request(
      `/stock-transfers/${transfer.id}/pricing`,
      {
        method: "PATCH",
        token: admin.token,
        body: {
          items: [
            { stockTransferItemId: transferItem.id, agreedTransferUnitPrice: 2550 },
          ],
        },
      }
    );
    assert(
      destinationManagerPricing.status === 403,
      "Destination manager cannot finalize source-branch transfer pricing",
      destinationManagerPricing.body
    );

    const approveWithoutPrice = await request(`/stock-transfers/${transfer.id}/status`, {
      method: "PATCH",
      token: superOwner.token,
      body: { status: "APPROVED" },
    });
    assert(
      approveWithoutPrice.status === 400,
      "Approval is rejected until every agreed line price is set",
      approveWithoutPrice.body
    );

    const setPricing = await request(`/stock-transfers/${transfer.id}/pricing`, {
      method: "PATCH",
      token: superOwner.token,
      body: {
        items: [
          { stockTransferItemId: transferItem.id, agreedTransferUnitPrice: 2550 },
        ],
      },
    });
    assert(
      setPricing.status === 200 &&
        decimalEquals(setPricing.body?.data?.items?.[0]?.agreedTransferUnitPrice, 2550) &&
        setPricing.body?.data?.items?.[0]?.priceSetById === superOwner.user.id,
      "Authorized source manager sets agreed price with actor attribution",
      setPricing.body
    );

    const approveTransfer = await request(`/stock-transfers/${transfer.id}/status`, {
      method: "PATCH",
      token: superOwner.token,
      body: { status: "APPROVED" },
    });
    const approvedItem = approveTransfer.body?.data?.items?.[0];
    assert(
      approveTransfer.status === 200 &&
        decimalEquals(approvedItem?.transferAmount, 7650) &&
        Boolean(approvedItem?.priceLockedAt) &&
        approvedItem?.destinationItemId === destinationItem.id,
      "Approval atomically locks price, exact line value, and destination catalog item",
      approveTransfer.body
    );

    const lockedPricingAttempt = await request(`/stock-transfers/${transfer.id}/pricing`, {
      method: "PATCH",
      token: superOwner.token,
      body: {
        items: [
          { stockTransferItemId: transferItem.id, agreedTransferUnitPrice: 2600 },
        ],
      },
    });
    assert(
      lockedPricingAttempt.status === 409,
      "Agreed pricing cannot be changed after approval locks it",
      lockedPricingAttempt.body
    );

    const concurrentPosts = await Promise.all([
      request(`/stock-transfers/${transfer.id}/status`, {
        method: "PATCH",
        token: superOwner.token,
        body: { status: "POSTED" },
      }),
      request(`/stock-transfers/${transfer.id}/status`, {
        method: "PATCH",
        token: superOwner.token,
        body: { status: "POSTED" },
      }),
    ]);
    assert(
      concurrentPosts.every(
        (result) => result.status === 200 && result.body?.data?.status === "POSTED"
      ),
      "Concurrent posting retries resolve to one posted transfer",
      concurrentPosts
    );

    const postedTransfer = await prisma.stockTransfer.findUnique({
      where: { id: transfer.id },
      include: {
        items: {
          include: {
            allocations: {
              include: {
                sourceBatch: true,
                destinationBatch: true,
              },
            },
          },
        },
      },
    });
    const postedItem = postedTransfer.items[0];
    const allocationsBySource = new Map(
      postedItem.allocations.map((allocation) => [allocation.sourceBatchId, allocation])
    );
    const allocationA = allocationsBySource.get(sourceBatchA.id);
    const allocationB = allocationsBySource.get(sourceBatchB.id);
    assert(
      postedTransfer.status === "POSTED" && postedItem.allocations.length === 2,
      "Posting creates one immutable allocation per exact FIFO source batch",
      postedTransfer
    );
    assert(
      decimalEquals(allocationA?.quantity, 2) && decimalEquals(allocationB?.quantity, 1),
      "FIFO consumes the older batch first and then the next batch exactly",
      postedItem.allocations
    );
    assert(
      decimalEquals(allocationA?.acquisitionUnitCostSnapshot, 2400) &&
        decimalEquals(allocationB?.acquisitionUnitCostSnapshot, 2500) &&
        decimalEquals(allocationA?.sourceOperationalUnitCostSnapshot, 2450) &&
        decimalEquals(allocationB?.sourceOperationalUnitCostSnapshot, 2525),
      "Each allocation preserves acquisition and source operational costs",
      postedItem.allocations
    );
    assert(
      postedItem.allocations.every(
        (allocation) =>
          decimalEquals(allocation.destinationOperationalUnitCostSnapshot, 2550) &&
          decimalEquals(allocation.destinationBatch.operationalUnitCost, 2550)
      ),
      "Destination operational cost equals the locked agreed price on every allocation",
      postedItem.allocations
    );
    assert(
      decimalEquals(allocationA?.destinationBatch.unitCost, 2400) &&
        decimalEquals(allocationB?.destinationBatch.unitCost, 2500) &&
        allocationA?.destinationBatch.originBatchId === sourceBatchA.id &&
        allocationB?.destinationBatch.originBatchId === sourceBatchB.id,
      "Transfer-specific destination batches preserve original acquisition cost and origin lineage",
      postedItem.allocations
    );
    assert(
      postedItem.allocations.every(
        (allocation) =>
          allocation.destinationBatch.batchCode !== allocation.sourceBatch.batchCode &&
          allocation.destinationBatch.referenceNo === postedTransfer.transferCode
      ),
      "Destination batches have transfer-specific codes and transfer references",
      postedItem.allocations
    );

    const allocationAmount = postedItem.allocations.reduce(
      (sum, allocation) => sum + Number(allocation.transferAmount),
      0
    );
    assert(
      decimalEquals(postedItem.transferAmount, 7650) && allocationAmount === 7650,
      "Source transfer sale and destination transfer purchase share the exact 7,650 internal value",
      { lineAmount: postedItem.transferAmount, allocationAmount }
    );

    const destinationAfter = await prisma.item.findUnique({
      where: { id: destinationItem.id },
    });
    const destinationPricesAfter = [
      destinationAfter.price1,
      destinationAfter.price2,
      destinationAfter.price3,
      destinationAfter.price4,
      destinationAfter.price5,
    ].map(String);
    assert(
      JSON.stringify(destinationPricesAfter) === JSON.stringify(destinationPricesBefore),
      "Transfer posting leaves destination Price 1-5 unchanged",
      { destinationPricesBefore, destinationPricesAfter }
    );

    const transferMovements = await prisma.inventoryMovement.findMany({
      where: { referenceNo: postedTransfer.transferCode },
    });
    const expectedAcquisitionByBatch = new Map(
      postedItem.allocations.flatMap((allocation) => [
        [allocation.sourceBatchId, Number(allocation.acquisitionUnitCostSnapshot)],
        [allocation.destinationBatchId, Number(allocation.acquisitionUnitCostSnapshot)],
      ])
    );
    assert(
      transferMovements.length === 4 &&
        transferMovements.every(
          (movement) =>
            Number(movement.unitCost) === expectedAcquisitionByBatch.get(movement.batchId)
        ),
      "Transfer movements retain compatible acquisition-cost semantics on both sides",
      transferMovements
    );

    const transferBatchCollision = await request("/inventory/stock-in", {
      method: "POST",
      token: admin.token,
      body: {
        branchId: mainBranchId,
        itemId: destinationItem.id,
        batchCode: allocationA.destinationBatch.batchCode,
        quantity: 1,
        unitCost: 999999,
        remarks: "Historical transfer batch collision must fail",
      },
    });
    const preservedTransferredBatch = await prisma.inventoryBatch.findUnique({
      where: { id: allocationA.destinationBatchId },
    });
    assert(
      transferBatchCollision.status === 409 &&
        decimalEquals(preservedTransferredBatch.unitCost, 2400) &&
        decimalEquals(preservedTransferredBatch.operationalUnitCost, 2550) &&
        decimalEquals(preservedTransferredBatch.quantityAvailable, 2),
      "Manual stock-in cannot overwrite a historical transferred batch code or costs",
      { response: transferBatchCollision.body, preservedTransferredBatch }
    );

    const createSerializedTransfer = await request("/stock-transfers/requests", {
      method: "POST",
      token: technician.token,
      body: {
        fromBranchId: mabBranch.id,
        toBranchId: mainBranchId,
        notes: `Enterprise serialized transfer ${suffix}`,
        items: [
          {
            itemId: serializedSourceItem.id,
            quantity: 2,
            proposedTransferUnitPrice: 2000,
          },
        ],
      },
    });
    assert(
      createSerializedTransfer.status === 201,
      "Serialized transfer request is created with proposed pricing",
      createSerializedTransfer.body
    );
    const serializedTransfer = createSerializedTransfer.body.data;
    const serializedTransferItem = serializedTransfer.items[0];
    const setSerializedPricing = await request(
      `/stock-transfers/${serializedTransfer.id}/pricing`,
      {
        method: "PATCH",
        token: superOwner.token,
        body: {
          items: [
            {
              stockTransferItemId: serializedTransferItem.id,
              agreedTransferUnitPrice: 2050,
            },
          ],
        },
      }
    );
    assert(setSerializedPricing.status === 200, "Serialized transfer agreed price is set");
    const approveSerialized = await request(
      `/stock-transfers/${serializedTransfer.id}/status`,
      {
        method: "PATCH",
        token: superOwner.token,
        body: { status: "APPROVED" },
      }
    );
    assert(
      approveSerialized.status === 200 &&
        decimalEquals(approveSerialized.body?.data?.items?.[0]?.transferAmount, 4100),
      "Serialized transfer locks exact internal value"
    );
    const postSerialized = await request(
      `/stock-transfers/${serializedTransfer.id}/status`,
      {
        method: "PATCH",
        token: superOwner.token,
        body: { status: "POSTED" },
      }
    );
    assert(postSerialized.status === 200, "Serialized transfer posts successfully");

    const postedSerializedItem = await prisma.stockTransferItem.findUnique({
      where: { id: serializedTransferItem.id },
      include: {
        allocations: { include: { destinationBatch: true, serials: true } },
        serials: { include: { itemSerial: true } },
      },
    });
    const serializedAllocation = postedSerializedItem.allocations[0];
    assert(
      postedSerializedItem.allocations.length === 1 &&
        serializedAllocation.serials.length === 2 &&
        postedSerializedItem.serials.every(
          (serial) => serial.allocationId === serializedAllocation.id
        ),
      "Every serialized transfer row is linked to its exact allocation",
      postedSerializedItem
    );
    assert(
      postedSerializedItem.serials.every(
        (serial) =>
          serial.itemSerial.branchId === mainBranchId &&
          serial.itemSerial.itemId === serializedDestinationItem.id &&
          serial.itemSerial.batchId === serializedAllocation.destinationBatchId &&
          serial.itemSerial.status === "AVAILABLE"
      ) && serializedAllocation.destinationBatch.originBatchId === serializedSourceBatch.id,
      "Serialized units retain source-batch lineage while moving to the destination item and batch",
      postedSerializedItem.serials
    );

    const ordinarySalesAfterTransfers = await readOrdinarySaleFootprint();
    assert(
      ordinarySalesAfterTransfers.count === ordinarySalesBefore.count &&
        ordinarySalesAfterTransfers.grandTotal === ordinarySalesBefore.grandTotal,
      "Transfer posting creates no ordinary Sale and does not pollute consolidated external revenue",
      { ordinarySalesBefore, ordinarySalesAfterTransfers }
    );

    const saleResult = await request("/sales", {
      method: "POST",
      token: admin.token,
      body: {
        remarks: `Enterprise cost snapshot sale ${suffix}`,
        items: [
          {
            itemId: destinationItem.id,
            batchId: allocationA.destinationBatchId,
            priceTier: 1,
            quantity: 1,
            discountAmount: 0,
          },
        ],
        payments: [
          {
            paymentMethod: "OTHER",
            amount: 3200,
            remarks: "Enterprise transfer-cost snapshot test",
          },
        ],
      },
    });
    assert(saleResult.status === 201, "External sale from a transferred batch succeeds", saleResult.body);
    const sale = saleResult.body.data;
    const saleItem = sale.items[0];
    assert(
      decimalEquals(saleItem.operationalUnitCostSnapshot, 2550) &&
        decimalEquals(saleItem.acquisitionUnitCostSnapshot, 2400),
      "SaleItem snapshots destination operational cost and original acquisition cost",
      saleItem
    );

    const technicianSaleView = await request(`/sales/${sale.id}`, {
      token: technician.token,
    });
    const technicianSaleItem = technicianSaleView.body?.data?.items?.[0] || {};
    assert(
      technicianSaleView.status === 200 &&
        !("operationalUnitCostSnapshot" in technicianSaleItem) &&
        !("acquisitionUnitCostSnapshot" in technicianSaleItem),
      "Sale cost snapshots are redacted from non-management responses",
      technicianSaleView.body
    );

    const cancelSale = await request(`/sales/${sale.id}/cancel`, {
      method: "PATCH",
      token: admin.token,
      body: { cancellationReason: "Close retained enterprise cost snapshot sale" },
    });
    assert(cancelSale.status === 200, "Cost snapshot sale is audibly cancelled");
    const saleMovements = await prisma.inventoryMovement.findMany({
      where: {
        referenceNo: sale.receiptCode,
        type: { in: ["SALE_OUT", "RETURN_IN"] },
      },
      orderBy: { movementDate: "asc" },
    });
    assert(
      saleMovements.length === 2 &&
        saleMovements.every((movement) => decimalEquals(movement.unitCost, 2400)),
      "SALE_OUT and cancellation RETURN_IN remain symmetric on acquisition movement cost",
      saleMovements
    );

    const supplier = await prisma.supplier.findFirst({
      where: {
        status: "ACTIVE",
        OR: [{ branchId: null }, { branchId: mainBranchId }],
      },
    });
    assert(Boolean(supplier), "An active supplier is available for receiving cost verification");

    const receivingCode = `ETC-REC-${suffix}`;
    const netReceiving = await request("/purchase-receivings", {
      method: "POST",
      token: admin.token,
      body: {
        receivingCode,
        supplierId: supplier.id,
        referenceNo: `ETC-NET-REF-${suffix}`,
        notes: "Net acquisition unit cost verification",
        items: [
          {
            itemId: destinationItem.id,
            description: "Discounted receiving line",
            quantityReceived: 2,
            unitCost: 100,
            discountAmount: 20,
            batchCode: `ETC-NET-BATCH-${suffix}`,
          },
        ],
      },
    });
    assert(netReceiving.status === 201, "Discounted receiving draft is created", netReceiving.body);
    const postNetReceiving = await request(
      `/purchase-receivings/${netReceiving.body.data.id}/status`,
      {
        method: "PATCH",
        token: admin.token,
        body: { status: "POSTED" },
      }
    );
    assert(postNetReceiving.status === 200, "Discounted receiving posts successfully");
    const netBatch = await prisma.inventoryBatch.findUnique({
      where: {
        branchId_batchCode: {
          branchId: mainBranchId,
          batchCode: `ETC-NET-BATCH-${suffix}`,
        },
      },
    });
    const netMovement = await prisma.inventoryMovement.findFirst({
      where: { branchId: mainBranchId, batchId: netBatch.id, source: "PURCHASE" },
    });
    assert(
      decimalEquals(netBatch.unitCost, 90) &&
        decimalEquals(netBatch.operationalUnitCost, 90) &&
        decimalEquals(netMovement.unitCost, 90),
      "Receiving records net acquisition unit cost as lineTotal divided by quantity",
      { netBatch, netMovement }
    );

    const collisionReceiving = await request("/purchase-receivings", {
      method: "POST",
      token: admin.token,
      body: {
        receivingCode: `ETC-COLL-${suffix}`,
        supplierId: supplier.id,
        referenceNo: `ETC-COLL-REF-${suffix}`,
        notes: "Historical transfer batch collision verification",
        items: [
          {
            itemId: destinationItem.id,
            description: "Must not merge into transferred batch",
            quantityReceived: 1,
            unitCost: 999999,
            discountAmount: 0,
            batchCode: allocationA.destinationBatch.batchCode,
          },
        ],
      },
    });
    assert(collisionReceiving.status === 201, "Receiving collision fixture remains draft until posting");
    const collisionPost = await request(
      `/purchase-receivings/${collisionReceiving.body.data.id}/status`,
      {
        method: "PATCH",
        token: admin.token,
        body: { status: "POSTED" },
      }
    );
    const collisionReceivingAfter = await prisma.purchaseReceiving.findUnique({
      where: { id: collisionReceiving.body.data.id },
    });
    const collisionBatchAfter = await prisma.inventoryBatch.findUnique({
      where: { id: allocationA.destinationBatchId },
    });
    assert(
      collisionPost.status === 409 &&
        collisionReceivingAfter.status === "DRAFT" &&
        decimalEquals(collisionBatchAfter.unitCost, 2400) &&
        decimalEquals(collisionBatchAfter.operationalUnitCost, 2550) &&
        decimalEquals(collisionBatchAfter.quantityAvailable, 2),
      "Receiving batch-code collision rolls back posting and preserves historical transfer cost",
      { response: collisionPost.body, collisionReceivingAfter, collisionBatchAfter }
    );
    const cancelCollisionReceiving = await request(
      `/purchase-receivings/${collisionReceiving.body.data.id}/status`,
      {
        method: "PATCH",
        token: admin.token,
        body: {
          status: "CANCELLED",
          cancellationReason: "Close retained collision verification draft",
        },
      }
    );
    assert(
      cancelCollisionReceiving.status === 200,
      "Rejected receiving collision is closed through an auditable cancellation"
    );

    const catalogCleanupResponses = await Promise.all(
      cleanupCatalogItems.map((item) =>
        request(`/items/${item.id}`, {
          method: "PATCH",
          token: cleanupToken,
          body: { status: "INACTIVE" },
        })
      )
    );
    assert(
      catalogCleanupResponses.every(
        (response) => response.status === 200 && response.body?.data?.status === "INACTIVE"
      ),
      "All test-created catalog items are deactivated through the supported item API",
      catalogCleanupResponses
    );
    const retainedCatalogItems = await prisma.item.findMany({
      where: { id: { in: cleanupCatalogItems.map((item) => item.id) } },
      select: {
        id: true,
        status: true,
        inventoryBatches: { select: { quantityAvailable: true } },
      },
    });
    const retainedQuantityById = new Map(
      retainedCatalogItems.map((item) => [
        item.id,
        item.inventoryBatches.reduce(
          (sum, batch) => sum + Number(batch.quantityAvailable || 0),
          0
        ),
      ])
    );
    assert(
      retainedCatalogItems.length === 4 &&
        retainedCatalogItems.every((item) => item.status === "INACTIVE") &&
        decimalEquals(retainedQuantityById.get(sourceItem.id), 1) &&
        decimalEquals(retainedQuantityById.get(destinationItem.id), 5) &&
        decimalEquals(retainedQuantityById.get(serializedSourceItem.id), 0) &&
        decimalEquals(retainedQuantityById.get(serializedDestinationItem.id), 2),
      "Retained enterprise inventory history is non-sellable without changing its quantities",
      Object.fromEntries(retainedQuantityById)
    );
    cleanupComplete = true;

    console.log(`\nEnterprise transfer/costing test passed: ${passed} assertions.`);
    console.log(
      "Retained QA transfers, allocations, sale/cancellation, receiving, and inventory history remain available for inspection; test catalog items are inactive."
    );
  } finally {
    if (!cleanupComplete && cleanupToken && cleanupCatalogItems.length > 0) {
      const fallbackResults = await Promise.allSettled(
        cleanupCatalogItems.map((item) =>
          request(`/items/${item.id}`, {
            method: "PATCH",
            token: cleanupToken,
            body: { status: "INACTIVE" },
          })
        )
      );
      const failedCleanup = fallbackResults.filter(
        (result) =>
          result.status !== "fulfilled" ||
          result.value.status !== 200 ||
          result.value.body?.data?.status !== "INACTIVE"
      );

      if (failedCleanup.length > 0) {
        console.error("WARNING: Some test catalog items could not be deactivated", failedCleanup);
      }
    }

    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error("Enterprise transfer/costing test failed:");
  console.error(error);
  process.exitCode = 1;
});
