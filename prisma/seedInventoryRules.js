require("../src/config/env");

const prisma = require("../src/config/prisma");

const INVENTORY_RULE_SETTING = {
  scopeKey: "GLOBAL:inventory.rules",
  key: "inventory.rules",
  category: "OPERATION",
  valueType: "JSON",
  value: {
    blockNegativeStock: true,
    useItemMinimumStock: true,
    useItemReorderLevel: true,
    requireAdjustmentRemarks: true,
    requireOwnerApprovalForAdjustment: false,
    showLowStockAlerts: true,
  },
  label: "Inventory Rules",
  description:
    "Controls inventory rule display and future inventory safeguards. Current backend already prevents negative batch quantity.",
};

const seedInventoryRules = async () => {
  console.log("Seeding inventory rule settings...");

  const existingSetting = await prisma.businessSetting.findUnique({
    where: {
      scopeKey: INVENTORY_RULE_SETTING.scopeKey,
    },
  });

  if (existingSetting) {
    await prisma.businessSetting.update({
      where: {
        scopeKey: INVENTORY_RULE_SETTING.scopeKey,
      },
      data: {
        key: INVENTORY_RULE_SETTING.key,
        category: INVENTORY_RULE_SETTING.category,
        valueType: INVENTORY_RULE_SETTING.valueType,
        label: INVENTORY_RULE_SETTING.label,
        description: INVENTORY_RULE_SETTING.description,
        isEditable: true,
        isActive: true,
      },
    });

    console.log(`Existing setting preserved: ${INVENTORY_RULE_SETTING.scopeKey}`);
    console.log("Value was not overwritten.");
    return;
  }

  await prisma.businessSetting.create({
    data: {
      scopeKey: INVENTORY_RULE_SETTING.scopeKey,
      key: INVENTORY_RULE_SETTING.key,
      category: INVENTORY_RULE_SETTING.category,
      valueType: INVENTORY_RULE_SETTING.valueType,
      value: INVENTORY_RULE_SETTING.value,
      label: INVENTORY_RULE_SETTING.label,
      description: INVENTORY_RULE_SETTING.description,
      isEditable: true,
      isActive: true,
    },
  });

  console.log(`Created: ${INVENTORY_RULE_SETTING.scopeKey}`);
};

seedInventoryRules()
  .catch((error) => {
    console.error("Inventory rule settings seeding failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
