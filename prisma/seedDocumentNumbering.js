require("../src/config/env");

const prisma = require("../src/config/prisma");

const DOCUMENT_NUMBERING_SETTING = {
  scopeKey: "GLOBAL:document.numbering",
  key: "document.numbering",
  category: "DOCUMENT",
  valueType: "JSON",
  value: {
    receipt: {
      label: "Receipt",
      prefix: "RCPT",
      format: "RCPT-{BRANCH}-{YYYYMMDD}-{SEQUENCE}",
      backendConnected: false,
    },
    quotation: {
      label: "Quotation",
      prefix: "QT",
      format: "QT-{BRANCH}-{YYYYMMDD}-{SEQUENCE}",
      backendConnected: false,
    },
    serviceJob: {
      label: "Service Job",
      prefix: "SVC",
      format: "SVC-{BRANCH}-{YYYYMMDD}-{SEQUENCE}",
      backendConnected: false,
    },
    servicePayment: {
      label: "Service Payment",
      prefix: "SVCPAY",
      format: "SVCPAY-{BRANCH}-{YYYYMMDD}-{SEQUENCE}",
      backendConnected: false,
    },
    warrantyClaim: {
      label: "Warranty Claim",
      prefix: "WTY",
      format: "WTY-{BRANCH}-{YYYYMMDD}-{SEQUENCE}",
      backendConnected: false,
    },
    stockTransfer: {
      label: "Stock Transfer",
      prefix: "TR",
      format: "TR-{BRANCH}-{SEQUENCE}",
      backendConnected: false,
    },
    purchaseOrder: {
      label: "Purchase Order",
      prefix: "PO",
      format: "PO-{BRANCH}-{SEQUENCE}",
      backendConnected: false,
    },
    purchaseReceiving: {
      label: "Purchase Receiving",
      prefix: "REC",
      format: "REC-{BRANCH}-{SEQUENCE}",
      backendConnected: false,
    }
  },
  label: "Document Numbering",
  description:
    "Displays current document number formats. Backend generators are still hardcoded and not connected to this setting yet.",
};

const seedDocumentNumbering = async () => {
  console.log("Seeding document numbering settings...");

  const existingSetting = await prisma.businessSetting.findUnique({
    where: {
      scopeKey: DOCUMENT_NUMBERING_SETTING.scopeKey,
    },
  });

  if (existingSetting) {
    await prisma.businessSetting.update({
      where: {
        scopeKey: DOCUMENT_NUMBERING_SETTING.scopeKey,
      },
      data: {
        key: DOCUMENT_NUMBERING_SETTING.key,
        category: DOCUMENT_NUMBERING_SETTING.category,
        valueType: DOCUMENT_NUMBERING_SETTING.valueType,
        label: DOCUMENT_NUMBERING_SETTING.label,
        description: DOCUMENT_NUMBERING_SETTING.description,
        isEditable: false,
        isActive: true,
      },
    });

    console.log(`Existing setting preserved: ${DOCUMENT_NUMBERING_SETTING.scopeKey}`);
    console.log("Value was not overwritten.");
    return;
  }

  await prisma.businessSetting.create({
    data: {
      scopeKey: DOCUMENT_NUMBERING_SETTING.scopeKey,
      key: DOCUMENT_NUMBERING_SETTING.key,
      category: DOCUMENT_NUMBERING_SETTING.category,
      valueType: DOCUMENT_NUMBERING_SETTING.valueType,
      value: DOCUMENT_NUMBERING_SETTING.value,
      label: DOCUMENT_NUMBERING_SETTING.label,
      description: DOCUMENT_NUMBERING_SETTING.description,
      isEditable: false,
      isActive: true,
    },
  });

  console.log(`Created: ${DOCUMENT_NUMBERING_SETTING.scopeKey}`);
};

seedDocumentNumbering()
  .catch((error) => {
    console.error("Document numbering settings seeding failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

