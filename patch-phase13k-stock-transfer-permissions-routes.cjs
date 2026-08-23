const fs = require("fs");

const permissionsPath = "./src/constants/permissions.js";
const apiRoutesPath = "./src/routes/api.routes.js";

let permissions = fs.readFileSync(permissionsPath, "utf8");

if (!permissions.includes("VIEW_STOCK_TRANSFERS")) {
  permissions = permissions.replace(
    `  VIEW_PURCHASE_RECEIVINGS: "purchase_receivings:view",
  MANAGE_PURCHASE_RECEIVINGS: "purchase_receivings:manage",`,
    `  VIEW_PURCHASE_RECEIVINGS: "purchase_receivings:view",
  MANAGE_PURCHASE_RECEIVINGS: "purchase_receivings:manage",

  VIEW_STOCK_TRANSFERS: "stock_transfers:view",
  MANAGE_STOCK_TRANSFERS: "stock_transfers:manage",`
  );

  permissions = permissions.replaceAll(
    `    PERMISSIONS.VIEW_PURCHASE_RECEIVINGS,
    PERMISSIONS.MANAGE_PURCHASE_RECEIVINGS,`,
    `    PERMISSIONS.VIEW_PURCHASE_RECEIVINGS,
    PERMISSIONS.MANAGE_PURCHASE_RECEIVINGS,

    PERMISSIONS.VIEW_STOCK_TRANSFERS,
    PERMISSIONS.MANAGE_STOCK_TRANSFERS,`
  );
}

fs.writeFileSync(permissionsPath, permissions);

let apiRoutes = fs.readFileSync(apiRoutesPath, "utf8");

if (!apiRoutes.includes("stockTransferRoutes")) {
  apiRoutes = apiRoutes.replace(
    `const purchaseReceivingRoutes = require("../modules/purchase-receivings/routes/purchaseReceiving.routes");`,
    `const purchaseReceivingRoutes = require("../modules/purchase-receivings/routes/purchaseReceiving.routes");
const stockTransferRoutes = require("../modules/stock-transfers/routes/stockTransfer.routes");`
  );

  apiRoutes = apiRoutes.replace(
    `router.use("/purchase-receivings", purchaseReceivingRoutes);`,
    `router.use("/purchase-receivings", purchaseReceivingRoutes);
router.use("/stock-transfers", stockTransferRoutes);`
  );
}

fs.writeFileSync(apiRoutesPath, apiRoutes);

console.log("DONE: Stock Transfer permissions and API route patched.");
