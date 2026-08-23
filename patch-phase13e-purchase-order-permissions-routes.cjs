const fs = require("fs");

const permissionsPath = "./src/constants/permissions.js";
const apiRoutesPath = "./src/routes/api.routes.js";

let permissions = fs.readFileSync(permissionsPath, "utf8");

if (!permissions.includes("VIEW_PURCHASE_ORDERS")) {
  permissions = permissions.replace(
    `  VIEW_SUPPLIERS: "suppliers:view",
  MANAGE_SUPPLIERS: "suppliers:manage",`,
    `  VIEW_SUPPLIERS: "suppliers:view",
  MANAGE_SUPPLIERS: "suppliers:manage",

  VIEW_PURCHASE_ORDERS: "purchase_orders:view",
  MANAGE_PURCHASE_ORDERS: "purchase_orders:manage",`
  );

  permissions = permissions.replaceAll(
    `    PERMISSIONS.VIEW_SUPPLIERS,
    PERMISSIONS.MANAGE_SUPPLIERS,`,
    `    PERMISSIONS.VIEW_SUPPLIERS,
    PERMISSIONS.MANAGE_SUPPLIERS,

    PERMISSIONS.VIEW_PURCHASE_ORDERS,
    PERMISSIONS.MANAGE_PURCHASE_ORDERS,`
  );
}

fs.writeFileSync(permissionsPath, permissions);

let apiRoutes = fs.readFileSync(apiRoutesPath, "utf8");

if (!apiRoutes.includes("purchaseOrderRoutes")) {
  apiRoutes = apiRoutes.replace(
    `const supplierRoutes = require("../modules/suppliers/routes/supplier.routes");`,
    `const supplierRoutes = require("../modules/suppliers/routes/supplier.routes");
const purchaseOrderRoutes = require("../modules/purchase-orders/routes/purchaseOrder.routes");`
  );

  apiRoutes = apiRoutes.replace(
    `router.use("/suppliers", supplierRoutes);`,
    `router.use("/suppliers", supplierRoutes);
router.use("/purchase-orders", purchaseOrderRoutes);`
  );
}

fs.writeFileSync(apiRoutesPath, apiRoutes);

console.log("DONE: Purchase Order permissions and API route patched.");
