const service = require("./src/modules/warranty-claims/services/warrantyClaim.service");
const controller = require("./src/modules/warranty-claims/controllers/warrantyClaim.controller");
const validation = require("./src/modules/warranty-claims/validations/warrantyClaim.validation");

console.log("Service createWarrantyClaim:", typeof service.createWarrantyClaim);
console.log("Service updateWarrantyClaimStatus:", typeof service.updateWarrantyClaimStatus);
console.log("Controller createWarrantyClaim:", typeof controller.createWarrantyClaim);
console.log("Controller updateWarrantyClaimStatus:", typeof controller.updateWarrantyClaimStatus);
console.log("Validation createWarrantyClaimSchema:", typeof validation.createWarrantyClaimSchema);
console.log("Validation updateWarrantyClaimStatusSchema:", typeof validation.updateWarrantyClaimStatusSchema);
