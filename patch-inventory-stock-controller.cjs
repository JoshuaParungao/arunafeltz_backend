const fs = require("fs");

const filePath = "./src/modules/inventory/controllers/inventory.controller.js";

if (!fs.existsSync(filePath)) {
  console.error("inventory.controller.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const createStockIn = async")) {
  console.log("SKIP: createStockIn controller already exists.");
  process.exit(0);
}

const errorHandler = `
const handleInventoryMutationError = (error, res, next) => {
  const knownErrors = {
    BRANCH_REQUIRED: [400, "Branch is required."],
    BRANCH_ACCESS_DENIED: [403, "You cannot manage inventory for this branch."],
    ITEM_NOT_FOUND: [404, "Item not found for this branch."],
    BATCH_NOT_FOUND: [404, "Batch not found for this branch."],
    DUPLICATE_SERIAL_IN_REQUEST: [400, "Duplicate serial number found in request."],
    SERIAL_COUNT_MISMATCH: [400, "Serialized item requires serial count to match quantity."],
    SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM: [400, "Serial numbers are not allowed for non-serialized item."],
    SERIAL_ALREADY_EXISTS: [409, "One or more serial numbers already exist."],
    INSUFFICIENT_BATCH_QUANTITY: [400, "Insufficient batch quantity."],
  };

  if (knownErrors[error.message]) {
    const [status, message] = knownErrors[error.message];

    return res.status(status).json({
      success: false,
      message,
      errorCode: error.message,
      details: error.details || null,
    });
  }

  return next(error);
};

const createStockIn = async (req, res, next) => {
  try {
    const result = await inventoryService.createStockIn(req.user, req.body);

    return res.status(201).json({
      success: true,
      message: "Stock-in recorded successfully",
      data: result,
    });
  } catch (error) {
    return handleInventoryMutationError(error, res, next);
  }
};

const createAdjustment = async (req, res, next) => {
  try {
    const result = await inventoryService.createStockAdjustment(req.user, req.body);

    return res.status(201).json({
      success: true,
      message: "Stock adjustment recorded successfully",
      data: result,
    });
  } catch (error) {
    return handleInventoryMutationError(error, res, next);
  }
};
`;

content = content.replace(
  "module.exports = {",
  `${errorHandler}\nmodule.exports = {`
);

content = content.replace(
  "getSerials,",
  "getSerials,\n  createStockIn,\n  createAdjustment,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: inventory.controller.js patched with stock-in and adjustment handlers.");
