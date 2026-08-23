const fs = require("fs");

const filePath = "./phase10-module6a-sales-credit-cash-link-test.js";

let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  `const createCustomSale = async ({ token, paymentMethod, amount, customerId = null }) => {`,
  `const createCustomSale = async ({ token, paymentMethod, amount, paymentAmount = amount, customerId = null }) => {`
);

content = content.replace(
  `        amount,`,
  `        amount: paymentAmount,`
);

content = content.replace(
  `  const creditSale = await createCustomSale({
    token: adminLogin.token,
    paymentMethod: "CREDIT",
    amount: 3000,
    customerId: customer.id,
  });`,
  `  const creditSale = await createCustomSale({
    token: adminLogin.token,
    paymentMethod: "CREDIT",
    amount: 3000,
    paymentAmount: 0,
    customerId: customer.id,
  });`
);

fs.writeFileSync(filePath, content);

console.log("DONE: Fixed Module 6A credit sale test. CREDIT payment amount is now 0.");
