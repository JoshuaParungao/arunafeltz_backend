const fs = require("fs");

const filePath = "./src/modules/inventory/services/inventory.service.js";

if (!fs.existsSync(filePath)) {
  console.error("inventory.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const getInventoryMovements = async")) {
  console.log("SKIP: getInventoryMovements already exists.");
  process.exit(0);
}

const functionToAdd = `
const getInventoryMovements = async (actor, query) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const search = query.search ? String(query.search).trim() : "";

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.itemId ? { itemId: query.itemId } : {}),
    ...(query.batchId ? { batchId: query.batchId } : {}),
    ...(query.serialId ? { serialId: query.serialId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(search
      ? {
          OR: [
            {
              movementCode: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              referenceNo: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              remarks: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              item: {
                itemCode: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              item: {
                itemName: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              batch: {
                batchCode: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
            {
              serial: {
                serialNumber: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
  };

  const { page, limit, skip } = parsePagination(query);

  const [totalItems, movements] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      orderBy: [
        {
          movementDate: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      skip,
      take: limit,
      select: {
        id: true,
        movementCode: true,
        type: true,
        source: true,
        quantity: true,
        previousQuantity: true,
        newQuantity: true,
        unitCost: true,
        referenceNo: true,
        remarks: true,
        movementDate: true,
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
          },
        },
        serial: {
          select: {
            id: true,
            serialNumber: true,
            status: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
      },
    }),
  ]);

  return {
    data: movements,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};
`;

content = content.replace(
  "module.exports = {",
  `${functionToAdd}\nmodule.exports = {`
);

content = content.replace(
  "getInventorySerials,",
  "getInventorySerials,\n  getInventoryMovements,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: inventory.service.js patched with movement history function.");
