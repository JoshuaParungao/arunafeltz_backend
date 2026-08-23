const { PERMISSIONS, ROLE_PERMISSIONS } = require("./src/constants/permissions");
const service = require("./src/modules/purchase-orders/services/purchaseOrder.service");
const controller = require("./src/modules/purchase-orders/controllers/purchaseOrder.controller");
const validation = require("./src/modules/purchase-orders/validations/purchaseOrder.validation");

console.log("Permission VIEW_PURCHASE_ORDERS:", PERMISSIONS.VIEW_PURCHASE_ORDERS);
console.log("Permission MANAGE_PURCHASE_ORDERS:", PERMISSIONS.MANAGE_PURCHASE_ORDERS);
console.log("Branch owner view PO:", ROLE_PERMISSIONS.BRANCH_OWNER.includes(PERMISSIONS.VIEW_PURCHASE_ORDERS));
console.log("Branch owner manage PO:", ROLE_PERMISSIONS.BRANCH_OWNER.includes(PERMISSIONS.MANAGE_PURCHASE_ORDERS));
console.log("Admin view PO:", ROLE_PERMISSIONS.ADMIN.includes(PERMISSIONS.VIEW_PURCHASE_ORDERS));
console.log("Admin manage PO:", ROLE_PERMISSIONS.ADMIN.includes(PERMISSIONS.MANAGE_PURCHASE_ORDERS));
console.log("Cashier view PO:", ROLE_PERMISSIONS.CASHIER.includes(PERMISSIONS.VIEW_PURCHASE_ORDERS));
console.log("Technician view PO:", ROLE_PERMISSIONS.TECHNICIAN.includes(PERMISSIONS.VIEW_PURCHASE_ORDERS));

console.log("Service createPurchaseOrder:", typeof service.createPurchaseOrder);
console.log("Service listPurchaseOrders:", typeof service.listPurchaseOrders);
console.log("Service getPurchaseOrderById:", typeof service.getPurchaseOrderById);
console.log("Service updatePurchaseOrderById:", typeof service.updatePurchaseOrderById);
console.log("Service updatePurchaseOrderStatusById:", typeof service.updatePurchaseOrderStatusById);

console.log("Controller createPurchaseOrder:", typeof controller.createPurchaseOrder);
console.log("Controller listPurchaseOrders:", typeof controller.listPurchaseOrders);
console.log("Controller getPurchaseOrderById:", typeof controller.getPurchaseOrderById);
console.log("Controller updatePurchaseOrderById:", typeof controller.updatePurchaseOrderById);
console.log("Controller updatePurchaseOrderStatusById:", typeof controller.updatePurchaseOrderStatusById);

console.log("Validation createPurchaseOrderSchema:", typeof validation.createPurchaseOrderSchema);
console.log("Validation listPurchaseOrdersSchema:", typeof validation.listPurchaseOrdersSchema);
console.log("Validation purchaseOrderIdParamSchema:", typeof validation.purchaseOrderIdParamSchema);
console.log("Validation updatePurchaseOrderSchema:", typeof validation.updatePurchaseOrderSchema);
console.log("Validation updatePurchaseOrderStatusSchema:", typeof validation.updatePurchaseOrderStatusSchema);
