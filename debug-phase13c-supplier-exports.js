const { PERMISSIONS, ROLE_PERMISSIONS } = require("./src/constants/permissions");
const service = require("./src/modules/suppliers/services/supplier.service");
const controller = require("./src/modules/suppliers/controllers/supplier.controller");
const validation = require("./src/modules/suppliers/validations/supplier.validation");

console.log("Permission VIEW_SUPPLIERS:", PERMISSIONS.VIEW_SUPPLIERS);
console.log("Permission MANAGE_SUPPLIERS:", PERMISSIONS.MANAGE_SUPPLIERS);
console.log("Branch owner view supplier:", ROLE_PERMISSIONS.BRANCH_OWNER.includes(PERMISSIONS.VIEW_SUPPLIERS));
console.log("Branch owner manage supplier:", ROLE_PERMISSIONS.BRANCH_OWNER.includes(PERMISSIONS.MANAGE_SUPPLIERS));
console.log("Admin view supplier:", ROLE_PERMISSIONS.ADMIN.includes(PERMISSIONS.VIEW_SUPPLIERS));
console.log("Admin manage supplier:", ROLE_PERMISSIONS.ADMIN.includes(PERMISSIONS.MANAGE_SUPPLIERS));
console.log("Cashier view supplier:", ROLE_PERMISSIONS.CASHIER.includes(PERMISSIONS.VIEW_SUPPLIERS));
console.log("Technician view supplier:", ROLE_PERMISSIONS.TECHNICIAN.includes(PERMISSIONS.VIEW_SUPPLIERS));

console.log("Service createSupplier:", typeof service.createSupplier);
console.log("Service listSuppliers:", typeof service.listSuppliers);
console.log("Service getSupplierById:", typeof service.getSupplierById);
console.log("Service updateSupplierById:", typeof service.updateSupplierById);
console.log("Service updateSupplierStatusById:", typeof service.updateSupplierStatusById);

console.log("Controller createSupplier:", typeof controller.createSupplier);
console.log("Controller listSuppliers:", typeof controller.listSuppliers);
console.log("Controller getSupplierById:", typeof controller.getSupplierById);
console.log("Controller updateSupplierById:", typeof controller.updateSupplierById);
console.log("Controller updateSupplierStatusById:", typeof controller.updateSupplierStatusById);

console.log("Validation createSupplierSchema:", typeof validation.createSupplierSchema);
console.log("Validation listSuppliersSchema:", typeof validation.listSuppliersSchema);
console.log("Validation supplierIdParamSchema:", typeof validation.supplierIdParamSchema);
console.log("Validation updateSupplierSchema:", typeof validation.updateSupplierSchema);
console.log("Validation updateSupplierStatusSchema:", typeof validation.updateSupplierStatusSchema);
