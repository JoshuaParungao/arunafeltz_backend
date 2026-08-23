const fs = require("fs");

const filePath = "./src/modules/sales/services/sale.service.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("QUOTATION_ALREADY_CONVERTED")) {
  console.log("SKIP: quotation conversion logic already patched.");
  process.exit(0);
}

content = content.replace(
  `  if (quotation.status !== "APPROVED") {
    const error = new Error("QUOTATION_NOT_APPROVED");
    error.statusCode = 400;
    throw error;
  }`,
  `  if (quotation.status === "CONVERTED") {
    const error = new Error("QUOTATION_ALREADY_CONVERTED");
    error.statusCode = 400;
    throw error;
  }

  if (quotation.status !== "APPROVED") {
    const error = new Error("QUOTATION_NOT_APPROVED");
    error.statusCode = 400;
    throw error;
  }`
);

content = content.replace(
  `    await ensureCustomerBelongsToBranch(tx, payload.customerId, branchId);
    await ensureQuotationBelongsToBranch(tx, payload.quotationId, branchId);`,
  `    await ensureCustomerBelongsToBranch(tx, payload.customerId, branchId);
    const quotation = await ensureQuotationBelongsToBranch(tx, payload.quotationId, branchId);`
);

content = content.replace(
  `    return sale;`,
  `    if (quotation) {
      await tx.quotation.update({
        where: {
          id: quotation.id,
        },
        data: {
          status: "CONVERTED",
          convertedAt: new Date(),
          updatedById: actor.id,
        },
      });

      sale.quotation.status = "CONVERTED";
    }

    return sale;`
);

fs.writeFileSync(filePath, content);
console.log("DONE: sale.service.js patched with quotation conversion logic.");
