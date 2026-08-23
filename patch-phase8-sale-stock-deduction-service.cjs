const fs = require("fs");

const filePath = "./src/modules/sales/services/sale.service.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const generateSaleInventoryMovementCode = async")) {
  console.log("SKIP: sale stock deduction service already patched.");
  process.exit(0);
}

const movementCodeFunction = `
const generateSaleInventoryMovementCode = async (tx, branchCode, itemCode, branchId) => {
  const prefix = \`MOV-\${branchCode}-\${itemCode}-SALEOUT-\`;

  const count = await tx.inventoryMovement.count({
    where: {
      branchId,
      movementCode: {
        startsWith: prefix,
      },
    },
  });

  return \`\${prefix}\${String(count + 1).padStart(3, "0")}\`;
};
`;

content = content.replace(
  "const buildSaleItems = async",
  `${movementCodeFunction}\nconst buildSaleItems = async`
);

content = content.replace(
  "  const saleItems = [];\n  let subtotal = 0;",
  "  const saleItems = [];\n  const stockDeductions = [];\n  let subtotal = 0;"
);

const stockDeductionBlock = `
      if (item.isSerialized) {
        const error = new Error("SERIALIZED_SALE_NOT_READY");
        error.statusCode = 400;
        throw error;
      }

      if (itemPayload.serialId) {
        const error = new Error("SERIAL_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM");
        error.statusCode = 400;
        throw error;
      }

      if (!itemPayload.batchId) {
        const error = new Error("BATCH_REQUIRED");
        error.statusCode = 400;
        throw error;
      }

      const batch = await tx.inventoryBatch.findFirst({
        where: {
          id: itemPayload.batchId,
          branchId,
          itemId: item.id,
          status: "ACTIVE",
        },
      });

      if (!batch) {
        const error = new Error("BATCH_NOT_FOUND");
        error.statusCode = 404;
        throw error;
      }

      const previousQuantity = Number(batch.quantityAvailable);
      const newQuantity = toMoney(previousQuantity - quantity);

      if (newQuantity < 0) {
        const error = new Error("INSUFFICIENT_BATCH_QUANTITY");
        error.statusCode = 400;
        throw error;
      }

      await tx.inventoryBatch.update({
        where: {
          id: batch.id,
        },
        data: {
          quantityAvailable: toMoneyString(newQuantity),
          status: newQuantity === 0 ? "DEPLETED" : "ACTIVE",
          updatedById: actor.id,
        },
      });

      stockDeductions.push({
        branchId,
        itemId: item.id,
        itemCode: item.itemCode,
        batchId: batch.id,
        quantity,
        previousQuantity,
        newQuantity,
        unitCost: batch.unitCost,
      });
`;

const targetBlock = `      if (OWNER_ADMIN_ROLES.has(actor.role) && itemPayload.unitPrice !== undefined) {
        unitPrice = toMoney(itemPayload.unitPrice);
      }`;

if (!content.includes(targetBlock)) {
  console.error("Target block for stock deduction insertion not found.");
  process.exit(1);
}

content = content.replace(targetBlock, `${targetBlock}\n${stockDeductionBlock}`);

content = content.replace(
  "    saleItems,\n    subtotal: toMoney(subtotal),",
  "    saleItems,\n    stockDeductions,\n    subtotal: toMoney(subtotal),"
);

content = content.replace(
  "    const { saleItems, subtotal, totalDiscount } = await buildSaleItems(",
  "    const { saleItems, stockDeductions, subtotal, totalDiscount } = await buildSaleItems("
);

const movementCreateBlock = `
    for (const deduction of stockDeductions) {
      const movementCode = await generateSaleInventoryMovementCode(
        tx,
        branch.code,
        deduction.itemCode,
        branchId
      );

      await tx.inventoryMovement.create({
        data: {
          branchId,
          itemId: deduction.itemId,
          batchId: deduction.batchId,
          movementCode,
          type: "SALE_OUT",
          source: "SALE",
          quantity: toMoneyString(deduction.quantity),
          previousQuantity: toMoneyString(deduction.previousQuantity),
          newQuantity: toMoneyString(deduction.newQuantity),
          unitCost: deduction.unitCost.toString(),
          referenceNo: receiptCode,
          remarks: \`Sale stock deduction for \${receiptCode}.\`,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
    }

`;

content = content.replace(
  "    const sale = await tx.sale.create({",
  `${movementCreateBlock}    const sale = await tx.sale.create({`
);

fs.writeFileSync(filePath, content);
console.log("DONE: sale.service.js patched with non-serialized stock deduction.");
