require("../src/config/env");

const prisma = require("../src/config/prisma");

const DISCOUNT_RULE_SETTING = {
  scopeKey: "GLOBAL:discount.rules",
  key: "discount.rules",
  category: "OPERATION",
  valueType: "JSON",
  value: {
    discountMode: "AMOUNT_ONLY",
    allowLineItemDiscount: true,
    allowPercentageDiscount: false,
    requireRemarks: false,
    requireOwnerApproval: false,
  },
  label: "Discount Rules",
  description:
    "Controls discount rules shown in POS and quotations. Current backend computation supports amount-based line discounts.",
};

const seedDiscountRules = async () => {
  console.log("Seeding discount rule settings...");

  const existingSetting = await prisma.businessSetting.findUnique({
    where: {
      scopeKey: DISCOUNT_RULE_SETTING.scopeKey,
    },
  });

  if (existingSetting) {
    await prisma.businessSetting.update({
      where: {
        scopeKey: DISCOUNT_RULE_SETTING.scopeKey,
      },
      data: {
        key: DISCOUNT_RULE_SETTING.key,
        category: DISCOUNT_RULE_SETTING.category,
        valueType: DISCOUNT_RULE_SETTING.valueType,
        label: DISCOUNT_RULE_SETTING.label,
        description: DISCOUNT_RULE_SETTING.description,
        isEditable: true,
        isActive: true,
      },
    });

    console.log(`Existing setting preserved: ${DISCOUNT_RULE_SETTING.scopeKey}`);
    console.log("Value was not overwritten.");
    return;
  }

  await prisma.businessSetting.create({
    data: {
      scopeKey: DISCOUNT_RULE_SETTING.scopeKey,
      key: DISCOUNT_RULE_SETTING.key,
      category: DISCOUNT_RULE_SETTING.category,
      valueType: DISCOUNT_RULE_SETTING.valueType,
      value: DISCOUNT_RULE_SETTING.value,
      label: DISCOUNT_RULE_SETTING.label,
      description: DISCOUNT_RULE_SETTING.description,
      isEditable: true,
      isActive: true,
    },
  });

  console.log(`Created: ${DISCOUNT_RULE_SETTING.scopeKey}`);
};

seedDiscountRules()
  .catch((error) => {
    console.error("Discount rule settings seeding failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
