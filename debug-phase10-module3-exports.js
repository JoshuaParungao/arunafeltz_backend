const service = require("./src/modules/cash-boxes/services/cashBox.service");
const controller = require("./src/modules/cash-boxes/controllers/cashBox.controller");
const validation = require("./src/modules/cash-boxes/validations/cashBox.validation");

console.log("Service createCashTransaction:", typeof service.createCashTransaction);
console.log("Controller createCashTransaction:", typeof controller.createCashTransaction);
console.log("Validation createCashTransactionSchema:", typeof validation.createCashTransactionSchema);
