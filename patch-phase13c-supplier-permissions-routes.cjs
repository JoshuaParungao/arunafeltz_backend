const fs = require("fs");

const permissionsPath = "./src/constants/permissions.js";
const apiRoutesPath = "./src/routes/api.routes.js";

let permissions = fs.readFileSync(permissionsPath, "utf8");

if (!permissions.includes("VIEW_SUPPLIERS")) {
  permissions = permissions.replace(
    `  VIEW_CUSTOMERS: "customers:view",
  MANAGE_CUSTOMERS: "customers:manage",`,
    `  VIEW_CUSTOMERS: "customers:view",
  MANAGE_CUSTOMERS: "customers:manage",

  VIEW_SUPPLIERS: "suppliers:view",
  MANAGE_SUPPLIERS: "suppliers:manage",`
  );

  permissions = permissions.replace(
    `    PERMISSIONS.VIEW_CUSTOMERS,
    PERMISSIONS.MANAGE_CUSTOMERS,`,
    `    PERMISSIONS.VIEW_CUSTOMERS,
    PERMISSIONS.MANAGE_CUSTOMERS,

    PERMISSIONS.VIEW_SUPPLIERS,
    PERMISSIONS.MANAGE_SUPPLIERS,`
  );

  permissions = permissions.replace(
    `    PERMISSIONS.VIEW_CUSTOMERS,
    PERMISSIONS.MANAGE_CUSTOMERS,

    PERMISSIONS.VIEW_CATALOG,`,
    `    PERMISSIONS.VIEW_CUSTOMERS,
    PERMISSIONS.MANAGE_CUSTOMERS,

    PERMISSIONS.VIEW_SUPPLIERS,
    PERMISSIONS.MANAGE_SUPPLIERS,

    PERMISSIONS.VIEW_CATALOG,`
  );
}

fs.writeFileSync(permissionsPath, permissions);

let apiRoutes = fs.readFileSync(apiRoutesPath, "utf8");

if (!apiRoutes.includes("supplierRoutes")) {
  apiRoutes = apiRoutes.replace(
    `const customerRoutes = require("../modules/customers/routes/customer.routes");`,
    `const customerRoutes = require("../modules/customers/routes/customer.routes");
const supplierRoutes = require("../modules/suppliers/routes/supplier.routes");`
  );

  apiRoutes = apiRoutes.replace(
    `router.use("/customers", customerRoutes);`,
    `router.use("/customers", customerRoutes);
router.use("/suppliers", supplierRoutes);`
  );
}

fs.writeFileSync(apiRoutesPath, apiRoutes);

console.log("DONE: Supplier permissions and API route patched.");
