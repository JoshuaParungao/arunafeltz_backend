const service = require("./src/modules/cash-boxes/services/cashBox.service");
const controller = require("./src/modules/cash-boxes/controllers/cashBox.controller");
const validation = require("./src/modules/cash-boxes/validations/cashBox.validation");

console.log("Service cancelCashHandover:", typeof service.cancelCashHandover);
console.log("Controller cancelCashHandover:", typeof controller.cancelCashHandover);
console.log("Validation cancelCashHandoverSchema:", typeof validation.cancelCashHandoverSchema);
