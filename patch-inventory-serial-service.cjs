const fs = require("fs");

const filePath = "./src/modules/inventory/services/inventory.service.js";

if (!fs.existsSync(filePath)) {
  console.error("inventory.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const updateSerialStatus = async")) {
  console.log("SKIP: updateSerialStatus already exists.");
  process.exit(0);
}

const functionToAdd = `
const updateSerialStatus = async (actor, serialId, payload) => {
  const serial = await prisma.itemSerial.findUnique({
    where: {
      id: serialId,
    },
    include: {
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      item: {
        select: {
          id: true,
          itemCode: true,
          itemName: true,
        },
      },
      batch: {
        select: {
          id: true,
          batchCode: true,
          quantityAvailable: true,
        },
      },
    },
  });

  if (!serial) {
    const error = new Error("SERIAL_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (!isSuperOwner(actor) && serial.branchId !== actor.branchId) {
    const error = new Error("BRANCH_ACCESS_DENIED");
    error.statusCode = 403;
    throw error;
  }

  const previousStatus = serial.status;

  const updatedSerial = await prisma.itemSerial.update({
    where: {
      id: serial.id,
    },
    data: {
      status: payload.status,
      remarks: payload.remarks || serial.remarks,
      updatedById: actor.id,
    },
    select: {
      id: true,
      serialNumber: true,
      status: true,
      remarks: true,
      createdAt: true,
      updatedAt: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      item: {
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          brand: true,
          modelName: true,
        },
      },
      batch: {
        select: {
          id: true,
          batchCode: true,
          quantityAvailable: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
    },
  });

  return {
    previousStatus,
    serial: updatedSerial,
  };
};
`;

content = content.replace(
  "module.exports = {",
  `${functionToAdd}\nmodule.exports = {`
);

content = content.replace(
  "createStockAdjustment,",
  "createStockAdjustment,\n  updateSerialStatus,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: inventory.service.js patched with updateSerialStatus.");
