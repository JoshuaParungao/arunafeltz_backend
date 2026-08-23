require("../src/config/env");

const prisma = require("../src/config/prisma");

const INCENTIVE_RULE_SETTING = {
  scopeKey: "GLOBAL:incentive.rules",
  key: "incentive.rules",
  category: "OPERATION",
  valueType: "JSON",
  value: {
    enableItemIncentives: false,
    enableServiceIncentives: false,
    defaultItemIncentivePercent: 0,
    defaultServiceIncentivePercent: 0,
    staffCanViewOwnIncentives: true,
    ownerCanViewAllIncentives: true,
    requireOwnerApprovalBeforePayout: true,
  },
  label: "Incentive Rules",
  description:
    "Controls source-linked product and service incentive posting, visibility, and payout safeguards.",
};

const seedIncentiveRules = async () => {
  console.log("Seeding incentive rule settings...");

  const existingSetting = await prisma.businessSetting.findUnique({
    where: {
      scopeKey: INCENTIVE_RULE_SETTING.scopeKey,
    },
  });

  if (existingSetting) {
    await prisma.businessSetting.update({
      where: {
        scopeKey: INCENTIVE_RULE_SETTING.scopeKey,
      },
      data: {
        key: INCENTIVE_RULE_SETTING.key,
        category: INCENTIVE_RULE_SETTING.category,
        valueType: INCENTIVE_RULE_SETTING.valueType,
        label: INCENTIVE_RULE_SETTING.label,
        description: INCENTIVE_RULE_SETTING.description,
        isEditable: true,
        isActive: true,
      },
    });

    console.log(`Existing setting preserved: ${INCENTIVE_RULE_SETTING.scopeKey}`);
    console.log("Value was not overwritten.");
    return;
  }

  await prisma.businessSetting.create({
    data: {
      scopeKey: INCENTIVE_RULE_SETTING.scopeKey,
      key: INCENTIVE_RULE_SETTING.key,
      category: INCENTIVE_RULE_SETTING.category,
      valueType: INCENTIVE_RULE_SETTING.valueType,
      value: INCENTIVE_RULE_SETTING.value,
      label: INCENTIVE_RULE_SETTING.label,
      description: INCENTIVE_RULE_SETTING.description,
      isEditable: true,
      isActive: true,
    },
  });

  console.log(`Created: ${INCENTIVE_RULE_SETTING.scopeKey}`);
};

seedIncentiveRules()
  .catch((error) => {
    console.error("Incentive rule settings seeding failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
