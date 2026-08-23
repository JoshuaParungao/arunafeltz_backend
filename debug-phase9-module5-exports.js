const service = require("./src/modules/credit-accounts/services/creditAccount.service");
const controller = require("./src/modules/credit-accounts/controllers/creditAccount.controller");
const validation = require("./src/modules/credit-accounts/validations/creditAccount.validation");

console.log("Service createCreditCollection:", typeof service.createCreditCollection);
console.log("Controller createCreditCollection:", typeof controller.createCreditCollection);
console.log("Validation createCreditCollectionSchema:", typeof validation.createCreditCollectionSchema);
