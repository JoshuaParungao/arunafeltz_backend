const saleController = require("./src/modules/sales/controllers/sale.controller");
const saleValidation = require("./src/modules/sales/validations/sale.validation");

console.log("Controller keys:", Object.keys(saleController));
console.log("createCreditAccountFromSale type:", typeof saleController.createCreditAccountFromSale);

console.log("Validation keys:", Object.keys(saleValidation));
console.log("createCreditAccountSchema type:", typeof saleValidation.createCreditAccountSchema);
