const fs = require("fs");

const schema = fs.readFileSync("./prisma/schema.prisma", "utf8");

const printModel = (modelName) => {
  const startText = `model ${modelName} {`;
  const start = schema.indexOf(startText);

  if (start === -1) {
    console.log(`\nNOT FOUND: ${modelName}`);
    return;
  }

  const firstBrace = schema.indexOf("{", start);
  let depth = 0;

  for (let i = firstBrace; i < schema.length; i += 1) {
    if (schema[i] === "{") depth += 1;
    if (schema[i] === "}") depth -= 1;

    if (depth === 0) {
      console.log("\n==============================");
      console.log(modelName);
      console.log("==============================");
      console.log(schema.slice(start, i + 1));
      return;
    }
  }
};

[
  "Supplier",
  "PurchaseOrder",
  "PurchaseOrderItem",
  "Delivery",
  "DeliveryItem",
  "StockTransfer",
  "StockTransferItem",
  "StockRequest",
  "StockRequestItem",
  "InventoryTransaction",
  "InventoryTransactionItem",
  "Inventory",
  "ItemBatch",
  "ItemSerial",
  "Branch",
  "User",
  "Item"
].forEach(printModel);
