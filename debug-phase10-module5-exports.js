const service = require("./src/modules/cash-boxes/services/cashBox.service");
const controller = require("./src/modules/cash-boxes/controllers/cashBox.controller");
const validation = require("./src/modules/cash-boxes/validations/cashBox.validation");

console.log("Service cancelCashTransaction:", typeof service.cancelCashTransaction);
console.log("Controller cancelCashTransaction:", typeof controller.cancelCashTransaction);
console.log("Validation cancelCashTransactionSchema:", typeof validation.cancelCashTransactionSchema);
