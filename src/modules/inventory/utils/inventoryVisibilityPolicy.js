const OWNER_ADMIN_ROLES = new Set(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"]);

const canViewInventoryCost = (actor) => {
  return Boolean(actor && OWNER_ADMIN_ROLES.has(actor.role));
};

const sanitizeBatchCostForActor = (batch, actor) => {
  if (!batch) {
    return batch;
  }

  if (canViewInventoryCost(actor)) {
    return batch;
  }

  const { unitCost, operationalUnitCost, ...safeBatch } = batch;

  if (safeBatch.originBatch) {
    safeBatch.originBatch = sanitizeBatchCostForActor(safeBatch.originBatch, actor);
  }

  return safeBatch;
};

const sanitizeBatchesCostForActor = (batches, actor) => {
  return batches.map((batch) => sanitizeBatchCostForActor(batch, actor));
};


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

module.exports = {
  canViewInventoryCost,
  sanitizeBatchCostForActor,
  sanitizeBatchesCostForActor,
  sanitizeMovementCostForActor,
  sanitizeMovementsCostForActor,
};
