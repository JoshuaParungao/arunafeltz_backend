const fs = require("fs");

const routePath = "./src/routes/api.routes.js";
let routes = fs.readFileSync(routePath, "utf8");

if (!routes.includes('require("../modules/warranty-claims/routes/warrantyClaim.routes")')) {
  routes = routes.replace(
    'const serviceJobRoutes = require("../modules/service-jobs/routes/serviceJob.routes");',
    'const serviceJobRoutes = require("../modules/service-jobs/routes/serviceJob.routes");\nconst warrantyClaimRoutes = require("../modules/warranty-claims/routes/warrantyClaim.routes");'
  );
}

if (!routes.includes('router.use("/warranty-claims", warrantyClaimRoutes);')) {
  routes = routes.replace(
    'router.use("/service-jobs", serviceJobRoutes);',
    'router.use("/service-jobs", serviceJobRoutes);\nrouter.use("/warranty-claims", warrantyClaimRoutes);'
  );
}

fs.writeFileSync(routePath, routes);

console.log("DONE: warranty claim route added.");
