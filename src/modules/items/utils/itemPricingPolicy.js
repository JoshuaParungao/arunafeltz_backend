const SENSITIVE_PRICING_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
]);

const canViewSensitivePricing = (actor) => {
  if (!actor || !actor.role) {
    return false;
  }

  return SENSITIVE_PRICING_ROLES.has(actor.role);
};

const sanitizeItemPricingForActor = (item, actor) => {
  if (!item) {
    return item;
  }

  if (canViewSensitivePricing(actor)) {
    return item;
  }

  const { costPrice, ...safeItem } = item;

  return safeItem;
};

const sanitizeItemsPricingForActor = (items, actor) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => sanitizeItemPricingForActor(item, actor));
};

module.exports = {
  canViewSensitivePricing,
  sanitizeItemPricingForActor,
  sanitizeItemsPricingForActor,
};
