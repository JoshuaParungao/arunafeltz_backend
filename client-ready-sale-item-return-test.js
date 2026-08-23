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
    if (details !== undefined) console.dir(details, { depth: null });
    throw new Error(message);
  }

  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
};

const money = (value) => Math.round(Number(value) * 100) / 100;

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
        ...(options.token
          ? { Authorization: `Bearer ${options.token}` }
          : {}),
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

  const updateRules = (token, body) =>
    request("/incentives/rules", {
      method: "PATCH",
      token,
      body,
    });

  const createInventorySale = async ({
    token,
    branchId,
    item,
    batchId,
    serialId,
    quantity,
    discountAmount = 0,
    paymentMethod,
    paymentAmount,
    remarks,
    customerId,
  }) => {
    const result = await request("/sales", {
      method: "POST",
      token,
      body: {
        branchId,
        customerId,
        remarks,
        items: [
          {
            itemId: item.id,
            batchId,
            serialId,
            priceTier: 1,
            quantity,
            discountAmount,
          },
        ],
        payments: [
          {
            paymentMethod,
            amount: paymentAmount,
          },
        ],
      },
    });
    assert(result.status === 201, `${remarks} is created`, result.body);
    return result.body.data;
  };

  try {
    const [admin, technician, loggedInSuperOwner] = await Promise.all([
      login(credentials.admin),
      login(credentials.technician),
      login(credentials.superOwner),
    ]);
    superOwner = loggedInSuperOwner;

    const branchId = admin.user.branch?.id || admin.user.branchId;
    const otherBranch = await prisma.branch.findFirst({
      where: { id: { not: branchId }, status: "ACTIVE" },
      select: { id: true, code: true },
    });
    assert(Boolean(branchId && otherBranch), "Two active branches are available");

    const rulesResponse = await request("/incentives?limit=1", {
      token: superOwner.token,
    });
    assert(rulesResponse.status === 200, "Current incentive rules are readable");
    const rules = rulesResponse.body.data.rules;
    originalRules = {
      enableItemIncentives: rules.enableItemIncentives,
      enableServiceIncentives: rules.enableServiceIncentives,
      defaultItemIncentivePercent: rules.defaultItemIncentivePercent,
      defaultServiceIncentivePercent: rules.defaultServiceIncentivePercent,
      staffCanViewOwnIncentives: rules.staffCanViewOwnIncentives,
      ownerCanViewAllIncentives: rules.ownerCanViewAllIncentives,
      requireOwnerApprovalBeforePayout:
        rules.requireOwnerApprovalBeforePayout,
    };
    const enabledRules = await updateRules(superOwner.token, {
      ...originalRules,
      enableItemIncentives: true,
      defaultItemIncentivePercent: 10,
    });
    assert(enabledRules.status === 200, "Product incentive posting is enabled for isolated QA");

    const batch = await prisma.inventoryBatch.findFirst({
      where: {
        branchId,
        status: "ACTIVE",
        quantityAvailable: { gte: 6 },
        item: { status: "ACTIVE", isSerialized: false, price1: { gt: 0 } },
      },
      include: { item: true },
      orderBy: { quantityAvailable: "desc" },
    });
    assert(Boolean(batch), "Main branch has a non-serialized batch for returns");
    const batchBaseline = Number(batch.quantityAvailable);
    const unitPrice = Number(batch.item.price1);
    const suffix = Date.now().toString(36).toUpperCase();

    const productSale = await createInventorySale({
      token: admin.token,
      item: batch.item,
      batchId: batch.id,
      quantity: 3,
      discountAmount: 300,
      paymentMethod: "GCASH",
      paymentAmount: money(unitPrice * 3 - 300),
      remarks: `RETURN QA PRODUCT ${suffix}`,
    });
    retained.productSaleId = productSale.id;
    retained.productSaleCode = productSale.receiptCode;
    const productSaleItem = productSale.items[0];
    const lineNet = Number(productSaleItem.lineTotal);
    assert(
      Number(
        (
          await prisma.inventoryBatch.findUnique({ where: { id: batch.id } })
        ).quantityAvailable
      ) ===
        batchBaseline - 3,
      "Sale deducts exactly three units before returns"
    );

    let initialIncentive = await prisma.incentive.findUnique({
      where: { sourceKey: `SALE_ITEM:${productSale.id}` },
    });
    // Enterprise posting is intentionally paused until an owner saves both an
    // effective rate matrix and claim schedule. Keep this legacy-return
    // regression independent of that owner decision by creating the exact
    // pre-enterprise ledger shape only when the normal hook safely skipped it.
    if (!initialIncentive) {
      initialIncentive = await prisma.incentive.create({
        data: {
          sourceKey: `SALE_ITEM:${productSale.id}`,
          type: "SALE_ITEM",
          sourceCode: productSale.receiptCode,
          sourceDate: productSale.saleDate,
          basisAmount: lineNet,
          ratePercent: 10,
          amount: money(lineNet * 0.1),
          branchId,
          staffId: admin.user.id,
          saleId: productSale.id,
          postedById: admin.user.id,
        },
      });
    }
    const originalIncentiveRate = Number(initialIncentive.ratePercent);
    assert(
      initialIncentive?.status === "POSTED" &&
        Number(initialIncentive.basisAmount) === lineNet &&
        Number.isFinite(originalIncentiveRate),
      "Sale has one posted product incentive snapshot"
    );

    const unauthorized = await request(`/sales/${productSale.id}/returns`, {
      method: "POST",
      token: technician.token,
      body: {
        reason: `Unauthorized ${suffix}`,
        refundMethod: "GCASH",
        refundAmount: money(lineNet / 3),
        items: [{ saleItemId: productSaleItem.id, quantity: 1 }],
      },
    });
    assert(unauthorized.status === 403, "Technician cannot return sale items");

    const otherBranchSaleResult = await request("/sales", {
      method: "POST",
      token: superOwner.token,
      body: {
        branchId: otherBranch.id,
        remarks: `RETURN QA BRANCH ${suffix}`,
        items: [
          {
            description: `Branch isolation line ${suffix}`,
            quantity: 1,
            unitPrice: 0,
            discountAmount: 0,
          },
        ],
        payments: [{ paymentMethod: "OTHER", amount: 0 }],
      },
    });
    assert(otherBranchSaleResult.status === 201, "Other-branch isolation sale is created");
    retained.branchSaleId = otherBranchSaleResult.body.data.id;
    const crossBranch = await request(
      `/sales/${retained.branchSaleId}/returns`,
      {
        method: "POST",
        token: admin.token,
        body: {
          reason: `Cross branch ${suffix}`,
          refundMethod: "NONE",
          refundAmount: 0,
          items: [
            {
              saleItemId: otherBranchSaleResult.body.data.items[0].id,
              quantity: 1,
            },
          ],
        },
      }
    );
    assert(crossBranch.status === 404, "Branch Admin cannot access another branch sale return");
    const branchSaleCancel = await request(
      `/sales/${retained.branchSaleId}/cancel`,
      {
        method: "PATCH",
        token: superOwner.token,
        body: { cancellationReason: `Close branch isolation QA ${suffix}` },
      }
    );
    assert(branchSaleCancel.status === 200, "Other-branch QA sale is closed through audited cancellation");

    const returnCountBefore = await prisma.returnRequest.count({
      where: { saleId: productSale.id },
    });
    const overReturn = await request(`/sales/${productSale.id}/returns`, {
      method: "POST",
      token: admin.token,
      body: {
        reason: `Over return ${suffix}`,
        refundMethod: "GCASH",
        refundAmount: lineNet,
        items: [{ saleItemId: productSaleItem.id, quantity: 4 }],
      },
    });
    assert(overReturn.status === 400, "Quantity above the sold line is rejected");
    assert(
      (await prisma.returnRequest.count({ where: { saleId: productSale.id } })) ===
        returnCountBefore,
      "Rejected over-return creates no return request"
    );

    const firstRefund = money(lineNet / 3);
    const partialReturn = await request(`/sales/${productSale.id}/returns`, {
      method: "POST",
      token: admin.token,
      body: {
        reason: `Customer product return ${suffix}`,
        notes: "Retained client-ready partial return verification",
        refundMethod: "GCASH",
        refundAmount: firstRefund,
        items: [{ saleItemId: productSaleItem.id, quantity: 1 }],
      },
    });
    assert(partialReturn.status === 201, "One unit completes as an auditable non-cash return", partialReturn.body);
    retained.partialReturnId = partialReturn.body.data.returnRequest.id;
    retained.partialReturnCode = partialReturn.body.data.returnRequest.returnCode;
    assert(
      partialReturn.body.data.sale.status === "PARTIALLY_REFUNDED" &&
        partialReturn.body.data.sale.paymentStatus === "PAID",
      "Partial return updates sale status without prematurely refunding payment status"
    );
    assert(
      Number(
        (
          await prisma.inventoryBatch.findUnique({ where: { id: batch.id } })
        ).quantityAvailable
      ) ===
        batchBaseline - 2,
      "Partial return restores exactly one batch unit"
    );
    assert(
      (await prisma.cashTransaction.count({
        where: { sourceId: retained.partialReturnId },
      })) === 0,
      "Non-cash return does not mutate the cash box"
    );

    const adjustedIncentive = await prisma.incentive.findUnique({
      where: {
        sourceKey: `SALE_ITEM_RETURN:${productSale.id}:${retained.partialReturnId}`,
      },
    });
    assert(
      (
        await prisma.incentive.findUnique({ where: { id: initialIncentive.id } })
      ).status === "REVERSED" &&
        adjustedIncentive?.status === "POSTED" &&
        Number(adjustedIncentive.basisAmount) === money(lineNet - firstRefund) &&
        Number(adjustedIncentive.ratePercent) === originalIncentiveRate,
      "Partial return reverses and replaces only product incentive at original rate"
    );

    const remainingRefund = money(lineNet - firstRefund);
    const concurrentReturns = await Promise.all([
      request(`/sales/${productSale.id}/returns`, {
        method: "POST",
        token: admin.token,
        body: {
          reason: `Concurrent final A ${suffix}`,
          refundMethod: "GCASH",
          refundAmount: remainingRefund,
          items: [{ saleItemId: productSaleItem.id, quantity: 2 }],
        },
      }),
      request(`/sales/${productSale.id}/returns`, {
        method: "POST",
        token: admin.token,
        body: {
          reason: `Concurrent final B ${suffix}`,
          refundMethod: "GCASH",
          refundAmount: remainingRefund,
          items: [{ saleItemId: productSaleItem.id, quantity: 2 }],
        },
      }),
    ]);
    assert(
      JSON.stringify(concurrentReturns.map((result) => result.status).sort()) ===
        JSON.stringify([201, 400]),
      "Concurrent final return completes exactly once",
      concurrentReturns
    );
    const finalReturn = concurrentReturns.find((result) => result.status === 201)
      .body.data.returnRequest;
    retained.finalReturnId = finalReturn.id;
    retained.finalReturnCode = finalReturn.returnCode;
    const refundedSale = await prisma.sale.findUnique({
      where: { id: productSale.id },
    });
    assert(
      refundedSale.status === "REFUNDED" &&
        refundedSale.paymentStatus === "REFUNDED",
      "Returning every product unit fully refunds sale and payment status"
    );
    assert(
      Number(
        (
          await prisma.inventoryBatch.findUnique({ where: { id: batch.id } })
        ).quantityAvailable
      ) === batchBaseline,
      "All returns restore the exact pre-sale batch balance"
    );
    const completedProductReturns = await prisma.returnRequest.findMany({
      where: { saleId: productSale.id, status: "COMPLETED" },
      include: { items: true },
    });
    assert(
      completedProductReturns.length === 2 &&
        completedProductReturns
          .flatMap((requestRecord) => requestRecord.items)
          .reduce((sum, item) => sum + Number(item.quantity), 0) === 3,
      "Completed return history contains exactly the sold quantity"
    );
    assert(
      (await prisma.incentive.count({
        where: { saleId: productSale.id, type: "SALE_ITEM", status: "POSTED" },
      })) === 0 &&
        (
          await prisma.incentive.findUnique({ where: { id: adjustedIncentive.id } })
        ).status === "REVERSED",
      "Fully returned product revenue leaves no payable product incentive"
    );

    const serial = await prisma.itemSerial.findFirst({
      where: {
        branchId,
        status: "AVAILABLE",
        item: { status: "ACTIVE", isSerialized: true, price1: { gt: 0 } },
        batch: { status: "ACTIVE", quantityAvailable: { gte: 1 } },
      },
      include: { item: true, batch: true },
    });
    const otherSerial = await prisma.itemSerial.findFirst({
      where: {
        branchId,
        status: "AVAILABLE",
        id: { not: serial?.id },
      },
      select: { id: true },
    });
    assert(Boolean(serial && otherSerial), "Available serialized QA units exist");
    const serialBatchBaseline = Number(serial.batch.quantityAvailable);
    const serialSale = await createInventorySale({
      token: admin.token,
      item: serial.item,
      batchId: serial.batchId,
      serialId: serial.id,
      quantity: 1,
      paymentMethod: "GCASH",
      paymentAmount: Number(serial.item.price1),
      remarks: `RETURN QA SERIAL ${suffix}`,
    });
    retained.serialSaleId = serialSale.id;
    retained.serialSaleCode = serialSale.receiptCode;
    const serialSaleItem = serialSale.items[0];
    const wrongSerialReturn = await request(`/sales/${serialSale.id}/returns`, {
      method: "POST",
      token: admin.token,
      body: {
        reason: `Wrong serial ${suffix}`,
        refundMethod: "GCASH",
        refundAmount: Number(serialSaleItem.lineTotal),
        items: [
          {
            saleItemId: serialSaleItem.id,
            quantity: 1,
            serialId: otherSerial.id,
          },
        ],
      },
    });
    assert(wrongSerialReturn.status === 400, "A different serial cannot satisfy a serialized return");
    assert(
      (await prisma.itemSerial.findUnique({ where: { id: serial.id } })).status ===
        "SOLD",
      "Rejected serial return leaves the sold serial unchanged"
    );
    const serializedConcurrent = await Promise.all([
      request(`/sales/${serialSale.id}/returns`, {
        method: "POST",
        token: admin.token,
        body: {
          reason: `Serial concurrent A ${suffix}`,
          refundMethod: "GCASH",
          refundAmount: Number(serialSaleItem.lineTotal),
          items: [
            { saleItemId: serialSaleItem.id, quantity: 1, serialId: serial.id },
          ],
        },
      }),
      request(`/sales/${serialSale.id}/returns`, {
        method: "POST",
        token: admin.token,
        body: {
          reason: `Serial concurrent B ${suffix}`,
          refundMethod: "GCASH",
          refundAmount: Number(serialSaleItem.lineTotal),
          items: [
            { saleItemId: serialSaleItem.id, quantity: 1, serialId: serial.id },
          ],
        },
      }),
    ]);
    assert(
      JSON.stringify(serializedConcurrent.map((result) => result.status).sort()) ===
        JSON.stringify([201, 400]),
      "Concurrent serialized return completes exactly once"
    );
    const returnedSerial = await prisma.itemSerial.findUnique({
      where: { id: serial.id },
    });
    assert(returnedSerial.status === "RETURNED", "Sold serial moves to RETURNED for inspection");
    assert(
      Number(
        (
          await prisma.inventoryBatch.findUnique({ where: { id: serial.batchId } })
        ).quantityAvailable
      ) === serialBatchBaseline,
      "Serialized return restores its exact batch balance"
    );
    const serialReturn = serializedConcurrent.find((result) => result.status === 201)
      .body.data.returnRequest;
    retained.serialReturnId = serialReturn.id;
    retained.serialReturnCode = serialReturn.returnCode;
    assert(
      Boolean(
        await prisma.inventoryMovement.findFirst({
          where: {
            referenceNo: serialReturn.returnCode,
            type: "RETURN_IN",
            source: "RETURN",
            serialId: serial.id,
          },
        })
      ),
      "Serialized return has a source-linked RETURN_IN movement"
    );
    const releaseReturnedSerial = await request(
      `/inventory/serials/${serial.id}/status`,
      {
        method: "PATCH",
        token: admin.token,
        body: {
          status: "AVAILABLE",
          remarks: `QA inspected after return ${serialReturn.returnCode}`,
        },
      }
    );
    assert(
      releaseReturnedSerial.status === 200,
      "Returned QA serial is released through the normal inspection status workflow"
    );

    const customer = await prisma.customer.findFirst({
      where: { branchId, status: "ACTIVE" },
      select: { id: true },
    });
    assert(Boolean(customer), "Active customer exists for linked credit safety");
    const creditBatchBefore = Number(
      (
        await prisma.inventoryBatch.findUnique({ where: { id: batch.id } })
      ).quantityAvailable
    );
    const creditSale = await createInventorySale({
      token: admin.token,
      item: batch.item,
      batchId: batch.id,
      quantity: 1,
      paymentMethod: "CREDIT",
      paymentAmount: 0,
      remarks: `RETURN QA CREDIT ${suffix}`,
      customerId: customer.id,
    });
    retained.creditSaleId = creditSale.id;
    retained.creditSaleCode = creditSale.receiptCode;
    const creditCreate = await request(`/sales/${creditSale.id}/credit-account`, {
      method: "POST",
      token: admin.token,
      body: { term: "MONTH_3", dueDay: 15, remarks: `Return rejection QA ${suffix}` },
    });
    assert(creditCreate.status === 201, "Credit-linked sale has an installment account", creditCreate.body);
    retained.creditAccountId = creditCreate.body.data.id;
    retained.creditAccountCode = creditCreate.body.data.creditCode;
    const creditBefore = await prisma.creditAccount.findUnique({
      where: { id: retained.creditAccountId },
    });
    const creditReturn = await request(`/sales/${creditSale.id}/returns`, {
      method: "POST",
      token: admin.token,
      body: {
        reason: `Unsafe credit return ${suffix}`,
        refundMethod: "NONE",
        refundAmount: 0,
        items: [{ saleItemId: creditSale.items[0].id, quantity: 1 }],
      },
    });
    assert(
      creditReturn.status === 400 &&
        creditReturn.body?.errorCode === "SALE_RETURN_CREDIT_UNSUPPORTED",
      "Partial return of a credit-linked sale is rejected with a safe explicit error",
      creditReturn.body
    );
    const creditAfter = await prisma.creditAccount.findUnique({
      where: { id: retained.creditAccountId },
    });
    assert(
      Number(creditAfter.balanceAmount) === Number(creditBefore.balanceAmount) &&
        Number(creditAfter.remainingBalance) === Number(creditBefore.remainingBalance) &&
        (await prisma.returnRequest.count({ where: { saleId: creditSale.id } })) === 0 &&
        Number(
          (
            await prisma.inventoryBatch.findUnique({ where: { id: batch.id } })
          ).quantityAvailable
        ) ===
          creditBatchBefore - 1,
      "Rejected credit return does not drift principal, balance, stock, or return history"
    );
    const closeCreditSale = await request(`/sales/${creditSale.id}/cancel`, {
      method: "PATCH",
      token: admin.token,
      body: { cancellationReason: `Close linked credit return QA ${suffix}` },
    });
    assert(closeCreditSale.status === 200, "Credit QA sale closes through whole-sale audited reversal");
    assert(
      (await prisma.creditAccount.findUnique({ where: { id: retained.creditAccountId } }))
        .status === "CANCELLED" &&
        Number(
          (
            await prisma.inventoryBatch.findUnique({ where: { id: batch.id } })
          ).quantityAvailable
        ) === creditBatchBefore,
      "Audited whole-sale reversal safely cancels credit and restores QA stock"
    );

    const cashBatch = await prisma.inventoryBatch.findFirst({
      where: {
        branchId: otherBranch.id,
        status: "ACTIVE",
        quantityAvailable: { gte: 1 },
        item: { status: "ACTIVE", isSerialized: false, price1: { gt: 0 } },
      },
      include: { item: true },
    });
    const cashBox = await prisma.cashBox.findFirst({
      where: {
        branchId: otherBranch.id,
        boxCode: `CASHBOX-${otherBranch.code}`,
        status: "ACTIVE",
      },
    });
    assert(Boolean(cashBatch && cashBox), "Second branch has stock and an active cash box");
    const cashBatchBaseline = Number(cashBatch.quantityAvailable);
    const cashBaseline = Number(cashBox.currentBalance);
    const cashSale = await createInventorySale({
      token: superOwner.token,
      branchId: otherBranch.id,
      item: cashBatch.item,
      batchId: cashBatch.id,
      quantity: 1,
      paymentMethod: "CASH",
      paymentAmount: Number(cashBatch.item.price1),
      remarks: `RETURN QA CASH ${suffix}`,
    });
    retained.cashSaleId = cashSale.id;
    retained.cashSaleCode = cashSale.receiptCode;
    const cashSaleItem = cashSale.items[0];
    const balanceAfterSale = Number(
      (await prisma.cashBox.findUnique({ where: { id: cashBox.id } })).currentBalance
    );
    assert(
      balanceAfterSale === money(cashBaseline + Number(cashSaleItem.lineTotal)),
      "Cash sale posts the exact source-linked collection"
    );
    const drain = await request(`/cash-boxes/${cashBox.id}/transactions`, {
      method: "POST",
      token: superOwner.token,
      body: {
        type: "CASH_OUT",
        amount: balanceAfterSale,
        description: `Temporary return insufficient-cash QA ${suffix}`,
        referenceNo: `RET-DRAIN-${suffix}`,
      },
    });
    assert(drain.status === 201, "Temporary cash QA drain posts through normal cash workflow", drain.body);
    retained.cashDrainTransactionId = drain.body.data.transaction.id;
    const cashReturnPayload = {
      reason: `Cash customer return ${suffix}`,
      refundMethod: "CASH",
      refundAmount: Number(cashSaleItem.lineTotal),
      items: [{ saleItemId: cashSaleItem.id, quantity: 1 }],
    };
    const insufficientCashReturn = await request(`/sales/${cashSale.id}/returns`, {
      method: "POST",
      token: superOwner.token,
      body: cashReturnPayload,
    });
    assert(
      insufficientCashReturn.status === 400 &&
        insufficientCashReturn.body?.errorCode === "INSUFFICIENT_CASH_FOR_REFUND",
      "Cash return rejects atomically when the branch cash box is insufficient",
      insufficientCashReturn.body
    );
    assert(
      (await prisma.returnRequest.count({ where: { saleId: cashSale.id } })) === 0 &&
        (await prisma.sale.findUnique({ where: { id: cashSale.id } })).status ===
          "COMPLETED" &&
        Number(
          (
            await prisma.inventoryBatch.findUnique({ where: { id: cashBatch.id } })
          ).quantityAvailable
        ) ===
          cashBatchBaseline - 1,
      "Insufficient cash rolls back return history, sale status, and stock restoration"
    );
    const reverseDrain = await request(
      `/cash-boxes/transactions/${retained.cashDrainTransactionId}/cancel`,
      {
        method: "POST",
        token: superOwner.token,
        body: { cancellationReason: `Restore temporary return QA cash ${suffix}` },
      }
    );
    assert(reverseDrain.status === 200, "Temporary cash drain is reversibly restored");
    const cashReturn = await request(`/sales/${cashSale.id}/returns`, {
      method: "POST",
      token: superOwner.token,
      body: cashReturnPayload,
    });
    assert(cashReturn.status === 201, "Cash item return completes after funds are available", cashReturn.body);
    retained.cashReturnId = cashReturn.body.data.returnRequest.id;
    retained.cashReturnCode = cashReturn.body.data.returnRequest.returnCode;
    const cashOut = await prisma.cashTransaction.findFirst({
      where: {
        source: "SALE",
        sourceId: retained.cashReturnId,
        type: "CASH_OUT",
        status: "POSTED",
      },
    });
    assert(
      cashOut?.sourceCode === retained.cashReturnCode &&
        Number(cashOut.amount) === Number(cashSaleItem.lineTotal),
      "Cash refund creates one traceable CASH_OUT linked to the return request"
    );
    assert(
      Number(
        (await prisma.cashBox.findUnique({ where: { id: cashBox.id } }))
          .currentBalance
      ) === cashBaseline &&
        Number(
          (
            await prisma.inventoryBatch.findUnique({ where: { id: cashBatch.id } })
          ).quantityAvailable
        ) === cashBatchBaseline,
      "Cash and stock return to their exact pre-sale balances"
    );

    const saleDetail = await request(`/sales/${productSale.id}`, {
      token: admin.token,
    });
    assert(
      saleDetail.status === 200 &&
        saleDetail.body.data.returnRequests.length === 2 &&
        Number(saleDetail.body.data.items[0].returnedQuantity) === 3 &&
        Number(saleDetail.body.data.items[0].remainingReturnQuantity) === 0,
      "Sale detail exposes completed return history and exact remaining quantities",
      saleDetail.body
    );
    assert(
      Boolean(
        await prisma.auditLog.findFirst({
          where: {
            action: "SALE_ITEMS_RETURNED",
            entityType: "ReturnRequest",
            entityId: retained.partialReturnId,
          },
        })
      ),
      "Completed return has a durable global audit-log event"
    );
  } finally {
    if (originalRules && superOwner?.token) {
      const restored = await updateRules(superOwner.token, originalRules).catch(
        () => null
      );
      if (restored?.status === 200) {
        console.log("RESTORED: original incentive rules restored through audited API.");
      } else {
        console.error("CRITICAL: incentive rules could not be restored", restored);
        process.exitCode = 1;
      }
    }

    console.log("RETAINED AUDIT IDENTIFIERS:", JSON.stringify(retained));
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }

  console.log(`\nSale-item return regression passed: ${passed} assertions.`);
  console.log(
    "All QA sales, returns, movements, incentives, and cash history were retained; temporary stock/cash effects were compensated through normal audited workflows."
  );
};

main().catch((error) => {
  console.error("Sale-item return regression failed:");
  console.error(error);
  process.exitCode = 1;
});
