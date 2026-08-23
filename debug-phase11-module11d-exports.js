const service = require("./src/modules/service-jobs/services/serviceJob.service");
const controller = require("./src/modules/service-jobs/controllers/serviceJob.controller");
const validation = require("./src/modules/service-jobs/validations/serviceJob.validation");

console.log("Service createServiceJob:", typeof service.createServiceJob);
console.log("Service getServiceJobs:", typeof service.getServiceJobs);
console.log("Service getServiceJobById:", typeof service.getServiceJobById);
console.log("Service updateServiceJobStatus:", typeof service.updateServiceJobStatus);

console.log("Controller createServiceJob:", typeof controller.createServiceJob);
console.log("Controller getServiceJobs:", typeof controller.getServiceJobs);
console.log("Controller getServiceJobById:", typeof controller.getServiceJobById);
console.log("Controller updateServiceJobStatus:", typeof controller.updateServiceJobStatus);

console.log("Validation createServiceJobSchema:", typeof validation.createServiceJobSchema);
console.log("Validation listServiceJobsSchema:", typeof validation.listServiceJobsSchema);
console.log("Validation serviceJobIdParamSchema:", typeof validation.serviceJobIdParamSchema);
console.log("Validation updateServiceJobStatusSchema:", typeof validation.updateServiceJobStatusSchema);
