const fs = require("fs");

const file = "./src/modules/sales/validations/sale.validation.js";

if (!fs.existsSync(file)) {
  console.log("FILE NOT FOUND:", file);
  process.exit(1);
}

const content = fs.readFileSync(file, "utf8");

console.log(content);
