const service = require("./src/modules/cash-boxes/services/cashBox.service");
const controller = require("./src/modules/cash-boxes/controllers/cashBox.controller");
const validation = require("./src/modules/cash-boxes/validations/cashBox.validation");

console.log("Service getCashBoxes:", typeof service.getCashBoxes);
console.log("Service getCashBoxById:", typeof service.getCashBoxById);
console.log("Service getCashTransactions:", typeof service.getCashTransactions);
console.log("Service getCashTransactionById:", typeof service.getCashTransactionById);
console.log("Controller getCashBoxes:", typeof controller.getCashBoxes);
console.log("Controller getCashBoxById:", typeof controller.getCashBoxById);
console.log("Controller getCashTransactions:", typeof controller.getCashTransactions);
console.log("Controller getCashTransactionById:", typeof controller.getCashTransactionById);
console.log("Validation listCashBoxesSchema:", typeof validation.listCashBoxesSchema);
console.log("Validation cashBoxIdParamSchema:", typeof validation.cashBoxIdParamSchema);
console.log("Validation listCashTransactionsSchema:", typeof validation.listCashTransactionsSchema);
console.log("Validation cashTransactionIdParamSchema:", typeof validation.cashTransactionIdParamSchema);
