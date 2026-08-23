const service = require("./src/modules/service-jobs/services/serviceJob.service");
const controller = require("./src/modules/service-jobs/controllers/serviceJob.controller");
const validation = require("./src/modules/service-jobs/validations/serviceJob.validation");

console.log("Service createServiceJob:", typeof service.createServiceJob);
console.log("Controller createServiceJob:", typeof controller.createServiceJob);
console.log("Validation createServiceJobSchema:", typeof validation.createServiceJobSchema);
