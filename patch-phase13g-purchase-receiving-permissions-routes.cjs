const fs = require("fs");

const permissionsPath = "./src/constants/permissions.js";
const apiRoutesPath = "./src/routes/api.routes.js";

let permissions = fs.readFileSync(permissionsPath, "utf8");

if (!permissions.includes("VIEW_PURCHASE_RECEIVINGS")) {
  permissions = permissions.replace(
    `  VIEW_PURCHASE_ORDERS: "purchase_orders:view",
  MANAGE_PURCHASE_ORDERS: "purchase_orders:manage",`,
    `  VIEW_PURCHASE_ORDERS: "purchase_orders:view",
  MANAGE_PURCHASE_ORDERS: "purchase_orders:manage",

  VIEW_PURCHASE_RECEIVINGS: "purchase_receivings:view",
  MANAGE_PURCHASE_RECEIVINGS: "purchase_receivings:manage",`
  );

  permissions = permissions.replaceAll(
    `    PERMISSIONS.VIEW_PURCHASE_ORDERS,
    PERMISSIONS.MANAGE_PURCHASE_ORDERS,`,
    `    PERMISSIONS.VIEW_PURCHASE_ORDERS,
    PERMISSIONS.MANAGE_PURCHASE_ORDERS,

    PERMISSIONS.VIEW_PURCHASE_RECEIVINGS,
    PERMISSIONS.MANAGE_PURCHASE_RECEIVINGS,`
  );
}

fs.writeFileSync(permissionsPath, permissions);

let apiRoutes = fs.readFileSync(apiRoutesPath, "utf8");

if (!apiRoutes.includes("purchaseReceivingRoutes")) {
  apiRoutes = apiRoutes.replace(
    `const purchaseOrderRoutes = require("../modules/purchase-orders/routes/purchaseOrder.routes");`,
    `const purchaseOrderRoutes = require("../modules/purchase-orders/routes/purchaseOrder.routes");
const purchaseReceivingRoutes = require("../modules/purchase-receivings/routes/purchaseReceiving.routes");`
  );

  apiRoutes = apiRoutes.replace(
    `router.use("/purchase-orders", purchaseOrderRoutes);`,
    `router.use("/purchase-orders", purchaseOrderRoutes);
router.use("/purchase-receivings", purchaseReceivingRoutes);`
  );
}

fs.writeFileSync(apiRoutesPath, apiRoutes);

console.log("DONE: Purchase Receiving permissions and API route patched.");
