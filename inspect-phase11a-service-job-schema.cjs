const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";
const schema = fs.readFileSync(schemaPath, "utf8");

const targets = [
  "enum UserRole",
  "enum UserStatus",
  "model Branch",
  "model User",
  "model Customer",
  "model Sale",
  "model SaleItem",
  "model CashTransaction",
  "enum CashTransactionType",
  "enum CashTransactionSource",
];

const extractBlock = (content, title) => {
  const start = content.indexOf(title);

  if (start === -1) {
    return `NOT FOUND: ${title}`;
  }

  const firstBrace = content.indexOf("{", start);

  if (firstBrace === -1) {
    return `NO BRACE FOUND: ${title}`;
  }

  let depth = 0;

  for (let i = firstBrace; i < content.length; i += 1) {
    if (content[i] === "{") depth += 1;
    if (content[i] === "}") depth -= 1;

    if (depth === 0) {
      return content.slice(start, i + 1);
    }
  }

  return `NO CLOSING BRACE FOUND: ${title}`;
};

for (const target of targets) {
  console.log("\n==================================================");
  console.log(target);
  console.log("==================================================");
  console.log(extractBlock(schema, target));
}
