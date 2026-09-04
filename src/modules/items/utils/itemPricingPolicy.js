const canViewSensitivePricing = (actor) => {
  if (!actor || !actor.role) {
    return false;
  }

  // Cost price is viewable by all authenticated users in product & pricing
  return true;
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

