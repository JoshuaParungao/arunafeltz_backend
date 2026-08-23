require("dotenv").config();

const app = require("./src/app");
const prisma = require("./src/config/prisma");

const QA_BATCH_ID = "cmspt2ahm000j98uc5s53s0pd";
const QA_ITEM_ID = "cmspt2a7o000298uc7gsach92";
const QA_REFERENCE = "QA-COMP-MSPT2A5K-AOWHWC";

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
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });

    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  };

  try {
    const batchBefore = await prisma.inventoryBatch.findUnique({
      where: { id: QA_BATCH_ID },
      include: { item: { select: { id: true, itemCode: true } } },
    });

    if (
      !batchBefore ||
      batchBefore.itemId !== QA_ITEM_ID ||
      !batchBefore.item.itemCode.startsWith("QA-NON-MSPT2A5K-AOWHWC")
    ) {
      throw new Error("Refusing compensation: QA batch identity does not match");
    }

    const existingCompensation = await prisma.inventoryMovement.findFirst({
      where: {
        branchId: batchBefore.branchId,
        batchId: QA_BATCH_ID,
        referenceNo: QA_REFERENCE,
      },
    });

    if (existingCompensation) {
      console.log(
        JSON.stringify(
          {
            passed: Number(batchBefore.quantityAvailable) === 0,
            idempotentReplay: true,
            batchId: QA_BATCH_ID,
            quantityAvailable: batchBefore.quantityAvailable.toString(),
            movementId: existingCompensation.id,
          },
          null,
          2
        )
      );
      return;
    }

    if (Number(batchBefore.quantityAvailable) !== 2) {
      throw new Error(
        `Refusing compensation: expected QA quantity 2, found ${batchBefore.quantityAvailable}`
      );
    }

    const login = await request("/auth/login", {
      method: "POST",
      body: { identifier: "mainadmin", password: "Password123!" },
    });
    const token = login.body?.data?.token;

    if (login.status !== 200 || !token) {
      throw new Error("Admin login failed");
    }

    const adjustment = await request("/inventory/adjustments", {
      method: "POST",
      token,
      body: {
        branchId: batchBefore.branchId,
        batchId: QA_BATCH_ID,
        type: "DECREASE",
        quantity: 2,
        referenceNo: QA_REFERENCE,
        remarks:
          "Auditable compensation for isolated client-ready purchasing concurrency acceptance",
      },
    });

    const batchAfter = await prisma.inventoryBatch.findUnique({
      where: { id: QA_BATCH_ID },
    });
    const compensationMovement = await prisma.inventoryMovement.findFirst({
      where: {
        branchId: batchBefore.branchId,
        batchId: QA_BATCH_ID,
        referenceNo: QA_REFERENCE,
      },
    });
    const passed =
      adjustment.status === 201 &&
      Number(batchAfter.quantityAvailable) === 0 &&
      batchAfter.status === "DEPLETED" &&
      Number(compensationMovement?.previousQuantity) === 2 &&
      Number(compensationMovement?.newQuantity) === 0;

    console.log(
      JSON.stringify(
        {
          passed,
          adjustmentStatus: adjustment.status,
          batchId: QA_BATCH_ID,
          quantityBefore: batchBefore.quantityAvailable.toString(),
          quantityAfter: batchAfter.quantityAvailable.toString(),
          batchStatus: batchAfter.status,
          movementId: compensationMovement?.id,
          referenceNo: QA_REFERENCE,
        },
        null,
        2
      )
    );

    if (!passed) {
      console.dir(adjustment, { depth: null });
      process.exitCode = 1;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
