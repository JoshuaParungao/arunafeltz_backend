require("dotenv").config();

const app = require("./src/app");
const prisma = require("./src/config/prisma");

const QA_SUPPLIER_ID = "cmspt2a6r000098ucr79gdg2w";
const QA_ITEM_ID = "cmspt2a7o000298uc7gsach92";
const EXISTING_QA_REFERENCE = "QA-REF-NON-MSPT2A5K-AOWHWC";

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

const main = async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  let token = null;
  let purchaseOrder = null;

  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });

    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  };

  try {
    const login = await request("/auth/login", {
      method: "POST",
      body: { identifier: "mainadmin", password: "Password123!" },
    });
    token = login.body?.data?.token;
    assert(login.status === 200 && token, "Admin login succeeds", login.body);

    const supplierActivation = await request(
      `/suppliers/${QA_SUPPLIER_ID}/status`,
      { method: "PATCH", token, body: { status: "ACTIVE" } }
    );
    const itemActivation = await request(`/items/${QA_ITEM_ID}`, {
      method: "PATCH",
      token,
      body: { status: "ACTIVE" },
    });
    assert(
      supplierActivation.status === 200 && itemActivation.status === 200,
      "Only isolated QA supplier and item are reactivated for follow-up",
      { supplierActivation, itemActivation }
    );

    const suffix = Date.now().toString(36).toUpperCase();
    const duplicateCode = `QA-REC-DUP-REF-${suffix}`;
    const duplicateReference = await request("/purchase-receivings", {
      method: "POST",
      token,
      body: {
        receivingCode: duplicateCode,
        supplierId: QA_SUPPLIER_ID,
        referenceNo: EXISTING_QA_REFERENCE.toLowerCase(),
        items: [
          {
            itemId: QA_ITEM_ID,
            description: "Duplicate reference must fail",
            quantityReceived: 1,
            unitCost: 100,
            batchCode: `QA-NOT-CREATED-${suffix}`,
          },
        ],
      },
    });
    const duplicateCount = await prisma.purchaseReceiving.count({
      where: { receivingCode: duplicateCode },
    });
    assert(
      duplicateReference.status === 409 && duplicateCount === 0,
      "Case-insensitive duplicate business reference is rejected without a draft",
      duplicateReference.body
    );

    const poCode = `QA-PO-INTEGRITY-${suffix}`;
    const poCreate = await request("/purchase-orders", {
      method: "POST",
      token,
      body: {
        poCode,
        supplierId: QA_SUPPLIER_ID,
        notes: "Retained cancelled QA record for linked receiving integrity",
        items: [
          {
            itemId: QA_ITEM_ID,
            description: "QA linked receiving item",
            quantity: 1,
            unitCost: 100,
          },
        ],
      },
    });
    assert(poCreate.status === 201, "Integrity QA PO is created", poCreate.body);
    purchaseOrder = poCreate.body.data;

    const poOrder = await request(`/purchase-orders/${purchaseOrder.id}/status`, {
      method: "PATCH",
      token,
      body: { status: "ORDERED" },
    });
    assert(poOrder.status === 200, "Integrity QA PO is ordered", poOrder.body);

    const missingMappingCode = `QA-REC-MISSING-MAP-${suffix}`;
    const missingMapping = await request("/purchase-receivings", {
      method: "POST",
      token,
      body: {
        receivingCode: missingMappingCode,
        supplierId: QA_SUPPLIER_ID,
        purchaseOrderId: purchaseOrder.id,
        referenceNo: `QA-MISSING-MAP-${suffix}`,
        items: [
          {
            itemId: QA_ITEM_ID,
            description: "Missing PO item mapping must fail",
            quantityReceived: 1,
            unitCost: 100,
            batchCode: `QA-MISSING-MAP-BATCH-${suffix}`,
          },
        ],
      },
    });
    const missingMappingCount = await prisma.purchaseReceiving.count({
      where: { receivingCode: missingMappingCode },
    });
    assert(
      missingMapping.status === 400 && missingMappingCount === 0,
      "PO-linked receiving requires an explicit PO item and creates no draft",
      missingMapping.body
    );

    const poCancel = await request(`/purchase-orders/${purchaseOrder.id}/status`, {
      method: "PATCH",
      token,
      body: {
        status: "CANCELLED",
        cancellationReason: "Close isolated linked-receiving integrity QA",
      },
    });
    assert(
      poCancel.status === 200 && poCancel.body?.data?.status === "CANCELLED",
      "Unreceived ordered PO can be cancelled audibly",
      poCancel.body
    );

    const finalPo = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrder.id },
      include: { items: true },
    });
    assert(
      finalPo.status === "CANCELLED" &&
        finalPo.items.every((item) => Number(item.receivedQuantity) === 0),
      "Cancelled follow-up PO has no received quantity or stock effect",
      finalPo
    );

    console.log(`\nRESULT: ${passed}/${passed} assertions passed`);
    console.log(
      JSON.stringify(
        {
          retainedPurchaseOrderId: purchaseOrder.id,
          retainedPurchaseOrderCode: purchaseOrder.poCode,
          retainedStatus: finalPo.status,
        },
        null,
        2
      )
    );
  } finally {
    if (token) {
      if (purchaseOrder) {
        const latestPo = await prisma.purchaseOrder.findUnique({
          where: { id: purchaseOrder.id },
          select: { status: true, items: { select: { receivedQuantity: true } } },
        });

        if (
          latestPo &&
          latestPo.status === "ORDERED" &&
          latestPo.items.every((item) => Number(item.receivedQuantity) === 0)
        ) {
          await request(`/purchase-orders/${purchaseOrder.id}/status`, {
            method: "PATCH",
            token,
            body: {
              status: "CANCELLED",
              cancellationReason: "Safety close after interrupted integrity QA",
            },
          });
        }
      }

      await request(`/suppliers/${QA_SUPPLIER_ID}/status`, {
        method: "PATCH",
        token,
        body: { status: "INACTIVE" },
      });
      await request(`/items/${QA_ITEM_ID}`, {
        method: "PATCH",
        token,
        body: { status: "INACTIVE" },
      });
    }

    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
