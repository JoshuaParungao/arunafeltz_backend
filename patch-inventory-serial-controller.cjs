const fs = require("fs");

const filePath = "./src/modules/inventory/controllers/inventory.controller.js";

if (!fs.existsSync(filePath)) {
  console.error("inventory.controller.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const updateSerialStatus = async")) {
  console.log("SKIP: updateSerialStatus controller already exists.");
  process.exit(0);
}

const handlerToAdd = `
const updateSerialStatus = async (req, res, next) => {
  try {
    const result = await inventoryService.updateSerialStatus(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Serial status updated successfully",
      data: result,
    });
  } catch (error) {
    return handleInventoryMutationError(error, res, next);
  }
};
`;

if (!content.includes("SERIAL_NOT_FOUND")) {
  content = content.replace(
    'INSUFFICIENT_BATCH_QUANTITY: [400, "Insufficient batch quantity."],',
    'INSUFFICIENT_BATCH_QUANTITY: [400, "Insufficient batch quantity."],\n    SERIAL_NOT_FOUND: [404, "Serial not found."],'
  );
}

content = content.replace(
  "module.exports = {",
  `${handlerToAdd}\nmodule.exports = {`
);

content = content.replace(
  "createAdjustment,",
  "createAdjustment,\n  updateSerialStatus,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: inventory.controller.js patched with updateSerialStatus.");
