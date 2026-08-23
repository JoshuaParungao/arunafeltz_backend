const fs = require("fs");

const schema = fs.readFileSync("./prisma/schema.prisma", "utf8");

const models = ["Item", "ItemSerial", "Sale", "SaleItem", "Customer", "Branch", "User"];

const extractExactModel = (content, modelName) => {
  const target = `model ${modelName} {`;
  const start = content.indexOf(target);

  if (start === -1) {
    return `NOT FOUND: ${target}`;
  }

  const firstBrace = content.indexOf("{", start);
  let depth = 0;

  for (let i = firstBrace; i < content.length; i += 1) {
    if (content[i] === "{") depth += 1;
    if (content[i] === "}") depth -= 1;

    if (depth === 0) {
      return content.slice(start, i + 1);
    }
  }

  return `NO CLOSING BRACE FOUND: ${target}`;
};

for (const model of models) {
  console.log("\n==================================================");
  console.log(`model ${model}`);
  console.log("==================================================");
  console.log(extractExactModel(schema, model));
}
