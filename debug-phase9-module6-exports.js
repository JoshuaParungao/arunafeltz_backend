const service = require("./src/modules/credit-accounts/services/creditAccount.service");
const controller = require("./src/modules/credit-accounts/controllers/creditAccount.controller");
const validation = require("./src/modules/credit-accounts/validations/creditAccount.validation");

console.log("Service cancelCreditCollection:", typeof service.cancelCreditCollection);
console.log("Controller cancelCreditCollection:", typeof controller.cancelCreditCollection);
console.log("Validation cancelCreditCollectionSchema:", typeof validation.cancelCreditCollectionSchema);
