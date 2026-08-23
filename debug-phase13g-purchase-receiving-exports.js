const { PERMISSIONS, ROLE_PERMISSIONS } = require("./src/constants/permissions");
const service = require("./src/modules/purchase-receivings/services/purchaseReceiving.service");
const controller = require("./src/modules/purchase-receivings/controllers/purchaseReceiving.controller");
const validation = require("./src/modules/purchase-receivings/validations/purchaseReceiving.validation");

console.log("Permission VIEW_PURCHASE_RECEIVINGS:", PERMISSIONS.VIEW_PURCHASE_RECEIVINGS);
console.log("Permission MANAGE_PURCHASE_RECEIVINGS:", PERMISSIONS.MANAGE_PURCHASE_RECEIVINGS);
console.log("Branch owner view receiving:", ROLE_PERMISSIONS.BRANCH_OWNER.includes(PERMISSIONS.VIEW_PURCHASE_RECEIVINGS));
console.log("Branch owner manage receiving:", ROLE_PERMISSIONS.BRANCH_OWNER.includes(PERMISSIONS.MANAGE_PURCHASE_RECEIVINGS));
console.log("Admin view receiving:", ROLE_PERMISSIONS.ADMIN.includes(PERMISSIONS.VIEW_PURCHASE_RECEIVINGS));
console.log("Admin manage receiving:", ROLE_PERMISSIONS.ADMIN.includes(PERMISSIONS.MANAGE_PURCHASE_RECEIVINGS));
console.log("Cashier view receiving:", ROLE_PERMISSIONS.CASHIER.includes(PERMISSIONS.VIEW_PURCHASE_RECEIVINGS));
console.log("Technician view receiving:", ROLE_PERMISSIONS.TECHNICIAN.includes(PERMISSIONS.VIEW_PURCHASE_RECEIVINGS));

console.log("Service createPurchaseReceiving:", typeof service.createPurchaseReceiving);
console.log("Service listPurchaseReceivings:", typeof service.listPurchaseReceivings);
console.log("Service getPurchaseReceivingById:", typeof service.getPurchaseReceivingById);
console.log("Service updatePurchaseReceivingById:", typeof service.updatePurchaseReceivingById);
console.log("Service updatePurchaseReceivingStatusById:", typeof service.updatePurchaseReceivingStatusById);

console.log("Controller createPurchaseReceiving:", typeof controller.createPurchaseReceiving);
console.log("Controller listPurchaseReceivings:", typeof controller.listPurchaseReceivings);
console.log("Controller getPurchaseReceivingById:", typeof controller.getPurchaseReceivingById);
console.log("Controller updatePurchaseReceivingById:", typeof controller.updatePurchaseReceivingById);
console.log("Controller updatePurchaseReceivingStatusById:", typeof controller.updatePurchaseReceivingStatusById);

console.log("Validation createPurchaseReceivingSchema:", typeof validation.createPurchaseReceivingSchema);
console.log("Validation listPurchaseReceivingsSchema:", typeof validation.listPurchaseReceivingsSchema);
console.log("Validation purchaseReceivingIdParamSchema:", typeof validation.purchaseReceivingIdParamSchema);
console.log("Validation updatePurchaseReceivingSchema:", typeof validation.updatePurchaseReceivingSchema);
console.log("Validation updatePurchaseReceivingStatusSchema:", typeof validation.updatePurchaseReceivingStatusSchema);
