require("../src/config/env");

const prisma = require("../src/config/prisma");

const PRICE_TIER_LABEL_SETTING = {
  scopeKey: "GLOBAL:price.tier_labels",
  key: "price.tier_labels",
  category: "OPERATION",
  valueType: "JSON",
  value: {
    1: "Price 1",
    2: "Price 2",
    3: "Price 3",
    4: "Price 4",
    5: "Price 5",
  },
  label: "Price Tier Labels",
  description:
    "Controls display names for item price tiers used in POS, quotations, and inventory.",
};

const seedPriceTierLabels = async () => {
  console.log("Seeding price tier label settings...");

  const existingSetting = await prisma.businessSetting.findUnique({
    where: {
      scopeKey: PRICE_TIER_LABEL_SETTING.scopeKey,
    },
  });

  if (existingSetting) {
    await prisma.businessSetting.update({
      where: {
        scopeKey: PRICE_TIER_LABEL_SETTING.scopeKey,
      },
      data: {
        key: PRICE_TIER_LABEL_SETTING.key,
        category: PRICE_TIER_LABEL_SETTING.category,
        valueType: PRICE_TIER_LABEL_SETTING.valueType,
        label: PRICE_TIER_LABEL_SETTING.label,
        description: PRICE_TIER_LABEL_SETTING.description,
        isEditable: true,
        isActive: true,
      },
    });

    console.log(`Existing setting preserved: ${PRICE_TIER_LABEL_SETTING.scopeKey}`);
    console.log("Value was not overwritten.");
    return;
  }

  await prisma.businessSetting.create({
    data: {
      scopeKey: PRICE_TIER_LABEL_SETTING.scopeKey,
      key: PRICE_TIER_LABEL_SETTING.key,
      category: PRICE_TIER_LABEL_SETTING.category,
      valueType: PRICE_TIER_LABEL_SETTING.valueType,
      value: PRICE_TIER_LABEL_SETTING.value,
      label: PRICE_TIER_LABEL_SETTING.label,
      description: PRICE_TIER_LABEL_SETTING.description,
      isEditable: true,
      isActive: true,
    },
  });

  console.log(`Created: ${PRICE_TIER_LABEL_SETTING.scopeKey}`);
};

seedPriceTierLabels()
  .catch((error) => {
    console.error("Price tier label settings seeding failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
