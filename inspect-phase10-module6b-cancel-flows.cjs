const fs = require("fs");

const files = [
  {
    file: "./src/modules/sales/services/sale.service.js",
    functions: ["cancelSale"],
  },
  {
    file: "./src/modules/credit-accounts/services/creditAccount.service.js",
    functions: ["cancelCreditCollection"],
  },
  {
    file: "./src/modules/cash-boxes/services/cashLink.service.js",
    functions: ["postSystemCashIn"],
  },
];

const findFunctionBlock = (content, functionName) => {
  const start = content.indexOf(`const ${functionName} = async`);

  if (start === -1) {
    return null;
  }

  const firstBrace = content.indexOf("{", start);

  if (firstBrace === -1) {
    return null;
  }

  let depth = 0;

  for (let i = firstBrace; i < content.length; i += 1) {
    if (content[i] === "{") depth += 1;
    if (content[i] === "}") depth -= 1;

    if (depth === 0) {
      const semicolon = content.indexOf(";", i);

      if (semicolon === -1) {
        return content.slice(start, i + 1);
      }

      return content.slice(start, semicolon + 1);
    }
  }

  return null;
};

for (const item of files) {
  console.log("\n==================================================");
  console.log(item.file);
  console.log("==================================================");

  if (!fs.existsSync(item.file)) {
    console.log("FILE NOT FOUND");
    continue;
  }

  const content = fs.readFileSync(item.file, "utf8");

  for (const functionName of item.functions) {
    console.log(`\n--- ${functionName} ---`);

    const block = findFunctionBlock(content, functionName);

    if (!block) {
      console.log(`NOT FOUND: ${functionName}`);
    } else {
      console.log(block);
    }
  }

  console.log("\n--- module.exports ---");
  const exportsIndex = content.indexOf("module.exports");
  if (exportsIndex === -1) {
    console.log("NOT FOUND: module.exports");
  } else {
    console.log(content.slice(exportsIndex, exportsIndex + 700));
  }
}
