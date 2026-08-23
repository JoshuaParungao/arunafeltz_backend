const fs = require("fs");

const routePath = "./src/modules/cash-boxes/routes/cashBox.routes.js";
const route = fs.readFileSync(routePath, "utf8");

console.log(route);
