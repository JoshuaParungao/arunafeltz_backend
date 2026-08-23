const service = require("./src/modules/cash-boxes/services/cashBox.service");
const controller = require("./src/modules/cash-boxes/controllers/cashBox.controller");
const validation = require("./src/modules/cash-boxes/validations/cashBox.validation");

console.log("Service getCashHandovers:", typeof service.getCashHandovers);
console.log("Service getCashHandoverById:", typeof service.getCashHandoverById);
console.log("Controller getCashHandovers:", typeof controller.getCashHandovers);
console.log("Controller getCashHandoverById:", typeof controller.getCashHandoverById);
console.log("Validation listCashHandoversSchema:", typeof validation.listCashHandoversSchema);
console.log("Validation cashHandoverIdParamSchema:", typeof validation.cashHandoverIdParamSchema);
