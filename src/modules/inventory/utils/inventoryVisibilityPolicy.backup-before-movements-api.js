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

  const { unitCost, ...safeBatch } = batch;
  return safeBatch;
};

const sanitizeBatchesCostForActor = (batches, actor) => {
  return batches.map((batch) => sanitizeBatchCostForActor(batch, actor));
};

module.exports = {
  canViewInventoryCost,
  sanitizeBatchCostForActor,
  sanitizeBatchesCostForActor,
};
