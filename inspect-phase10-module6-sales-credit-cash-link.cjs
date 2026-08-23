const fs = require("fs");

const files = [
  "./src/modules/sales/services/sale.service.js",
  "./src/modules/credit-accounts/services/creditAccount.service.js",
  "./src/modules/sales/controllers/sale.controller.js",
  "./src/modules/credit-accounts/controllers/creditAccount.controller.js",
  "./src/modules/sales/routes/sale.routes.js",
  "./src/modules/credit-accounts/routes/creditAccount.routes.js",
];

const showAround = (content, keyword, radius = 1200) => {
  const index = content.indexOf(keyword);

  if (index === -1) {
    console.log(`NOT FOUND: ${keyword}`);
    return;
  }

  const start = Math.max(0, index - radius);
  const end = Math.min(content.length, index + keyword.length + radius);

  console.log(content.slice(start, end));
};

for (const file of files) {
  console.log("\n==================================================");
  console.log(file);
  console.log("==================================================");

  if (!fs.existsSync(file)) {
    console.log("FILE NOT FOUND");
    continue;
  }

  const content = fs.readFileSync(file, "utf8");

  console.log("\n--- EXPORTS ---");
  showAround(content, "module.exports", 500);

  console.log("\n--- createSale ---");
  showAround(content, "const createSale", 1000);

  console.log("\n--- createCreditCollection ---");
  showAround(content, "const createCreditCollection", 1200);

  console.log("\n--- tx.salePayment / salePayment ---");
  showAround(content, "salePayment", 1200);

  console.log("\n--- tx.creditCollection / creditCollection ---");
  showAround(content, "creditCollection", 1200);
}
