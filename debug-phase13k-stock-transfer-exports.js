const { PERMISSIONS, ROLE_PERMISSIONS } = require("./src/constants/permissions");
const service = require("./src/modules/stock-transfers/services/stockTransfer.service");
const controller = require("./src/modules/stock-transfers/controllers/stockTransfer.controller");
const validation = require("./src/modules/stock-transfers/validations/stockTransfer.validation");

console.log("Permission VIEW_STOCK_TRANSFERS:", PERMISSIONS.VIEW_STOCK_TRANSFERS);
console.log("Permission MANAGE_STOCK_TRANSFERS:", PERMISSIONS.MANAGE_STOCK_TRANSFERS);
console.log("Branch owner view transfer:", ROLE_PERMISSIONS.BRANCH_OWNER.includes(PERMISSIONS.VIEW_STOCK_TRANSFERS));
console.log("Branch owner manage transfer:", ROLE_PERMISSIONS.BRANCH_OWNER.includes(PERMISSIONS.MANAGE_STOCK_TRANSFERS));
console.log("Admin view transfer:", ROLE_PERMISSIONS.ADMIN.includes(PERMISSIONS.VIEW_STOCK_TRANSFERS));
console.log("Admin manage transfer:", ROLE_PERMISSIONS.ADMIN.includes(PERMISSIONS.MANAGE_STOCK_TRANSFERS));
console.log("Cashier view transfer:", ROLE_PERMISSIONS.CASHIER.includes(PERMISSIONS.VIEW_STOCK_TRANSFERS));
console.log("Technician view transfer:", ROLE_PERMISSIONS.TECHNICIAN.includes(PERMISSIONS.VIEW_STOCK_TRANSFERS));

console.log("Service createStockTransfer:", typeof service.createStockTransfer);
console.log("Service listStockTransfers:", typeof service.listStockTransfers);
console.log("Service getStockTransferById:", typeof service.getStockTransferById);
console.log("Service updateStockTransferById:", typeof service.updateStockTransferById);
console.log("Service updateStockTransferStatusById:", typeof service.updateStockTransferStatusById);

console.log("Controller createStockTransfer:", typeof controller.createStockTransfer);
console.log("Controller listStockTransfers:", typeof controller.listStockTransfers);
console.log("Controller getStockTransferById:", typeof controller.getStockTransferById);
console.log("Controller updateStockTransferById:", typeof controller.updateStockTransferById);
console.log("Controller updateStockTransferStatusById:", typeof controller.updateStockTransferStatusById);

console.log("Validation createStockTransferSchema:", typeof validation.createStockTransferSchema);
console.log("Validation listStockTransfersSchema:", typeof validation.listStockTransfersSchema);
console.log("Validation stockTransferIdParamSchema:", typeof validation.stockTransferIdParamSchema);
console.log("Validation updateStockTransferSchema:", typeof validation.updateStockTransferSchema);
console.log("Validation updateStockTransferStatusSchema:", typeof validation.updateStockTransferStatusSchema);
