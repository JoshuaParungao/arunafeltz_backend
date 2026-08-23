const fs = require("fs");

const schemaPath = "./prisma/schema.prisma";

if (!fs.existsSync(schemaPath)) {
  console.error("schema.prisma not found");
  process.exit(1);
}

let schema = fs.readFileSync(schemaPath, "utf8");

const addFieldToSpecificModel = (modelName, fieldLine) => {
  const modelStart = schema.indexOf(`model ${modelName} {`);

  if (modelStart === -1) {
    console.error(`Missing model: ${modelName}`);
    process.exit(1);
  }

  const nextModelStart = schema.indexOf("\nmodel ", modelStart + 1);
  const searchEnd = nextModelStart === -1 ? schema.length : nextModelStart;
  const modelBlock = schema.slice(modelStart, searchEnd);

  if (modelBlock.includes(fieldLine.trim())) {
    console.log(`SKIP: ${modelName} already has ${fieldLine.trim()}`);
    return;
  }

  const lastBraceIndexInBlock = modelBlock.lastIndexOf("}");

  if (lastBraceIndexInBlock === -1) {
    console.error(`Invalid model block: ${modelName}`);
    process.exit(1);
  }

  const absoluteInsertIndex = modelStart + lastBraceIndexInBlock;

  schema =
    schema.slice(0, absoluteInsertIndex) +
    `  ${fieldLine}\n` +
    schema.slice(absoluteInsertIndex);

  console.log(`ADDED: ${fieldLine} to ${modelName}`);
};

addFieldToSpecificModel("Customer", "quotations Quotation[]");

fs.writeFileSync(schemaPath, schema);
console.log("DONE: Customer quotation relation checked.");
