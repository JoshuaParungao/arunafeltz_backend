const fs = require("fs");

const files = [
  "./src/modules/cash-boxes/services/cashLink.service.js",
  "./src/modules/cash-boxes/services/cashBox.service.js",
];

const findFunctionBlock = (content, functionName) => {
  const start = content.indexOf(`const ${functionName} = async`);

  if (start === -1) {
    return null;
  }

  const firstBrace = content.indexOf("{", start);

  if (firstBrace === -1) {
    throw new Error(`Cannot find opening brace for ${functionName}`);
  }

  let depth = 0;

  for (let i = firstBrace; i < content.length; i += 1) {
    if (content[i] === "{") depth += 1;
    if (content[i] === "}") depth -= 1;

    if (depth === 0) {
      const semicolon = content.indexOf(";", i);

      if (semicolon === -1) {
        throw new Error(`Cannot find semicolon for ${functionName}`);
      }

      return {
        start,
        end: semicolon + 1,
        text: content.slice(start, semicolon + 1),
      };
    }
  }

  throw new Error(`Cannot find closing brace for ${functionName}`);
};

const newGenerateCashTransactionCode = `const generateCashTransactionCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = \`\${yyyy}\${mm}\${dd}\`;
  const prefix = \`CASH-\${branchCode}-\${datePart}-\`;

  const latestTransaction = await tx.cashTransaction.findFirst({
    where: {
      branchId,
      transactionCode: {
        startsWith: prefix,
      },
    },
    orderBy: {
      transactionCode: "desc",
    },
    select: {
      transactionCode: true,
    },
  });

  let nextNumber = 1;

  if (latestTransaction) {
    const latestNumberText = latestTransaction.transactionCode.slice(prefix.length);
    const latestNumber = Number(latestNumberText);

    if (Number.isInteger(latestNumber) && latestNumber > 0) {
      nextNumber = latestNumber + 1;
    }
  }

  return \`\${prefix}\${String(nextNumber).padStart(4, "0")}\`;
};`;

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  const block = findFunctionBlock(content, "generateCashTransactionCode");

  if (!block) {
    console.log(`SKIP: generateCashTransactionCode not found in ${file}`);
    continue;
  }

  content =
    content.slice(0, block.start) +
    newGenerateCashTransactionCode +
    content.slice(block.end);

  fs.writeFileSync(file, content);

  console.log(`DONE: Patched generateCashTransactionCode in ${file}`);
}
