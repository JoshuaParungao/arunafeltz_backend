const fs = require("fs");

const filePath = "./src/modules/inventory/controllers/inventory.controller.js";

if (!fs.existsSync(filePath)) {
  console.error("inventory.controller.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const getMovements = async")) {
  console.log("SKIP: getMovements controller already exists.");
  process.exit(0);
}

content = content.replace(
  "sanitizeBatchesCostForActor,",
  "sanitizeBatchesCostForActor,\n  sanitizeMovementsCostForActor,"
);

const handlerToAdd = `
const getMovements = async (req, res, next) => {
  try {
    const result = await inventoryService.getInventoryMovements(req.user, req.query);

    result.data = sanitizeMovementsCostForActor(result.data, req.user);

    return sendSuccess(res, "Inventory movements fetched successfully", result);
  } catch (error) {
    return next(error);
  }
};
`;

content = content.replace(
  "module.exports = {",
  `${handlerToAdd}\nmodule.exports = {`
);

content = content.replace(
  "getSerials,",
  "getSerials,\n  getMovements,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: inventory.controller.js patched with movement history handler.");
