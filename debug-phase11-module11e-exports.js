const service = require("./src/modules/service-jobs/services/serviceJob.service");
const controller = require("./src/modules/service-jobs/controllers/serviceJob.controller");
const validation = require("./src/modules/service-jobs/validations/serviceJob.validation");

console.log("Service createServicePayment:", typeof service.createServicePayment);
console.log("Controller createServicePayment:", typeof controller.createServicePayment);
console.log("Validation createServicePaymentSchema:", typeof validation.createServicePaymentSchema);
