const fs = require("fs");

const apiRoutesPath = "./src/routes/api.routes.js";
let apiRoutes = fs.readFileSync(apiRoutesPath, "utf8");

if (!apiRoutes.includes('require("../modules/service-jobs/routes/serviceJob.routes")')) {
  apiRoutes = apiRoutes.replace(
    'const cashBoxRoutes = require("../modules/cash-boxes/routes/cashBox.routes");',
    'const cashBoxRoutes = require("../modules/cash-boxes/routes/cashBox.routes");\nconst serviceJobRoutes = require("../modules/service-jobs/routes/serviceJob.routes");'
  );
}

if (!apiRoutes.includes('router.use("/service-jobs", serviceJobRoutes);')) {
  apiRoutes = apiRoutes.replace(
    'router.use("/cash-boxes", cashBoxRoutes);',
    'router.use("/cash-boxes", cashBoxRoutes);\nrouter.use("/service-jobs", serviceJobRoutes);'
  );
}

fs.writeFileSync(apiRoutesPath, apiRoutes);

console.log("DONE: service-jobs route registered.");
