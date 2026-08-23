require("../src/config/env");

const prisma = require("../src/config/prisma");

const SERVICE_RULE_SETTING = {
  scopeKey: "GLOBAL:service.rules",
  key: "service.rules",
  category: "OPERATION",
  valueType: "JSON",
  value: {
    requireCustomer: false,
    requireTechnicianAssignment: false,
    requireFinalChargeOnCompletion: true,
    requireCancellationReason: true,
    allowPaymentOnlyWhenCompleted: true,
    requireExactPaymentAmount: true,
  },
  label: "Service Rules",
  description:
    "Controls service job rule display and future service safeguards. Current backend already enforces completion, cancellation, and payment rules.",
};

const seedServiceRules = async () => {
  console.log("Seeding service rule settings...");

  const existingSetting = await prisma.businessSetting.findUnique({
    where: {
      scopeKey: SERVICE_RULE_SETTING.scopeKey,
    },
  });

  if (existingSetting) {
    await prisma.businessSetting.update({
      where: {
        scopeKey: SERVICE_RULE_SETTING.scopeKey,
      },
      data: {
        key: SERVICE_RULE_SETTING.key,
        category: SERVICE_RULE_SETTING.category,
        valueType: SERVICE_RULE_SETTING.valueType,
        label: SERVICE_RULE_SETTING.label,
        description: SERVICE_RULE_SETTING.description,
        isEditable: true,
        isActive: true,
      },
    });

    console.log(`Existing setting preserved: ${SERVICE_RULE_SETTING.scopeKey}`);
    console.log("Value was not overwritten.");
    return;
  }

  await prisma.businessSetting.create({
    data: {
      scopeKey: SERVICE_RULE_SETTING.scopeKey,
      key: SERVICE_RULE_SETTING.key,
      category: SERVICE_RULE_SETTING.category,
      valueType: SERVICE_RULE_SETTING.valueType,
      value: SERVICE_RULE_SETTING.value,
      label: SERVICE_RULE_SETTING.label,
      description: SERVICE_RULE_SETTING.description,
      isEditable: true,
      isActive: true,
    },
  });

  console.log(`Created: ${SERVICE_RULE_SETTING.scopeKey}`);
};

seedServiceRules()
  .catch((error) => {
    console.error("Service rule settings seeding failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
