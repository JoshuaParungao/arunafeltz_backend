const fs = require("fs");

const filePath = "./phase10-module6a-sales-credit-cash-link-test.js";

let content = fs.readFileSync(filePath, "utf8");

const oldBlock = `  const payload = {
    customerId,
    serviceCharge: 0,
    remarks: \`Phase 10 Module 6A \${paymentMethod} sale test.\`,
    items: [
      {
        description: \`Phase 10 Module 6A \${paymentMethod} custom item\`,
        quantity: 1,
        unitPrice: amount,
        discountAmount: 0,
      },
    ],
    payments: [
      {
        paymentMethod,
        amount,
        referenceNo: \`PHASE10-M6A-\${paymentMethod}-\${Date.now()}\`,
      },
    ],
  };`;

const newBlock = `  const payload = {
    serviceCharge: 0,
    remarks: \`Phase 10 Module 6A \${paymentMethod} sale test.\`,
    items: [
      {
        description: \`Phase 10 Module 6A \${paymentMethod} custom item\`,
        quantity: 1,
        unitPrice: amount,
        discountAmount: 0,
      },
    ],
    payments: [
      {
        paymentMethod,
        amount,
        referenceNo: \`PHASE10-M6A-\${paymentMethod}-\${Date.now()}\`,
      },
    ],
  };

  if (customerId) {
    payload.customerId = customerId;
  }`;

if (!content.includes(oldBlock)) {
  throw new Error("Target payload block not found. Stop muna.");
}

content = content.replace(oldBlock, newBlock);

fs.writeFileSync(filePath, content);

console.log("DONE: Fixed Module 6A test payload. customerId is now omitted when null.");
