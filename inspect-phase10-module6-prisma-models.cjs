const fs = require("fs");

const schema = fs.readFileSync("./prisma/schema.prisma", "utf8");

const showModel = (modelName) => {
  const start = schema.indexOf(`model ${modelName} {`);

  if (start === -1) {
    console.log(`NOT FOUND: model ${modelName}`);
    return;
  }

  const nextModel = schema.indexOf("\nmodel ", start + 1);
  const end = nextModel === -1 ? schema.length : nextModel;

  console.log("\n==================================================");
  console.log(`model ${modelName}`);
  console.log("==================================================");
  console.log(schema.slice(start, end));
};

showModel("Sale");
showModel("SalePayment");
showModel("CreditCollection");
showModel("CashBox");
showModel("CashTransaction");
