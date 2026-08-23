const fs = require("fs");

const filePath = "./src/modules/inventory/utils/inventoryVisibilityPolicy.js";

if (!fs.existsSync(filePath)) {
  console.error("inventoryVisibilityPolicy.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("sanitizeMovementCostForActor")) {
  console.log("SKIP: movement cost sanitizer already exists.");
  process.exit(0);
}

const functionsToAdd = `
const sanitizeMovementCostForActor = (movement, actor) => {
  if (!movement) {
    return movement;
  }

  if (canViewInventoryCost(actor)) {
    return movement;
  }

  const { unitCost, ...safeMovement } = movement;
  return safeMovement;
};

const sanitizeMovementsCostForActor = (movements, actor) => {
  return movements.map((movement) => sanitizeMovementCostForActor(movement, actor));
};
`;

content = content.replace(
  "module.exports = {",
  `${functionsToAdd}\nmodule.exports = {`
);

content = content.replace(
  "sanitizeBatchesCostForActor,",
  "sanitizeBatchesCostForActor,\n  sanitizeMovementCostForActor,\n  sanitizeMovementsCostForActor,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: inventoryVisibilityPolicy.js patched for movements.");
