const service = require("./src/modules/cash-boxes/services/cashBox.service");
const controller = require("./src/modules/cash-boxes/controllers/cashBox.controller");
const validation = require("./src/modules/cash-boxes/validations/cashBox.validation");

console.log("Service receiveCashHandover:", typeof service.receiveCashHandover);
console.log("Controller receiveCashHandover:", typeof controller.receiveCashHandover);
console.log("Validation receiveCashHandoverSchema:", typeof validation.receiveCashHandoverSchema);
