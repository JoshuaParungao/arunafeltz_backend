const saleService = require("./src/modules/sales/services/sale.service");
const saleController = require("./src/modules/sales/controllers/sale.controller");
const saleValidation = require("./src/modules/sales/validations/sale.validation");

console.log("Service createCreditAccountFromSale:", typeof saleService.createCreditAccountFromSale);
console.log("Controller createCreditAccountFromSale:", typeof saleController.createCreditAccountFromSale);
console.log("Validation createCreditAccountSchema:", typeof saleValidation.createCreditAccountSchema);
