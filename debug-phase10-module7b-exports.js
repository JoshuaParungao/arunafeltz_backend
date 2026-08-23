const service = require("./src/modules/cash-boxes/services/cashBox.service");
const controller = require("./src/modules/cash-boxes/controllers/cashBox.controller");
const validation = require("./src/modules/cash-boxes/validations/cashBox.validation");

console.log("Service createCashHandover:", typeof service.createCashHandover);
console.log("Controller createCashHandover:", typeof controller.createCashHandover);
console.log("Validation createCashHandoverSchema:", typeof validation.createCashHandoverSchema);
