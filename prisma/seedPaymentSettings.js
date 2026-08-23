require("../src/config/env");

const prisma = require("../src/config/prisma");

const PAYMENT_SETTING = {
  scopeKey: "GLOBAL:payment.methods",
  key: "payment.methods",
  category: "OPERATION",
  valueType: "JSON",
  value: {
    cash: true,
    gcash: true,
    bankTransfer: true,
    cardTerminal: true,
    cheque: true,
    creditInstallment: true,
    mixedPayment: true,
    requiredFields: {
      referenceNumber: true,
      cardApprovalCode: true,
      chequeNumber: true,
      bankName: true,
      remarks: false,
    },
  },
  label: "Payment Methods",
  description:
    "Controls accepted payment methods and required payment details for POS and collections.",
};

const seedPaymentSettings = async () => {
  console.log("Seeding payment method settings...");

  const existingSetting = await prisma.businessSetting.findUnique({
    where: {
      scopeKey: PAYMENT_SETTING.scopeKey,
    },
  });

  if (existingSetting) {
    await prisma.businessSetting.update({
      where: {
        scopeKey: PAYMENT_SETTING.scopeKey,
      },
      data: {
        key: PAYMENT_SETTING.key,
        category: PAYMENT_SETTING.category,
        valueType: PAYMENT_SETTING.valueType,
        label: PAYMENT_SETTING.label,
        description: PAYMENT_SETTING.description,
        isEditable: true,
        isActive: true,
      },
    });

    console.log(`Existing setting preserved: ${PAYMENT_SETTING.scopeKey}`);
    console.log("Value was not overwritten.");
    return;
  }

  await prisma.businessSetting.create({
    data: {
      scopeKey: PAYMENT_SETTING.scopeKey,
      key: PAYMENT_SETTING.key,
      category: PAYMENT_SETTING.category,
      valueType: PAYMENT_SETTING.valueType,
      value: PAYMENT_SETTING.value,
      label: PAYMENT_SETTING.label,
      description: PAYMENT_SETTING.description,
      isEditable: true,
      isActive: true,
    },
  });

  console.log(`Created: ${PAYMENT_SETTING.scopeKey}`);
};

seedPaymentSettings()
  .catch((error) => {
    console.error("Payment settings seeding failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
