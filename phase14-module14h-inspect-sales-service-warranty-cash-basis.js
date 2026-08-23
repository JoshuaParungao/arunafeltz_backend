const fs = require("fs");

const files = [
  "src/modules/sales/routes/sale.routes.js",
  "src/modules/sales/controllers/sale.controller.js",
  "src/modules/sales/services/sale.service.js",
  "src/modules/service-jobs/routes/serviceJob.routes.js",
  "src/modules/service-jobs/controllers/serviceJob.controller.js",
  "src/modules/service-jobs/services/serviceJob.service.js",
  "src/modules/warranty-claims/routes/warrantyClaim.routes.js",
  "src/modules/warranty-claims/controllers/warrantyClaim.controller.js",
  "src/modules/warranty-claims/services/warrantyClaim.service.js",
  "src/modules/cash-boxes/routes/cashBox.routes.js",
  "src/modules/cash-boxes/controllers/cashBox.controller.js",
  "src/modules/cash-boxes/services/cashBox.service.js",
  "prisma/schema.prisma",
];

const schemaKeywords = [
  "model Sale ",
  "model SaleItem ",
  "model SalePayment ",
  "model ServiceJob ",
  "model ServicePayment ",
  "model WarrantyClaim ",
  "model CashBox ",
  "model CashTransaction ",
  "model CashHandover ",
  "enum SaleStatus",
  "enum SalePaymentMethod",
  "enum SalePaymentStatus",
  "enum ServiceJobStatus",
  "enum ServicePaymentMethod",
  "enum ServicePaymentStatus",
  "enum WarrantyClaimStatus",
  "enum CashTransactionType",
  "enum CashTransactionStatus",
  "enum CashHandoverStatus",
];

console.log("\nPHASE 14H INSPECT: Sales / Service / Warranty / Cash Report Basis");
console.log("=================================================================");

for (const file of files) {
  console.log(`\n\n===== ${file} =====`);

  if (!fs.existsSync(file)) {
    console.log("[MISSING]");
    continue;
  }

  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  if (file.endsWith("schema.prisma")) {
    for (const keyword of schemaKeywords) {
      const index = lines.findIndex((line) => line.includes(keyword));

      console.log(`\n--- ${keyword} ---`);

      if (index === -1) {
        console.log("[MISSING]");
        continue;
      }

      const start = Math.max(0, index);
      const end = Math.min(lines.length, index + 100);

      for (let i = start; i < end; i++) {
        console.log(`${i + 1}: ${lines[i]}`);
      }
    }

    continue;
  }

  const maxLines = Math.min(lines.length, 260);

  for (let i = 0; i < maxLines; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }

  if (lines.length > maxLines) {
    console.log(`... truncated, total lines: ${lines.length}`);
  }
}
